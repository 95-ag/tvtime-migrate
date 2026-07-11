import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from '../../trakt/client.mjs';

const seq = (rs) => {
  let i = 0;
  return async () => rs[i++];
};

describe('makeClient.request', () => {
  it('sends auth headers on GET', async () => {
    let cap;
    const client = makeClient({
      clientId: 'cid',
      token: 'tok',
      fetch: async (_u, o) => {
        cap = o;
        return { ok: true, status: 200, json: async () => ({}) };
      },
      sleep: async () => {},
    });
    await client.get('/sync/watched/shows');
    assert.equal(cap.headers['trakt-api-key'], 'cid');
    assert.equal(cap.headers['trakt-api-version'], '2');
    assert.equal(cap.headers.Authorization, 'Bearer tok');
  });

  it('retries on 429 using Retry-After', async () => {
    let slept = 0;
    const client = makeClient({
      clientId: 'c',
      token: 't',
      fetch: seq([
        { ok: false, status: 429, headers: { get: (h) => (h === 'Retry-After' ? '2' : null) }, json: async () => ({}) },
        { ok: true, status: 200, json: async () => ({ result: 'ok' }) },
      ]),
      sleep: async (ms) => {
        slept += ms;
      },
    });
    const r = await client.get('/t');
    assert.equal(slept, 2000);
    assert.deepEqual(r, { result: 'ok' });
  });

  it('retries on 500', async () => {
    let n = 0;
    const client = makeClient({
      clientId: 'c',
      token: 't',
      fetch: async () =>
        ++n < 2
          ? { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) }
          : { ok: true, status: 200, json: async () => ({}) },
      sleep: async () => {},
    });
    await client.get('/t');
    assert.equal(n, 2);
  });

  it('throws after maxRetries', async () => {
    const client = makeClient({
      clientId: 'c',
      token: 't',
      fetch: async () => ({ ok: false, status: 500, headers: { get: () => null }, json: async () => ({ error: 'x' }) }),
      sleep: async () => {},
    });
    await assert.rejects(() => client.get('/t'), /500/);
  });

  it('paces POSTs', async () => {
    let slept = 0;
    const client = makeClient({
      clientId: 'c',
      token: 't',
      fetch: async () => ({ ok: true, status: 200, json: async () => ({}) }),
      sleep: async (ms) => {
        slept += ms;
      },
    });
    await client.post('/sync/history', {});
    await client.post('/sync/history', {});
    assert.ok(slept >= 900);
  });
});
