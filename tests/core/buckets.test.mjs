import { test } from 'node:test';
import assert from 'node:assert/strict';
import { statusToSimkl, statusToTrakt } from '../../core/buckets.mjs';

test('Simkl buckets cover all 5 statuses', () => {
  assert.equal(statusToSimkl('up_to_date'), 'completed');
  assert.equal(statusToSimkl('continuing'), 'watching');
  assert.equal(statusToSimkl('not_started_yet'), 'plantowatch');
  assert.equal(statusToSimkl('watch_later'), 'plantowatch');
  assert.equal(statusToSimkl('stopped'), 'dropped');
});

test('Trakt treatments cover all 5 statuses', () => {
  assert.equal(statusToTrakt('up_to_date'), 'watched-progress');
  assert.equal(statusToTrakt('continuing'), 'watched-progress');
  assert.equal(statusToTrakt('not_started_yet'), 'watchlist');
  assert.equal(statusToTrakt('watch_later'), 'watchlist');
  assert.equal(statusToTrakt('stopped'), 'dropped-list');
});

test('unknown status throws — never silently mis-buckets', () => {
  assert.throws(() => statusToSimkl('bogus'));
  assert.throws(() => statusToTrakt('bogus'));
});
