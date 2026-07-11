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

export function buildRewatchPayload(rewatchRows) {
  const shows = [];
  for (const r of rewatchRows) {
    const tvdb = toTvdbId(r.showTvdb, `rewatch show tvdb=${r.showTvdb}`);
    for (let i = 0; i < r.plays; i++) {
      shows.push({
        ids: { tvdb },
        seasons: [{ number: r.season, episodes: [{ number: r.episode, watched_at: 'unknown' }] }],
      });
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
