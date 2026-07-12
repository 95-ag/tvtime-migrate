// trakt/auth.mjs — Trakt OAuth device flow. Never automates the human step.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildAuthHeaders, config, requireEnv } from './config.mjs';

export async function requestDeviceCode({ clientId, fetch = globalThis.fetch }) {
  const res = await fetch(`${config.baseUrl}/oauth/device/code`, {
    method: 'POST',
    headers: buildAuthHeaders(clientId, null),
    body: JSON.stringify({ client_id: clientId }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Trakt device code request failed: HTTP ${res.status} ${err.error ?? ''}`);
  }
  return res.json();
}

export async function pollForToken({
  clientId,
  clientSecret,
  deviceCode,
  intervalMs,
  expiresInMs,
  fetch = globalThis.fetch,
  sleep = defaultSleep,
  now = Date.now,
}) {
  const start = now();
  for (;;) {
    if (now() - start >= expiresInMs)
      throw new Error('Trakt device authorization expired — re-run `npm run auth:trakt`.');
    await sleep(intervalMs);
    const res = await fetch(`${config.baseUrl}/oauth/device/token`, {
      method: 'POST',
      headers: buildAuthHeaders(clientId, null),
      body: JSON.stringify({ code: deviceCode, client_id: clientId, client_secret: clientSecret }),
    });
    if (res.status === 200) return res.json();
    if (res.status === 400) continue;
    if (res.status === 404) throw new Error('Trakt device code invalid.');
    if (res.status === 409) throw new Error('Trakt device code already used.');
    if (res.status === 410) throw new Error('Trakt device authorization expired — re-run `npm run auth:trakt`.');
    if (res.status === 418) throw new Error('Trakt authorization denied by user.');
    if (res.status === 429) {
      await sleep(5000);
      continue;
    }
    throw new Error(`Trakt device token poll failed: HTTP ${res.status}`);
  }
}

export async function deviceAuth({ log = console.log } = {}) {
  const clientId = requireEnv('TRAKT_CLIENT_ID');
  const clientSecret = requireEnv('TRAKT_CLIENT_SECRET');
  const code = await requestDeviceCode({ clientId });
  log('\n=== Trakt authorization required (manual) ===');
  log(`  1. Open: ${code.verification_url}`);
  log(`  2. Enter code: ${code.user_code}`);
  log(`  (expires in ${Math.round(code.expires_in / 60)} min — polling every ${code.interval}s…)\n`);
  const tokens = await pollForToken({
    clientId,
    clientSecret,
    deviceCode: code.device_code,
    intervalMs: code.interval * 1000,
    expiresInMs: code.expires_in * 1000,
  });
  saveTokens(tokens);
  log(`Authorized. Token saved to ${config.tokenFile} (gitignored).`);
  return tokens.access_token;
}

export function saveTokens(tokens) {
  writeFileSync(config.tokenFile, JSON.stringify({ ...tokens, obtained_at: new Date().toISOString() }, null, 2), {
    mode: 0o600,
  });
}

export function loadTokens() {
  if (!existsSync(config.tokenFile)) throw new Error(`No ${config.tokenFile}. Run \`npm run auth:trakt\` first.`);
  return JSON.parse(readFileSync(config.tokenFile, 'utf8'));
}

export function loadToken() {
  const t = loadTokens();
  if (!t.access_token) throw new Error(`${config.tokenFile} has no access_token — re-run \`npm run auth:trakt\`.`);
  return t.access_token;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (import.meta.url === `file://${process.argv[1]}`) await deviceAuth();
