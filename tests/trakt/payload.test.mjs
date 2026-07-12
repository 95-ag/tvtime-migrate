import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildHistoryPayload,
  buildRewatchPayload,
  buildWatchlistPayload,
  sameDateStamp,
} from '../../trakt/payload.mjs';

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
  it('falls back to title+year when watched movie has null imdb', () => {
    const { movies } = buildHistoryPayload({
      ...master,
      movies: [{ tvdb: 5, imdb: null, title: 'X', year: 2021, watched: true, watchedAt: '2023-03-01T00:00:00.000Z' }],
    });
    assert.equal(movies.length, 1);
    assert.deepEqual(movies[0], { title: 'X', year: 2021, watched_at: '2023-03-01T00:00:00.000Z' });
    assert(!('ids' in movies[0]));
  });
  it('skips (and manifests) a watched movie with no imdb and no title/year', () => {
    const { movies, skippedMovies } = buildHistoryPayload({
      ...master,
      movies: [{ tvdb: 5, imdb: null, title: null, year: null, watched: true }],
    });
    assert.equal(movies.length, 0);
    assert.equal(skippedMovies.length, 1);
    assert.equal(skippedMovies[0].reason, 'no_imdb_or_title_year');
    assert.equal(skippedMovies[0].tvdb, 5);
  });
});

describe('sameDateStamp', () => {
  it('skips the base minute when the base play was watched at minute 1 (00:01:52)', () => {
    // baseMinute = 1 -> i=1 must NOT collide with the base play's own minute 1.
    assert.equal(sameDateStamp('2022-07-08T00:01:52Z', 1), '2022-07-08T00:00:00.000Z');
  });
  it('gives a distinct minute for i=2, still skipping the base minute', () => {
    assert.equal(sameDateStamp('2022-07-08T00:01:52Z', 2), '2022-07-08T00:02:00.000Z');
  });
  it('a normal-time base (07:30, baseMinute=450) is unaffected by the skip for i=1', () => {
    assert.equal(sameDateStamp('2022-07-08T07:30:00Z', 1), '2022-07-08T00:00:00.000Z');
  });
});

describe('buildRewatchPayload', () => {
  it('with a base watch date: emits `plays` entries with distinct times on the SAME calendar date', () => {
    const { shows } = buildRewatchPayload(
      [{ showTvdb: 101, season: 1, episode: 1, plays: 3 }],
      [{ showTvdb: 101, season: 1, episode: 1, watchedAt: '2020-05-05T14:30:00.000Z' }],
    );
    const eps = shows.flatMap((s) => s.seasons.flatMap((se) => se.episodes));
    assert.equal(eps.length, 3);
    const watchedAts = eps.map((e) => e.watched_at);
    assert.equal(new Set(watchedAts).size, 3);
    assert.ok(watchedAts.every((w) => w.startsWith('2020-05-05')));
  });
  it('without a base watch date: emits distinct synthetic timestamps, never the literal "unknown"', () => {
    const { shows } = buildRewatchPayload([{ showTvdb: 101, season: 1, episode: 1, plays: 2 }], []);
    const eps = shows.flatMap((s) => s.seasons.flatMap((se) => se.episodes));
    assert.equal(eps.length, 2);
    const watchedAts = eps.map((e) => e.watched_at);
    assert.equal(new Set(watchedAts).size, 2);
    assert.ok(watchedAts.every((w) => w !== 'unknown'));
  });
  it('throws on invalid tvdb', () => {
    assert.throws(() => buildRewatchPayload([{ showTvdb: 0, season: 1, episode: 1, plays: 1 }], []), /invalid tvdb/i);
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
  it('falls back to title+year when PTW movie has null imdb', () => {
    const { movies } = buildWatchlistPayload({
      ...master,
      planToWatch: { shows: [], movies: [{ tvdb: 8, imdb: null, title: 'X', year: 2021 }] },
    });
    assert.equal(movies.length, 1);
    assert.deepEqual(movies[0], { title: 'X', year: 2021 });
  });
  it('skips (and manifests) a PTW movie with no imdb and no title/year', () => {
    const { movies, skippedMovies } = buildWatchlistPayload({
      ...master,
      planToWatch: { shows: [], movies: [{ tvdb: 8, imdb: null, title: null, year: null }] },
    });
    assert.equal(movies.length, 0);
    assert.equal(skippedMovies.length, 1);
    assert.equal(skippedMovies[0].reason, 'no_imdb_or_title_year');
    assert.equal(skippedMovies[0].kind, 'ptw-movie');
  });
});
