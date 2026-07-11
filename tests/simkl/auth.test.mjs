import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pollForToken } from '../../simkl/auth.mjs';

function fakeRes(body) {
  return { status: 200, ok: true, json: async () => body };
}

test('pollForToken loops on "Authorization pending" then returns the access_token', async () => {
  const bodies = [
    { result: 'KO', message: 'Authorization pending' },
    { result: 'KO', message: 'Authorization pending' },
    { result: 'OK', access_token: 'TOKEN123' },
  ];
  let i = 0;
  const sleeps = [];
  const token = await pollForToken({
    clientId: 'CID',
    userCode: '5G6JAH',
    intervalMs: 5000,
    expiresInMs: 900000,
    fetch: async () => fakeRes(bodies[i++]),
    sleep: async (ms) => sleeps.push(ms),
    now: (() => {
      let t = 0;
      return () => (t += 5000);
    })(),
  });
  assert.equal(token, 'TOKEN123');
  assert.equal(sleeps.length, 2); // slept before each re-poll
});

test('pollForToken throws when the PIN window expires without approval', async () => {
  await assert.rejects(
    () =>
      pollForToken({
        clientId: 'C',
        userCode: 'X',
        intervalMs: 5000,
        expiresInMs: 10000,
        fetch: async () => fakeRes({ result: 'KO', message: 'Authorization pending' }),
        sleep: async () => {},
        now: (() => {
          let t = 0;
          return () => (t += 6000);
        })(),
      }),
    /expired/i,
  );
});

test('pollForToken throws immediately on a non-pending error response (not silently waiting out expiry)', async () => {
  let polls = 0;
  await assert.rejects(
    () =>
      pollForToken({
        clientId: 'C',
        userCode: 'X',
        intervalMs: 5000,
        expiresInMs: 900000,
        fetch: async () => {
          polls++;
          return fakeRes({ result: 'KO', message: 'Invalid or denied' });
        },
        sleep: async () => {},
        now: (() => {
          let t = 0;
          return () => (t += 5000);
        })(),
      }),
    /authorization failed/i,
  );
  assert.equal(polls, 1); // threw on the first non-pending response, did not keep polling
});
