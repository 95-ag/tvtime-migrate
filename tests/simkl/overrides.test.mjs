import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupOverride, OVERRIDES } from '../../simkl/overrides.mjs';

test('season-specific override wins over any whole-show match', () => {
  const o = lookupOverride('405494', 2);
  assert.deepEqual(o, { tvdb: '405494', season: 2, simkl: 3161260, type: 'anime' });
});

test('whole-show override applies to any season', () => {
  assert.equal(lookupOverride('429656', 1).simkl, 2084801);
  assert.equal(lookupOverride('429656', 5).simkl, 2084801);
  assert.equal(lookupOverride('429656', 1).type, 'tv');
});

test('49 Days whole-show override', () => {
  assert.equal(lookupOverride('245521', 1).simkl, 25227);
});

test('unknown tvdb → null', () => {
  assert.equal(lookupOverride('99999', 1), null);
});

test('a season without a season-specific override falls through to null when no whole-show entry', () => {
  // 405494 has ONLY a season-2 override, no whole-show entry → season 1 must be null
  assert.equal(lookupOverride('405494', 1), null);
});

test('OVERRIDES entries are well-formed', () => {
  for (const o of OVERRIDES) {
    assert.equal(typeof o.tvdb, 'string');
    assert.equal(typeof o.simkl, 'number');
    assert.ok(['tv', 'anime', 'movie'].includes(o.type));
  }
});
