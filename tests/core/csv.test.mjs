import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCsvObjects } from '../../core/csv.mjs';

test('keeps commas inside quoted titles', () => {
  const csv = 'title,season\n"Love, Death & Robots",1\n';
  const rows = parseCsvObjects(csv);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, 'Love, Death & Robots');
  assert.equal(rows[0].season, '1');
});

test('handles escaped double-quotes and quoted newlines', () => {
  const csv = 'title,note\n"He said ""hi""","line1\nline2"\n';
  const rows = parseCsvObjects(csv);
  assert.equal(rows[0].title, 'He said "hi"');
  assert.equal(rows[0].note, 'line1\nline2');
});

test('missing trailing cells become empty strings, not undefined', () => {
  const rows = parseCsvObjects('a,b,c\n1,2\n');
  assert.equal(rows[0].c, '');
});
