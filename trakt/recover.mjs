// trakt/recover.mjs — recover episodes that exist on Trakt under different numbering than TheTVDB.
// Maps our epTvdb -> Trakt (season, number) via each show's episode tvdb ids, then re-imports the
// missing episodes (and their rewatch plays) at Trakt's numbering. Writes build/trakt-episode-map.json
// (consumed by verify.mjs) and a resume-safe state file. Run AFTER the main import + verify.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient, chunkShows } from './client.mjs';

const EPISODE_MAP_FILE = 'build/trakt-episode-map.json';
const STATE_FILE = 'build/trakt-recover-state.json';
const REPORT_FILE = 'build/trakt-recover-report.json';

// Same synthetic-timestamp scheme as payload.mjs's buildRewatchPayload: extra plays reuse the
// episode's real watch DATE at distinct minutes; a 1970 sentinel + counter when no base date exists.
function sameDateStamp(baseIso, i) {
  const d = new Date(baseIso);
  const dayStartMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(dayStartMs + i * 60000).toISOString();
}
function sentinelStamp(i) {
  return new Date(i * 60000).toISOString();
}

function missingEpisodesFromReport(report) {
  return (report?.missingFromReadback ?? []).filter((m) => m.kind === 'episode' && m.reason === 'absent');
}

// Pure: build the epTvdb -> {season, number} map from a set of Trakt seasons (extended=episodes).
export function mapSeasonsToEpisodeMap(seasons) {
  const map = {};
  for (const season of seasons ?? []) {
    for (const ep of season.episodes ?? []) {
      if (ep.ids?.tvdb != null) map[String(ep.ids.tvdb)] = { season: season.number, number: ep.number };
    }
  }
  return map;
}

// Pure: build the recovery payload + rewatch remap + stillMissing list given the resolved episode map.
export function planRecovery(missing, master, episodeMap) {
  const epByIdentity = new Map();
  for (const ep of master.episodes) epByIdentity.set(`${ep.showTvdb}|${ep.season}|${ep.episode}`, ep);

  const byShow = new Map(); // showTvdb -> { ids:{tvdb}, seasons: Map<number, Map<number, watched_at>> }
  const stillMissing = [];
  const recoveredIdentities = new Set(); // `${showTvdb}|${season}|${episode}` — for rewatch remap below

  for (const m of missing) {
    const ep = epByIdentity.get(`${m.tvdb}|${m.season}|${m.episode}`);
    const mapped = ep ? episodeMap.get(String(ep.epTvdb)) : undefined;
    if (!ep || !mapped) {
      stillMissing.push({ tvdb: m.tvdb, season: m.season, episode: m.episode });
      continue;
    }
    let show = byShow.get(m.tvdb);
    if (!show) {
      show = { ids: { tvdb: m.tvdb }, seasons: new Map() };
      byShow.set(m.tvdb, show);
    }
    let seasonMap = show.seasons.get(mapped.season);
    if (!seasonMap) {
      seasonMap = new Map();
      show.seasons.set(mapped.season, seasonMap);
    }
    seasonMap.set(mapped.number, ep.watchedAt ?? undefined);
    recoveredIdentities.add(`${m.tvdb}|${m.season}|${m.episode}`);
  }

  const shows = [...byShow.values()].map((show) => ({
    ids: show.ids,
    seasons: [...show.seasons.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([number, eps]) => ({
        number,
        episodes: [...eps.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([n, watched_at]) => ({ number: n, ...(watched_at ? { watched_at } : {}) })),
      })),
  }));

  // Rewatch: re-send extra plays for any recovered episode, at Trakt's mapped numbering.
  const rewatchShows = [];
  let sentinel = 0;
  for (const r of master.rewatch ?? []) {
    if (!recoveredIdentities.has(`${r.showTvdb}|${r.season}|${r.episode}`)) continue;
    const ep = epByIdentity.get(`${r.showTvdb}|${r.season}|${r.episode}`);
    const mapped = episodeMap.get(String(ep.epTvdb));
    for (let i = 1; i <= r.plays; i++) {
      const watched_at = ep.watchedAt ? sameDateStamp(ep.watchedAt, i) : sentinelStamp(sentinel++);
      rewatchShows.push({
        ids: { tvdb: r.showTvdb },
        seasons: [{ number: mapped.season, episodes: [{ number: mapped.number, watched_at }] }],
      });
    }
  }

  return { shows, rewatchShows, stillMissing };
}

const loadState = () =>
  existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : {
        committedChunks: [],
        added: { shows: 0, movies: 0, episodes: 0 },
        notFound: { shows: [], movies: [], episodes: [] },
      };
const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

if (import.meta.url === `file://${process.argv[1]}`) {
  const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
  const report = JSON.parse(readFileSync('build/trakt-verify-report.json', 'utf8'));
  const missing = missingEpisodesFromReport(report);
  const missingByShow = new Map();
  for (const m of missing) {
    const list = missingByShow.get(m.tvdb) ?? [];
    list.push(m);
    missingByShow.set(m.tvdb, list);
  }

  const client = makeClient({ clientId: requireEnv('TRAKT_CLIENT_ID'), token: loadToken() });

  const episodeMapObj = {};
  const notOnTrakt = [];
  for (const tvdb of missingByShow.keys()) {
    const results = await client.get(`/search/tvdb/${tvdb}?type=show`);
    const traktId = results?.[0]?.show?.ids?.trakt;
    if (!traktId) {
      notOnTrakt.push(tvdb);
      continue;
    }
    const seasons = await client.get(`/shows/${traktId}/seasons?extended=episodes`);
    Object.assign(episodeMapObj, mapSeasonsToEpisodeMap(seasons));
  }
  writeFileSync(EPISODE_MAP_FILE, JSON.stringify(episodeMapObj, null, 2));

  const episodeMap = new Map(Object.entries(episodeMapObj));
  const { shows, rewatchShows, stillMissing } = planRecovery(missing, master, episodeMap);

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

  const epChunks = chunkShows(shows);
  for (let i = 0; i < epChunks.length; i++)
    await send(`recover-ep-${i}`, () => client.postHistory({ shows: epChunks[i] }));
  const rwChunks = chunkShows(rewatchShows);
  for (let i = 0; i < rwChunks.length; i++)
    await send(`recover-rw-${i}`, () => client.postHistory({ shows: rwChunks[i] }));

  const recoveredEpisodes = shows.reduce(
    (n, s) => n + s.seasons.reduce((m, season) => m + season.episodes.length, 0),
    0,
  );
  writeFileSync(
    REPORT_FILE,
    JSON.stringify({ recoveredEpisodes, stillMissing, notOnTrakt, mapSize: episodeMap.size }, null, 2),
  );
  console.log(
    `Recovery: shows processed=${missingByShow.size}, mapSize=${episodeMap.size}, recoveredEpisodes=${recoveredEpisodes}, stillMissing=${stillMissing.length}, notOnTrakt=${notOnTrakt.length}, rewatchPlaysSent=${rewatchShows.length}.`,
  );
}
