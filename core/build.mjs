// Orchestrates the master build: load data/ -> merge -> write build/master.json (deterministic) -> summary.
// data/ is read-only; the only write is build/master.json. No wall-clock in the output (determinism gate).
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import {
  loadRefractEpisodes,
  loadRefractSeries,
  loadRefractMovies,
  loadRescueEpisodes,
  loadRescueShows,
  loadGdprRewatch,
} from './sources.mjs';
import { buildEpisodes } from './merge-episodes.mjs';
import { buildMovies, buildShows, buildPlanToWatch, buildDropped } from './merge-catalog.mjs';
import { buildNameToTvdb, buildRewatch } from './merge-rewatch.mjs';
import { checkIdIntegrity } from './verify-ids.mjs';
import { buildLists, buildFavorites } from './lists.mjs';

const DATA = new URL('../data/', import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, DATA), 'utf8');
const rj = (rel) => JSON.parse(rd(rel));

// The Refract export names files with the export DATE (e.g. tvtime-series-2026-07-07.csv). Resolve by
// pattern so any user's export loads without editing this file — exactly one match is expected per pattern.
function pick(subdir, pattern) {
  const matches = readdirSync(new URL(`${subdir}/`, DATA))
    .filter((f) => pattern.test(f))
    .sort();
  if (matches.length === 0) throw new Error(`No file matching ${pattern} in data/${subdir}/`);
  if (matches.length > 1)
    throw new Error(`Multiple files match ${pattern} in data/${subdir}/ (${matches.join(', ')}) — keep only one.`);
  return `${subdir}/${matches[0]}`;
}

export function buildMaster() {
  const refractEps = loadRefractEpisodes(rd(pick('refract', /^tvtime-series-episodes-.*\.csv$/)));
  const refractSeries = loadRefractSeries(rd(pick('refract', /^tvtime-series-\d.*\.csv$/)));
  const refractMovies = loadRefractMovies(rd(pick('refract', /^tvtime-movies-.*\.csv$/)));
  const rescueEps = loadRescueEpisodes(rd('rescue/episodes.csv'));
  const rescueShows = loadRescueShows(rd('rescue/shows.csv'));
  const gdprRewatch = loadGdprRewatch(rd('gdpr/rewatched_episode.csv'));
  const rawLists = rj(pick('refract', /^tvtime-lists-.*\.json$/));
  const rawSeriesJson = rj(pick('refract', /^tvtime-series-\d.*\.json$/));
  const rawMoviesJson = rj(pick('refract', /^tvtime-movies-.*\.json$/));

  checkIdIntegrity(refractSeries, rescueShows);

  const episodes = buildEpisodes(refractEps, rescueEps);
  const movies = buildMovies(refractMovies);
  const shows = buildShows(refractSeries, rescueShows);
  const planToWatch = buildPlanToWatch(refractSeries, rescueShows, refractMovies);
  const droppedShows = buildDropped(refractSeries);
  const { bridged: rewatch, dropped: rewatchDropped } = buildRewatch(gdprRewatch, buildNameToTvdb(shows));
  const lists = buildLists(rawLists, movies);
  const favorites = buildFavorites(rawSeriesJson, rawMoviesJson);

  const counts = {
    episodes: episodes.length,
    movies: movies.length,
    shows: shows.length,
    planToWatchShows: planToWatch.shows.length,
    planToWatchMovies: planToWatch.movies.length,
    droppedShows: droppedShows.length,
    rewatchEpisodes: rewatch.length,
    rewatchPlays: rewatch.reduce((a, r) => a + r.plays, 0),
    rewatchDropped: rewatchDropped.length,
    lists: lists.length,
    favoriteShows: favorites.shows.length,
    favoriteMovies: favorites.movies.length,
  };
  return {
    counts,
    episodes,
    movies,
    shows,
    planToWatch,
    droppedShows,
    rewatch,
    rewatchDropped,
    lists,
    favorites,
  };
}

function main() {
  const master = buildMaster();
  mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../build/master.json', import.meta.url), JSON.stringify(master, null, 2));
  for (const [k, v] of Object.entries(master.counts)) console.log(k.padEnd(20), v);
}

// Run only as a script, not on import (tests import buildMaster directly).
if (import.meta.url === `file://${process.argv[1]}`) main();
