// simkl/verify.mjs — identity-based, franchise-aware read-back reconciliation gate.
// Matches each master episode by IDENTITY: resolve its target (Simkl anime id + episode number) via the
// franchise cache or an override, then check that exact entry. Anime read-back is indexed by SIMKL ID (never
// by tvdb) so split-per-cour shows are fully measured and a middle gap cannot cascade.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';
import { requireClientId } from './config.mjs';
import { buildManifest, renderManifest } from './manifest.mjs';
import { lookupOverride } from './overrides.mjs';

const HISTORY_BUCKETS = new Set(['completed', 'watching', 'dropped']);
const tvdbOf = (e) => String(e.show?.ids?.tvdb ?? e.movie?.ids?.tvdb ?? '');
const simklOf = (e) => String(e.show?.ids?.simkl ?? e.movie?.ids?.simkl ?? '');

function indexShows(showsLib) {
  const byTvdb = new Map();
  const bySimkl = new Map();
  const statusByTvdb = new Map();
  for (const s of showsLib ?? []) {
    const eps = new Map();
    for (const se of s.seasons ?? [])
      for (const e of se.episodes ?? []) eps.set(`${se.number}|${e.number}`, e.watched_at);
    const t = tvdbOf(s);
    const sk = simklOf(s);
    if (t) {
      byTvdb.set(t, eps);
      statusByTvdb.set(t, s.status);
    }
    if (sk) bySimkl.set(sk, eps);
  }
  return { byTvdb, bySimkl, statusByTvdb };
}

function indexAnime(animeLib) {
  const bySimkl = new Map();
  const tvdbSet = new Set();
  for (const s of animeLib ?? []) {
    if (s.anime_type === 'movie') continue;
    const eps = new Map();
    for (const se of s.seasons ?? []) for (const e of se.episodes ?? []) eps.set(e.number, e.watched_at);
    bySimkl.set(simklOf(s), eps);
    const t = tvdbOf(s);
    if (t) tvdbSet.add(t);
  }
  return { bySimkl, tvdbSet };
}

export function reconcile(master, library, franchiseCache = {}, overrideFn = lookupOverride) {
  const shows = indexShows(library.shows);
  const anime = indexAnime(library.anime);
  const movieByTvdb = new Map();
  const movieBySimkl = new Map();
  for (const m of [...(library.movies ?? []), ...(library.anime ?? []).filter((e) => e.anime_type === 'movie')]) {
    const d = m.watched_at ?? m.last_watched_at;
    if (tvdbOf(m)) movieByTvdb.set(tvdbOf(m), d);
    if (simklOf(m)) movieBySimkl.set(simklOf(m), d);
  }

  let matchedEpisodes = 0;
  let dateMatches = 0;
  const missingFromReadback = [];
  const miss = (ep, detail) =>
    missingFromReadback.push({
      kind: 'episode',
      ids: { tvdb: Number(ep.showTvdb) },
      season: ep.season,
      episode: ep.episode,
      ...(detail ? { reason_detail: detail } : {}),
    });

  for (const ep of master.episodes) {
    const tvdb = String(ep.showTvdb);
    const fr = franchiseCache[tvdb];
    const ov = overrideFn(tvdb, ep.season);
    let got;
    let hadTarget = true;
    if (fr?.type === 'anime' || ov?.type === 'anime') {
      const mapHit = fr?.type === 'anime' ? fr.entries?.[`${ep.season}|${ep.episode}`] : null;
      if (mapHit) got = anime.bySimkl.get(String(mapHit.simkl))?.get(mapHit.epNum);
      else if (ov?.type === 'anime') got = anime.bySimkl.get(String(ov.simkl))?.get(ep.episode);
      else hadTarget = false; // anime show but this episode has no map/override target
    } else if (ov?.type === 'tv') {
      got = shows.bySimkl.get(String(ov.simkl))?.get(`${ep.season}|${ep.episode}`);
    } else {
      got = shows.byTvdb.get(tvdb)?.get(`${ep.season}|${ep.episode}`);
    }
    if (got !== undefined) {
      matchedEpisodes++;
      if (got === ep.watchedAt) dateMatches++;
      else miss(ep, 'date_mismatch');
    } else miss(ep, hadTarget ? 'absent_on_simkl' : 'unmapped');
  }

  // Buckets: only for regular tv shows (single well-defined status). Anime status is per-sub-anime → skip.
  const bucketMismatches = [];
  const bucketDowngrades = [];
  for (const s of master.shows) {
    if (!HISTORY_BUCKETS.has(s.simklBucket)) continue;
    const t = String(s.tvdb);
    if (franchiseCache[t]?.type === 'anime' || overrideFn(t)?.type === 'anime') continue;
    const got = shows.statusByTvdb.get(t);
    if (!got || got === s.simklBucket) continue;
    if (s.simklBucket === 'completed' && got === 'watching')
      bucketDowngrades.push({ tvdb: s.tvdb, expected: s.simklBucket, got });
    else bucketMismatches.push({ tvdb: s.tvdb, expected: s.simklBucket, got });
  }

  const dualLibraryTvdbs = [...shows.byTvdb.keys()].filter((t) => anime.tvdbSet.has(t));

  let movieMatches = 0;
  const watched = master.movies.filter((m) => m.watched);
  for (const mv of watched) {
    const ov = overrideFn(String(mv.tvdb));
    const got = ov?.type === 'movie' ? movieBySimkl.get(String(ov.simkl)) : movieByTvdb.get(String(mv.tvdb));
    if (got === mv.watchedAt) movieMatches++;
    else
      missingFromReadback.push({
        kind: 'movie',
        ids: { tvdb: Number(mv.tvdb), ...(mv.imdb ? { imdb: mv.imdb } : {}) },
        reason_detail: got === undefined ? 'absent_on_simkl' : 'date_mismatch',
      });
  }

  // Plan-to-watch presence. Overlap shows (PTW + watched episodes) are verified via their episodes; skip them.
  const withEpisodes = new Set(master.episodes.map((e) => String(e.showTvdb)));
  const ptwShows = (master.planToWatch?.shows ?? []).filter((s) => !withEpisodes.has(String(s.tvdb)));
  const ptwMovies = master.planToWatch?.movies ?? [];
  let ptwMatches = 0;
  for (const s of ptwShows) {
    if (shows.byTvdb.has(String(s.tvdb)) || anime.tvdbSet.has(String(s.tvdb))) ptwMatches++;
    else
      missingFromReadback.push({
        kind: 'plantowatch-show',
        ids: { tvdb: Number(s.tvdb) },
        reason_detail: 'ptw_absent',
      });
  }
  for (const m of ptwMovies) {
    if (movieByTvdb.has(String(m.tvdb))) ptwMatches++;
    else
      missingFromReadback.push({
        kind: 'plantowatch-movie',
        ids: { tvdb: Number(m.tvdb) },
        reason_detail: 'ptw_absent',
      });
  }
  const ptwTotal = ptwShows.length + ptwMovies.length;

  const totalEpisodes = master.episodes.length;
  const episodeCoverage = totalEpisodes ? matchedEpisodes / totalEpisodes : 1;
  const dateFidelity = matchedEpisodes ? dateMatches / matchedEpisodes : 1;
  const pass =
    episodeCoverage >= 0.99 &&
    dateFidelity === 1 &&
    bucketMismatches.length === 0 &&
    movieMatches === watched.length &&
    ptwMatches === ptwTotal;
  return {
    totalEpisodes,
    matchedEpisodes,
    episodeCoverage,
    dateFidelity,
    movieMatches,
    watchedMovies: watched.length,
    bucketMismatches,
    bucketDowngrades,
    dualLibraryTvdbs,
    ptwMatches,
    ptwTotal,
    missingFromReadback,
    pass,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
  const franchiseCache = existsSync('build/franchise-map.json')
    ? JSON.parse(readFileSync('build/franchise-map.json', 'utf8'))
    : {};
  const client = makeClient({ clientId: requireClientId(), token: loadToken() });
  const showsR = await client.getAllItems('shows', 'all');
  const moviesR = await client.getAllItems('movies', 'all');
  const animeR = await client.getAllItems('anime', 'all');
  const library = { shows: showsR.shows ?? [], movies: moviesR.movies ?? [], anime: animeR.anime ?? [] };
  const r = reconcile(master, library, franchiseCache);
  const manifest = buildManifest({
    notFound: { shows: [], movies: [], episodes: [] },
    missingFromReadback: r.missingFromReadback,
  });
  writeFileSync('build/simkl-verify-report.json', JSON.stringify(r, null, 2));
  writeFileSync('build/simkl-manifest.json', JSON.stringify(manifest, null, 2));
  writeFileSync('build/simkl-manifest.md', renderManifest(manifest.items, master, 'Simkl'));
  console.log(
    JSON.stringify(
      {
        episodeCoverage: r.episodeCoverage,
        dateFidelity: r.dateFidelity,
        movieMatches: `${r.movieMatches}/${r.watchedMovies}`,
        plantowatch: `${r.ptwMatches}/${r.ptwTotal}`,
        bucketMismatches: r.bucketMismatches.length,
        bucketDowngrades: r.bucketDowngrades.length,
        dualLibraryTvdbs: r.dualLibraryTvdbs.length,
        notImported: manifest.count,
        pass: r.pass,
      },
      null,
      2,
    ),
  );
  if (!r.pass) process.exitCode = 1;
}
