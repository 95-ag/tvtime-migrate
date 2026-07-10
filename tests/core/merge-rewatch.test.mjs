import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNameToTvdb, buildRewatch } from '../../core/merge-rewatch.mjs';

test('name→tvdb map is case/space-insensitive', () => {
  const map = buildNameToTvdb([{ tvdb: '10', title: 'The  Office' }]);
  assert.equal(map.get('the office'), '10');
});

test('rewatch rows bridge to tvdb and carry play counts', () => {
  const map = buildNameToTvdb([{ tvdb: '10', title: 'The Office' }]);
  const rw = buildRewatch(
    [
      { showName: 'The Office', season: 2, episode: 3, cpt: 2 },
      { showName: 'The Office', season: 2, episode: 4, cpt: 1 },
    ],
    map,
  );
  assert.deepEqual(rw, [
    { showTvdb: '10', season: 2, episode: 3, plays: 2 },
    { showTvdb: '10', season: 2, episode: 4, plays: 1 },
  ]);
});

test('rows whose show name cannot be bridged are dropped (reported by caller), not guessed', () => {
  const map = buildNameToTvdb([{ tvdb: '10', title: 'The Office' }]);
  const rw = buildRewatch([{ showName: 'Unknown Show', season: 1, episode: 1, cpt: 5 }], map);
  assert.deepEqual(rw, []);
});
