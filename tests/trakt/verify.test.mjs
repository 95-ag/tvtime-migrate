import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../../trakt/verify.mjs';

const master = {
  episodes: [
    { showTvdb: 101, season: 1, episode: 1, watchedAt: '2023-01-01T00:00:00.000Z' },
    { showTvdb: 101, season: 1, episode: 2, watchedAt: '2023-01-02T00:00:00.000Z' },
    { showTvdb: 202, season: 2, episode: 5, watchedAt: '2023-03-01T00:00:00.000Z' },
  ],
  movies: [{ tvdb: 999, imdb: 'tt1', title: 'A', watchedAt: '2023-02-01T00:00:00.000Z', watched: true }],
  rewatch: [{ showTvdb: 101, season: 1, episode: 1, plays: 2 }],
  planToWatch: { shows: [{ tvdb: 300 }], movies: [] },
  favorites: { shows: [{ tvdb: 101 }], movies: [] },
  shows: [],
};
const readback = {
  watchedShows: [
    {
      show: { ids: { tvdb: 101 } },
      seasons: [
        {
          number: 1,
          episodes: [
            { number: 1, plays: 3, last_watched_at: '2023-06-01T00:00:00.000Z' },
            { number: 2, plays: 1, last_watched_at: '2023-01-02T00:00:00.000Z' },
          ],
        },
      ],
    },
    {
      show: { ids: { tvdb: 202 } },
      seasons: [{ number: 2, episodes: [{ number: 5, plays: 1, last_watched_at: '2023-03-01T00:00:00.000Z' }] }],
    },
  ],
  watchedMovies: [{ movie: { ids: { imdb: 'tt1' } }, last_watched_at: '2023-02-01T00:00:00.000Z' }],
  watchlistShows: [{ show: { ids: { tvdb: 300 } } }],
  watchlistMovies: [],
  favoriteShows: [{ show: { ids: { tvdb: 101 } } }],
  favoriteMovies: [],
};

describe('reconcile', () => {
  it('matches all episodes', () => {
    assert.equal(reconcile(master, readback).matchedEpisodes, 3);
  });
  it('date fidelity over non-rewatched', () => {
    assert.equal(reconcile(master, readback).dateFidelity, 1);
  });
  it('rewatch play-count verified', () => {
    assert.equal(reconcile(master, readback).rewatchMatches, 1);
  });
  it('movies by imdb', () => {
    assert.equal(reconcile(master, readback).movieMatches, 1);
  });
  it('ptw + favorites', () => {
    const r = reconcile(master, readback);
    assert.equal(r.ptwMatches, 1);
    assert.equal(r.favMatches, 1);
  });
  it('passes', () => {
    assert.equal(reconcile(master, readback).pass, true);
  });
  it('fails when episodes absent', () => {
    assert.equal(reconcile(master, { ...readback, watchedShows: [] }).pass, false);
  });
  it('fails on a wrong non-rewatch date', () => {
    const badWatchedShows = [
      readback.watchedShows[0],
      {
        show: { ids: { tvdb: 202 } },
        seasons: [{ number: 2, episodes: [{ number: 5, plays: 1, last_watched_at: '2023-09-09T00:00:00.000Z' }] }],
      },
    ];
    const r = reconcile(master, { ...readback, watchedShows: badWatchedShows });
    assert.ok(r.dateFidelity < 1);
    assert.equal(r.pass, false);
  });
  it('fails on a rewatch play-count shortfall, attributed to rewatch not date', () => {
    const badWatchedShows = [
      {
        show: { ids: { tvdb: 101 } },
        seasons: [
          {
            number: 1,
            episodes: [
              { number: 1, plays: 1, last_watched_at: '2023-06-01T00:00:00.000Z' },
              { number: 2, plays: 1, last_watched_at: '2023-01-02T00:00:00.000Z' },
            ],
          },
        ],
      },
      readback.watchedShows[1],
    ];
    const r = reconcile(master, { ...readback, watchedShows: badWatchedShows });
    assert.equal(r.pass, false);
    assert.equal(r.dateFidelity, 1);
    assert.notEqual(r.rewatchMatches, r.rewatchTotal);
    assert.equal(r.rewatchMatches, 0);
  });
  it('fails when a watched movie is missing from the readback', () => {
    assert.equal(reconcile(master, { ...readback, watchedMovies: [] }).pass, false);
  });
  it('fails when a plan-to-watch show is missing from the watchlist', () => {
    assert.equal(reconcile(master, { ...readback, watchlistShows: [] }).pass, false);
  });
  it('fails when a favorite show is missing from the favorites readback', () => {
    assert.equal(reconcile(master, { ...readback, favoriteShows: [] }).pass, false);
  });
});
