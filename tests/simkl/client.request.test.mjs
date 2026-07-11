import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from '../../simkl/client.mjs';

function fakeRes(status, body) {
  return { status, ok: status >= 200 && status < 300, json: async () => body, text: async () => JSON.stringify(body) };
}

test('postHistory posts to /sync/history with skip_auto_watching=yes and returns parsed body', async () => {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    return fakeRes(201, { added: { episodes: 1 }, not_found: {} });
  };
  const client = makeClient({ clientId: 'CID', token: 'TOK', fetch, sleep: async () => {} });
  const res = await client.postHistory({ shows: [{ ids: { tvdb: 1 } }] });
  assert.equal(res.added.episodes, 1);
  const u = new URL(calls[0].url);
  assert.equal(u.pathname, '/sync/history');
  assert.equal(u.searchParams.get('skip_auto_watching'), 'yes');
  assert.equal(calls[0].opts.method, 'POST');
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer TOK');
});

test('retries on 429 then succeeds, honoring backoff sleeps', async () => {
  let n = 0;
  const sleeps = [];
  const fetch = async () =>
    ++n < 3 ? fakeRes(429, { error: 'rate_limit' }) : fakeRes(201, { added: {}, not_found: {} });
  const client = makeClient({ clientId: 'C', token: 'T', fetch, sleep: async (ms) => sleeps.push(ms) });
  await client.postHistory({ shows: [] });
  assert.equal(n, 3);
  assert.ok(sleeps.length >= 2); // paced + backoff sleeps
});

test('409 duplicate is treated as soft-success (no throw)', async () => {
  const fetch = async () => fakeRes(409, { error: 'duplicate' });
  const client = makeClient({ clientId: 'C', token: 'T', fetch, sleep: async () => {} });
  const res = await client.postHistory({ shows: [] });
  assert.ok(res); // resolves, does not throw
});

test('409 with an empty/unparseable body still returns a stable {added,not_found} shape (not null)', async () => {
  const fetch = async () => ({
    status: 409,
    ok: false,
    json: async () => {
      throw new Error('no body');
    },
    text: async () => '',
  });
  const client = makeClient({ clientId: 'C', token: 'T', fetch, sleep: async () => {} });
  const res = await client.postHistory({ shows: [] });
  assert.deepEqual(res, { added: {}, not_found: {} });
});

test('412 wrong client_id throws without retry', async () => {
  let n = 0;
  const fetch = async () => {
    n++;
    return fakeRes(412, { error: 'client_id_invalid', message: 'wrong' });
  };
  const client = makeClient({ clientId: 'C', token: 'T', fetch, sleep: async () => {} });
  await assert.rejects(() => client.postHistory({ shows: [] }), /client_id_invalid/);
  assert.equal(n, 1); // no retry
});

test('gives up after maxRetries on a persistent 429 (bounded loop, not infinite)', async () => {
  let n = 0;
  const fetch = async () => {
    n++;
    return fakeRes(429, { error: 'rate_limit' });
  };
  const client = makeClient({ clientId: 'C', token: 'T', fetch, sleep: async () => {} });
  await assert.rejects(() => client.postHistory({ shows: [] }), /429/);
  assert.equal(n, 6); // initial attempt + 5 retries (config.backoff.maxRetries)
});

test('getAllItems builds the read-back URL with extended/episode_watched_at/include_all_episodes', async () => {
  let seen;
  const fetch = async (url) => {
    seen = url;
    return fakeRes(200, { shows: [] });
  };
  const client = makeClient({ clientId: 'C', token: 'T', fetch, sleep: async () => {} });
  await client.getAllItems('shows', 'all');
  const u = new URL(seen);
  assert.equal(u.pathname, '/sync/all-items/shows/all');
  assert.equal(u.searchParams.get('extended'), 'full');
  assert.equal(u.searchParams.get('episode_watched_at'), 'yes');
  assert.equal(u.searchParams.get('include_all_episodes'), 'yes');
});
