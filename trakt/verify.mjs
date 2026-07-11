// trakt/verify.mjs — identity-based Trakt read-back reconciliation.
import { readFileSync, writeFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';
import { buildManifest } from './manifest.mjs';

export function reconcile(
  master,
  { watchedShows, watchedMovies, watchlistShows, watchlistMovies, favoriteShows, favoriteMovies },
) {
  const showIndex = new Map();
  for (const entry of watchedShows ?? []) {
    const tvdb = String(entry.show?.ids?.tvdb ?? '');
    if (!tvdb) continue;
    const eps = new Map();
    for (const se of entry.seasons ?? [])
      for (const e of se.episodes ?? [])
        eps.set(`${se.number}|${e.number}`, { plays: e.plays, last_watched_at: e.last_watched_at });
    showIndex.set(tvdb, eps);
  }
  const rewatchIndex = new Map();
  for (const r of master.rewatch ?? []) rewatchIndex.set(`${r.showTvdb}|${r.season}|${r.episode}`, r.plays);

  let matchedEpisodes = 0,
    dateFidelityEpisodes = 0,
    rewatchMatches = 0,
    rewatchTotal = 0;
  const missingFromReadback = [];
  for (const ep of master.episodes) {
    const found = showIndex.get(String(ep.showTvdb))?.get(`${ep.season}|${ep.episode}`);
    if (!found) {
      missingFromReadback.push({
        kind: 'episode',
        tvdb: Number(ep.showTvdb),
        season: ep.season,
        episode: ep.episode,
        reason: 'absent',
      });
      continue;
    }
    matchedEpisodes++;
    const extra = rewatchIndex.get(`${ep.showTvdb}|${ep.season}|${ep.episode}`) ?? 0;
    if (extra > 0) {
      rewatchTotal++;
      if (found.plays >= 1 + extra) rewatchMatches++;
      else
        missingFromReadback.push({
          kind: 'episode',
          tvdb: Number(ep.showTvdb),
          season: ep.season,
          episode: ep.episode,
          reason: 'rewatch_play_count',
          expected: 1 + extra,
          got: found.plays,
        });
    } else {
      if (!ep.watchedAt || found.last_watched_at === ep.watchedAt) dateFidelityEpisodes++;
      else
        missingFromReadback.push({
          kind: 'episode',
          tvdb: Number(ep.showTvdb),
          season: ep.season,
          episode: ep.episode,
          reason: 'date_mismatch',
          expected: ep.watchedAt,
          got: found.last_watched_at,
        });
    }
  }

  const movieIndex = new Map();
  for (const m of watchedMovies ?? []) if (m.movie?.ids?.imdb) movieIndex.set(m.movie.ids.imdb, m.last_watched_at);
  let movieMatches = 0;
  const watched = master.movies.filter((m) => m.watched);
  for (const mv of watched) {
    const got = movieIndex.get(mv.imdb);
    if (got === mv.watchedAt || (got && !mv.watchedAt)) movieMatches++;
    else
      missingFromReadback.push({
        kind: 'movie',
        imdb: mv.imdb,
        title: mv.title,
        reason: got === undefined ? 'absent' : 'date_mismatch',
        expected: mv.watchedAt,
        got,
      });
  }

  const wlShows = new Set((watchlistShows ?? []).map((e) => String(e.show?.ids?.tvdb ?? '')));
  const wlMovies = new Set((watchlistMovies ?? []).map((e) => e.movie?.ids?.imdb ?? ''));
  const withEpisodes = new Set(master.episodes.map((e) => String(e.showTvdb)));
  const ptwShows = (master.planToWatch?.shows ?? []).filter((s) => !withEpisodes.has(String(s.tvdb)));
  const ptwMovies = master.planToWatch?.movies ?? [];
  let ptwMatches = 0;
  for (const s of ptwShows) {
    if (wlShows.has(String(s.tvdb))) ptwMatches++;
    else missingFromReadback.push({ kind: 'ptw-show', tvdb: s.tvdb, reason: 'absent_from_watchlist' });
  }
  for (const m of ptwMovies) {
    if (wlMovies.has(m.imdb)) ptwMatches++;
    else missingFromReadback.push({ kind: 'ptw-movie', imdb: m.imdb, reason: 'absent_from_watchlist' });
  }
  const ptwTotal = ptwShows.length + ptwMovies.length;

  const favShowSet = new Set((favoriteShows ?? []).map((e) => String(e.show?.ids?.tvdb ?? '')));
  const favMovieSet = new Set((favoriteMovies ?? []).map((e) => e.movie?.ids?.imdb ?? ''));
  const favS = master.favorites?.shows ?? [];
  const favM = master.favorites?.movies ?? [];
  let favMatches = 0;
  for (const s of favS) {
    if (favShowSet.has(String(s.tvdb))) favMatches++;
    else missingFromReadback.push({ kind: 'favorite-show', tvdb: s.tvdb, reason: 'absent_from_favorites' });
  }
  for (const m of favM) {
    if (favMovieSet.has(m.imdb)) favMatches++;
    else missingFromReadback.push({ kind: 'favorite-movie', imdb: m.imdb, reason: 'absent_from_favorites' });
  }
  const favTotal = favS.length + favM.length;

  const totalEpisodes = master.episodes.length;
  const episodeCoverage = totalEpisodes ? matchedEpisodes / totalEpisodes : 1;
  const nonRewatchMatched = matchedEpisodes - rewatchTotal;
  const dateFidelity = nonRewatchMatched ? dateFidelityEpisodes / nonRewatchMatched : 1;
  const pass =
    episodeCoverage >= 0.99 &&
    dateFidelity === 1 &&
    rewatchMatches === rewatchTotal &&
    movieMatches === watched.length &&
    ptwMatches === ptwTotal &&
    favMatches === favTotal;

  return {
    totalEpisodes,
    matchedEpisodes,
    episodeCoverage,
    dateFidelity,
    rewatchMatches,
    rewatchTotal,
    movieMatches,
    watchedMovies: watched.length,
    ptwMatches,
    ptwTotal,
    favMatches,
    favTotal,
    missingFromReadback,
    pass,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
  const client = makeClient({ clientId: requireEnv('TRAKT_CLIENT_ID'), token: loadToken() });
  const watchedShows = await client.getWatchedShows();
  const watchedMovies = await client.getWatchedMovies();
  const watchlistShows = await client.getWatchlist('shows');
  const watchlistMovies = await client.getWatchlist('movies');
  const favoriteShows = await client.getFavorites('shows');
  const favoriteMovies = await client.getFavorites('movies');

  const r = reconcile(master, {
    watchedShows,
    watchedMovies,
    watchlistShows,
    watchlistMovies,
    favoriteShows,
    favoriteMovies,
  });
  const payload = JSON.parse(readFileSync('build/trakt-payload.json', 'utf8'));
  const manifest = buildManifest({
    notFound: {},
    missingFromReadback: r.missingFromReadback,
    unbridgedRewatch: master.rewatchDropped ?? [],
    skippedLists: payload.skippedLists ?? [],
    unresolvedListMovies: payload.unresolvedListMovies ?? [],
    skippedMovies: payload.skippedMovies ?? [],
  });
  writeFileSync('build/trakt-verify-report.json', JSON.stringify(r, null, 2));
  writeFileSync('build/trakt-manifest.json', JSON.stringify(manifest, null, 2));
  console.log(
    JSON.stringify(
      {
        episodeCoverage: `${(r.episodeCoverage * 100).toFixed(2)}%`,
        dateFidelity: `${(r.dateFidelity * 100).toFixed(2)}%`,
        movies: `${r.movieMatches}/${r.watchedMovies}`,
        ptw: `${r.ptwMatches}/${r.ptwTotal}`,
        favorites: `${r.favMatches}/${r.favTotal}`,
        rewatchMatches: r.rewatchMatches,
        notImported: manifest.count,
        pass: r.pass,
      },
      null,
      2,
    ),
  );
  if (!r.pass) process.exitCode = 1;
}
