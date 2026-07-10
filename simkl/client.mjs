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
