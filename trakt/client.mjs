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

  async function requestRaw(method, path, { params = {}, body } = {}) {
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

      if (res.ok) return res;
      if (RETRYABLE.has(res.status) && attempt < config.backoff.maxRetries) {
        const retryAfter = res.headers?.get?.('Retry-After');
        await sleep(retryAfter ? Number(retryAfter) * 1000 : backoffMs(attempt));
        continue;
      }
      const err = await res.json().catch(() => ({}));
      throw new Error(`Trakt ${res.status}: ${err.error ?? err.message ?? 'error'}`.trim());
    }
  }

  async function request(method, path, opts) {
    const res = await requestRaw(method, path, opts);
    return res.json().catch(() => null);
  }

  async function requestMeta(method, path, opts) {
    const res = await requestRaw(method, path, opts);
    return { body: await res.json().catch(() => null), headers: res.headers };
  }

  async function getAll(path, params = {}) {
    const all = [];
    let page = 1;
    let pageCount = 1;
    do {
      const { body, headers } = await requestMeta('GET', path, { params: { ...params, page, limit: 1000 } });
      if (Array.isArray(body)) all.push(...body);
      const pc = Number(headers?.get?.('x-pagination-page-count'));
      pageCount = Number.isFinite(pc) && pc > 0 ? pc : 1;
      page += 1;
    } while (page <= pageCount);
    return all;
  }

  return {
    request,
    get: (path, params) => request('GET', path, { params }),
    post: (path, body) => request('POST', path, { body }),
    postHistory: (payload) => request('POST', '/sync/history', { body: payload }),
    postWatchlist: (payload) => request('POST', '/sync/watchlist', { body: payload }),
    postFavorites: (payload) => request('POST', '/sync/favorites', { body: payload }),
    getWatchedShows: () => getAll('/sync/watched/shows', { extended: 'full' }),
    getWatchedMovies: () => getAll('/sync/watched/movies', { extended: 'full' }),
    getWatchlist: (type) => getAll(`/sync/watchlist/${type}`, { extended: 'full' }),
    getFavorites: (type) => getAll(`/sync/favorites/${type}`, { extended: 'full' }),
    getUserLists: () => request('GET', '/users/me/lists'),
    createList: (body) => request('POST', '/users/me/lists', { body }),
    addToList: (slug, body) => request('POST', `/users/me/lists/${slug}/items`, { body }),
    getListItems: (slug, type = 'shows') => request('GET', `/users/me/lists/${slug}/items/${type}`),
  };
}

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));
