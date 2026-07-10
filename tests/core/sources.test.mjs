import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadRefractEpisodes, assertColumns } from '../../core/sources.mjs';

const fix = (n) => readFileSync(new URL(`./fixtures/${n}`, import.meta.url), 'utf8');

test('loads only watched episodes, mapping fields by name', () => {
  const rows = loadRefractEpisodes(fix('refract-episodes.csv'));
  assert.equal(rows.length, 2); // the is_watched=false row is dropped
  assert.deepEqual(rows[0], {
    seriesTvdb: '459616',
    seriesImdb: null,
    title: 'Our Universe (2026)',
    season: 1,
    episode: 1,
    epTvdb: '10937193',
    watchedAt: '2026-02-08T16:33:13Z',
    rewatchCount: 0,
    special: false,
  });
});

test('comma-in-title row keeps correct column alignment', () => {
  const rows = loadRefractEpisodes(fix('refract-episodes.csv'));
  const toradora = rows.find((r) => r.seriesTvdb === '83277');
  assert.equal(toradora.title, 'Toradora!, The Movie');
  assert.equal(toradora.special, true);
  assert.equal(toradora.rewatchCount, 1);
});

test('a header missing a required column is rejected, not coerced', () => {
  assert.throws(() => loadRefractEpisodes(fix('refract-episodes-bad.csv')), /watched_at/);
});

test('assertColumns names the first missing column', () => {
  assert.throws(() => assertColumns(['a', 'b'], ['a', 'x'], 'demo'), /x/);
});

import { loadRefractMovies } from '../../core/sources.mjs';
test('movie loader maps ids and watched flag', () => {
  const csv =
    'uuid,tvdb_id,imdb_id,title,year,created_at,watched_at,is_watched,rewatch_count\n' +
    'fe9cd0a8,285,tt0103639,Aladdin,1993,2022-11-14T15:45:28Z,2022-11-14T15:46:27Z,true,0\n';
  const [m] = loadRefractMovies(csv);
  assert.equal(m.tvdb, '285');
  assert.equal(m.imdb, 'tt0103639');
  assert.equal(m.watchedAt, '2022-11-14T15:46:27Z');
  assert.equal(m.watched, true);
});
