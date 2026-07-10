// simkl/verify.mjs — read-back reconciliation GATE. reconcile() is pure; the CLI does the sequential fetch.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';
import { requireClientId } from './config.mjs';
import { buildManifest } from './manifest.mjs';

const HISTORY_BUCKETS = new Set(['completed', 'watching', 'dropped']);

// Read-back entries nest ids under .show (shows/anime) or .movie (movies) — live-verified 2026-07-10.
const tvdbOf = (entry) => String(entry.show?.ids?.tvdb ?? entry.movie?.ids?.tvdb ?? entry.ids?.tvdb ?? '');

const bySE = (a, b) => a.season - b.season || a.episode - b.episode;
const bySEback = (a, b) => a.s - b.s || a.e - b.e;

export function reconcile(master, library) {
  const showEpIndex = new Map(); // regular shows lib: "tvdb|s|e" -> watched_at
  const animeEps = new Map(); // anime lib: tvdb -> sorted [{s,e,w}] (Simkl season-1 absolute)
  const statusByTvdb = new Map();

  for (const s of library.shows ?? []) {
    const t = tvdbOf(s);
    statusByTvdb.set(t, s.status);
    for (const se of s.seasons ?? [])
      for (const e of se.episodes ?? []) showEpIndex.set(`${t}|${se.number}|${e.number}`, e.watched_at);
  }
  for (const s of library.anime ?? []) {
    if (s.anime_type === 'movie') continue; // anime movies handled as movies below
    const t = tvdbOf(s);
    statusByTvdb.set(t, s.status);
    animeEps.set(
      t,
      (s.seasons ?? [])
        .flatMap((se) => se.episodes.map((e) => ({ s: se.number, e: e.number, w: e.watched_at })))
        .sort(bySEback),
    );
  }

  const masterByShow = new Map();
  for (const ep of master.episodes) {
    const t = String(ep.showTvdb);
    if (!masterByShow.has(t)) masterByShow.set(t, []);
    masterByShow.get(t).push(ep);
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

  for (const [t, eps] of masterByShow) {
    if (animeEps.has(t)) {
      // Anime: Simkl uses season-1 absolute numbering. Match regular-season episodes by absolute rank;
      // season-0 specials are not part of the absolute run, so check them as unmapped gaps.
      const regular = eps.filter((e) => e.season > 0).sort(bySE);
      const back = animeEps.get(t);
      for (let i = 0; i < regular.length; i++) {
        if (i < back.length) {
          matchedEpisodes++;
          if (regular[i].watchedAt === back[i].w) dateMatches++;
          else miss(regular[i], 'date_mismatch');
        } else miss(regular[i], 'absent_on_simkl');
      }
      for (const sp of eps.filter((e) => e.season === 0)) miss(sp, 'special_unmapped');
    } else {
      // Regular (or not-imported) show: match on (tvdb, season, episode) against the shows library.
      for (const ep of eps) {
        const key = `${t}|${ep.season}|${ep.episode}`;
        if (showEpIndex.has(key)) {
          matchedEpisodes++;
          if (showEpIndex.get(key) === ep.watchedAt) dateMatches++;
          else miss(ep, 'date_mismatch');
        } else miss(ep);
      }
    }
  }

  // Bucket check. Simkl "intelligently downgrades" completed→watching when not every episode it knows is
  // watched — that is acceptable Simkl behavior, not an import error, so classify it separately.
  const bucketMismatches = [];
  const bucketDowngrades = [];
  for (const s of master.shows) {
    if (!HISTORY_BUCKETS.has(s.simklBucket)) continue;
    const got = statusByTvdb.get(String(s.tvdb));
    if (!got || got === s.simklBucket) continue;
    if (s.simklBucket === 'completed' && got === 'watching')
      bucketDowngrades.push({ tvdb: s.tvdb, expected: s.simklBucket, got });
    else bucketMismatches.push({ tvdb: s.tvdb, expected: s.simklBucket, got });
  }

  const movieEntries = [...(library.movies ?? []), ...(library.anime ?? []).filter((e) => e.anime_type === 'movie')];
  const movieIndex = new Map(movieEntries.map((m) => [tvdbOf(m), m.watched_at ?? m.last_watched_at]));
  let movieMatches = 0;
  for (const mv of master.movies.filter((m) => m.watched))
    if (movieIndex.get(String(mv.tvdb)) === mv.watchedAt) movieMatches++;

  const totalEpisodes = master.episodes.length;
  const watchedMovies = master.movies.filter((m) => m.watched).length;
  const episodeCoverage = totalEpisodes ? matchedEpisodes / totalEpisodes : 1;
  const dateFidelity = matchedEpisodes ? dateMatches / matchedEpisodes : 1;
  const pass =
    episodeCoverage >= 0.99 && dateFidelity === 1 && bucketMismatches.length === 0 && movieMatches === watchedMovies;

  return {
    totalEpisodes,
    matchedEpisodes,
    episodeCoverage,
    dateFidelity,
    movieMatches,
    watchedMovies,
    bucketMismatches,
    bucketDowngrades,
    missingFromReadback,
    pass,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
  const client = makeClient({ clientId: requireClientId(), token: loadToken() });
  // Sequential per-type, no parallel, no date_from (Simkl anti-suspension). Anime is a separate library.
  const shows = await client.getAllItems('shows', 'all');
  const movies = await client.getAllItems('movies', 'all');
  const anime = await client.getAllItems('anime', 'all');
  const library = { shows: shows.shows ?? [], movies: movies.movies ?? [], anime: anime.anime ?? [] };
  const r = reconcile(master, library);
  const manifest = buildManifest({
    notFound: { shows: [], movies: [], episodes: [] },
    missingFromReadback: r.missingFromReadback,
  });
  writeFileSync('build/simkl-verify-report.json', JSON.stringify(r, null, 2));
  writeFileSync('build/simkl-manifest.json', JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify(
      {
        episodeCoverage: r.episodeCoverage,
        dateFidelity: r.dateFidelity,
        movieMatches: `${r.movieMatches}/${r.watchedMovies}`,
        bucketMismatches: r.bucketMismatches.length,
        bucketDowngrades: r.bucketDowngrades.length,
        notImported: manifest.count,
        pass: r.pass,
      },
      null,
      2,
    ),
  );
  if (!r.pass) process.exitCode = 1;
}
