// trakt/resolve-shows.mjs — resolve shows whose TheTVDB id is stale on Trakt (a different Trakt id
// holds the same show) by title+year search, then re-import their episodes at the resolved id.
// Mirrors recover.mjs's structure but for "wrong id" rather than "renumbered episode" gaps.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { requireEnv } from './config.mjs';
import { loadToken } from './auth.mjs';
import { makeClient, chunkShows } from './client.mjs';
import { findOrCreateList } from './lists.mjs';

const RESOLUTION_FILE = 'build/trakt-show-resolution.json';
const SHOW_MAP_FILE = 'build/trakt-show-map.json';
const STATE_FILE = 'build/trakt-resolve-state.json';
const REPORT_FILE = 'build/trakt-resolve-report.json';

export function normalizeTitle(s) {
  return String(s || '')
    .replace(/\s*\(\d{4}\)\s*$/, '') // strip trailing (YYYY)
    .replace(/[‘’ʼ]/g, "'") // curly/modifier apostrophes -> straight
    .replace(/[“”]/g, '"') // curly quotes -> straight
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export function yearFromTitle(s) {
  const m = String(s || '').match(/\((\d{4})\)\s*$/);
  return m ? Number(m[1]) : null;
}

// candidates: [{title, year, ids:{trakt}}]. Return the ONE confident match or null.
export function pickMatch(ourTitle, candidates) {
  const nt = normalizeTitle(ourTitle);
  const ourYear = yearFromTitle(ourTitle);
  const exact = (candidates ?? []).filter((c) => normalizeTitle(c.title) === nt);
  if (ourYear != null) {
    const byYear = exact.filter((c) => c.year != null && Math.abs(c.year - ourYear) <= 1);
    return byYear.length === 1 ? byYear[0] : null; // ambiguous if >1
  }
  return exact.length === 1 ? exact[0] : null; // no year: only accept a unique exact-title match
}

function sameDateStamp(baseIso, i) {
  const d = new Date(baseIso);
  const dayStartMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(dayStartMs + i * 60000).toISOString();
}
function sentinelStamp(i) {
  return new Date(i * 60000).toISOString();
}

function missingByShow(report) {
  const byShow = new Map();
  for (const m of report?.missingFromReadback ?? []) {
    if (m.kind !== 'episode' || m.reason !== 'absent') continue;
    const list = byShow.get(m.tvdb) ?? [];
    list.push(m);
    byShow.set(m.tvdb, list);
  }
  return byShow;
}

const loadState = () =>
  existsSync(STATE_FILE)
    ? JSON.parse(readFileSync(STATE_FILE, 'utf8'))
    : { committedChunks: [], added: { shows: 0, movies: 0, episodes: 0 } };
const saveState = (s) => writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));

if (import.meta.url === `file://${process.argv[1]}`) {
  const commit = process.argv.includes('--commit');
  const master = JSON.parse(readFileSync('build/master.json', 'utf8'));
  const report = JSON.parse(readFileSync('build/trakt-verify-report.json', 'utf8'));
  const showsByTvdb = new Map(master.shows.map((s) => [String(s.tvdb), s]));
  const grouped = missingByShow(report);

  const client = makeClient({ clientId: requireEnv('TRAKT_CLIENT_ID'), token: loadToken() });

  const resolved = [];
  const unresolved = [];
  for (const [tvdb, missing] of grouped.entries()) {
    const byTvdb = await client.get(`/search/tvdb/${tvdb}?type=show`);
    if (byTvdb?.[0]?.show?.ids?.trakt) continue; // resolves fine — a partial-gap show, not stale-tvdb

    const show = showsByTvdb.get(String(tvdb));
    const ourTitle = show?.title ?? String(tvdb);
    const candidates = await client.get(`/search/show?query=${encodeURIComponent(normalizeTitle(ourTitle))}&limit=5`);
    const match = pickMatch(
      ourTitle,
      (candidates ?? []).map((c) => c.show),
    );

    if (match) {
      resolved.push({
        ourTvdb: Number(tvdb),
        ourTitle,
        traktId: match.ids.trakt,
        traktTitle: match.title,
        traktYear: match.year,
        episodes: missing.length,
      });
    } else {
      unresolved.push({ ourTvdb: Number(tvdb), ourTitle, missing: missing.length });
    }
  }

  writeFileSync(RESOLUTION_FILE, JSON.stringify({ resolved, unresolved }, null, 2));

  for (const r of resolved) {
    console.log(`RESOLVE  ${r.episodes}ep  "${r.ourTitle}"  ->  ${r.traktTitle} (${r.traktYear}) trakt=${r.traktId}`);
  }
  for (const u of unresolved) {
    console.log(`none  ${u.missing}ep  "${u.ourTitle}"`);
  }
  const resolvedEpisodes = resolved.reduce((n, r) => n + r.episodes, 0);
  const unresolvedEpisodes = unresolved.reduce((n, u) => n + u.missing, 0);
  console.log(
    `\nTotals: resolved shows=${resolved.length} (${resolvedEpisodes} episodes), unresolved shows=${unresolved.length} (${unresolvedEpisodes} episodes).`,
  );

  if (!commit) {
    console.log('\nDRY RUN — re-run with --commit to import the resolved shows.');
  } else {
    const epByIdentity = new Map();
    for (const ep of master.episodes) epByIdentity.set(`${ep.showTvdb}|${ep.season}|${ep.episode}`, ep);

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

    const showIdMap = {};
    for (const r of resolved) {
      const showEpisodes = master.episodes.filter((e) => String(e.showTvdb) === String(r.ourTvdb));
      const seasons = new Map();
      for (const ep of showEpisodes) {
        const list = seasons.get(ep.season) ?? seasons.set(ep.season, []).get(ep.season);
        list.push(ep);
      }
      const episodesShow = {
        ids: { trakt: r.traktId },
        seasons: [...seasons.entries()]
          .sort((a, b) => a[0] - b[0])
          .map(([number, eps]) => ({
            number,
            episodes: eps
              .sort((a, b) => a.episode - b.episode)
              .map((e) => ({ number: e.episode, ...(e.watchedAt ? { watched_at: e.watchedAt } : {}) })),
          })),
      };
      const epChunks = chunkShows([episodesShow]);
      for (let i = 0; i < epChunks.length; i++)
        await send(`resolve-ep-${r.ourTvdb}-${i}`, () => client.postHistory({ shows: epChunks[i] }));

      const rewatchShows = [];
      let sentinel = 0;
      for (const rw of master.rewatch ?? []) {
        if (String(rw.showTvdb) !== String(r.ourTvdb)) continue;
        const ep = epByIdentity.get(`${rw.showTvdb}|${rw.season}|${rw.episode}`);
        for (let i = 1; i <= rw.plays; i++) {
          const watched_at = ep?.watchedAt ? sameDateStamp(ep.watchedAt, i) : sentinelStamp(sentinel++);
          rewatchShows.push({
            ids: { trakt: r.traktId },
            seasons: [{ number: rw.season, episodes: [{ number: rw.episode, watched_at }] }],
          });
        }
      }
      const rwChunks = chunkShows(rewatchShows);
      for (let i = 0; i < rwChunks.length; i++)
        await send(`resolve-rw-${r.ourTvdb}-${i}`, () => client.postHistory({ shows: rwChunks[i] }));

      const memberLists = (master.lists ?? []).filter((l) =>
        (l.shows ?? []).some((s) => String(s.tvdb) === String(r.ourTvdb)),
      );
      for (const l of memberLists) {
        const label = `resolve-list-${r.ourTvdb}-${l.name}`;
        if (committedChunks.includes(label)) {
          console.log(`skip ${label} (committed)`);
          continue;
        }
        const slug = await findOrCreateList(client, l.name);
        await client.addToList(slug, { shows: [{ ids: { trakt: r.traktId } }] });
        committedChunks.push(label);
        saveState(state);
        console.log(`${label}: added`);
      }

      showIdMap[String(r.ourTvdb)] = r.traktId;
    }

    writeFileSync(SHOW_MAP_FILE, JSON.stringify(showIdMap, null, 2));
    writeFileSync(
      REPORT_FILE,
      JSON.stringify({ resolvedShows: resolved.length, resolvedEpisodes, added, showIdMap }, null, 2),
    );
    console.log(`\nCommitted. Resolved ${resolved.length} shows, ${resolvedEpisodes} episodes re-imported.`);
  }
}
