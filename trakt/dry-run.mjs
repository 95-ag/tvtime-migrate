// trakt/dry-run.mjs — assemble + validate all Trakt payloads, print summary. No network.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildFavoritesPayload } from './favorites.mjs';
import { buildContentLists, buildDroppedShows } from './lists.mjs';
import { buildHistoryPayload, buildRewatchPayload, buildWatchlistPayload } from './payload.mjs';

export function assemble(masterPath = 'build/master.json') {
  const master = JSON.parse(readFileSync(masterPath, 'utf8'));
  const history = buildHistoryPayload(master);
  const rewatch = buildRewatchPayload(master.rewatch ?? [], master.episodes ?? []);
  const watchlist = buildWatchlistPayload(master);
  const favorites = buildFavoritesPayload(master);
  const { lists, skipped, unresolvedMovies } = buildContentLists(master);
  const droppedShows = (master.shows ?? []).filter((s) => s.simklBucket === 'dropped');
  const dropped = buildDroppedShows(droppedShows);
  const skippedMovies = [...(history.skippedMovies ?? []), ...(watchlist.skippedMovies ?? [])];
  return {
    history,
    rewatch,
    watchlist,
    favorites,
    contentLists: lists,
    droppedList: { name: 'Dropped', ...dropped },
    skippedLists: skipped,
    unresolvedListMovies: unresolvedMovies,
    rewatchDropped: master.rewatchDropped ?? [],
    skippedMovies,
  };
}

export function summarize(p) {
  const epCount = p.history.shows.reduce((n, s) => n + s.seasons.reduce((m, se) => m + se.episodes.length, 0), 0);
  return {
    episodes: epCount,
    movies: p.history.movies.length,
    shows: p.history.shows.length,
    rewatchPlays: p.rewatch.shows.length,
    ptwShows: p.watchlist.shows.length,
    ptwMovies: p.watchlist.movies.length,
    favShows: p.favorites.shows.length,
    favMovies: p.favorites.movies.length,
    contentLists: p.contentLists.map((l) => `${l.name}:${l.shows.length}s/${l.movies.length}m`),
    droppedList: p.droppedList.shows.length,
    skippedLists: p.skippedLists,
    unresolvedListMovies: p.unresolvedListMovies.length,
    unbridgedRewatch: p.rewatchDropped.length,
    skippedMovies: p.skippedMovies.length,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const payload = assemble();
  console.log(JSON.stringify(summarize(payload), null, 2));
  writeFileSync('build/trakt-payload.json', JSON.stringify(payload, null, 2));
  console.log('\nPayload written to build/trakt-payload.json (gitignored).');
  console.log(
    'Next: npm run auth:trakt → npm run probe:trakt → (manual UI wipe) → npm run import:trakt → npm run verify:trakt',
  );
}
