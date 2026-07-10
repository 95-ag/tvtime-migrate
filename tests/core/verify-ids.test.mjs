import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkIdIntegrity } from '../../core/verify-ids.mjs';

test('agreeing tvdb ids across lineages pass', () => {
  const r = checkIdIntegrity([{ tvdb: '10', title: 'The Office' }], [{ tvdb: '10', title: 'the  office' }]);
  assert.equal(r.matched, 1);
});

test('a tvdb disagreement on a shared name throws', () => {
  assert.throws(
    () => checkIdIntegrity([{ tvdb: '10', title: 'The Office' }], [{ tvdb: '99', title: 'The Office' }]),
    /mismatch/,
  );
});

test('unjoinable names (language variants) are allowed, not errors', () => {
  const r = checkIdIntegrity([{ tvdb: '10', title: 'The Office' }], [{ tvdb: '20', title: 'Prividenie' }]);
  assert.equal(r.unjoinable, 1);
  assert.equal(r.matched, 0);
});
