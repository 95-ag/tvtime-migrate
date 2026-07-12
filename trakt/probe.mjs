// trakt/probe.mjs — GATE: live date/mapping probe. Sends 1 episode, reads back, asserts correct.
// Does NOT re-send (Trakt has no server-side dedup). After PASS, the user wipes history via the UI, then imports.
import { readFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient } from './client.mjs';
import { toTvdbId } from './payload.mjs';

const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
// Probe a representative REGULAR episode (season>=1, dated) — season-0/episode-0 specials
// may not exist on Trakt (they land in not_found at import, which the manifest captures).
const ep = master.episodes
  .filter((e) => e.season >= 1 && e.episode >= 1 && e.watchedAt)
  .sort(
    (a, b) =>
      String(a.showTvdb).localeCompare(String(b.showTvdb), undefined, { numeric: true }) ||
      a.season - b.season ||
      a.episode - b.episode,
  )[0];

const client = makeClient({ clientId: requireEnv('TRAKT_CLIENT_ID'), token: loadToken() });
console.log(`\n[probe] Sending tvdb=${ep.showTvdb} "${ep.showTitle}" S${ep.season}E${ep.episode} @ ${ep.watchedAt}`);

const res = await client.postHistory({
  shows: [
    {
      ids: { tvdb: toTvdbId(ep.showTvdb, `probe show "${ep.showTitle ?? ep.showTvdb}"`) },
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

// Read back from /sync/history/episodes (the only per-episode source; watched/shows has no episodes).
// Trakt truncates watched_at to the minute, so compare at minute precision.
const toMinute = (iso) => (iso ? new Date(iso).toISOString().slice(0, 16) : null);
const history = await client.getHistory('episodes');
const play = (history ?? []).find(
  (h) =>
    String(h.show?.ids?.tvdb) === String(ep.showTvdb) &&
    h.episode?.season === ep.season &&
    h.episode?.number === ep.episode,
);
console.log('  read-back:', play ? JSON.stringify({ watched_at: play.watched_at, tvdb: play.show?.ids?.tvdb }) : null);

let pass = true;
if (!play) {
  console.error('  ✗ episode not found in history read-back');
  pass = false;
} else {
  const want = toMinute(ep.watchedAt);
  const got = toMinute(play.watched_at);
  if (want && got !== want) {
    console.error(`  ✗ date mismatch (minute): sent ${want}, got ${got}`);
    pass = false;
  } else {
    console.log(`  ✓ found in history at S${ep.season}E${ep.episode}; date ok at minute precision (${got})`);
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
