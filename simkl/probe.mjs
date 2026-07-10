// simkl/probe.mjs — GATE: live idempotency/date/anime-mapping probe on REAL episodes. Requires a token.
// Picks InuYasha S1E1 (Simkl classifies as anime → validates use_tvdb_anime_seasons routing) + one regular
// show; sends each, reads it back across the shows+anime+movies libraries, re-sends, and asserts the distinct
// watched_at survives on the correct (tvdb, season, episode). No bulk import until this passes.
import { readFileSync } from 'node:fs';
import { makeClient } from './client.mjs';
import { requireClientId } from './config.mjs';
import { loadToken } from './auth.mjs';

const master = JSON.parse(readFileSync('build/master.json', 'utf8'));

const findEp = (pred) => master.episodes.find(pred);
const animeEp =
  findEp((e) => String(e.showTvdb) === '71361' && e.season === 1 && e.episode === 1) ??
  findEp((e) => String(e.showTvdb) === '71361');
const regularEp = findEp((e) => String(e.showTvdb) !== '71361');
const cases = [
  { label: 'regular', ep: regularEp },
  { label: 'anime (InuYasha)', ep: animeEp },
].filter((c) => c.ep);

function payloadFor(ep) {
  return {
    shows: [
      {
        ids: { tvdb: Number(ep.showTvdb) },
        use_tvdb_anime_seasons: true,
        seasons: [{ number: ep.season, episodes: [{ number: ep.episode, watched_at: ep.watchedAt }] }],
      },
    ],
  };
}

async function readBack(client, ep) {
  // Anime is a separate library from shows — search both for this (tvdb, season, episode).
  for (const lib of ['shows', 'anime']) {
    const res = await client.getAllItems(lib, 'all');
    const show = (res[lib] ?? []).find((s) => String(s.show?.ids?.tvdb) === String(ep.showTvdb));
    const season = show?.seasons?.find((se) => se.number === ep.season);
    const found = season?.episodes?.find((e) => e.number === ep.episode);
    if (found) return { lib, watched_at: found.watched_at };
  }
  return null;
}

const client = makeClient({ clientId: requireClientId(), token: loadToken() });
let failed = false;
for (const { label, ep } of cases) {
  console.log(`\n[${label}] ${ep.showTitle} tvdb=${ep.showTvdb} S${ep.season}E${ep.episode} @ ${ep.watchedAt}`);
  const r1 = await client.postHistory(payloadFor(ep));
  console.log('  added:', JSON.stringify(r1?.added ?? {}), 'not_found:', JSON.stringify(r1?.not_found ?? {}));
  const a = await readBack(client, ep);
  console.log('  read-back #1:', JSON.stringify(a));
  await client.postHistory(payloadFor(ep)); // re-send (idempotency check)
  const b = await readBack(client, ep);
  console.log('  read-back #2 (after re-send):', JSON.stringify(b));

  if (!a) {
    console.error(`  ✗ ${label}: episode not found on read-back (mapping/resolve FAIL)`);
    failed = true;
  } else if (a.watched_at !== ep.watchedAt) {
    console.error(`  ✗ ${label}: date mismatch — sent ${ep.watchedAt}, got ${a.watched_at}`);
    failed = true;
  } else if (!b || b.watched_at !== a.watched_at) {
    console.error(`  ✗ ${label}: re-send changed/duplicated the date (idempotency FAIL)`);
    failed = true;
  } else {
    console.log(`  ✓ ${label}: correct S/E in "${a.lib}" library, date retained, idempotent.`);
  }
}
if (failed) {
  console.error(
    '\nPROBE FAILED — do NOT run `npm run import`. If the anime case failed on S/E, revisit use_tvdb_anime_seasons.',
  );
  process.exitCode = 1;
} else {
  console.log('\nPROBE PASSED — bulk import is cleared.');
}
