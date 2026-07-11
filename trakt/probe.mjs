// trakt/probe.mjs — GATE: live date/mapping probe. Sends 1 episode, reads back, asserts correct.
// Does NOT re-send (Trakt has no server-side dedup). After PASS, the user wipes history via the UI, then imports.
import { readFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';

const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
const ep = master.episodes.slice().sort((a, b) => a.season - b.season || a.episode - b.episode)[0];

const client = makeClient({ clientId: requireEnv('TRAKT_CLIENT_ID'), token: loadToken() });
console.log(`\n[probe] Sending tvdb=${ep.showTvdb} "${ep.showTitle}" S${ep.season}E${ep.episode} @ ${ep.watchedAt}`);

const res = await client.postHistory({
  shows: [
    {
      ids: { tvdb: Number(ep.showTvdb) },
      seasons: [
        {
          number: ep.season,
          episodes: [{ number: ep.episode, ...(ep.watchedAt ? { watched_at: ep.watchedAt } : {}) }],
        },
      ],
    },
  ],
});
console.log('  POST added:', JSON.stringify(res?.added ?? {}), 'not_found:', JSON.stringify(res?.not_found ?? {}));

const watched = await client.getWatchedShows();
const show = (watched ?? []).find((s) => String(s.show?.ids?.tvdb) === String(ep.showTvdb));
const found = show?.seasons?.find((se) => se.number === ep.season)?.episodes?.find((e) => e.number === ep.episode);
console.log('  read-back:', JSON.stringify(found ?? null));

let pass = true;
if (!found) {
  console.error('  ✗ episode not found on read-back (check id field path)');
  pass = false;
} else {
  const expected = ep.watchedAt ?? null;
  const got = found.last_watched_at ?? null;
  if (expected && got !== expected) {
    console.error(`  ✗ date mismatch: sent ${expected}, got ${got}`);
    pass = false;
  } else {
    console.log(`  ✓ found at S${ep.season}E${ep.episode}; date ok (${got}); plays=${found.plays}`);
  }
}

if (!pass) {
  console.error('\nPROBE FAILED — do NOT import.');
  process.exitCode = 1;
} else {
  console.log(
    '\nPROBE PASSED. Next: wipe all history via the Trakt UI (Settings → data), THEN run `npm run import:trakt`.',
  );
}
