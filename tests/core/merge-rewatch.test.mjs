import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNameToTvdb, buildRewatch } from '../../core/merge-rewatch.mjs';

test('name→tvdb map is case/space-insensitive', () => {
  const map = buildNameToTvdb([{ tvdb: '10', title: 'The  Office' }]);
  assert.equal(map.get('the office'), '10');
});

test('rewatch rows bridge to tvdb and carry play counts', () => {
  const map = buildNameToTvdb([{ tvdb: '10', title: 'The Office' }]);
  const { bridged, dropped } = buildRewatch(
    [
      { showName: 'The Office', season: 2, episode: 3, cpt: 2 },
      { showName: 'The Office', season: 2, episode: 4, cpt: 1 },
    ],
    map,
  );
  assert.deepEqual(bridged, [
    { showTvdb: '10', season: 2, episode: 3, plays: 2 },
    { showTvdb: '10', season: 2, episode: 4, plays: 1 },
  ]);
  assert.deepEqual(dropped, []);
});

test('rows whose show name cannot be bridged are returned as dropped, not guessed', () => {
  const map = buildNameToTvdb([{ tvdb: '10', title: 'The Office' }]);
  const { bridged, dropped } = buildRewatch([{ showName: 'Unknown Show', season: 1, episode: 1, cpt: 5 }], map);
  assert.deepEqual(bridged, []);
  assert.deepEqual(dropped, [{ showName: 'Unknown Show', season: 1, episode: 1, cpt: 5 }]);
});

test('bridged rows sort by tvdb (numeric), then season, then episode', () => {
  const map = buildNameToTvdb([
    { tvdb: '2', title: 'Show B' },
    { tvdb: '10', title: 'Show A' },
  ]);
  const { bridged } = buildRewatch(
    [
      { showName: 'Show A', season: 1, episode: 2, cpt: 1 },
      { showName: 'Show B', season: 1, episode: 1, cpt: 1 },
      { showName: 'Show A', season: 1, episode: 1, cpt: 1 },
    ],
    map,
  );
  assert.deepEqual(
    bridged.map((r) => `${r.showTvdb}-${r.season}-${r.episode}`),
    ['2-1-1', '10-1-1', '10-1-2'],
  );
});
