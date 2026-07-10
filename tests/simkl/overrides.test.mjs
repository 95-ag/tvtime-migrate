import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OVERRIDES, lookupOverride } from '../../simkl/overrides.mjs';

const sample = [
  { tvdb: '245521', simkl: 25227, type: 'tv' },
  { tvdb: '405494', season: 2, simkl: 3161260, type: 'anime' },
  { tvdb: '429656', simkl: 2084801, type: 'tv' },
];

test('OVERRIDES ships empty (repo is data-independent; users add their own)', () => {
  assert.deepEqual(OVERRIDES, []);
});

test('season-specific override wins over whole-show', () => {
  assert.deepEqual(lookupOverride('405494', 2, sample), { tvdb: '405494', season: 2, simkl: 3161260, type: 'anime' });
});

test('whole-show override applies to any season', () => {
  assert.equal(lookupOverride('429656', 1, sample).simkl, 2084801);
  assert.equal(lookupOverride('429656', 5, sample).simkl, 2084801);
  assert.equal(lookupOverride('429656', 1, sample).type, 'tv');
});

test('a season without a season-specific override (no whole-show entry) → null', () => {
  assert.equal(lookupOverride('405494', 1, sample), null);
});

test('unknown tvdb → null', () => {
  assert.equal(lookupOverride('99999', 1, sample), null);
});

test('default (empty seed) → null for anything', () => {
  assert.equal(lookupOverride('245521', 1), null);
});
