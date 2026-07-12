import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildLists, buildFavorites } from '../../core/lists.mjs';

const rawLists = [
  {
    name: 'K-drama',
    items: [
      { type: 'series', tvdb_id: 101, name: 'Show A' },
      { type: 'movie', uuid: 'u-1', name: 'Movie A' },
      { type: 'movie', uuid: 'u-missing', name: 'Movie X' },
    ],
  },
  { name: 'C-Drama', items: [{ type: 'series', tvdb_id: 202, name: 'Show B' }] },
];
const movies = [{ tvdb: 999, imdb: 'tt111', uuid: 'u-1', title: 'Movie A' }];

describe('buildLists', () => {
  it('maps series items to {tvdb, name}', () => {
    const kd = buildLists(rawLists, movies).find((l) => l.name === 'K-drama');
    assert.deepEqual(kd.shows, [{ tvdb: 101, name: 'Show A' }]);
  });
  it('resolves movie uuid to imdb via master movies', () => {
    const kd = buildLists(rawLists, movies).find((l) => l.name === 'K-drama');
    assert.equal(kd.movies.find((m) => m.name === 'Movie A').imdb, 'tt111');
  });
  it('marks unresolved movie items with imdb null', () => {
    const kd = buildLists(rawLists, movies).find((l) => l.name === 'K-drama');
    const u = kd.movies.find((m) => m.name === 'Movie X');
    assert.equal(u.imdb, null);
    assert.equal(u.uuid, 'u-missing');
  });
});

// Refract's raw JSON rows carry a nested { id: { tvdb, imdb } } + title (not flat tvdb_id/name).
describe('buildFavorites', () => {
  const series = [
    { id: { tvdb: 101, imdb: null }, title: 'Fav Show', is_favorite: true },
    { id: { tvdb: 202, imdb: null }, title: 'Not Fav', is_favorite: false },
  ];
  const movieRows = [{ id: { tvdb: 999, imdb: 'tt222' }, title: 'Fav Movie', is_favorite: false }];
  it('collects favorite shows by tvdb', () => {
    const fav = buildFavorites(series, movieRows);
    assert.equal(fav.shows.length, 1);
    assert.deepEqual(fav.shows[0], { tvdb: 101, name: 'Fav Show' });
  });
  it('collects favorite movies (none here)', () => {
    assert.equal(buildFavorites(series, movieRows).movies.length, 0);
  });
  it('collects favorite movies when present', () => {
    const favMovies = [{ id: { tvdb: 1, imdb: 'tt333' }, title: 'Fav Flick', is_favorite: true }];
    const fav = buildFavorites(series, favMovies);
    assert.deepEqual(fav.movies, [{ imdb: 'tt333', name: 'Fav Flick' }]);
  });
});
