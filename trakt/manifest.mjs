// trakt/manifest.mjs — Trakt failure manifest builder.
export function buildManifest({
  notFound = {},
  missingFromReadback = [],
  unbridgedRewatch = [],
  skippedLists = [],
  unresolvedListMovies = [],
  skippedMovies = [],
}) {
  const items = [
    ...(notFound.movies ?? []).map((m) => ({ ...m, reason: 'not_found_movies' })),
    ...(notFound.shows ?? []).map((s) => ({ ...s, reason: 'not_found_shows' })),
    ...(notFound.episodes ?? []).map((e) => ({ ...e, reason: 'not_found_episodes' })),
    ...missingFromReadback,
    ...unbridgedRewatch.map((r) => ({ ...r, reason: 'unbridged_rewatch' })),
    ...skippedLists.map((l) => ({ ...l, reason: 'skipped_list_free_tier' })),
    ...unresolvedListMovies.map((m) => ({ ...m, reason: 'list_movie_no_imdb' })),
    ...skippedMovies.map((m) => ({ ...m, reason: m.reason ?? 'movie_no_identifier' })),
  ];
  return { count: items.length, items };
}
