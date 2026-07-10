import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildManifest } from '../../simkl/manifest.mjs';

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
