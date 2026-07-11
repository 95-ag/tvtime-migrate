// simkl/client.mjs — Simkl HTTP layer. Pure helpers + a fetch wrapper (injectable for tests).
import { config } from './config.mjs';

export function buildUrl(clientId, path, params = {}) {
  const url = new URL(path, config.baseUrl);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('app-name', config.appName);
  url.searchParams.set('app-version', config.appVersion);
  for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
  return url.toString();
}

export function buildHeaders(token) {
  const h = { 'User-Agent': config.userAgent, 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export function backoffMs(attempt, rand = Math.random) {
  const { baseMs, capMs } = config.backoff;
  return Math.min(baseMs * 2 ** attempt, capMs) + Math.floor(rand() * 1000);
}

export function chunkShows(items, size = config.maxShowsPerChunk) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

const RETRYABLE = new Set([429, 500, 502, 503]);

export function makeClient({ clientId, token, fetch = globalThis.fetch, sleep = defaultSleep }) {
  let lastPostAt = 0;

  async function request(method, path, { params = {}, body } = {}) {
    for (let attempt = 0; ; attempt++) {
      if (method === 'POST') {
        const wait = config.postIntervalMs - (Date.now() - lastPostAt); // 1 POST/sec pacing
        if (wait > 0) await sleep(wait);
      }
      const url = buildUrl(clientId, path, params);
      const res = await fetch(url, {
        method,
        headers: buildHeaders(token),
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (method === 'POST') lastPostAt = Date.now();

      if (res.status === 409) return (await safeJson(res)) ?? { added: {}, not_found: {} }; // duplicate → soft-success (stable shape)
      if (res.ok) return safeJson(res);
      if (RETRYABLE.has(res.status) && attempt < config.backoff.maxRetries) {
        await sleep(backoffMs(attempt));
        continue;
      }
      const err = await safeJson(res);
      throw new Error(`Simkl ${res.status} ${err?.error ?? 'error'}: ${err?.message ?? ''}`.trim());
    }
  }

  return {
    request,
    postHistory: (payload) =>
      request('POST', '/sync/history', { params: { skip_auto_watching: 'yes' }, body: payload }),
    getAllItems: (type = 'all', status = 'all') =>
      request('GET', `/sync/all-items/${type}/${status}`, {
        params: { extended: 'full', episode_watched_at: 'yes', include_all_episodes: 'yes' },
      }),
  };
}

async function safeJson(res) {
  try {
    return await res.json();
  } catch {
    return null;
  }
}
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
