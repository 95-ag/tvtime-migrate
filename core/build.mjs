// Orchestrates the master build: load data/ -> merge -> write build/master.json (deterministic) -> summary.
// data/ is read-only; the only write is build/master.json. No wall-clock in the output (determinism gate).
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  loadRefractEpisodes, loadRefractSeries, loadRefractMovies,
  loadRescueEpisodes, loadRescueShows, loadGdprRewatch,
} from './sources.mjs';
import { buildEpisodes } from './merge-episodes.mjs';
import { buildMovies, buildShows, buildPlanToWatch, buildDropped } from './merge-catalog.mjs';
import { buildNameToTvdb, buildRewatch } from './merge-rewatch.mjs';

const DATA = new URL('../data/', import.meta.url);
const rd = (rel) => readFileSync(new URL(rel, DATA), 'utf8');

export function buildMaster() {
  const refractEps = loadRefractEpisodes(rd('refract/tvtime-series-episodes-2026-07-07.csv'));
  const refractSeries = loadRefractSeries(rd('refract/tvtime-series-2026-07-07.csv'));
  const refractMovies = loadRefractMovies(rd('refract/tvtime-movies-2026-07-07.csv'));
  const rescueEps = loadRescueEpisodes(rd('rescue/episodes.csv'));
  const rescueShows = loadRescueShows(rd('rescue/shows.csv'));
  const gdprRewatch = loadGdprRewatch(rd('gdpr/rewatched_episode.csv'));

  const episodes = buildEpisodes(refractEps, rescueEps);
  const movies = buildMovies(refractMovies);
  const shows = buildShows(refractSeries, rescueShows);
  const planToWatch = buildPlanToWatch(refractSeries, rescueShows, refractMovies);
  const droppedShows = buildDropped(refractSeries);
  const rewatch = buildRewatch(gdprRewatch, buildNameToTvdb(shows));

  const counts = {
    episodes: episodes.length, movies: movies.length, shows: shows.length,
    planToWatchShows: planToWatch.shows.length, planToWatchMovies: planToWatch.movies.length,
    droppedShows: droppedShows.length,
    rewatchEpisodes: rewatch.length, rewatchPlays: rewatch.reduce((a, r) => a + r.plays, 0),
  };
  return { counts, episodes, movies, shows, planToWatch, droppedShows, rewatch };
}

function main() {
  const master = buildMaster();
  mkdirSync(new URL('../build/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../build/master.json', import.meta.url), JSON.stringify(master, null, 2));
  for (const [k, v] of Object.entries(master.counts)) console.log(k.padEnd(20), v);
}

// Run only as a script, not on import (tests import buildMaster directly).
if (import.meta.url === `file://${process.argv[1]}`) main();
