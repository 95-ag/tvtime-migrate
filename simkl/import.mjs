// simkl/import.mjs — paced, chunked /sync/history commit. Requires a token + a passing probe (GATE).
// Idempotent: Simkl dedups by (item + watched_at), so a re-run / resume re-sends safely (added:0 on dups).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { loadToken } from './auth.mjs';
import { chunkShows, makeClient } from './client.mjs';
import { config, requireClientId } from './config.mjs';
import { assemble } from './dry-run.mjs';
import { buildManifest } from './manifest.mjs';

const STATE = 'build/simkl-import-state.json';
const loadState = () =>
  existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, 'utf8'))
    : {
        committedChunks: [],
        added: { shows: 0, movies: 0, episodes: 0 },
        notFound: { shows: [], movies: [], episodes: [] },
      };
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));

const payload = existsSync('build/simkl-payload.json')
  ? JSON.parse(readFileSync('build/simkl-payload.json', 'utf8'))
  : assemble();

const client = makeClient({ clientId: requireClientId(), token: loadToken() });
const state = loadState();
state.committedChunks ??= [];
const added = state.added ?? { shows: 0, movies: 0, episodes: 0 };
const notFound = state.notFound ?? { shows: [], movies: [], episodes: [] };

async function send(label, body) {
  if (state.committedChunks.includes(label)) {
    console.log(`skip ${label} (already committed)`);
    return;
  }
  const res = await client.postHistory(body);
  for (const k of ['shows', 'movies', 'episodes']) {
    added[k] += res?.added?.[k] ?? 0;
    for (const it of res?.not_found?.[k] ?? []) notFound[k].push(it);
  }
  state.committedChunks.push(label);
  state.added = added;
  state.notFound = notFound;
  saveState(state);
  console.log(`${label}: added ${JSON.stringify(res?.added ?? {})}`);
}

const showChunks = chunkShows(payload.history.shows, config.maxShowsPerChunk);
for (let i = 0; i < showChunks.length; i++) await send(`shows-${i}`, { shows: showChunks[i] });
await send('movies', { movies: payload.history.movies });
await send('ptw-shows', { shows: payload.planToWatch.shows });
await send('ptw-movies', { movies: payload.planToWatch.movies });

const manifest = buildManifest({ notFound, missingFromReadback: [] });
writeFileSync('build/simkl-import-report.json', JSON.stringify({ added, notFound }, null, 2));
writeFileSync('build/simkl-manifest.json', JSON.stringify(manifest, null, 2));
console.log(
  `\nImport complete. added=${JSON.stringify(added)}; not_found=${manifest.count}. Manifest: build/simkl-manifest.json`,
);
console.log('Run `npm run verify` to reconcile against the master.');
