import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRecovery } from '../../simkl/recover.mjs';

const master = {
  episodes: [
    { showTvdb: '305074', season: 1, episode: 1, watchedAt: 'D1' }, // franchise → simkl 532942 ep 1
    { showTvdb: '305074', season: 2, episode: 1, watchedAt: 'D2' }, // franchise → simkl 595017 ep 1
    { showTvdb: '405494', season: 2, episode: 3, watchedAt: 'D3' }, // anime override → simkl 3161260 (season1, ep3)
    { showTvdb: '245521', season: 1, episode: 5, watchedAt: 'D4' }, // tv override → simkl 25227 (season1, ep5)
    { showTvdb: '999999', season: 1, episode: 1, watchedAt: 'D5' }, // gap, no map/override → unresolved
    { showTvdb: '888888', season: 1, episode: 1, watchedAt: 'D6' }, // NOT a gap → ignored
    { showTvdb: '305074', season: 0, episode: 1, watchedAt: 'DS' }, // special → skipped
  ],
};
const maps = {
  305074: new Map([
    ['1|1', { simkl: 532942, epNum: 1 }],
    ['2|1', { simkl: 595017, epNum: 1 }],
  ]),
};
const mapFor = (t) => maps[t] ?? null;
const overrideFor = (tvdb, season) => {
  if (String(tvdb) === '405494' && season === 2) return { simkl: 3161260, type: 'anime' };
  if (String(tvdb) === '245521') return { simkl: 25227, type: 'tv' };
  return null;
};
const gaps = ['305074', '405494', '245521', '999999'];

test('planRecovery routes each episode to its correct Simkl target, groups by simkl id', () => {
  const { payload } = planRecovery(master, gaps, mapFor, overrideFor);
  const byId = Object.fromEntries(payload.shows.map((s) => [s.ids.simkl, s]));
  // franchise targets: two different sub-anime
  assert.deepEqual(byId[532942].seasons, [{ number: 1, episodes: [{ number: 1, watched_at: 'D1' }] }]);
  assert.deepEqual(byId[595017].seasons, [{ number: 1, episodes: [{ number: 1, watched_at: 'D2' }] }]);
  // anime override → season 1, episode = master episode number
  assert.deepEqual(byId[3161260].seasons, [{ number: 1, episodes: [{ number: 3, watched_at: 'D3' }] }]);
  // tv override → real season + episode
  assert.deepEqual(byId[25227].seasons, [{ number: 1, episodes: [{ number: 5, watched_at: 'D4' }] }]);
});

test('planRecovery lists unresolved gap episodes and ignores non-gap + specials', () => {
  const { payload, unresolved } = planRecovery(master, gaps, mapFor, overrideFor);
  assert.ok(unresolved.some((u) => u.tvdb === 999999 && u.episode === 1));
  assert.equal(unresolved.length, 1); // only 999999; specials skipped, 888888 not a gap
  assert.ok(!payload.shows.some((s) => s.ids.simkl === undefined));
});

test('planRecovery counts a routing collision without overwriting the first watched_at', () => {
  const m = {
    episodes: [
      { showTvdb: '1', season: 1, episode: 1, watchedAt: 'A' },
      { showTvdb: '1', season: 1, episode: 2, watchedAt: 'B' },
    ],
  };
  const mapFor = () =>
    new Map([
      ['1|1', { simkl: 9, epNum: 1 }],
      ['1|2', { simkl: 9, epNum: 1 }],
    ]); // both → ep 1
  const { payload, collisions } = planRecovery(m, ['1'], mapFor, () => null);
  assert.equal(collisions, 1);
  assert.deepEqual(payload.shows[0].seasons[0].episodes, [{ number: 1, watched_at: 'A' }]); // first-wins
});
