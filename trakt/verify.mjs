// trakt/verify.mjs — identity-based Trakt read-back reconciliation.
import { readFileSync, writeFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';
import { buildManifest } from './manifest.mjs';

export function reconcile(
  master,
  { historyEpisodes, watchedMovies, watchlistShows, watchlistMovies, favoriteShows, favoriteMovies },
) {
  const toMinute = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : null);

  const epIndex = new Map();
  for (const h of historyEpisodes ?? []) {
    const tvdb = h.show?.ids?.tvdb;
    if (tvdb == null || !h.episode) continue;
    const key = `${tvdb}|${h.episode.season}|${h.episode.number}`;
    const rec = epIndex.get(key) ?? { plays: 0, minutes: new Set() };
    rec.plays += 1;
    const m = toMinute(h.watched_at);
    if (m) rec.minutes.add(m);
    epIndex.set(key, rec);
  }

  const rewatchIndex = new Map();
  for (const r of master.rewatch ?? []) rewatchIndex.set(`${r.showTvdb}|${r.season}|${r.episode}`, r.plays);

  let matchedEpisodes = 0,
    dateFidelityEpisodes = 0,
    rewatchMatches = 0,
    rewatchTotal = 0;
  const missingFromReadback = [];
  for (const ep of master.episodes) {
    const found = epIndex.get(`${ep.showTvdb}|${ep.season}|${ep.episode}`);
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
      const want = toMinute(ep.watchedAt);
      if (!ep.watchedAt || found.minutes.has(want)) dateFidelityEpisodes++;
      else
        missingFromReadback.push({
          kind: 'episode',
          tvdb: Number(ep.showTvdb),
          season: ep.season,
          episode: ep.episode,
          reason: 'date_mismatch',
          expected: want,
        });
    }
  }

  // Movies: strict imdb match for movies WITH imdb; best-effort title+year for the
  // few sent without imdb (unresolved uuid->imdb), which never fail the gate.
  const movieByImdb = new Map();
  const movieByTitleYear = new Map();
  for (const m of watchedMovies ?? []) {
    const mv = m.movie ?? {};
    const lw = toMinute(m.last_watched_at);
    if (mv.ids?.imdb) movieByImdb.set(mv.ids.imdb, lw);
    if (mv.title && mv.year) movieByTitleYear.set(`${String(mv.title).toLowerCase()}|${mv.year}`, lw);
  }
  const watched = master.movies.filter((m) => m.watched);
  const withImdb = watched.filter((m) => m.imdb);
  const withoutImdb = watched.filter((m) => !m.imdb);
  let movieMatches = 0;
  for (const mv of withImdb) {
    const got = movieByImdb.get(mv.imdb);
    const wantMinute = toMinute(mv.watchedAt);
    if (got !== undefined && (got === wantMinute || (got && !mv.watchedAt))) movieMatches++;
    else
      missingFromReadback.push({
        kind: 'movie',
        imdb: mv.imdb,
        title: mv.title,
        reason: got === undefined ? 'absent' : 'date_mismatch',
        expected: wantMinute,
        got,
      });
  }
  let movieTitleYearMatches = 0;
  const unverifiableMovies = [];
  for (const mv of withoutImdb) {
    const key = mv.title && mv.year ? `${String(mv.title).toLowerCase()}|${mv.year}` : null;
    if (key && movieByTitleYear.has(key)) movieTitleYearMatches++;
    else
      unverifiableMovies.push({
        kind: 'movie',
        title: mv.title,
        year: mv.year,
        reason: 'sent_by_title_year_unverified',
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
    movieMatches === withImdb.length &&
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
    moviesWithImdb: withImdb.length,
    movieTitleYearMatches,
    unverifiableMovies,
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
  const historyEpisodes = await client.getHistory('episodes');
  const watchedMovies = await client.getWatchedMovies();
  const watchlistShows = await client.getWatchlist('shows');
  const watchlistMovies = await client.getWatchlist('movies');
  const favoriteShows = await client.getFavorites('shows');
  const favoriteMovies = await client.getFavorites('movies');

  const r = reconcile(master, {
    historyEpisodes,
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
        movies: `${r.movieMatches}/${r.moviesWithImdb}`,
        rewatch: `${r.rewatchMatches}/${r.rewatchTotal}`,
        unverifiableMovies: r.unverifiableMovies.length,
        ptw: `${r.ptwMatches}/${r.ptwTotal}`,
        favorites: `${r.favMatches}/${r.favTotal}`,
        notImported: manifest.count,
        pass: r.pass,
      },
      null,
      2,
    ),
  );
  if (!r.pass) process.exitCode = 1;
}
