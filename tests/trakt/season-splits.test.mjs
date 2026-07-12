import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSplitEpisodesPayload,
  buildSplitRewatchPayload,
  listsForSplit,
  buildSplitMap,
} from '../../trakt/season-splits.mjs';

const split = { ourTvdb: 386917, ourSeason: 2, traktId: 203675, note: 'Tale of the Nine Tailed' };

const episodes = [
  { showTvdb: 386917, season: 1, episode: 1, watchedAt: '2021-01-01T00:00:00.000Z' },
  { showTvdb: 386917, season: 2, episode: 1, watchedAt: '2022-07-08T00:01:52.000Z' },
  { showTvdb: 386917, season: 2, episode: 2, watchedAt: '2022-07-09T00:00:00.000Z' },
  { showTvdb: 999, season: 2, episode: 1, watchedAt: '2022-07-01T00:00:00.000Z' },
];

describe('buildSplitEpisodesPayload', () => {
  it('maps our season -> Trakt Season 1, keeping episode numbers', () => {
    const payload = buildSplitEpisodesPayload(split, episodes);
    assert.equal(payload.ids.trakt, 203675);
    assert.equal(payload.seasons.length, 1);
    assert.equal(payload.seasons[0].number, 1);
    assert.deepEqual(
      payload.seasons[0].episodes.map((e) => e.number),
      [1, 2],
    );
  });
  it('excludes episodes from other shows/seasons', () => {
    const payload = buildSplitEpisodesPayload(split, episodes);
    assert.equal(payload.seasons[0].episodes.length, 2);
  });
  it('carries watched_at when present, omits when absent', () => {
    const payload = buildSplitEpisodesPayload(split, [{ showTvdb: 386917, season: 2, episode: 1, watchedAt: null }]);
    assert(!('watched_at' in payload.seasons[0].episodes[0]));
  });
});

describe('buildSplitRewatchPayload', () => {
  it('emits distinct synthetic timestamps on the same date as the base play, under Trakt Season 1', () => {
    const { shows } = buildSplitRewatchPayload(
      split,
      [{ showTvdb: 386917, season: 2, episode: 1, plays: 2 }],
      episodes,
    );
    assert.equal(shows.length, 2);
    for (const s of shows) {
      assert.equal(s.ids.trakt, 203675);
      assert.equal(s.seasons[0].number, 1);
      assert.equal(s.seasons[0].episodes[0].number, 1);
    }
    const watchedAts = shows.map((s) => s.seasons[0].episodes[0].watched_at);
    assert.equal(new Set(watchedAts).size, 2);
    assert.ok(watchedAts.every((w) => w.startsWith('2022-07-08')));
  });
  it('ignores rewatch rows outside the split show/season', () => {
    const { shows } = buildSplitRewatchPayload(split, [{ showTvdb: 999, season: 2, episode: 1, plays: 3 }], episodes);
    assert.equal(shows.length, 0);
  });
});

describe('listsForSplit', () => {
  it('returns lists that contain the split show tvdb', () => {
    const lists = [
      { name: 'K-drama', shows: [{ tvdb: 386917 }, { tvdb: 1 }] },
      { name: 'Dropped', shows: [{ tvdb: 5 }] },
    ];
    const result = listsForSplit(split, lists);
    assert.equal(result.length, 1);
    assert.equal(result[0].name, 'K-drama');
  });
});

describe('buildSplitMap', () => {
  it('keys by "ourTvdb|ourSeason" -> traktId', () => {
    const map = buildSplitMap([split, { ourTvdb: 413010, ourSeason: 2, traktId: 213359 }]);
    assert.deepEqual(map, { '386917|2': 203675, '413010|2': 213359 });
  });
});
