import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest, renderManifest } from '../../simkl/manifest.mjs';

const master = {
  shows: [
    { tvdb: '101', title: 'Show A' },
    { tvdb: '202', title: 'Show B' },
  ],
  movies: [{ tvdb: '5', imdb: 'tt0001', title: 'Movie A', year: '2020' }],
};

test('lists not_found shows/movies/episodes with a reason and preserves ids', () => {
  const m = buildManifest({
    notFound: { shows: [{ ids: { tvdb: 42 }, title: 'Ghost' }], movies: [], episodes: [] },
    missingFromReadback: [],
  });
  assert.equal(m.count, 1);
  assert.deepEqual(m.items[0], { kind: 'show', ids: { tvdb: 42 }, title: 'Ghost', reason: 'not_found' });
});

test('adds read-back gaps (sent but not confirmed present) with reason not_confirmed', () => {
  const m = buildManifest({
    notFound: { shows: [], movies: [], episodes: [] },
    missingFromReadback: [{ kind: 'episode', ids: { tvdb: 7 }, season: 2, episode: 5, title: 'X' }],
  });
  assert.equal(m.count, 1);
  assert.equal(m.items[0].reason, 'not_confirmed');
  assert.equal(m.items[0].season, 2);
});

test('empty inputs → zero-count manifest', () => {
  const m = buildManifest({ notFound: { shows: [], movies: [], episodes: [] }, missingFromReadback: [] });
  assert.equal(m.count, 0);
  assert.deepEqual(m.items, []);
});

test('tolerates omitted not_found buckets via the ?? [] guard (no crash, no silent loss)', () => {
  const m = buildManifest({ notFound: { shows: [{ ids: { tvdb: 9 }, title: 'Solo' }] } });
  assert.equal(m.count, 1);
  assert.deepEqual(m.items[0], { ids: { tvdb: 9 }, title: 'Solo', kind: 'show', reason: 'not_found' });
});

test('renderManifest: zero items → everything transferred', () => {
  const md = renderManifest([], master, 'Simkl');
  assert.match(md, /^# What didn't transfer to Simkl/);
  assert.match(md, /Everything transferred — nothing was left behind\./);
});

test('renderManifest: groups missing episodes by show name with counts, most-missing first', () => {
  const items = [
    { kind: 'episode', ids: { tvdb: 101 }, season: 1, episode: 1, reason_detail: 'absent_on_simkl' },
    { kind: 'episode', ids: { tvdb: 101 }, season: 1, episode: 2, reason_detail: 'unmapped' },
    { kind: 'episode', ids: { tvdb: 202 }, season: 1, episode: 1, reason_detail: 'absent_on_simkl' },
  ];
  const md = renderManifest(items, master, 'Simkl');
  assert.match(md, /## Episodes the catalogue doesn't have/);
  assert.match(md, /- Show A — 2 episode\(s\)/);
  assert.match(md, /- Show B — 1 episode\(s\)/);
  assert.ok(md.indexOf('Show A — 2') < md.indexOf('Show B — 1'));
  assert.doesNotMatch(md, /101|202/);
});

test('renderManifest: lists missing movies by title, falling back to master lookup', () => {
  const items = [
    { kind: 'movie', ids: { tvdb: 999, imdb: 'tt9999' }, title: 'Standalone Movie', reason_detail: 'absent_on_simkl' },
    { kind: 'movie', ids: { tvdb: 5, imdb: 'tt0001' }, reason_detail: 'date_mismatch' },
  ];
  const md = renderManifest(items, master, 'Simkl');
  assert.match(md, /## Movies the catalogue doesn't have/);
  assert.match(md, /- Standalone Movie/);
  assert.match(md, /- Movie A \(2020\)/);
});

test('renderManifest: resolves plan-to-watch items to show/movie names', () => {
  const items = [
    { kind: 'plantowatch-show', ids: { tvdb: 202 }, reason_detail: 'ptw_absent' },
    { kind: 'plantowatch-movie', ids: { tvdb: 999 }, reason_detail: 'ptw_absent' },
  ];
  const md = renderManifest(items, master, 'Simkl');
  assert.match(md, /## Watchlist items not added/);
  assert.match(md, /- Show B/);
  assert.match(md, /- A watchlist movie \(no matching id\)/);
});

test('renderManifest: summary line reports the real item count', () => {
  const items = [{ kind: 'episode', ids: { tvdb: 101 }, season: 1, episode: 1, reason_detail: 'absent_on_simkl' }];
  const md = renderManifest(items, master, 'Simkl');
  assert.match(md, /`1` item\(s\) from your TV Time history aren't on Simkl/);
});
