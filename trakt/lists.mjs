// trakt/lists.mjs — build the 5 chosen custom lists from master.lists (+ master.episodes for the split).
import { toTvdbId } from './payload.mjs';

const KEEP_PLAIN = new Set(['C-Drama', 'C-drama minis']);
const KDRAMA_OLD_CAP = 250;

export async function findOrCreateList(client, name) {
  const lists = await client.getUserLists();
  const existing = (lists ?? []).find((l) => l.name === name);
  if (existing) return existing.ids.slug;
  const created = await client.createList({ name, description: '', privacy: 'private', allow_comments: false });
  return created.ids.slug;
}

export function buildDroppedShows(droppedShows) {
  return { shows: droppedShows.map((s) => ({ ids: { tvdb: toTvdbId(s.tvdb, `dropped show tvdb=${s.tvdb}`) } })) };
}

function lastWatchByShow(episodes) {
  const m = new Map();
  for (const e of episodes) {
    if (!e.watchedAt) continue;
    const t = String(e.showTvdb);
    const prev = m.get(t);
    if (!prev || e.watchedAt > prev) m.set(t, e.watchedAt);
  }
  return m;
}

export function splitKdrama(kdList, episodes, cap = KDRAMA_OLD_CAP) {
  const lastWatch = lastWatchByShow(episodes);
  const dated = [];
  const undated = [];
  for (const s of kdList.shows) {
    const d = lastWatch.get(String(s.tvdb));
    if (d) dated.push({ ...s, date: d });
    else undated.push(s);
  }
  dated.sort((a, b) => a.date.localeCompare(b.date)); // ascending: earliest watched first
  const oldShows = dated.slice(0, cap);
  const newShows = dated.slice(cap);
  const toIds = (arr) => arr.map((s) => ({ ids: { tvdb: toTvdbId(s.tvdb, `K-drama show tvdb=${s.tvdb}`) } }));
  const movies = (kdList.movies ?? []).filter((m) => m.imdb).map((m) => ({ ids: { imdb: m.imdb } }));
  return {
    old: { name: 'K-drama Old', shows: toIds(oldShows), movies: [] },
    neu: { name: 'K-drama New', shows: [...toIds(newShows), ...toIds(undated)], movies },
    unresolvedMovies: (kdList.movies ?? []).filter((m) => !m.imdb).map((m) => ({ list: 'K-drama', ...m })),
  };
}

export function buildContentLists(master) {
  const lists = [];
  const skipped = [];
  const unresolvedMovies = [];
  const kdList = master.lists.find((l) => l.name === 'K-drama');

  if (kdList) {
    const { old, neu, unresolvedMovies: um } = splitKdrama(kdList, master.episodes, KDRAMA_OLD_CAP);
    lists.push(old, neu);
    unresolvedMovies.push(...um);
  }

  for (const l of master.lists) {
    if (l.name === 'K-drama') continue;
    if (KEEP_PLAIN.has(l.name)) {
      lists.push({
        name: l.name,
        shows: l.shows.map((s) => ({ ids: { tvdb: toTvdbId(s.tvdb, `${l.name} show tvdb=${s.tvdb}`) } })),
        movies: (l.movies ?? []).filter((m) => m.imdb).map((m) => ({ ids: { imdb: m.imdb } })),
      });
      unresolvedMovies.push(...(l.movies ?? []).filter((m) => !m.imdb).map((m) => ({ list: l.name, ...m })));
    } else {
      skipped.push({ name: l.name, shows: l.shows.length, movies: (l.movies ?? []).length });
    }
  }

  return { lists, skipped, unresolvedMovies };
}
