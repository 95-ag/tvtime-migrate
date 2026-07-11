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

const EPISODE_REASONS = new Set(['absent', 'not_found_episodes']);
const MOVIE_REASONS = new Set(['absent', 'not_found_movies', 'date_mismatch']);
const UNMATCHED_REASONS = new Set(['no_imdb_or_title_year', 'movie_no_identifier', 'list_movie_no_imdb']);
const WATCHLIST_REASONS = new Set(['absent_from_watchlist']);
const REWATCH_REASONS = new Set(['rewatch_play_count', 'unbridged_rewatch']);

function showTitle(showByTvdb, tvdb) {
  return showByTvdb.get(String(tvdb)) || `TV show #${tvdb}`; // || so an empty title falls back too
}

function movieLabel(movieByImdb, item) {
  if (item.title) return item.year ? `${item.title} (${item.year})` : item.title;
  const found = item.imdb ? movieByImdb.get(item.imdb) : undefined;
  if (found) return found.year ? `${found.title} (${found.year})` : found.title;
  return 'a movie';
}

// Pure renderer: turns manifest items into a Markdown report in plain TV Time vocabulary
// (show/movie names, never internal ids) so a non-technical user can read it directly.
export function renderManifest(items, master, targetName) {
  const lines = [`# What didn't transfer to ${targetName}`, ''];
  if (items.length === 0) {
    lines.push('Everything transferred — nothing was left behind.');
    return `${lines.join('\n')}\n`;
  }
  lines.push(
    `\`${items.length}\` item(s) from your TV Time history aren't on ${targetName} — almost all because ${targetName}'s catalogue doesn't have them.`,
    '',
  );

  const showByTvdb = new Map((master.shows ?? []).map((s) => [String(s.tvdb), s.title]));
  const movieByImdb = new Map((master.movies ?? []).map((m) => [m.imdb, m]).filter(([imdb]) => imdb));

  const episodeMisses = items.filter((it) => it.kind === 'episode' && EPISODE_REASONS.has(it.reason));
  const movieMisses = items.filter((it) => it.kind === 'movie' && MOVIE_REASONS.has(it.reason));
  const unmatched = items.filter((it) => UNMATCHED_REASONS.has(it.reason));
  const watchlistMisses = items.filter(
    (it) => WATCHLIST_REASONS.has(it.reason) && (it.kind === 'ptw-show' || it.kind === 'ptw-movie'),
  );
  const rewatchIssues = items.filter((it) => REWATCH_REASONS.has(it.reason));
  const wrongDates = items.filter((it) => it.kind === 'episode' && it.reason === 'date_mismatch');
  const skippedLists = items.filter((it) => it.reason === 'skipped_list_free_tier');
  const other = items.filter(
    (it) =>
      !episodeMisses.includes(it) &&
      !movieMisses.includes(it) &&
      !unmatched.includes(it) &&
      !watchlistMisses.includes(it) &&
      !rewatchIssues.includes(it) &&
      !wrongDates.includes(it) &&
      !skippedLists.includes(it),
  );

  if (episodeMisses.length) {
    const counts = new Map();
    for (const it of episodeMisses) counts.set(String(it.tvdb), (counts.get(String(it.tvdb)) ?? 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    lines.push("## Episodes the catalogue doesn't have");
    for (const [tvdb, count] of rows) lines.push(`- ${showTitle(showByTvdb, tvdb)} — ${count} episode(s)`);
    lines.push('');
  }

  if (movieMisses.length) {
    lines.push("## Movies the catalogue doesn't have");
    for (const it of movieMisses) lines.push(`- ${movieLabel(movieByImdb, it)}`);
    lines.push('');
  }

  if (unmatched.length) {
    lines.push("## Titles that couldn't be matched");
    for (const it of unmatched) lines.push(`- ${it.title ?? it.name ?? 'an untitled item'}`);
    lines.push('');
  }

  if (watchlistMisses.length) {
    lines.push('## Watchlist items not added');
    for (const it of watchlistMisses) {
      if (it.kind === 'ptw-show') lines.push(`- ${showTitle(showByTvdb, it.tvdb)}`);
      else {
        const found = it.imdb ? movieByImdb.get(it.imdb) : undefined;
        lines.push(`- ${found ? movieLabel(movieByImdb, found) : 'A watchlist movie (no matching id)'}`);
      }
    }
    lines.push('');
  }

  if (rewatchIssues.length) {
    lines.push('## Rewatches not fully recorded');
    for (const it of rewatchIssues) {
      const name = it.showName ?? showTitle(showByTvdb, it.tvdb);
      lines.push(`- ${name} S${it.season}E${it.episode}`);
    }
    lines.push('');
  }

  if (wrongDates.length) {
    lines.push('## Wrong watch date');
    for (const it of wrongDates) lines.push(`- ${showTitle(showByTvdb, it.tvdb)} S${it.season}E${it.episode}`);
    lines.push('');
  }

  if (skippedLists.length) {
    lines.push('## Custom lists skipped (free-plan limit)');
    for (const it of skippedLists) lines.push(`- ${it.name} (${it.shows} shows)`);
    lines.push('');
  }

  if (other.length) {
    lines.push('## Other items');
    for (const it of other) lines.push(`- ${it.title ?? it.name ?? it.reason}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
