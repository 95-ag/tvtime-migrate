// simkl/payload.mjs — master → Simkl /sync/history bodies. Pure; no network, no secrets.

const HISTORY_STATUSES = new Set(['completed', 'watching', 'dropped']);

function toTvdbId(value, label) {
  const n = Number(value);
  if (value == null || !Number.isInteger(n) || n <= 0) {
    throw new Error(`Refusing to build Simkl payload: ${label} has an invalid tvdb id (${JSON.stringify(value)}).`);
  }
  return n;
}

export function buildHistoryPayload(master, { useTvdbAnimeSeasons = true } = {}) {
  const showByTvdb = new Map(master.shows.map((s) => [String(s.tvdb), s]));
  const groups = new Map(); // tvdb -> { tvdb, show, seasons: Map<number, episode[]> }

  for (const ep of master.episodes) {
    const tvdb = String(ep.showTvdb);
    let g = groups.get(tvdb);
    if (!g) g = groups.set(tvdb, { tvdb, show: showByTvdb.get(tvdb), seasons: new Map() }).get(tvdb);
    const list = g.seasons.get(ep.season) ?? g.seasons.set(ep.season, []).get(ep.season);
    list.push(ep);
  }

  const shows = [];
  for (const g of groups.values()) {
    const ids = { tvdb: toTvdbId(g.tvdb, `show "${g.show?.title ?? g.tvdb}"`) };
    if (g.show?.imdb) ids.imdb = g.show.imdb;
    const showObj = {
      ids,
      ...(g.show?.title ? { title: g.show.title } : {}),
      use_tvdb_anime_seasons: useTvdbAnimeSeasons,
      seasons: [...g.seasons.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([number, eps]) => ({
          number,
          episodes: eps
            .sort((a, b) => a.episode - b.episode)
            .map((e) => ({ number: e.episode, ...(e.watchedAt ? { watched_at: e.watchedAt } : {}) })),
        })),
    };
    // Locked rule: explicit status for completed/watching/dropped; omit for plantowatch-with-history
    // (the 10 overlap shows) so Simkl resolves status from progress.
    const bucket = g.show?.simklBucket;
    if (bucket && HISTORY_STATUSES.has(bucket)) showObj.status = bucket;
    shows.push(showObj);
  }

  const movies = master.movies
    .filter((mv) => mv.watched)
    .map((mv) => {
      const ids = { tvdb: toTvdbId(mv.tvdb, `movie "${mv.title ?? mv.tvdb}"`) };
      if (mv.imdb) ids.imdb = mv.imdb;
      return {
        ids,
        ...(mv.title ? { title: mv.title } : {}),
        ...(mv.year ? { year: Number(mv.year) } : {}),
        ...(mv.watchedAt ? { watched_at: mv.watchedAt } : {}),
        status: 'completed',
      };
    });

  return { shows, movies };
}

export function buildPlanToWatchPayload(master) {
  const withEpisodes = new Set(master.episodes.map((e) => String(e.showTvdb)));
  const shows = master.planToWatch.shows
    .filter((s) => !withEpisodes.has(String(s.tvdb))) // skip the 10 overlap; status resolves via history
    .map((s) => ({
      ids: { tvdb: toTvdbId(s.tvdb, `plan-to-watch show "${s.title ?? s.tvdb}"`) },
      ...(s.title ? { title: s.title } : {}),
      status: 'plantowatch',
    }));
  const movies = master.planToWatch.movies.map((mv) => ({
    ids: {
      tvdb: toTvdbId(mv.tvdb, `plan-to-watch movie "${mv.title ?? mv.tvdb}"`),
      ...(mv.imdb ? { imdb: mv.imdb } : {}),
    },
    ...(mv.title ? { title: mv.title } : {}),
    status: 'plantowatch',
  }));
  return { shows, movies };
}
