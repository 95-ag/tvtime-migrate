import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../../trakt/verify.mjs';

const master = {
  episodes: [
    { showTvdb: 101, season: 1, episode: 1, watchedAt: '2023-01-01T00:00:00.000Z' },
    { showTvdb: 101, season: 1, episode: 2, watchedAt: '2023-01-02T00:00:00.000Z' },
    { showTvdb: 202, season: 2, episode: 5, watchedAt: '2023-03-01T12:00:45.000Z' },
  ],
  movies: [{ tvdb: 999, imdb: 'tt1', title: 'A', watchedAt: '2023-02-01T00:00:00.000Z', watched: true }],
  rewatch: [{ showTvdb: 101, season: 1, episode: 1, plays: 2 }],
  planToWatch: { shows: [{ tvdb: 300 }], movies: [] },
  favorites: { shows: [{ tvdb: 101 }], movies: [] },
  shows: [],
};

// Rewatched episode (101 S1E1) needs 1 + plays(2) = 3 plays total.
const readback = {
  historyEpisodes: [
    { watched_at: '2023-06-01T00:00:00.000Z', episode: { season: 1, number: 1 }, show: { ids: { tvdb: 101 } } },
    { watched_at: '2023-06-02T00:00:00.000Z', episode: { season: 1, number: 1 }, show: { ids: { tvdb: 101 } } },
    { watched_at: '2023-06-03T00:00:00.000Z', episode: { season: 1, number: 1 }, show: { ids: { tvdb: 101 } } },
    { watched_at: '2023-01-02T00:00:00.000Z', episode: { season: 1, number: 2 }, show: { ids: { tvdb: 101 } } },
    // Trakt truncates seconds — master carries :45 seconds, history has :00.
    { watched_at: '2023-03-01T12:00:00.000Z', episode: { season: 2, number: 5 }, show: { ids: { tvdb: 202 } } },
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
  it('date fidelity over non-rewatched at minute precision', () => {
    assert.equal(reconcile(master, readback).dateFidelity, 1);
  });
  it('rewatch play-count verified', () => {
    assert.equal(reconcile(master, readback).rewatchMatches, 1);
  });
  it('movies by imdb', () => {
    assert.equal(reconcile(master, readback).movieMatches, 1);
  });
  it('movies without imdb are verified best-effort by title+year and never fail the gate', () => {
    const masterWithUnresolved = {
      ...master,
      movies: [
        ...master.movies,
        { tvdb: null, imdb: null, title: 'No Imdb Movie', year: 2020, watchedAt: null, watched: true },
      ],
    };
    const rMatched = reconcile(masterWithUnresolved, {
      ...readback,
      watchedMovies: [
        ...readback.watchedMovies,
        { movie: { title: 'No Imdb Movie', year: 2020 }, last_watched_at: '2023-05-01T00:00:00.000Z' },
      ],
    });
    assert.equal(rMatched.pass, true);
    assert.equal(rMatched.movieTitleYearMatches, 1);
    assert.equal(rMatched.unverifiableMovies.length, 0);

    const rUnmatched = reconcile(masterWithUnresolved, readback);
    assert.equal(rUnmatched.pass, true);
    assert.equal(rUnmatched.unverifiableMovies.length, 1);
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
    assert.equal(reconcile(master, { ...readback, historyEpisodes: [] }).pass, false);
  });
  it('fails on a wrong non-rewatch date', () => {
    const badHistory = readback.historyEpisodes.map((h) =>
      h.episode.season === 2 && h.episode.number === 5 ? { ...h, watched_at: '2023-09-09T00:00:00.000Z' } : h,
    );
    const r = reconcile(master, { ...readback, historyEpisodes: badHistory });
    assert.ok(r.dateFidelity < 1);
    assert.equal(r.pass, false);
  });
  it('fails on a rewatch play-count shortfall, attributed to rewatch not date', () => {
    // Only 2 plays sent for 101 S1E1 (needs 3) — shortfall, not a date mismatch.
    const badHistory = [
      { watched_at: '2023-06-01T00:00:00.000Z', episode: { season: 1, number: 1 }, show: { ids: { tvdb: 101 } } },
      { watched_at: '2023-06-02T00:00:00.000Z', episode: { season: 1, number: 1 }, show: { ids: { tvdb: 101 } } },
      { watched_at: '2023-01-02T00:00:00.000Z', episode: { season: 1, number: 2 }, show: { ids: { tvdb: 101 } } },
      { watched_at: '2023-03-01T12:00:00.000Z', episode: { season: 2, number: 5 }, show: { ids: { tvdb: 202 } } },
    ];
    const r = reconcile(master, { ...readback, historyEpisodes: badHistory });
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
