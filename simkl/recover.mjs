// simkl/recover.mjs — gap-triggered recovery: map each gap-show episode to its correct Simkl target via the
// franchise episode-map, else a manual override, else mark unresolved. Then send. Idempotent.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadToken } from './auth.mjs';
import { chunkShows, makeClient } from './client.mjs';
import { requireClientId } from './config.mjs';
import { buildAllMaps, loadMap } from './franchise.mjs';
import { buildManifest } from './manifest.mjs';
import { lookupOverride } from './overrides.mjs';

// Pure: route each gap-show regular episode to a Simkl target. mapFor(tvdb)->Map|null, overrideFor(tvdb,season)->override|null.
export function planRecovery(master, gapTvdbs, mapFor, overrideFor) {
  const gaps = new Set([...gapTvdbs].map(String));
  const bySimkl = new Map(); // simkl -> Map<seasonNumber, Map<epNumber, watched_at>>
  const unresolved = [];
  let collisions = 0;
  const add = (simkl, seasonNum, epNum, watchedAt) => {
    if (!bySimkl.has(simkl)) bySimkl.set(simkl, new Map());
    const seasons = bySimkl.get(simkl);
    if (!seasons.has(seasonNum)) seasons.set(seasonNum, new Map());
    const eps = seasons.get(seasonNum);
    if (eps.has(epNum)) {
      collisions++;
      return; // first-wins, counted (not silently discarded)
    }
    eps.set(epNum, watchedAt);
  };
  for (const ep of master.episodes) {
    const tvdb = String(ep.showTvdb);
    if (!gaps.has(tvdb) || ep.season === 0) continue;
    const hit = mapFor(tvdb)?.get(`${ep.season}|${ep.episode}`);
    if (hit) {
      add(hit.simkl, 1, hit.epNum, ep.watchedAt);
      continue;
    }
    const ov = overrideFor(tvdb, ep.season);
    if (ov?.type === 'tv') {
      add(ov.simkl, ep.season, ep.episode, ep.watchedAt);
      continue;
    }
    if (ov?.type === 'anime') {
      add(ov.simkl, 1, ep.episode, ep.watchedAt);
      continue;
    }
    unresolved.push({ tvdb: Number(tvdb), season: ep.season, episode: ep.episode });
  }
  const shows = [...bySimkl.entries()].map(([simkl, seasons]) => ({
    ids: { simkl },
    seasons: [...seasons.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, eps]) => ({
        number,
        episodes: [...eps.entries()].sort((a, b) => a[0] - b[0]).map(([n, w]) => ({ number: n, watched_at: w })),
      })),
  }));
  return { payload: { shows }, unresolved, collisions };
}

// Gap tvdbs = shows with any episode on the verify manifest (absent/mismatch/not-confirmed) + full misses.
function gapTvdbsFromReport(report) {
  return [...new Set((report?.missingFromReadback ?? []).map((m) => String(m.ids?.tvdb)).filter(Boolean))];
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
  const report = existsSync('build/simkl-verify-report.json')
    ? JSON.parse(readFileSync('build/simkl-verify-report.json', 'utf8'))
    : { missingFromReadback: [] };
  const gapTvdbs = gapTvdbsFromReport(report);
  const client = makeClient({ clientId: requireClientId(), token: loadToken() });
  const cache = await buildAllMaps(client, master); // builds/uses build/franchise-map.json
  const { payload, unresolved, collisions } = planRecovery(master, gapTvdbs, (t) => loadMap(cache, t), lookupOverride);

  const notFound = { shows: [], movies: [], episodes: [] };
  let added = 0;
  for (const chunk of chunkShows(payload.shows, 20)) {
    const res = await client.postHistory({ shows: chunk });
    added += res?.added?.episodes ?? 0;
    for (const k of ['shows', 'movies', 'episodes']) for (const it of res?.not_found?.[k] ?? []) notFound[k].push(it);
  }
  const manifest = buildManifest({
    notFound,
    missingFromReadback: unresolved.map((u) => ({
      kind: 'episode',
      ids: { tvdb: u.tvdb },
      season: u.season,
      episode: u.episode,
      reason_detail: 'unrecoverable',
    })),
  });
  writeFileSync(
    'build/simkl-recovery-report.json',
    JSON.stringify(
      { addedEpisodes: added, targets: payload.shows.length, unresolved: unresolved.length, collisions },
      null,
      2,
    ),
  );
  writeFileSync('build/simkl-recovery-manifest.json', JSON.stringify(manifest, null, 2));
  console.log(
    `Recovery: sent to ${payload.shows.length} Simkl targets, addedEpisodes=${added}, unresolved=${unresolved.length}, collisions=${collisions}.`,
  );
}
