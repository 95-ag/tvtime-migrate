// trakt/client.mjs — Trakt HTTP layer. Pure helpers + a fetch wrapper.
import { config, buildAuthHeaders } from './config.mjs';

export function chunkShows(items, size = config.maxShowsPerChunk) {
  const out = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function backoffMs(attempt, rand = Math.random) {
  const { baseMs, capMs } = config.backoff;
  return Math.min(baseMs * 2 ** attempt, capMs) + Math.floor(rand() * 1000);
}

const RETRYABLE = new Set([429, 500, 502, 503]);

export function makeClient({ clientId, token, fetch = globalThis.fetch, sleep = defaultSleep }) {
  let lastPostAt = 0;

  async function request(method, path, { params = {}, body } = {}) {
    const url = new URL(path, config.baseUrl);
    for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));

    for (let attempt = 0; ; attempt++) {
      if (method === 'POST') {
        const wait = config.postIntervalMs - (Date.now() - lastPostAt);
        if (wait > 0) await sleep(wait);
      }
      const res = await fetch(url.toString(), {
        method,
        headers: buildAuthHeaders(clientId, token),
        ...(body != null ? { body: JSON.stringify(body) } : {}),
      });
      if (method === 'POST') lastPostAt = Date.now();

      if (res.ok) return res.json().catch(() => null);
      if (RETRYABLE.has(res.status) && attempt < config.backoff.maxRetries) {
        const retryAfter = res.headers?.get?.('Retry-After');
        await sleep(retryAfter ? Number(retryAfter) * 1000 : backoffMs(attempt));
        continue;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(`Trakt ${res.status}: ${err.error ?? err.message ?? 'error'}`.trim());
    }
  }

  return {
    request,
    get: (path, params) => request('GET', path, { params }),
    post: (path, body) => request('POST', path, { body }),
    postHistory: (payload) => request('POST', '/sync/history', { body: payload }),
    postWatchlist: (payload) => request('POST', '/sync/watchlist', { body: payload }),
    postFavorites: (payload) => request('POST', '/sync/favorites', { body: payload }),
    getWatchedShows: () => request('GET', '/sync/watched/shows', { params: { extended: 'full' } }),
    getWatchedMovies: () => request('GET', '/sync/watched/movies', { params: { extended: 'full' } }),
    getWatchlist: (type) => request('GET', `/sync/watchlist/${type}`, { params: { extended: 'full' } }),
    getFavorites: (type) => request('GET', `/sync/favorites/${type}`, { params: { extended: 'full' } }),
    getUserLists: () => request('GET', '/users/me/lists'),
    createList: (body) => request('POST', '/users/me/lists', { body }),
    addToList: (slug, body) => request('POST', `/users/me/lists/${slug}/items`, { body }),
    getListItems: (slug, type = 'shows') => request('GET', `/users/me/lists/${slug}/items/${type}`),
  };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
