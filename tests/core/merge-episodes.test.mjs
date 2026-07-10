import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildEpisodes } from '../../core/merge-episodes.mjs';

const rEp = (o) => ({ seriesTvdb: '10', seriesImdb: null, title: 'S', season: 1, episode: 1,
  epTvdb: '100', watchedAt: '2020-01-01T00:00:00Z', rewatchCount: 0, special: false, ...o });
const sEp = (o) => ({ showTvdb: '10', title: 'S', season: 1, episode: 1,
  epTvdb: '100', watchedAt: '2021-06-06T06:06:06Z', special: false, ...o });

test('Refract episodes form the spine with canonical dates', () => {
  const eps = buildEpisodes([rEp()], []);
  assert.equal(eps.length, 1);
  assert.equal(eps[0].source, 'refract');
  assert.equal(eps[0].dateConfidence, 'canonical');
  assert.equal(eps[0].watchedAt, '2020-01-01T00:00:00Z');
  assert.equal(eps[0].showTvdb, '10');
});

test('a Rescue episode absent from Refract is grafted, flagged insert-time', () => {
  const eps = buildEpisodes([rEp()], [sEp({ season: 2, episode: 5 })]);
  const graft = eps.find((e) => e.season === 2 && e.episode === 5);
  assert.equal(graft.source, 'rescue');
  assert.equal(graft.dateConfidence, 'insert-time');
});

test('a Rescue episode already in Refract does NOT override the canonical date', () => {
  const eps = buildEpisodes([rEp()], [sEp()]); // same (10,1,1)
  assert.equal(eps.length, 1);
  assert.equal(eps[0].watchedAt, '2020-01-01T00:00:00Z');
  assert.equal(eps[0].source, 'refract');
});

test('duplicate Refract keys collapse to one row', () => {
  const eps = buildEpisodes([rEp(), rEp()], []);
  assert.equal(eps.length, 1);
});

test('output is sorted by (showTvdb, season, episode) for determinism', () => {
  const eps = buildEpisodes([rEp({ episode: 3 }), rEp({ episode: 1 }), rEp({ season: 2, episode: 1 })], []);
  assert.deepEqual(eps.map((e) => [e.season, e.episode]), [[1, 1], [1, 3], [2, 1]]);
});
