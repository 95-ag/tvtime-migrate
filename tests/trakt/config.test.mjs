import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { config, requireEnv, buildAuthHeaders } from '../../trakt/config.mjs';

describe('config', () => {
  it('has correct base + version', () => {
    assert.equal(config.baseUrl, 'https://api.trakt.tv');
    assert.equal(config.apiVersion, '2');
    assert.equal(config.postIntervalMs, 1000);
    assert.equal(config.tokenFile, '.trakt-token.json');
  });
});

describe('requireEnv', () => {
  it('throws when missing', () => {
    assert.throws(() => requireEnv('TRAKT_CLIENT_ID', {}), /TRAKT_CLIENT_ID/);
  });
  it('returns value when set', () => {
    assert.equal(requireEnv('TRAKT_CLIENT_ID', { TRAKT_CLIENT_ID: 'abc' }), 'abc');
  });
});

describe('buildAuthHeaders', () => {
  it('unauthenticated', () => {
    const h = buildAuthHeaders('myid', null);
    assert.equal(h['trakt-api-key'], 'myid');
    assert.equal(h['trakt-api-version'], '2');
    assert.equal(h['Content-Type'], 'application/json');
    assert(!h.Authorization);
  });
  it('authenticated', () => {
    assert.equal(buildAuthHeaders('myid', 'tok').Authorization, 'Bearer tok');
  });
});
