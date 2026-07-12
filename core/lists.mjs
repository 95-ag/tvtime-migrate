// core/lists.mjs — extract TV Time custom lists + favorites into the PII-free master.
// Lists are target-agnostic here (all 7, faithful); the trakt/ module applies free-tier selection.
// Series items carry tvdb_id; movie items carry only a TV Time uuid → resolve to imdb via master movies.

export function buildLists(rawLists, masterMovies) {
  const imdbByUuid = new Map();
  for (const mv of masterMovies) if (mv.uuid && mv.imdb) imdbByUuid.set(mv.uuid, mv.imdb);

  return rawLists.map((l) => {
    const shows = [];
    const movies = [];
    for (const it of l.items ?? []) {
      if (it.type === 'series' && it.tvdb_id != null) {
        shows.push({ tvdb: it.tvdb_id, name: it.name });
      } else if (it.type === 'movie') {
        const imdb = imdbByUuid.get(it.uuid) ?? null;
        movies.push(imdb ? { imdb, name: it.name } : { uuid: it.uuid, name: it.name, imdb: null });
      }
    }
    return { name: l.name, shows, movies };
  });
}

// Refract's raw series/movie JSON rows (not the CSV-derived core rows) carry is_favorite + nested ids.
export function buildFavorites(seriesRows, movieRows) {
  const isFav = (r) => r.is_favorite === true || r.is_favorite === 'true' || r.is_favorite === 1;
  const shows = seriesRows
    .filter(isFav)
    .filter((r) => r.id?.tvdb != null)
    .map((r) => ({ tvdb: r.id.tvdb, name: r.title }));
  const movies = movieRows
    .filter(isFav)
    .filter((r) => r.id?.imdb)
    .map((r) => ({ imdb: r.id.imdb, name: r.title }));
  return { shows, movies };
}
