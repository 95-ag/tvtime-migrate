import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryPayload } from '../../simkl/payload.mjs';

const master = {
  episodes: [
    {
      showTvdb: '71361',
      showImdb: null,
      showTitle: 'InuYasha',
      season: 1,
      episode: 2,
      watchedAt: '2020-09-24T10:00:00Z',
      special: false,
    },
    {
      showTvdb: '71361',
      showImdb: null,
      showTitle: 'InuYasha',
      season: 1,
      episode: 1,
      watchedAt: '2020-09-23T12:30:57Z',
      special: false,
    },
    {
      showTvdb: '99999',
      showImdb: 'tt5',
      showTitle: 'Done Show',
      season: 1,
      episode: 1,
      watchedAt: '2021-01-01T00:00:00Z',
      special: false,
    },
    {
      showTvdb: '77777',
      showImdb: null,
      showTitle: 'Overlap',
      season: 1,
      episode: 1,
      watchedAt: '2022-01-01T00:00:00Z',
      special: false,
    },
  ],
  shows: [
    { tvdb: '71361', imdb: null, title: 'InuYasha', simklBucket: 'dropped' },
    { tvdb: '99999', imdb: 'tt5', title: 'Done Show', simklBucket: 'completed' },
    { tvdb: '77777', imdb: null, title: 'Overlap', simklBucket: 'plantowatch' },
  ],
  movies: [
    { tvdb: '1', imdb: 'tt0437086', title: 'Alita', year: '2019', watchedAt: '2019-08-25T05:27:37Z', watched: true },
    { tvdb: '2', imdb: null, title: 'Unwatched', year: '2020', watchedAt: null, watched: false },
  ],
};

test('groups episodes by show into sorted seasons/episodes with per-episode watched_at', () => {
  const { shows } = buildHistoryPayload(master);
  const inu = shows.find((s) => s.ids.tvdb === 71361);
  assert.equal(inu.seasons.length, 1);
  assert.equal(inu.seasons[0].number, 1);
  assert.deepEqual(inu.seasons[0].episodes, [
    { number: 1, watched_at: '2020-09-23T12:30:57Z' },
    { number: 2, watched_at: '2020-09-24T10:00:00Z' },
  ]);
});

test('ids: tvdb numeric; imdb included only when present', () => {
  const { shows } = buildHistoryPayload(master);
  assert.deepEqual(shows.find((s) => s.ids.tvdb === 99999).ids, { tvdb: 99999, imdb: 'tt5' });
  assert.deepEqual(shows.find((s) => s.ids.tvdb === 71361).ids, { tvdb: 71361 });
});

test('status: explicit for completed/dropped; OMITTED for plantowatch-with-history (overlap)', () => {
  const { shows } = buildHistoryPayload(master);
  assert.equal(shows.find((s) => s.ids.tvdb === 99999).status, 'completed');
  assert.equal(shows.find((s) => s.ids.tvdb === 71361).status, 'dropped');
  assert.equal('status' in shows.find((s) => s.ids.tvdb === 77777), false);
});

test('anime flag set on every show object (default on)', () => {
  const { shows } = buildHistoryPayload(master);
  assert.ok(shows.every((s) => s.use_tvdb_anime_seasons === true));
});

test('movies: only watched, status completed, numeric tvdb, watched_at preserved', () => {
  const { movies } = buildHistoryPayload(master);
  assert.equal(movies.length, 1);
  assert.deepEqual(movies[0], {
    ids: { tvdb: 1, imdb: 'tt0437086' },
    title: 'Alita',
    year: 2019,
    watched_at: '2019-08-25T05:27:37Z',
    status: 'completed',
  });
});

test('throws on a movie with a null tvdb rather than fabricating id 0', () => {
  const bad = {
    episodes: [],
    shows: [],
    movies: [{ tvdb: null, title: 'X', watchedAt: '2020-01-01T00:00:00Z', watched: true }],
  };
  assert.throws(() => buildHistoryPayload(bad), /invalid tvdb/);
});
