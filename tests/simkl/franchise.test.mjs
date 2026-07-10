import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync as rf } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildAllMaps, buildMapFromNodes } from '../../simkl/franchise.mjs';

test('maps (tvdb season,episode) → (simkl, epNum) for same-tvdb nodes only', () => {
  const nodes = [
    { ids: { tvdb: '305074', simkl: 532942 }, episodes: [{ episode: 1, tvdb: { season: 1, episode: 1 } }] },
    { ids: { tvdb: '305074', simkl: 595017 }, episodes: [{ episode: 1, tvdb: { season: 2, episode: 1 } }] },
    { ids: { tvdb: '458058', simkl: 999 }, episodes: [{ episode: 1, tvdb: { season: 2, episode: 1 } }] },
  ];
  const { map, collisions } = buildMapFromNodes(nodes, '305074');
  assert.equal(collisions, 0);
  assert.deepEqual(map.get('1|1'), { simkl: 532942, epNum: 1 });
  assert.deepEqual(map.get('2|1'), { simkl: 595017, epNum: 1 });
  assert.equal(map.size, 2);
});

test('first-wins on a genuine same-tvdb collision, counted', () => {
  const nodes = [
    { ids: { tvdb: '1', simkl: 10 }, episodes: [{ episode: 5, tvdb: { season: 1, episode: 1 } }] },
    { ids: { tvdb: '1', simkl: 20 }, episodes: [{ episode: 7, tvdb: { season: 1, episode: 1 } }] },
  ];
  const { map, collisions } = buildMapFromNodes(nodes, '1');
  assert.equal(collisions, 1);
  assert.deepEqual(map.get('1|1'), { simkl: 10, epNum: 5 });
});

test('ignores episodes without a tvdb mapping', () => {
  const nodes = [
    { ids: { tvdb: '1', simkl: 10 }, episodes: [{ episode: 1 }, { episode: 2, tvdb: { season: 1, episode: 2 } }] },
  ];
  const { map } = buildMapFromNodes(nodes, '1');
  assert.equal(map.size, 1);
  assert.deepEqual(map.get('1|2'), { simkl: 10, epNum: 2 });
});

test('buildAllMaps is resume-safe: one failing tvdb does not lose the others', async () => {
  const cachePath = join(mkdtempSync(join(tmpdir(), 'fr-')), 'cache.json');
  // client whose /search/id throws for tvdb 222 but resolves 111 as a non-anime tv show
  const client = {
    request: async (_m, path, opts) => {
      const tvdb = opts?.params?.tvdb;
      if (path === '/search/id' && tvdb === '222') throw new Error('boom');
      if (path === '/search/id' && tvdb === '111') return [{ type: 'tv', ids: { simkl: 1 } }];
      return [];
    },
  };
  const master = { episodes: [{ showTvdb: '111' }, { showTvdb: '222' }] };
  const cache = await buildAllMaps(client, master, { cachePath, log: () => {} });
  assert.equal(cache['111'].type, 'tv');
  assert.equal(cache['222'].type, 'error');
  // cache file was written despite the failure
  const onDisk = JSON.parse(rf(cachePath, 'utf8'));
  assert.equal(onDisk['222'].type, 'error');
  assert.equal(onDisk['111'].type, 'tv');
});
