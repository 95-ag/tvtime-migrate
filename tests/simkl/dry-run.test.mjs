import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePayload, summarize } from '../../simkl/dry-run.mjs';

const good = {
  history: {
    shows: [
      {
        ids: { tvdb: 1 },
        use_tvdb_anime_seasons: true,
        status: 'completed',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2020-01-01T00:00:00Z' }] }],
      },
    ],
    movies: [{ ids: { tvdb: 2 }, watched_at: '2019-01-01T00:00:00Z', status: 'completed' }],
  },
  planToWatch: { shows: [{ ids: { tvdb: 3 }, status: 'plantowatch' }], movies: [] },
};

test('validatePayload passes a well-formed payload', () => {
  assert.deepEqual(validatePayload(good), []);
});

test('validatePayload flags a non-numeric tvdb id', () => {
  const bad = structuredClone(good);
  bad.history.shows[0].ids.tvdb = '1';
  assert.ok(validatePayload(bad).some((e) => /tvdb.*number/i.test(e)));
});

test('validatePayload flags an episode missing watched_at', () => {
  const bad = structuredClone(good);
  delete bad.history.shows[0].seasons[0].episodes[0].watched_at;
  assert.ok(validatePayload(bad).some((e) => /watched_at/i.test(e)));
});

test('validatePayload flags an invalid status', () => {
  const bad = structuredClone(good);
  bad.history.shows[0].status = 'bogus';
  assert.ok(validatePayload(bad).some((e) => /status/i.test(e)));
});

test('summarize reports show/episode/movie/ptw counts', () => {
  const s = summarize(good);
  assert.equal(s.historyShows, 1);
  assert.equal(s.historyEpisodes, 1);
  assert.equal(s.historyMovies, 1);
  assert.equal(s.ptwShows, 1);
});

test('validatePayload flags a non-ISO-Z episode watched_at', () => {
  const bad = structuredClone(good);
  bad.history.shows[0].seasons[0].episodes[0].watched_at = '2020-01-01 00:00:00';
  assert.ok(validatePayload(bad).some((e) => /ISO-Z/i.test(e)));
});
test('validatePayload flags a movie missing watched_at', () => {
  const bad = structuredClone(good);
  delete bad.history.movies[0].watched_at;
  assert.ok(validatePayload(bad).some((e) => /watched_at/i.test(e)));
});
test('validatePayload flags a movie invalid status', () => {
  const bad = structuredClone(good);
  bad.history.movies[0].status = 'bogus';
  assert.ok(validatePayload(bad).some((e) => /status/i.test(e)));
});
test('validatePayload flags a ptw show not set to plantowatch', () => {
  const bad = structuredClone(good);
  bad.planToWatch.shows[0].status = 'completed';
  assert.ok(validatePayload(bad).some((e) => /plantowatch/i.test(e)));
});
test('summarize buckets a status-omitted show under (resolve)', () => {
  const p = structuredClone(good);
  delete p.history.shows[0].status;
  assert.equal(summarize(p).showsByStatus['(resolve)'], 1);
});
