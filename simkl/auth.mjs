// simkl/auth.mjs — Simkl PIN flow. Never automates the human step: prints the code, waits for the user.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { config, requireClientId } from './config.mjs';
import { buildUrl, buildHeaders } from './client.mjs';

export async function requestPin({ clientId, fetch = globalThis.fetch }) {
  const res = await fetch(buildUrl(clientId, '/oauth/pin'), { headers: buildHeaders() });
  const body = await res.json();
  if (body.result !== 'OK') throw new Error(`PIN request failed: ${JSON.stringify(body)}`);
  return body; // { user_code, verification_uri, expires_in, interval, device_code }
}

export async function pollForToken({
  clientId,
  userCode,
  intervalMs,
  expiresInMs,
  fetch = globalThis.fetch,
  sleep = defaultSleep,
  now = Date.now,
}) {
  const start = now();
  for (let attempt = 0; ; attempt++) {
    if (now() - start > expiresInMs) throw new Error('PIN authorization expired — re-run `npm run auth`.');
    if (attempt > 0) await sleep(intervalMs); // no wait before the first poll; sleep before each re-poll
    const res = await fetch(buildUrl(clientId, `/oauth/pin/${userCode}`), { headers: buildHeaders() });
    if (!res.ok) throw new Error(`Simkl PIN poll failed: HTTP ${res.status}`);
    const body = await res.json();
    if (body.result === 'OK' && body.access_token) return body.access_token;
    if (body.result === 'KO' && /pending/i.test(body.message ?? '')) continue; // still waiting on the user
    throw new Error(`Simkl PIN authorization failed: ${JSON.stringify(body)}`);
  }
}

export async function pinAuth({ log = console.log } = {}) {
  const clientId = requireClientId();
  const pin = await requestPin({ clientId });
  log('\n=== Simkl authorization required (manual) ===');
  log(`  1. Open: ${pin.verification_uri}`);
  log(`  2. Enter code: ${pin.user_code}`);
  log(`  (waiting up to ${Math.round(pin.expires_in / 60)} min…)\n`);
  const token = await pollForToken({
    clientId,
    userCode: pin.user_code,
    intervalMs: pin.interval * 1000,
    expiresInMs: pin.expires_in * 1000,
  });
  writeFileSync(
    config.tokenFile,
    JSON.stringify({ access_token: token, obtained_at: new Date().toISOString() }, null, 2),
    { mode: 0o600 },
  );
  log(`Authorized. Token saved to ${config.tokenFile} (gitignored).`);
  return token;
}

export function loadToken() {
  if (!existsSync(config.tokenFile)) throw new Error(`No ${config.tokenFile}. Run \`npm run auth\` first.`);
  const token = JSON.parse(readFileSync(config.tokenFile, 'utf8')).access_token;
  if (!token) throw new Error(`${config.tokenFile} has no access_token — re-run \`npm run auth\`.`);
  return token;
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (import.meta.url === `file://${process.argv[1]}`) await pinAuth();
