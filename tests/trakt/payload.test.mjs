import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryPayload, buildRewatchPayload, buildWatchlistPayload } from '../../trakt/payload.mjs';

const master = {
  episodes: [
    { showTvdb: 101, showTitle: 'Show A', season: 1, episode: 1, watchedAt: '2023-01-01T00:00:00.000Z' },
    { showTvdb: 101, showTitle: 'Show A', season: 1, episode: 2, watchedAt: '2023-01-02T00:00:00.000Z' },
    { showTvdb: 101, showTitle: 'Show A', season: 0, episode: 1, watchedAt: '2023-01-03T00:00:00.000Z' },
    { showTvdb: 202, showTitle: 'Show B', season: 1, episode: 1, watchedAt: null },
  ],
  movies: [
    {
      tvdb: 999,
      imdb: 'tt1234567',
      title: 'Movie A',
      year: 2020,
      watchedAt: '2023-02-01T00:00:00.000Z',
      watched: true,
    },
    { tvdb: 777, imdb: 'tt9999999', title: 'Movie C', year: 2022, watchedAt: null, watched: false },
  ],
  shows: [
    { tvdb: 101, title: 'Show A' },
    { tvdb: 202, title: 'Show B' },
  ],
  planToWatch: {
    shows: [
      { tvdb: 300, title: 'PTW' },
      { tvdb: 101, title: 'Show A' },
    ],
    movies: [{ tvdb: 777, imdb: 'tt9999999', title: 'Movie C', year: 2022 }],
  },
};

describe('buildHistoryPayload — episodes', () => {
  it('groups by show tvdb', () => {
    const s = buildHistoryPayload(master).shows.find((x) => x.ids.tvdb === 101);
    assert.equal(s.seasons.find((se) => se.number === 1).episodes.length, 2);
  });
  it('includes season-0 specials', () => {
    const s = buildHistoryPayload(master).shows.find((x) => x.ids.tvdb === 101);
    assert.ok(s.seasons.find((se) => se.number === 0));
  });
  it('omits watched_at when null', () => {
    const s = buildHistoryPayload(master).shows.find((x) => x.ids.tvdb === 202);
    assert(!('watched_at' in s.seasons[0].episodes[0]));
  });
  it('throws on invalid tvdb', () => {
    assert.throws(
      () =>
        buildHistoryPayload({
          ...master,
          episodes: [{ showTvdb: null, season: 1, episode: 1, watchedAt: null }],
          shows: [],
        }),
      /invalid tvdb/i,
    );
  });
});

describe('buildHistoryPayload — movies', () => {
  it('uses imdb, not tvdb', () => {
    const mv = buildHistoryPayload(master).movies.find((m) => m.ids.imdb === 'tt1234567');
    assert.ok(mv);
    assert(!('tvdb' in mv.ids));
  });
  it('skips unwatched', () => {
    assert.equal(buildHistoryPayload(master).movies.length, 1);
  });
  it('throws when watched movie has null imdb', () => {
    assert.throws(
      () => buildHistoryPayload({ ...master, movies: [{ tvdb: 5, imdb: null, title: 'X', watched: true }] }),
      /imdb/i,
    );
  });
});

describe('buildRewatchPayload', () => {
  it('emits `plays` entries per row with watched_at unknown', () => {
    const { shows } = buildRewatchPayload([{ showTvdb: 101, season: 1, episode: 1, plays: 3 }]);
    const eps = shows.flatMap((s) => s.seasons.flatMap((se) => se.episodes));
    assert.equal(eps.length, 3);
    assert.ok(eps.every((e) => e.watched_at === 'unknown'));
  });
  it('throws on invalid tvdb', () => {
    assert.throws(() => buildRewatchPayload([{ showTvdb: 0, season: 1, episode: 1, plays: 1 }]), /invalid tvdb/i);
  });
});

describe('buildWatchlistPayload', () => {
  it('suppresses PTW shows with watched episodes', () => {
    const { shows } = buildWatchlistPayload(master);
    assert(!shows.some((s) => s.ids.tvdb === 101));
    assert(shows.some((s) => s.ids.tvdb === 300));
  });
  it('PTW movies use imdb', () => {
    assert.ok(buildWatchlistPayload(master).movies.find((m) => m.ids.imdb === 'tt9999999'));
  });
  it('throws on PTW movie with null imdb', () => {
    assert.throws(
      () =>
        buildWatchlistPayload({ ...master, planToWatch: { shows: [], movies: [{ tvdb: 8, imdb: null, title: 'X' }] } }),
      /imdb/i,
    );
  });
});
