import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { makeClient } from '../../trakt/client.mjs';

describe('makeClient pagination', () => {
  it('concatenates all pages for getWatchedShows', async () => {
    const pages = [[{ id: 1 }], [{ id: 2 }]];
    let call = 0;
    const client = makeClient({
      clientId: 'c',
      token: 't',
      fetch: async () => {
        const body = pages[call++];
        return {
          ok: true,
          status: 200,
          json: async () => body,
          headers: { get: (h) => (h === 'x-pagination-page-count' ? '2' : null) },
        };
      },
      sleep: async () => {},
    });

    const all = await client.getWatchedShows();
    assert.deepEqual(all, [{ id: 1 }, { id: 2 }]);
    assert.equal(call, 2);
  });

  it('stops after one page when the page-count header is absent', async () => {
    let call = 0;
    const client = makeClient({
      clientId: 'c',
      token: 't',
      fetch: async () => {
        call++;
        return {
          ok: true,
          status: 200,
          json: async () => [{ id: 1 }],
          headers: { get: () => null },
        };
      },
      sleep: async () => {},
    });

    const all = await client.getWatchedMovies();
    assert.deepEqual(all, [{ id: 1 }]);
    assert.equal(call, 1);
  });

  it('paginates getWatchlist and getFavorites', async () => {
    const pages = [[{ id: 'a' }], [{ id: 'b' }], [{ id: 'c' }]];
    let call = 0;
    const client = makeClient({
      clientId: 'c',
      token: 't',
      fetch: async () => {
        const body = pages[call++];
        return {
          ok: true,
          status: 200,
          json: async () => body,
          headers: { get: (h) => (h === 'x-pagination-page-count' ? '3' : null) },
        };
      },
      sleep: async () => {},
    });

    const all = await client.getWatchlist('shows');
    assert.equal(all.length, 3);
    assert.equal(call, 3);
  });
});
