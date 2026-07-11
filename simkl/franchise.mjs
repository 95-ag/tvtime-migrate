// simkl/franchise.mjs — build an identity map (tvdb season|episode) -> (simkl anime id, simkl episode number)
// from a show's Simkl anime franchise. The reliable join for anime that Simkl renumbers or splits per-cour.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';
import { requireClientId } from './config.mjs';

const CACHE = 'build/franchise-map.json';

// Pure: given fetched anime nodes (each { ids:{tvdb,simkl}, episodes:[{episode, tvdb:{season,episode}}] }),
// build "<season>|<episode>" -> {simkl, epNum} for nodes whose ids.tvdb === targetTvdb. First-wins on collision.
export function buildMapFromNodes(nodes, targetTvdb) {
  const map = new Map();
  let collisions = 0;
  for (const n of nodes) {
    if (String(n.ids?.tvdb ?? '') !== String(targetTvdb)) continue;
    for (const ep of n.episodes ?? []) {
      if (!ep.tvdb) continue;
      const key = `${ep.tvdb.season}|${ep.tvdb.episode}`;
      if (map.has(key)) {
        collisions++;
        continue;
      }
      map.set(key, { simkl: n.ids.simkl, epNum: ep.episode });
    }
  }
  return { map, collisions };
}

// Live: resolve a tvdb's franchise. Returns { type:'anime'|'tv'|'movie'|'none', map, collisions }.
// type!=='anime' → no episode map (regular show / not found).
export async function resolveFranchise(client, tvdb) {
  const found = await client.request('GET', '/search/id', { params: { tvdb } });
  const rec = Array.isArray(found) ? found[0] : found;
  if (!rec?.ids?.simkl) return { type: 'none', map: new Map(), collisions: 0 };
  if (rec.type !== 'anime') return { type: rec.type, map: new Map(), collisions: 0 };
  const root = await client.request('GET', `/anime/${rec.ids.simkl}`, {});
  const ids = new Set([rec.ids.simkl, ...(root?.relations ?? []).map((r) => r.ids?.simkl).filter(Boolean)]);
  const nodes = [];
  for (const id of ids) {
    const d = await client.request('GET', `/anime/${id}`, {});
    const episodes = await client.request('GET', `/anime/episodes/${id}`, {});
    nodes.push({ ids: d?.ids ?? {}, episodes: Array.isArray(episodes) ? episodes : [] });
  }
  const { map, collisions } = buildMapFromNodes(nodes, tvdb);
  return { type: 'anime', map, collisions };
}

// Live: build+cache maps for every distinct show tvdb in the master. Reads cache unless refresh=true.
// Resume-safe: writes the cache after EACH tvdb (not just at the end) and isolates per-tvdb failures
// so one bad show doesn't lose the rest of a multi-minute run; failed tvdbs are retried on the next call.
export async function buildAllMaps(client, master, { refresh = false, log = console.log, cachePath = CACHE } = {}) {
  const cache = !refresh && existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const tvdbs = [...new Set(master.episodes.map((e) => String(e.showTvdb)))];
  for (const tvdb of tvdbs) {
    if (cache[tvdb] && cache[tvdb].type !== 'error') continue;
    try {
      const { type, map, collisions } = await resolveFranchise(client, tvdb);
      cache[tvdb] = { type, entries: Object.fromEntries(map), collisions };
      log(`franchise ${tvdb}: type=${type} entries=${map.size} collisions=${collisions}`);
    } catch (e) {
      cache[tvdb] = { type: 'error', error: String(e?.message ?? e), entries: {} };
      log(`franchise ${tvdb}: ERROR ${e?.message ?? e}`);
    }
    writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  }
  return cache;
}

// Load a cached map for a tvdb as a Map, or null if absent/not anime.
export function loadMap(cache, tvdb) {
  const c = cache?.[String(tvdb)];
  if (c?.type !== 'anime') return null;
  return new Map(Object.entries(c.entries));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
  const client = makeClient({ clientId: requireClientId(), token: loadToken() });
  const cache = await buildAllMaps(client, master, { refresh: process.argv.includes('--refresh') });
  const vals = Object.values(cache);
  const anime = vals.filter((c) => c.type === 'anime').length;
  const tv = vals.filter((c) => c.type === 'tv').length;
  const errors = vals.filter((c) => c.type === 'error').length;
  console.log(
    `franchise cache: ${vals.length} shows (${anime} anime, ${tv} tv, ${errors} errors) → build/franchise-map.json`,
  );
}
