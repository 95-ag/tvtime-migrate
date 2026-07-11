// trakt/favorites.mjs — master.favorites → POST /sync/favorites payload. Shows by tvdb, movies by imdb.
import { toTvdbId, requireImdb } from './payload.mjs';

export function buildFavoritesPayload(master) {
  const fav = master.favorites ?? { shows: [], movies: [] };
  return {
    shows: (fav.shows ?? []).map((s) => ({ ids: { tvdb: toTvdbId(s.tvdb, `favorite show "${s.name ?? s.tvdb}"`) } })),
    movies: (fav.movies ?? []).map((m) => ({
      ids: { imdb: requireImdb(m.imdb, `favorite movie "${m.name ?? m.imdb}"`) },
    })),
  };
}
