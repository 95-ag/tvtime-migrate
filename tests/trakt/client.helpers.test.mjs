import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chunkShows, backoffMs } from '../../trakt/client.mjs';

describe('chunkShows', () => {
  it('splits at size boundary', () => {
    const c = chunkShows(
      Array.from({ length: 7 }, (_, i) => i),
      3,
    );
    assert.equal(c.length, 3);
    assert.deepEqual(c[2], [6]);
  });
  it('single chunk when size >= length', () => {
    assert.equal(chunkShows([1, 2], 50).length, 1);
  });
});

describe('backoffMs', () => {
  it('doubles', () => {
    assert.ok(backoffMs(1, () => 0) >= backoffMs(0, () => 0) * 2 - 1);
  });
  it('caps', () => {
    assert.ok(backoffMs(20, () => 0) <= 17000);
  });
});
