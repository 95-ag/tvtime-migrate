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
  it('remaps an episode via the tvdb episode-id map when Trakt numbers it differently', () => {
    const remapMaster = {
      ...master,
      episodes: [
        ...master.episodes,
        { showTvdb: 101, season: 5, episode: 3, epTvdb: '900', watchedAt: '2023-04-01T00:00:00.000Z' },
      ],
    };
    const remapReadback = {
      ...readback,
      historyEpisodes: [
        ...readback.historyEpisodes,
        { watched_at: '2023-04-01T00:00:00.000Z', episode: { season: 1, number: 120 }, show: { ids: { tvdb: 101 } } },
      ],
    };

    const withoutMap = reconcile(remapMaster, remapReadback);
    assert.equal(withoutMap.matchedEpisodes, 3);
    assert.ok(withoutMap.missingFromReadback.some((m) => m.season === 5 && m.episode === 3));

    const episodeMap = new Map([['900', { season: 1, number: 120 }]]);
    const withMap = reconcile(remapMaster, remapReadback, episodeMap);
    assert.equal(withMap.matchedEpisodes, 4);
    assert.equal(withMap.dateFidelity, 1);
    assert.ok(!withMap.missingFromReadback.some((m) => m.season === 5 && m.episode === 3));
  });

  it('matches a mapped episode still present at its ORIGINAL position (imported before recovery)', () => {
    // epTvdb '900' is in the map (points to S1E120), but this episode was imported fine the first time
    // at its own numbering (S5E3) — recovery never moved it. Verify must still match it at the original spot.
    const m = {
      ...master,
      episodes: [
        ...master.episodes,
        { showTvdb: 101, season: 5, episode: 3, epTvdb: '900', watchedAt: '2023-04-01T00:00:00.000Z' },
      ],
    };
    const rb = {
      ...readback,
      historyEpisodes: [
        ...readback.historyEpisodes,
        { watched_at: '2023-04-01T00:00:00.000Z', episode: { season: 5, number: 3 }, show: { ids: { tvdb: 101 } } },
      ],
    };
    const episodeMap = new Map([['900', { season: 1, number: 120 }]]);
    const r = reconcile(m, rb, episodeMap);
    assert.equal(r.matchedEpisodes, 4);
    assert.equal(r.dateFidelity, 1);
    assert.ok(!r.missingFromReadback.some((x) => x.season === 5 && x.episode === 3));
  });

  it('matches an episode via the show-id map when the show is imported under a different trakt id', () => {
    // ourTvdb 500 -> trakt 777 (stale-tvdb resolution); numbering is unchanged, so the read-back is
    // keyed by the resolved trakt id with our original season/episode.
    const m = {
      ...master,
      episodes: [...master.episodes, { showTvdb: 500, season: 1, episode: 1, watchedAt: '2023-07-01T00:00:00.000Z' }],
    };
    const rbWithMap = {
      ...readback,
      historyEpisodes: [
        ...readback.historyEpisodes,
        {
          watched_at: '2023-07-01T00:00:00.000Z',
          episode: { season: 1, number: 1 },
          show: { ids: { trakt: 777, tvdb: null } },
        },
      ],
    };

    const withoutMap = reconcile(m, rbWithMap);
    assert.equal(withoutMap.matchedEpisodes, 3);
    assert.ok(withoutMap.missingFromReadback.some((x) => x.tvdb === 500));

    const showIdMap = new Map([['500', 777]]);
    const withMap = reconcile(m, rbWithMap, new Map(), showIdMap);
    assert.equal(withMap.matchedEpisodes, 4);
    assert.equal(withMap.dateFidelity, 1);
    assert.ok(!withMap.missingFromReadback.some((x) => x.tvdb === 500));
  });

  it('matches an episode via the season-split map when a later season is a separate Trakt show', () => {
    // showTvdb 600 season 2 is a season-split -> Trakt show 888, re-numbered under its own Season 1
    // with our original episode number kept.
    const m = {
      ...master,
      episodes: [...master.episodes, { showTvdb: 600, season: 2, episode: 3, watchedAt: '2023-08-01T00:00:00.000Z' }],
    };
    const rbWithSplit = {
      ...readback,
      historyEpisodes: [
        ...readback.historyEpisodes,
        {
          watched_at: '2023-08-01T00:00:00.000Z',
          episode: { season: 1, number: 3 },
          show: { ids: { trakt: 888, tvdb: null } },
        },
      ],
    };

    const withoutMap = reconcile(m, rbWithSplit);
    assert.equal(withoutMap.matchedEpisodes, 3);
    assert.ok(withoutMap.missingFromReadback.some((x) => x.tvdb === 600 && x.season === 2 && x.episode === 3));

    const seasonSplitMap = new Map([['600|2', 888]]);
    const withMap = reconcile(m, rbWithSplit, new Map(), new Map(), seasonSplitMap);
    assert.equal(withMap.matchedEpisodes, 4);
    assert.equal(withMap.dateFidelity, 1);
    assert.ok(!withMap.missingFromReadback.some((x) => x.tvdb === 600 && x.season === 2 && x.episode === 3));
  });

  it('credits a plan-to-watch show added to the watchlist under a resolved (stale-tvdb) trakt id', () => {
    // Our tvdb 360371 was stale on Trakt; the show was added under trakt id 102311 instead.
    const m = { ...master, planToWatch: { shows: [{ tvdb: 360371 }], movies: [] } };
    const rbResolved = {
      ...readback,
      watchlistShows: [{ show: { ids: { trakt: 102311, tvdb: null } } }],
    };

    const withoutOverride = reconcile(m, rbResolved);
    assert.equal(withoutOverride.ptwMatches, 0);
    assert.ok(withoutOverride.missingFromReadback.some((x) => x.kind === 'ptw-show' && x.tvdb === 360371));

    const idOverrides = { watchlistShows: { 360371: 102311 }, movies: {} };
    const withOverride = reconcile(m, rbResolved, new Map(), new Map(), new Map(), idOverrides);
    assert.equal(withOverride.ptwMatches, 1);
    assert.ok(!withOverride.missingFromReadback.some((x) => x.kind === 'ptw-show' && x.tvdb === 360371));
  });

  it('credits a watched movie added to the account under a resolved (stale-imdb) trakt id', () => {
    // Our imdb 'ttX' was stale on Trakt; the movie was added under trakt id 423004 instead.
    const m = {
      ...master,
      movies: [{ tvdb: null, imdb: 'ttX', title: 'Rascal', watchedAt: null, watched: true }],
    };
    const rbResolved = {
      ...readback,
      watchedMovies: [
        { movie: { ids: { trakt: 423004, imdb: 'ttDIFFERENT' } }, last_watched_at: '2023-02-01T00:00:00.000Z' },
      ],
    };

    const withoutOverride = reconcile(m, rbResolved);
    assert.equal(withoutOverride.movieMatches, 0);
    assert.ok(withoutOverride.missingFromReadback.some((x) => x.kind === 'movie' && x.imdb === 'ttX'));

    const idOverrides = { watchlistShows: {}, movies: { ttX: 423004 } };
    const withOverride = reconcile(m, rbResolved, new Map(), new Map(), new Map(), idOverrides);
    assert.equal(withOverride.movieMatches, 1);
    assert.ok(!withOverride.missingFromReadback.some((x) => x.kind === 'movie' && x.imdb === 'ttX'));
  });
});
