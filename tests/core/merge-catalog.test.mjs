import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMovies, buildShows, buildPlanToWatch, buildDropped } from '../../core/merge-catalog.mjs';

const series = [
  { tvdb: '10', imdb: null, title: 'Done', status: 'up_to_date' },
  { tvdb: '11', imdb: null, title: 'Airing', status: 'continuing' },
  { tvdb: '12', imdb: null, title: 'Later', status: 'watch_later' },
  { tvdb: '13', imdb: null, title: 'Never', status: 'not_started_yet' },
  { tvdb: '14', imdb: null, title: 'Quit', status: 'stopped' },
];
const rescueShows = [
  { tvdb: '10', title: 'Done', status: 'following' },     // already in Refract — ignored
  { tvdb: '99', title: 'ExtraFollow', status: 'following' }, // Rescue-only follow
];
const movies = [
  { uuid: 'a', tvdb: '285', imdb: 'tt1', title: 'Watched', year: '1993', watchedAt: '2022-11-14T15:46:27Z', watched: true },
  { uuid: 'b', tvdb: '286', imdb: 'tt2', title: 'Unwatched', year: '2000', watchedAt: null, watched: false },
];

test('movies keep ids, dates, and watched flag exactly', () => {
  const out = buildMovies(movies);
  assert.equal(out.length, 2);
  assert.deepEqual(out.find((m) => m.tvdb === '285'), {
    tvdb: '285', imdb: 'tt1', uuid: 'a', title: 'Watched', year: '1993',
    watchedAt: '2022-11-14T15:46:27Z', watched: true,
  });
});

test('shows carry Simkl + Trakt buckets; Rescue-only follow added as plantowatch', () => {
  const out = buildShows(series, rescueShows);
  assert.equal(out.length, 6); // 5 Refract + 1 Rescue-only
  assert.deepEqual(out.find((s) => s.tvdb === '10'),
    { tvdb: '10', imdb: null, title: 'Done', status: 'up_to_date', simklBucket: 'completed', traktTreatment: 'watched-progress' });
  const extra = out.find((s) => s.tvdb === '99');
  assert.equal(extra.status, 'not_started_yet');
  assert.equal(extra.simklBucket, 'plantowatch');
});

test('plan-to-watch = not_started_yet + watch_later shows and unwatched movies', () => {
  const ptw = buildPlanToWatch(series, rescueShows, movies);
  assert.deepEqual(ptw.shows.map((s) => s.tvdb).sort(), ['12', '13', '99']);
  assert.equal(ptw.shows.find((s) => s.tvdb === '12').from, 'watch_later');
  assert.deepEqual(ptw.movies.map((m) => m.tvdb), ['286']);
});

test('dropped = stopped shows only', () => {
  const dropped = buildDropped(series);
  assert.deepEqual(dropped, [{ tvdb: '14', title: 'Quit' }]);
});
