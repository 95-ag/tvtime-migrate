import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findOrCreateList, buildDroppedShows, buildContentLists, splitKdrama } from '../../trakt/lists.mjs';

describe('findOrCreateList', () => {
  it('returns existing slug', async () => {
    const slug = await findOrCreateList(
      { getUserLists: async () => [{ name: 'Dropped', ids: { slug: 'dropped' } }] },
      'Dropped',
    );
    assert.equal(slug, 'dropped');
  });
  it('creates when missing', async () => {
    let created;
    const slug = await findOrCreateList(
      {
        getUserLists: async () => [],
        createList: async (b) => {
          created = b;
          return { ids: { slug: 'dropped' } };
        },
      },
      'Dropped',
    );
    assert.equal(slug, 'dropped');
    assert.equal(created.name, 'Dropped');
    assert.equal(created.privacy, 'private');
  });
});

describe('buildDroppedShows', () => {
  it('maps to {ids:{tvdb}}', () => {
    assert.deepEqual(buildDroppedShows([{ tvdb: 101 }, { tvdb: 202 }]), {
      shows: [{ ids: { tvdb: 101 } }, { ids: { tvdb: 202 } }],
    });
  });
  it('throws on invalid tvdb', () => {
    assert.throws(() => buildDroppedShows([{ tvdb: null }]), /invalid tvdb/i);
  });
});

describe('splitKdrama', () => {
  const kdList = {
    name: 'K-drama',
    shows: [
      { tvdb: 1, name: 'w-2020' },
      { tvdb: 2, name: 'w-2021' },
      { tvdb: 3, name: 'w-2022' },
      { tvdb: 4, name: 'w-2023' },
      { tvdb: 5, name: 'undated' },
    ],
    movies: [{ imdb: 'tt9', name: 'MovieK' }],
  };
  const episodes = [
    { showTvdb: 1, watchedAt: '2020-01-01T00:00:00Z' },
    { showTvdb: 2, watchedAt: '2021-01-01T00:00:00Z' },
    { showTvdb: 3, watchedAt: '2022-01-01T00:00:00Z' },
    { showTvdb: 4, watchedAt: '2023-01-01T00:00:00Z' },
  ];

  it('Old gets the earliest-watched up to the cap', () => {
    const { old } = splitKdrama(kdList, episodes, 2);
    assert.deepEqual(
      old.shows.map((s) => s.ids.tvdb),
      [1, 2],
    );
    assert.equal(old.name, 'K-drama Old');
  });
  it('New gets the overflow + undated + movies', () => {
    const { neu } = splitKdrama(kdList, episodes, 2);
    assert.deepEqual(
      neu.shows.map((s) => s.ids.tvdb).sort((a, b) => a - b),
      [3, 4, 5],
    );
    assert.equal(neu.movies.length, 1);
    assert.equal(neu.name, 'K-drama New');
  });
});

describe('buildContentLists', () => {
  const master = {
    lists: [
      { name: 'C-Drama', shows: [{ tvdb: 10, name: 'c1' }], movies: [] },
      { name: 'Anime', shows: [{ tvdb: 20, name: 'a1' }], movies: [] },
    ],
    episodes: [],
  };
  it('keeps only configured lists', () => {
    const { lists, skipped } = buildContentLists(master);
    assert.ok(lists.find((l) => l.name === 'C-Drama'));
    assert.ok(!lists.find((l) => l.name === 'Anime'));
    assert.ok(skipped.find((s) => s.name === 'Anime'));
  });
  it('C-Drama items become {ids:{tvdb}}', () => {
    const { lists } = buildContentLists(master);
    assert.deepEqual(lists.find((l) => l.name === 'C-Drama').shows, [{ ids: { tvdb: 10 } }]);
  });
});
