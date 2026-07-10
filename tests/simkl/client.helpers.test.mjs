import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildUrl, buildHeaders, backoffMs, chunkShows } from '../../simkl/client.mjs';

test('buildUrl always adds the client_id/app-name/app-version trio', () => {
  const u = new URL(buildUrl('CID', '/sync/history', { skip_auto_watching: 'yes' }));
  assert.equal(u.origin + u.pathname, 'https://api.simkl.com/sync/history');
  assert.equal(u.searchParams.get('client_id'), 'CID');
  assert.equal(u.searchParams.get('app-name'), 'tvtime-migrate');
  assert.equal(u.searchParams.get('app-version'), '1.0');
  assert.equal(u.searchParams.get('skip_auto_watching'), 'yes');
});

test('buildUrl omits null/undefined extra params', () => {
  const u = new URL(buildUrl('CID', '/sync/all-items/shows/all', { date_from: undefined }));
  assert.equal(u.searchParams.has('date_from'), false);
});

test('buildHeaders: User-Agent always; Authorization only with a token', () => {
  assert.equal(buildHeaders().Authorization, undefined);
  assert.match(buildHeaders()['User-Agent'], /tvtime-migrate/);
  assert.equal(buildHeaders('TOK').Authorization, 'Bearer TOK');
  assert.equal(buildHeaders('TOK')['Content-Type'], 'application/json');
});

test('backoffMs follows 1→2→4→8→16s capped, with jitter in [0,1000)', () => {
  const noJitter = (n) => backoffMs(n, () => 0);
  assert.deepEqual([0, 1, 2, 3, 4, 5].map(noJitter), [1000, 2000, 4000, 8000, 16000, 16000]);
  const j = backoffMs(0, () => 0.5);
  assert.ok(j >= 1000 && j < 2000);
});

test('chunkShows splits into arrays of at most N', () => {
  const arr = Array.from({ length: 125 }, (_, i) => i);
  const chunks = chunkShows(arr, 50);
  assert.deepEqual(
    chunks.map((c) => c.length),
    [50, 50, 25],
  );
});
