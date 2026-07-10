import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlanToWatchPayload } from '../../simkl/payload.mjs';

const master = {
  episodes: [{ showTvdb: '77777', season: 1, episode: 1, watchedAt: '2022-01-01T00:00:00Z' }],
  planToWatch: {
    shows: [
      { tvdb: '77777', title: 'Overlap', from: 'watch_later' }, // has episodes → SKIP
      { tvdb: '88888', title: 'Pure PTW', from: 'not_started_yet' }, // no episodes → include
    ],
    movies: [{ tvdb: '5', imdb: 'tt9', title: 'Later Movie' }],
  },
};

test('excludes PTW shows that already have watched episodes (the overlap)', () => {
  const { shows } = buildPlanToWatchPayload(master);
  assert.equal(shows.length, 1);
  assert.deepEqual(shows[0], { ids: { tvdb: 88888 }, title: 'Pure PTW', status: 'plantowatch' });
});

test('all PTW movies included with plantowatch status and numeric tvdb', () => {
  const { movies } = buildPlanToWatchPayload(master);
  assert.deepEqual(movies, [{ ids: { tvdb: 5, imdb: 'tt9' }, title: 'Later Movie', status: 'plantowatch' }]);
});

test('throws on a plan-to-watch movie with a null tvdb rather than fabricating id 0', () => {
  const bad = { episodes: [], planToWatch: { shows: [], movies: [{ tvdb: null, title: 'X' }] } };
  assert.throws(() => buildPlanToWatchPayload(bad), /invalid tvdb/);
});
