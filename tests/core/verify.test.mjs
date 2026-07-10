import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMaster } from '../../core/build.mjs';
import { checkPiiFree, checkRowShapes, checkCounts } from '../../core/verify.mjs';

const master = buildMaster();

test('build is deterministic — two builds are byte-identical', () => {
  assert.equal(JSON.stringify(buildMaster()), JSON.stringify(master));
});

test('every episode row has a tvdb show id and a well-formed date or is flagged', () => {
  checkRowShapes(master); // throws on the first malformed row
});

test('master carries no PII field names or email-shaped values', () => {
  checkPiiFree(master);
});

test('counts reconcile to the analysis anchors', () => {
  checkCounts(master); // throws if outside expected bounds
});

test('landmark: Wizards of Waverly Place is present with its full episode span', () => {
  const wizards = master.episodes.filter((e) => /wizards of waverly place/i.test(e.showTitle));
  assert.ok(wizards.length >= 100, `expected >=100 Wizards episodes, got ${wizards.length}`);
});

test('landmark: every dropped show is status=stopped and absent from plan-to-watch', () => {
  const ptw = new Set(master.planToWatch.shows.map((s) => s.tvdb));
  for (const d of master.droppedShows) assert.equal(ptw.has(d.tvdb), false);
});
