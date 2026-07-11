// trakt/import.mjs — resume-safe paced Trakt import. Requires token + passing probe + a UI-wiped account.
// Trakt has NO server-side dedup; chunk-label tracking prevents double-sends on resume.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient, chunkShows } from './client.mjs';
import { assemble } from './dry-run.mjs';
import { buildManifest } from './manifest.mjs';
import { findOrCreateList } from './lists.mjs';

const STATE = 'build/trakt-import-state.json';
const loadState = () =>
  existsSync(STATE)
    ? JSON.parse(readFileSync(STATE, 'utf8'))
    : {
        committedChunks: [],
        added: { shows: 0, movies: 0, episodes: 0 },
        notFound: { shows: [], movies: [], episodes: [] },
      };
const saveState = (s) => writeFileSync(STATE, JSON.stringify(s, null, 2));

const payload = existsSync('build/trakt-payload.json')
  ? JSON.parse(readFileSync('build/trakt-payload.json', 'utf8'))
  : assemble();
const client = makeClient({ clientId: requireEnv('TRAKT_CLIENT_ID'), token: loadToken() });
const state = loadState();
const { committedChunks, added, notFound } = state;

async function send(label, fn) {
  if (committedChunks.includes(label)) {
    console.log(`skip ${label} (committed)`);
    return;
  }
  const res = await fn();
  for (const k of ['shows', 'movies', 'episodes']) {
    added[k] += res?.added?.[k] ?? 0;
    for (const it of res?.not_found?.[k] ?? []) notFound[k].push(it);
  }
  committedChunks.push(label);
  saveState(state);
  console.log(`${label}: added ${JSON.stringify(res?.added ?? {})}`);
}

// 1. Episodes
const showChunks = chunkShows(payload.history.shows);
for (let i = 0; i < showChunks.length; i++)
  await send(`episodes-${i}`, () => client.postHistory({ shows: showChunks[i] }));
// 2. Movies
await send('movies', () => client.postHistory({ movies: payload.history.movies }));
// 3. Rewatch
const rw = chunkShows(payload.rewatch.shows);
for (let i = 0; i < rw.length; i++) await send(`rewatch-${i}`, () => client.postHistory({ shows: rw[i] }));
// 4. Watchlist
await send('ptw-shows', () => client.postWatchlist({ shows: payload.watchlist.shows }));
await send('ptw-movies', () => client.postWatchlist({ movies: payload.watchlist.movies }));
// 5. Favorites
await send('favorites', () => client.postFavorites(payload.favorites));
// 6. Custom lists (content + dropped)
const allLists = [...payload.contentLists, payload.droppedList];
for (const list of allLists) {
  await send(`list:${list.name}`, async () => {
    const slug = await findOrCreateList(client, list.name);
    const body = { shows: list.shows, ...(list.movies?.length ? { movies: list.movies } : {}) };
    const res = await client.addToList(slug, body);
    console.log(`  "${list.name}" (${slug}): ${list.shows.length} shows, ${list.movies?.length ?? 0} movies`);
    return res;
  });
}

const manifest = buildManifest({
  notFound,
  missingFromReadback: [],
  unbridgedRewatch: payload.rewatchDropped ?? [],
  skippedLists: payload.skippedLists ?? [],
  unresolvedListMovies: payload.unresolvedListMovies ?? [],
  skippedMovies: payload.skippedMovies ?? [],
});
writeFileSync('build/trakt-manifest.json', JSON.stringify(manifest, null, 2));
console.log(`\nImport complete. added=${JSON.stringify(added)}; manifest items=${manifest.count}.`);
console.log('Run `npm run verify:trakt` to reconcile.');
