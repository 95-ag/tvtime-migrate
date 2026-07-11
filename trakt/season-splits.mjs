// trakt/season-splits.mjs — season-split recovery: a show's LATER season is a SEPARATE Trakt show
// (e.g. our "Tale of the Nine Tailed" tvdb 386917 Season 2 = Trakt "Tale of the Nine Tailed 1938").
// Reads build/trakt-season-splits.json = [{ourTvdb, ourSeason, traktId, note?}]. For each entry,
// imports our episodes matching (showTvdb===ourTvdb, season===ourSeason) under the target Trakt show
// at Season 1 (our episode numbers kept), plus their rewatch plays, plus adds the show to any master
// list the ourTvdb belongs to. Dry-run by default; --commit writes. Resume-safe via a chunk-label
// state file. Writes build/trakt-season-split-map.json (consumed by verify.mjs).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient, chunkShows } from './client.mjs';
import { sameDateStamp, sentinelStamp } from './payload.mjs';

const SPLITS_FILE = 'build/trakt-season-splits.json';
const MAP_FILE = 'build/trakt-season-split-map.json';
const STATE_FILE = 'build/trakt-season-split-state.json';
const REPORT_FILE = 'build/trakt-season-split-report.json';

// Pure: build the {ids:{trakt}, seasons:[{number:1, episodes}]} history payload for one split entry,
// mapping our season -> Trakt Season 1 and keeping our episode numbers.
export function buildSplitEpisodesPayload(split, episodes) {
  const matching = episodes
    .filter((e) => String(e.showTvdb) === String(split.ourTvdb) && e.season === split.ourSeason)
    .sort((a, b) => a.episode - b.episode);
  return {
    ids: { trakt: split.traktId },
    seasons: [
      {
        number: 1,
        episodes: matching.map((e) => ({
          number: e.episode,
          ...(e.watchedAt ? { watched_at: e.watchedAt } : {}),
        })),
      },
    ],
  };
}

// Pure: build rewatch history entries (Trakt Season 1, our episode numbers) for a split entry.
export function buildSplitRewatchPayload(split, rewatchRows, episodes) {
  const epByEpisode = new Map();
  for (const e of episodes) {
    if (String(e.showTvdb) === String(split.ourTvdb) && e.season === split.ourSeason) {
      epByEpisode.set(e.episode, e);
    }
  }
  const shows = [];
  let sentinel = 0;
  for (const r of rewatchRows) {
    if (String(r.showTvdb) !== String(split.ourTvdb) || r.season !== split.ourSeason) continue;
    const ep = epByEpisode.get(r.episode);
    for (let i = 1; i <= r.plays; i++) {
      const watched_at = ep?.watchedAt ? sameDateStamp(ep.watchedAt, i) : sentinelStamp(sentinel++);
      shows.push({
        ids: { trakt: split.traktId },
        seasons: [{ number: 1, episodes: [{ number: r.episode, watched_at }] }],
      });
    }
  }
  return { shows };
}

// Pure: which master lists the split's ourTvdb belongs to.
export function listsForSplit(split, lists) {
  return (lists ?? []).filter((l) => (l.shows ?? []).some((s) => String(s.tvdb) === String(split.ourTvdb)));
}

// Pure: build the "<ourTvdb>|<ourSeason>" -> traktId map consumed by verify.mjs.
export function buildSplitMap(splits) {
  const map = {};
  for (const split of splits) map[`${split.ourTvdb}|${split.ourSeason}`] = split.traktId;
  return map;
}

const loadState = () =>
  existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : { committedChunks: [], added: { shows: 0, movies: 0, episodes: 0 } };
const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

if (import.meta.url === `file://${process.argv[1]}`) {
  const commit = process.argv.includes('--commit');
  if (!existsSync(SPLITS_FILE)) {
    console.log(`No ${SPLITS_FILE} — nothing to do.`);
  } else {
    const splits = JSON.parse(readFileSync(SPLITS_FILE, 'utf8'));
    const master = JSON.parse(readFileSync('build/master.json', 'utf8'));

    let totalEpisodes = 0;
    let totalRewatch = 0;
    for (const split of splits) {
      const showPayload = buildSplitEpisodesPayload(split, master.episodes);
      const rewatchPayload = buildSplitRewatchPayload(split, master.rewatch ?? [], master.episodes);
      const memberLists = listsForSplit(split, master.lists ?? []);
      totalEpisodes += showPayload.seasons[0].episodes.length;
      totalRewatch += rewatchPayload.shows.length;
      console.log(
        `${split.note ?? ''} our tvdb=${split.ourTvdb} S${split.ourSeason} -> trakt=${split.traktId}: ` +
          `${showPayload.seasons[0].episodes.length} episodes, ${rewatchPayload.shows.length} rewatch plays, ${memberLists.length} list(s).`,
      );
    }

    if (!commit) {
      console.log(
        `\nDRY RUN — ${splits.length} split(s), ${totalEpisodes} episodes, ${totalRewatch} rewatch plays. Re-run with --commit to import.`,
      );
    } else {
      const client = makeClient({ clientId: requireEnv('TRAKT_CLIENT_ID'), token: loadToken() });
      const state = loadState();
      const { committedChunks, added } = state;
      async function send(label, fn) {
        if (committedChunks.includes(label)) {
          console.log(`skip ${label} (committed)`);
          return;
        }
        const res = await fn();
        for (const k of ['shows', 'movies', 'episodes']) added[k] += res?.added?.[k] ?? 0;
        committedChunks.push(label);
        saveState(state);
        console.log(`${label}: added ${JSON.stringify(res?.added ?? {})}`);
      }

      for (const split of splits) {
        const showPayload = buildSplitEpisodesPayload(split, master.episodes);
        const epChunks = chunkShows([showPayload]);
        for (let i = 0; i < epChunks.length; i++)
          await send(`split-ep-${split.ourTvdb}-${split.ourSeason}-${i}`, () =>
            client.postHistory({ shows: epChunks[i] }),
          );

        const rewatchPayload = buildSplitRewatchPayload(split, master.rewatch ?? [], master.episodes);
        const rwChunks = chunkShows(rewatchPayload.shows);
        for (let i = 0; i < rwChunks.length; i++)
          await send(`split-rw-${split.ourTvdb}-${split.ourSeason}-${i}`, () =>
            client.postHistory({ shows: rwChunks[i] }),
          );

        // Only add to lists that ALREADY exist on the account — never create a new one (the free-tier
        // 5-list cap is full, and the master "K-drama" list was split into "K-drama Old/New" at import,
        // so a create attempt just 420s). Shows whose master list has no live equivalent are skipped.
        const existing = new Map((await client.getUserLists())?.map((l) => [l.name, l.ids.slug]) ?? []);
        const memberLists = listsForSplit(split, master.lists ?? []);
        for (const l of memberLists) {
          const label = `split-list-${split.ourTvdb}-${split.ourSeason}-${l.name}`;
          if (committedChunks.includes(label)) {
            console.log(`skip ${label} (committed)`);
            continue;
          }
          const slug = existing.get(l.name);
          if (!slug) {
            console.log(`skip ${label} (list "${l.name}" not on account — no create at cap)`);
            committedChunks.push(label);
            saveState(state);
            continue;
          }
          await client.addToList(slug, { shows: [{ ids: { trakt: split.traktId } }] });
          committedChunks.push(label);
          saveState(state);
          console.log(`${label}: added`);
        }
      }

      writeFileSync(MAP_FILE, JSON.stringify(buildSplitMap(splits), null, 2));
      writeFileSync(
        REPORT_FILE,
        JSON.stringify({ splits: splits.length, totalEpisodes, totalRewatch, added }, null, 2),
      );
      console.log(`\nCommitted. ${splits.length} split(s), ${totalEpisodes} episodes, ${totalRewatch} rewatch plays.`);
    }
  }
}
