import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildFavoritesPayload } from '../../trakt/favorites.mjs';

const master = {
  favorites: {
    shows: [
      { tvdb: 101, name: 'A' },
      { tvdb: 202, name: 'B' },
    ],
    movies: [{ imdb: 'tt5', name: 'M' }],
  },
};

describe('buildFavoritesPayload', () => {
  it('maps shows to {ids:{tvdb}}', () => {
    assert.deepEqual(buildFavoritesPayload(master).shows, [{ ids: { tvdb: 101 } }, { ids: { tvdb: 202 } }]);
  });
  it('maps movies to {ids:{imdb}}', () => {
    assert.deepEqual(buildFavoritesPayload(master).movies, [{ ids: { imdb: 'tt5' } }]);
  });
  it('throws on invalid show tvdb', () => {
    assert.throws(
      () => buildFavoritesPayload({ favorites: { shows: [{ tvdb: null, name: 'X' }], movies: [] } }),
      /invalid tvdb/i,
    );
  });
  it('handles empty favorites', () => {
    assert.deepEqual(buildFavoritesPayload({ favorites: { shows: [], movies: [] } }), { shows: [], movies: [] });
  });
});
