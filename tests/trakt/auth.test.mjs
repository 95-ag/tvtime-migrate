import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildRefreshBody, pollForToken, requestDeviceCode } from '../../trakt/auth.mjs';

describe('requestDeviceCode', () => {
  it('POSTs client_id and returns code', async () => {
    let captured;
    const mockFetch = async (url, opts) => {
      captured = { url, opts };
      return {
        ok: true,
        json: async () => ({
          device_code: 'dc',
          user_code: 'UC',
          verification_url: 'https://trakt.tv/activate',
          expires_in: 600,
          interval: 5,
        }),
      };
    };
    const r = await requestDeviceCode({ clientId: 'cid', fetch: mockFetch });
    assert.equal(captured.opts.method, 'POST');
    assert.ok(captured.url.includes('/oauth/device/code'));
    assert.equal(JSON.parse(captured.opts.body).client_id, 'cid');
    assert.equal(r.device_code, 'dc');
  });
  it('throws on non-ok', async () => {
    await assert.rejects(
      () =>
        requestDeviceCode({ clientId: 'cid', fetch: async () => ({ ok: false, status: 400, json: async () => ({}) }) }),
      /400/,
    );
  });
});

describe('pollForToken', () => {
  const base = {
    clientId: 'c',
    clientSecret: 's',
    deviceCode: 'dc',
    intervalMs: 0,
    expiresInMs: 60000,
    sleep: async () => {},
    now: () => 0,
  };
  it('returns tokens on 200 after pending', async () => {
    let n = 0;
    const fetch = async () =>
      ++n < 2
        ? { status: 400, json: async () => ({}) }
        : { status: 200, json: async () => ({ access_token: 'at', refresh_token: 'rt', expires_in: 7776000 }) };
    assert.equal((await pollForToken({ ...base, fetch })).access_token, 'at');
  });
  it('throws on 410', async () => {
    await assert.rejects(
      () => pollForToken({ ...base, fetch: async () => ({ status: 410, json: async () => ({}) }) }),
      /expired/i,
    );
  });
  it('throws on 418', async () => {
    await assert.rejects(
      () => pollForToken({ ...base, fetch: async () => ({ status: 418, json: async () => ({}) }) }),
      /denied/i,
    );
  });
  it('throws when window elapses', async () => {
    let t = 0;
    await assert.rejects(
      () =>
        pollForToken({
          ...base,
          expiresInMs: 100,
          fetch: async () => ({ status: 400, json: async () => ({}) }),
          sleep: async () => {
            t += 200;
          },
          now: () => t,
        }),
      /expired/i,
    );
  });
});

describe('buildRefreshBody', () => {
  it('builds refresh body', () => {
    const b = buildRefreshBody({ clientId: 'c', clientSecret: 's', refreshToken: 'rt' });
    assert.equal(b.grant_type, 'refresh_token');
    assert.equal(b.refresh_token, 'rt');
  });
});
