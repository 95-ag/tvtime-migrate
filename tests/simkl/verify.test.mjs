import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconcile } from '../../simkl/verify.mjs';

const noOverride = () => null;

test('regular show: (tvdb,S,E) match → full coverage + dates → pass', () => {
  const master = {
    episodes: [{ showTvdb: '111', season: 1, episode: 1, watchedAt: 'D' }],
    shows: [{ tvdb: '111', simklBucket: 'completed' }],
    movies: [],
  };
  const library = {
    shows: [
      {
        show: { ids: { tvdb: '111', simkl: 5 } },
        status: 'completed',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: 'D' }] }],
      },
    ],
    anime: [],
    movies: [],
  };
  const r = reconcile(master, library, {}, noOverride);
  assert.equal(r.episodeCoverage, 1);
  assert.equal(r.dateFidelity, 1);
  assert.equal(r.pass, true);
});

test('BUG#1 split anime: two sub-anime, different simkl ids, SAME tvdb — BOTH matched', () => {
  const master = {
    episodes: [
      { showTvdb: '305074', season: 1, episode: 1, watchedAt: 'A' },
      { showTvdb: '305074', season: 2, episode: 1, watchedAt: 'B' },
    ],
    shows: [{ tvdb: '305074', simklBucket: 'completed' }],
    movies: [],
  };
  const franchiseCache = {
    305074: { type: 'anime', entries: { '1|1': { simkl: 532942, epNum: 1 }, '2|1': { simkl: 595017, epNum: 1 } } },
  };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '305074', simkl: 532942 } },
        status: 'completed',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: 'A' }] }],
      },
      {
        show: { ids: { tvdb: '305074', simkl: 595017 } },
        status: 'completed',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: 'B' }] }],
      },
    ],
  };
  const r = reconcile(master, library, franchiseCache, noOverride);
  assert.equal(r.matchedEpisodes, 2);
  assert.equal(r.dateFidelity, 1);
  assert.equal(r.episodeCoverage, 1);
});

test('BUG#3 middle gap does NOT cascade: only the missing episode is flagged, later ones still match by identity', () => {
  const master = {
    episodes: [
      { showTvdb: '1', season: 1, episode: 1, watchedAt: 'A' },
      { showTvdb: '1', season: 1, episode: 2, watchedAt: 'B' },
      { showTvdb: '1', season: 1, episode: 3, watchedAt: 'C' },
    ],
    shows: [],
    movies: [],
  };
  const franchiseCache = {
    1: {
      type: 'anime',
      entries: { '1|1': { simkl: 9, epNum: 1 }, '1|2': { simkl: 9, epNum: 2 }, '1|3': { simkl: 9, epNum: 3 } },
    },
  };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '1', simkl: 9 } },
        status: 'dropped',
        seasons: [
          {
            number: 1,
            episodes: [
              { number: 1, watched_at: 'A' },
              { number: 3, watched_at: 'C' },
            ],
          },
        ],
      },
    ],
  };
  const r = reconcile(master, library, franchiseCache, noOverride);
  assert.equal(r.matchedEpisodes, 2);
  assert.equal(r.dateFidelity, 1);
  const missed = r.missingFromReadback.filter((m) => m.kind === 'episode');
  assert.equal(missed.length, 1);
  assert.equal(missed[0].episode, 2);
});

test('BUG#4 anime special is CHECKED against read-back, not auto-missed', () => {
  const master = { episodes: [{ showTvdb: '1', season: 0, episode: 1, watchedAt: 'S' }], shows: [], movies: [] };
  const franchiseCache = { 1: { type: 'anime', entries: { '0|1': { simkl: 9, epNum: 25 } } } };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '1', simkl: 9 } },
        status: 'completed',
        seasons: [{ number: 1, episodes: [{ number: 25, watched_at: 'S' }] }],
      },
    ],
  };
  const r = reconcile(master, library, franchiseCache, noOverride);
  assert.equal(r.matchedEpisodes, 1);
  assert.equal(r.dateFidelity, 1);
});

test('BUG#5 a tvdb present in BOTH shows and anime libraries is flagged', () => {
  const master = { episodes: [], shows: [], movies: [] };
  const library = {
    shows: [{ show: { ids: { tvdb: '77', simkl: 1 } }, seasons: [] }],
    anime: [{ show: { ids: { tvdb: '77', simkl: 2 } }, seasons: [] }],
    movies: [],
  };
  const r = reconcile(master, library, {}, noOverride);
  assert.deepEqual(r.dualLibraryTvdbs, ['77']);
});

test('BUG#6 an unmatched watched movie lands on the manifest with per-movie detail', () => {
  const master = { episodes: [], shows: [], movies: [{ tvdb: '5', imdb: 'tt9', watchedAt: 'D', watched: true }] };
  const r = reconcile(master, { shows: [], anime: [], movies: [] }, {}, noOverride);
  assert.equal(r.movieMatches, 0);
  assert.equal(r.pass, false);
  assert.ok(r.missingFromReadback.some((m) => m.kind === 'movie' && String(m.ids.tvdb) === '5'));
});

test('override routes a tv episode to the override simkl id, not the master tvdb', () => {
  const master = { episodes: [{ showTvdb: '245521', season: 1, episode: 1, watchedAt: 'D' }], shows: [], movies: [] };
  const override = (tvdb) => (String(tvdb) === '245521' ? { simkl: 25227, type: 'tv' } : null);
  const library = {
    shows: [
      {
        show: { ids: { tvdb: '475026', simkl: 25227 } },
        status: 'completed',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: 'D' }] }],
      },
    ],
    anime: [],
    movies: [],
  };
  const r = reconcile(master, library, {}, override);
  assert.equal(r.matchedEpisodes, 1);
  assert.equal(r.dateFidelity, 1);
});

test('anime identity date-mismatch → fidelity < 1, pass false', () => {
  const master = { episodes: [{ showTvdb: '1', season: 1, episode: 1, watchedAt: 'RIGHT' }], shows: [], movies: [] };
  const franchiseCache = { 1: { type: 'anime', entries: { '1|1': { simkl: 9, epNum: 1 } } } };
  const library = {
    shows: [],
    movies: [],
    anime: [
      {
        show: { ids: { tvdb: '1', simkl: 9 } },
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: 'WRONG' }] }],
      },
    ],
  };
  const r = reconcile(master, library, franchiseCache, noOverride);
  assert.ok(r.dateFidelity < 1);
  assert.equal(r.pass, false);
});

test('plan-to-watch: a pure-PTW show present in the library counts; an absent one lands on the manifest', () => {
  const master = {
    episodes: [],
    shows: [],
    movies: [],
    planToWatch: { shows: [{ tvdb: '10' }, { tvdb: '20' }], movies: [{ tvdb: '30' }] },
  };
  const library = {
    shows: [{ show: { ids: { tvdb: '10', simkl: 1 } }, status: 'plantowatch', seasons: [] }],
    anime: [],
    movies: [],
  };
  const r = reconcile(master, library, {}, () => null);
  assert.equal(r.ptwTotal, 3); // 2 shows + 1 movie
  assert.equal(r.ptwMatches, 1); // only tvdb 10 present
  assert.ok(r.missingFromReadback.some((m) => m.kind === 'plantowatch-show' && String(m.ids.tvdb) === '20'));
  assert.ok(r.missingFromReadback.some((m) => m.kind === 'plantowatch-movie' && String(m.ids.tvdb) === '30'));
  assert.equal(r.pass, false); // ptwMatches !== ptwTotal
});

test('plan-to-watch: an overlap show (PTW + has episodes) is NOT double-checked as PTW', () => {
  const master = {
    episodes: [{ showTvdb: '10', season: 1, episode: 1, watchedAt: 'D' }],
    shows: [],
    movies: [],
    planToWatch: { shows: [{ tvdb: '10' }], movies: [] },
  };
  const library = {
    shows: [
      {
        show: { ids: { tvdb: '10', simkl: 1 } },
        status: 'watching',
        seasons: [{ number: 1, episodes: [{ number: 1, watched_at: 'D' }] }],
      },
    ],
    anime: [],
    movies: [],
  };
  const r = reconcile(master, library, {}, () => null);
  assert.equal(r.ptwTotal, 0); // the only PTW show has episodes → excluded from PTW check
  assert.equal(r.episodeCoverage, 1);
});
