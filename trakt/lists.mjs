// trakt/lists.mjs — build custom lists from master.lists (+ master.episodes for a watch-order split),
// driven by an account-specific "list plan" (see trakt/dry-run.mjs) so this module stays data-independent.
import { toTvdbId } from './payload.mjs';

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

// Splits `list` by each show's watch order (date = latest watched episode): the earliest `cap` watched
// shows go to `oldName`, the rest (plus undated shows and all movies) go to `newName`.
export function splitByWatchOrder(list, episodes, { cap, oldName, newName }) {
  const lastWatch = lastWatchByShow(episodes);
  const dated = [];
  const undated = [];
  for (const s of list.shows) {
    const d = lastWatch.get(String(s.tvdb));
    if (d) dated.push({ ...s, date: d });
    else undated.push(s);
  }
  dated.sort((a, b) => a.date.localeCompare(b.date)); // ascending: earliest watched first
  const oldShows = dated.slice(0, cap);
  const newShows = dated.slice(cap);
  const toIds = (arr) => arr.map((s) => ({ ids: { tvdb: toTvdbId(s.tvdb, `${list.name} show tvdb=${s.tvdb}`) } }));
  const movies = (list.movies ?? []).filter((m) => m.imdb).map((m) => ({ ids: { imdb: m.imdb } }));
  return {
    old: { name: oldName, shows: toIds(oldShows), movies: [] },
    neu: { name: newName, shows: [...toIds(newShows), ...toIds(undated)], movies },
    unresolvedMovies: (list.movies ?? []).filter((m) => !m.imdb).map((m) => ({ list: list.name, ...m })),
  };
}

// Builds the account's chosen custom lists per `plan` ({keep:[names], split:{source,cap,oldName,newName}}).
// Every master list not named in `plan.keep`/`plan.split.source` is reported as skipped.
export function buildContentLists(master, plan = {}) {
  const keep = new Set(plan.keep ?? []);
  const lists = [];
  const skipped = [];
  const unresolvedMovies = [];

  for (const l of master.lists) {
    if (plan.split && l.name === plan.split.source) {
      const { old, neu, unresolvedMovies: um } = splitByWatchOrder(l, master.episodes, plan.split);
      lists.push(old, neu);
      unresolvedMovies.push(...um);
    } else if (keep.has(l.name)) {
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
