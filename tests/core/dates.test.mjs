import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeWatchedAt } from '../../core/dates.mjs';

test('passes through Refract ISO-Z unchanged', () => {
  assert.equal(normalizeWatchedAt('2026-02-08T16:33:13Z'), '2026-02-08T16:33:13Z');
});

test('converts Rescue space-separated tz-less to ISO-Z (treated as UTC)', () => {
  assert.equal(normalizeWatchedAt('2021-03-01 16:05:01'), '2021-03-01T16:05:01Z');
});

test('empty or whitespace becomes null, never a sentinel', () => {
  assert.equal(normalizeWatchedAt(''), null);
  assert.equal(normalizeWatchedAt('   '), null);
  assert.equal(normalizeWatchedAt(undefined), null);
});

test('trims sub-second precision to whole seconds', () => {
  assert.equal(normalizeWatchedAt('2026-02-08T16:33:06.213637Z'), '2026-02-08T16:33:06Z');
});
