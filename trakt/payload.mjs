// trakt/payload.mjs — master → Trakt payload builders. Pure; no network, no secrets.

export function toTvdbId(value, label) {
  const n = Number(value);
  if (value == null || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Refusing to build Trakt payload: ${label} has an invalid tvdb id (${JSON.stringify(value)}).`);
  }
  return n;
}

export function requireImdb(value, label) {
  if (!value || typeof value !== 'string') {
    throw new Error(
      `Refusing to build Trakt payload: ${label} has a missing/null imdb id — Trakt does not accept tvdb for movies.`,
    );
  }
  return value;
}

export function buildHistoryPayload(master) {
  const groups = new Map();
  for (const ep of master.episodes) {
    const key = String(ep.showTvdb);
    let g = groups.get(key);
    if (!g) g = groups.set(key, { tvdb: ep.showTvdb, title: ep.showTitle, seasons: new Map() }).get(key);
    const list = g.seasons.get(ep.season) ?? g.seasons.set(ep.season, []).get(ep.season);
    list.push(ep);
  }

  const shows = [];
  for (const g of groups.values()) {
    shows.push({
      ids: { tvdb: toTvdbId(g.tvdb, `show "${g.title ?? g.tvdb}"`) },
      ...(g.title ? { title: g.title } : {}),
      seasons: [...g.seasons.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([number, eps]) => ({
          number,
          episodes: eps
            .sort((a, b) => a.episode - b.episode)
            .map((e) => ({ number: e.episode, ...(e.watchedAt ? { watched_at: e.watchedAt } : {}) })),
        })),
    });
  }

  const movies = [];
  const skippedMovies = [];
  for (const mv of master.movies) {
    if (!mv.watched) continue;
    const dated = mv.watchedAt ? { watched_at: mv.watchedAt } : {};
    if (mv.imdb) {
      movies.push({
        ids: { imdb: mv.imdb },
        ...(mv.title ? { title: mv.title } : {}),
        ...(mv.year ? { year: Number(mv.year) } : {}),
        ...dated,
      });
    } else if (mv.title && mv.year) {
      // Trakt matches a movie by title+year when no id is available (imdb missing)
      movies.push({ title: mv.title, year: Number(mv.year), ...dated });
    } else {
      skippedMovies.push({
        kind: 'movie',
        tvdb: mv.tvdb ?? null,
        title: mv.title ?? null,
        reason: 'no_imdb_or_title_year',
      });
    }
  }

  return { shows, movies, skippedMovies };
}

// Trakt dedups identical (episode, minute) plays and truncates to the minute. Master has a rewatch
// COUNT per episode but no rewatch dates, so extra plays reuse the episode's real watch DATE at
// distinct times (i minutes past midnight of that date). Only the count is real; the intra-day times
// are synthetic. If an episode has no base date, fall back to a 1970 sentinel date + counter.
function sameDateStamp(baseIso, i) {
  const d = new Date(baseIso);
  const dayStartMs = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return new Date(dayStartMs + i * 60000).toISOString(); // i minutes past midnight of the watch date
}
function sentinelStamp(i) {
  return new Date(i * 60000).toISOString(); // 1970-01-01T00:0i — obviously synthetic, distinct
}

export function buildRewatchPayload(rewatchRows, episodes = []) {
  const baseByEp = new Map();
  for (const e of episodes) {
    if (e.watchedAt) baseByEp.set(`${e.showTvdb}|${e.season}|${e.episode}`, e.watchedAt);
  }
  let sentinel = 0;
  const shows = [];
  for (const r of rewatchRows) {
    const tvdb = toTvdbId(r.showTvdb, `rewatch show tvdb=${r.showTvdb}`);
    const base = baseByEp.get(`${r.showTvdb}|${r.season}|${r.episode}`);
    for (let i = 1; i <= r.plays; i++) {
      const watched_at = base ? sameDateStamp(base, i) : sentinelStamp(sentinel++);
      shows.push({ ids: { tvdb }, seasons: [{ number: r.season, episodes: [{ number: r.episode, watched_at }] }] });
    }
  }
  return { shows };
}

export function buildWatchlistPayload(master) {
  const withEpisodes = new Set(master.episodes.map((e) => String(e.showTvdb)));
  const shows = (master.planToWatch?.shows ?? [])
    .filter((s) => !withEpisodes.has(String(s.tvdb)))
    .map((s) => ({
      ids: { tvdb: toTvdbId(s.tvdb, `ptw show "${s.title ?? s.tvdb}"`) },
      ...(s.title ? { title: s.title } : {}),
    }));
  const movies = [];
  const skippedMovies = [];
  for (const mv of master.planToWatch?.movies ?? []) {
    if (mv.imdb) {
      movies.push({
        ids: { imdb: mv.imdb },
        ...(mv.title ? { title: mv.title } : {}),
        ...(mv.year ? { year: Number(mv.year) } : {}),
      });
    } else if (mv.title && mv.year) {
      movies.push({ title: mv.title, year: Number(mv.year) });
    } else {
      skippedMovies.push({
        kind: 'ptw-movie',
        tvdb: mv.tvdb ?? null,
        title: mv.title ?? null,
        reason: 'no_imdb_or_title_year',
      });
    }
  }
  return { shows, movies, skippedMovies };
}
