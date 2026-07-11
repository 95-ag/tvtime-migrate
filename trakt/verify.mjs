// trakt/verify.mjs — identity-based Trakt read-back reconciliation.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';
import { buildManifest } from './manifest.mjs';

export function reconcile(
  master,
  { historyEpisodes, watchedMovies, watchlistShows, watchlistMovies, favoriteShows, favoriteMovies },
  episodeMap = new Map(),
  showIdMap = new Map(),
  seasonSplitMap = new Map(),
  idOverrides = { watchlistShows: {}, movies: {} },
) {
  const toMinute = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : null);

  // Anime recovery (recover.mjs) maps our epTvdb -> Trakt's own (season, number) when Trakt numbers an
  // episode differently than TheTVDB (e.g. absolute-numbered anime). An episode may be present at EITHER
  // the mapped position (re-imported by recovery) OR its original position (imported fine the first time
  // because our numbering already matched Trakt's) — so check both and match on whichever exists.
  // Stale-tvdb resolution (resolve-shows.mjs) maps our showTvdb -> a DIFFERENT Trakt show id (same
  // episode numbering) — add that key too when the show is in the map.
  // Season-split recovery (season-splits.mjs) maps our (showTvdb, season) -> a DIFFERENT Trakt show id,
  // re-numbered under that show's Season 1 with our original episode numbers — add that key too.
  const keysFor = (ep) => {
    const original = `${ep.showTvdb}|${ep.season}|${ep.episode}`;
    const mapped = episodeMap.get(String(ep.epTvdb));
    const keys = mapped ? [`${ep.showTvdb}|${mapped.season}|${mapped.number}`, original] : [original];
    if (showIdMap.has(String(ep.showTvdb))) {
      keys.push(`trakt:${showIdMap.get(String(ep.showTvdb))}|${ep.season}|${ep.episode}`);
    }
    const splitTraktId = seasonSplitMap.get(`${ep.showTvdb}|${ep.season}`);
    if (splitTraktId != null) {
      keys.push(`trakt:${splitTraktId}|1|${ep.episode}`);
    }
    return keys;
  };

  const epIndex = new Map();
  for (const h of historyEpisodes ?? []) {
    const tvdb = h.show?.ids?.tvdb;
    const trakt = h.show?.ids?.trakt;
    if (!h.episode) continue;
    const keys = [];
    if (tvdb != null) keys.push(`${tvdb}|${h.episode.season}|${h.episode.number}`);
    if (trakt != null) keys.push(`trakt:${trakt}|${h.episode.season}|${h.episode.number}`);
    for (const key of keys) {
      const rec = epIndex.get(key) ?? { plays: 0, minutes: new Set() };
      rec.plays += 1;
      const m = toMinute(h.watched_at);
      if (m) rec.minutes.add(m);
      epIndex.set(key, rec);
    }
  }

  const episodesByOriginalKey = new Map();
  for (const ep of master.episodes) episodesByOriginalKey.set(`${ep.showTvdb}|${ep.season}|${ep.episode}`, ep);

  const rewatchIndex = new Map();
  for (const r of master.rewatch ?? []) {
    const src = episodesByOriginalKey.get(`${r.showTvdb}|${r.season}|${r.episode}`);
    const keys = src ? keysFor(src) : [`${r.showTvdb}|${r.season}|${r.episode}`];
    for (const k of keys) rewatchIndex.set(k, r.plays);
  }

  let matchedEpisodes = 0,
    dateFidelityEpisodes = 0,
    rewatchMatches = 0,
    rewatchTotal = 0;
  const missingFromReadback = [];
  for (const ep of master.episodes) {
    const keys = keysFor(ep);
    const foundKey = keys.find((k) => epIndex.has(k));
    const found = foundKey ? epIndex.get(foundKey) : undefined;
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
    const extra = rewatchIndex.get(foundKey) ?? 0;
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
  const movieTraktSet = new Set();
  for (const m of watchedMovies ?? []) {
    const mv = m.movie ?? {};
    const lw = toMinute(m.last_watched_at);
    if (mv.ids?.imdb) movieByImdb.set(mv.ids.imdb, lw);
    if (mv.title && mv.year) movieByTitleYear.set(`${String(mv.title).toLowerCase()}|${mv.year}`, lw);
    if (mv.ids?.trakt != null) movieTraktSet.add(mv.ids.trakt);
  }
  const watched = master.movies.filter((m) => m.watched);
  const withImdb = watched.filter((m) => m.imdb);
  const withoutImdb = watched.filter((m) => !m.imdb);
  let movieMatches = 0;
  for (const mv of withImdb) {
    const got = movieByImdb.get(mv.imdb);
    const wantMinute = toMinute(mv.watchedAt);
    if (got !== undefined && (got === wantMinute || (got && !mv.watchedAt))) {
      movieMatches++;
      continue;
    }
    // Item may have been added under a DIFFERENT trakt id (our imdb was stale on Trakt).
    const overrideTraktId = idOverrides.movies?.[mv.imdb];
    if (overrideTraktId != null && movieTraktSet.has(overrideTraktId)) {
      movieMatches++;
      continue;
    }
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
  const wlTraktSet = new Set((watchlistShows ?? []).map((e) => e.show?.ids?.trakt).filter((id) => id != null));
  const withEpisodes = new Set(master.episodes.map((e) => String(e.showTvdb)));
  const ptwShows = (master.planToWatch?.shows ?? []).filter((s) => !withEpisodes.has(String(s.tvdb)));
  const ptwMovies = master.planToWatch?.movies ?? [];
  let ptwMatches = 0;
  for (const s of ptwShows) {
    // Item may have been added under a DIFFERENT trakt id (our tvdb was stale on Trakt).
    const overrideTraktId = idOverrides.watchlistShows?.[String(s.tvdb)];
    if (wlShows.has(String(s.tvdb)) || (overrideTraktId != null && wlTraktSet.has(overrideTraktId))) ptwMatches++;
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
  const episodeMap = existsSync('build/trakt-episode-map.json')
    ? new Map(Object.entries(JSON.parse(readFileSync('build/trakt-episode-map.json', 'utf8'))))
    : new Map();
  const showIdMap = existsSync('build/trakt-show-map.json')
    ? new Map(Object.entries(JSON.parse(readFileSync('build/trakt-show-map.json', 'utf8'))))
    : new Map();
  const seasonSplitMap = existsSync('build/trakt-season-split-map.json')
    ? new Map(Object.entries(JSON.parse(readFileSync('build/trakt-season-split-map.json', 'utf8'))))
    : new Map();
  const idOverrides = existsSync('build/trakt-id-overrides.json')
    ? JSON.parse(readFileSync('build/trakt-id-overrides.json', 'utf8'))
    : { watchlistShows: {}, movies: {} };

  const r = reconcile(
    master,
    {
      historyEpisodes,
      watchedMovies,
      watchlistShows,
      watchlistMovies,
      favoriteShows,
      favoriteMovies,
    },
    episodeMap,
    showIdMap,
    seasonSplitMap,
    idOverrides,
  );
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
