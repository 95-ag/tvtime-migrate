import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config, requireClientId } from '../../simkl/config.mjs';

test('config exposes Simkl API constants', () => {
  assert.equal(config.baseUrl, 'https://api.simkl.com');
  assert.equal(config.appName, 'tvtime-migrate');
  assert.match(config.userAgent, /^tvtime-migrate\//);
  assert.equal(config.postIntervalMs, 1000); // 1 POST/sec
  assert.ok(config.maxShowsPerChunk >= 1);
  assert.deepEqual(config.backoff, { baseMs: 1000, capMs: 16000, maxRetries: 5 });
});

test('requireClientId throws a clear error when SIMKL_CLIENT_ID is unset', () => {
  const prev = process.env.SIMKL_CLIENT_ID;
  delete process.env.SIMKL_CLIENT_ID;
  assert.throws(() => requireClientId(), /SIMKL_CLIENT_ID/);
  if (prev !== undefined) process.env.SIMKL_CLIENT_ID = prev;
});

test('requireClientId returns the env value when set', () => {
  process.env.SIMKL_CLIENT_ID = 'abc123';
  assert.equal(requireClientId(), 'abc123');
});
