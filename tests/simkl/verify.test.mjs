import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../../simkl/verify.mjs';

test('regular show: matches on (season, episode) from the shows library; full coverage + dates → pass', () => {
  const master = {
    episodes: [
      { showTvdb: '99999', season: 1, episode: 1, watchedAt: '2021-01-01T00:00:00Z' },
      { showTvdb: '99999', season: 2, episode: 1, watchedAt: '2021-02-01T00:00:00Z' },
    ],
    shows: [{ tvdb: '99999', simklBucket: 'completed' }],
    movies: [],
  };
  const library = {
    shows: [
      {
        show: { ids: { tvdb: '99999' } },
        status: 'completed',
        seasons: [
          { number: 1, episodes: [{ number: 1, watched_at: '2021-01-01T00:00:00Z' }] },
          { number: 2, episodes: [{ number: 1, watched_at: '2021-02-01T00:00:00Z' }] },
        ],
      },
    ],
    anime: [],
    movies: [],
  };
  const r = reconcile(master, library);
  assert.equal(r.episodeCoverage, 1);
  assert.equal(r.dateFidelity, 1);
  assert.equal(r.pass, true);
});

test('anime: master (season,episode) maps to Simkl season-1 ABSOLUTE numbering by rank; dates verified', () => {
  const master = {
    episodes: [
      { showTvdb: '71361', season: 1, episode: 1, watchedAt: '2020-09-23T12:30:57Z' },
      { showTvdb: '71361', season: 1, episode: 2, watchedAt: '2020-09-23T12:30:58Z' },
      { showTvdb: '71361', season: 2, episode: 1, watchedAt: '2020-09-24T00:00:00Z' },
    ],
    shows: [{ tvdb: '71361', simklBucket: 'dropped' }],
    movies: [],
  };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '71361' } },
        status: 'dropped',
        seasons: [
          {
            number: 1,
            episodes: [
              { number: 1, watched_at: '2020-09-23T12:30:57Z' },
              { number: 2, watched_at: '2020-09-23T12:30:58Z' },
              { number: 3, watched_at: '2020-09-24T00:00:00Z' }, // == master S2E1 by absolute rank 3
            ],
          },
        ],
      },
    ],
  };
  const r = reconcile(master, library);
  assert.equal(r.matchedEpisodes, 3);
  assert.equal(r.dateFidelity, 1);
  assert.equal(r.episodeCoverage, 1);
});

test('anime with fewer Simkl episodes than watched: extra ranks are absent_on_simkl (partial coverage)', () => {
  const master = {
    episodes: [
      { showTvdb: '305074', season: 1, episode: 1, watchedAt: '2020-01-01T00:00:00Z' },
      { showTvdb: '305074', season: 2, episode: 1, watchedAt: '2020-02-01T00:00:00Z' },
    ],
    shows: [{ tvdb: '305074', simklBucket: 'completed' }],
    movies: [],
  };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '305074' } },
        status: 'completed',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2020-01-01T00:00:00Z' }] }],
      },
    ],
  };
  const r = reconcile(master, library);
  assert.equal(r.matchedEpisodes, 1);
  assert.ok(r.episodeCoverage < 1);
  assert.ok(r.missingFromReadback.some((m) => m.reason_detail === 'absent_on_simkl'));
});

test('anime date mismatch by rank is caught as a fidelity failure', () => {
  const master = {
    episodes: [{ showTvdb: '71361', season: 1, episode: 1, watchedAt: '2020-09-23T12:30:57Z' }],
    shows: [{ tvdb: '71361', simklBucket: 'dropped' }],
    movies: [],
  };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '71361' } },
        status: 'dropped',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '1999-01-01T00:00:00Z' }] }],
      },
    ],
  };
  const r = reconcile(master, library);
  assert.ok(r.dateFidelity < 1);
  assert.equal(r.pass, false);
});

test('anime season-0 specials are reported as special_unmapped (not silently dropped)', () => {
  const master = {
    episodes: [
      { showTvdb: '71361', season: 0, episode: 1, watchedAt: '2020-01-01T00:00:00Z' },
      { showTvdb: '71361', season: 1, episode: 1, watchedAt: '2020-09-23T12:30:57Z' },
    ],
    shows: [{ tvdb: '71361', simklBucket: 'dropped' }],
    movies: [],
  };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '71361' } },
        status: 'dropped',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2020-09-23T12:30:57Z' }] }],
      },
    ],
  };
  const r = reconcile(master, library);
  assert.ok(r.missingFromReadback.some((m) => m.reason_detail === 'special_unmapped' && m.season === 0));
  assert.equal(r.matchedEpisodes, 1); // the regular ep matched
});

test('completed→watching downgrade is acceptable (not a mismatch); anime movie matched from anime lib', () => {
  const master = {
    episodes: [{ showTvdb: '99999', season: 1, episode: 1, watchedAt: '2021-01-01T00:00:00Z' }],
    shows: [{ tvdb: '99999', simklBucket: 'completed' }],
    movies: [{ tvdb: '133610', watchedAt: '2021-05-01T00:00:00Z', watched: true }],
  };
  const library = {
    shows: [
      {
        show: { ids: { tvdb: '99999' } },
        status: 'watching',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: '2021-01-01T00:00:00Z' }] }],
      },
    ],
    movies: [],
    anime: [
      {
        anime_type: 'movie',
        show: { ids: { tvdb: '133610' } },
        status: 'completed',
        last_watched_at: '2021-05-01T00:00:00Z',
      },
    ],
  };
  const r = reconcile(master, library);
  assert.equal(r.bucketMismatches.length, 0);
  assert.equal(r.bucketDowngrades.length, 1);
  assert.equal(r.movieMatches, 1);
  assert.equal(r.pass, true);
});
