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
const SKIPPED_LIST_REASON = 'skipped_list_free_tier';

function plural(n, word) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function showTitle(showByTvdb, tvdb) {
  return showByTvdb.get(String(tvdb)) || `TV show #${tvdb}`; // || so an empty title falls back too
}

function movieLabel(movieByImdb, item) {
  if (item.title) return item.year ? `${item.title} (${item.year})` : item.title;
  const found = item.imdb ? movieByImdb.get(item.imdb) : undefined;
  if (found) return found.year ? `${found.title} (${found.year})` : found.title;
  if (item.imdb) return `Movie (imdb ${item.imdb})`;
  const fallbackId = item.tvdb ?? item.uuid;
  if (fallbackId) return `Movie (id ${fallbackId})`;
  return 'An unidentified movie (the tool lost its title while matching)';
}

function summaryLine(summary) {
  if (
    !summary ||
    summary.matchedEpisodes === undefined ||
    summary.totalEpisodes === undefined ||
    summary.dateFidelity === undefined
  ) {
    return null;
  }
  const coverage = summary.episodeCoverage ?? summary.matchedEpisodes / summary.totalEpisodes;
  const pct = (coverage * 100).toFixed(2);
  const datePct = (summary.dateFidelity * 100).toFixed(2);
  return `**${summary.matchedEpisodes} of ${summary.totalEpisodes} episodes (${pct}%) transferred, with ${datePct}% of dates kept.** This file lists only the exceptions below.`;
}

// Pure renderer: turns manifest items into a Markdown report in plain TV Time vocabulary
// (show/movie names, never internal ids) so a non-technical user can read it directly.
export function renderManifest(items, master, targetName, summary = {}) {
  const lines = [`# What didn't transfer to ${targetName}`, ''];
  const reassurance = summaryLine(summary);
  if (reassurance) lines.push(reassurance, '');

  if (items.length === 0) {
    lines.push('Everything transferred — nothing was left behind.');
    return `${lines.join('\n')}\n`;
  }

  const skippedLists = items.filter((it) => it.reason === SKIPPED_LIST_REASON);
  const realItems = items.filter((it) => it.reason !== SKIPPED_LIST_REASON);

  if (realItems.length === 0) {
    lines.push('Everything transferred — nothing was left behind, aside from the lists below.', '');
  } else {
    lines.push(
      `\`${realItems.length}\` item(s) from your TV Time history aren't on ${targetName} — almost all because ${targetName}'s catalogue doesn't have them.`,
      '',
    );
  }

  const showByTvdb = new Map((master.shows ?? []).map((s) => [String(s.tvdb), s.title]));
  const movieByImdb = new Map((master.movies ?? []).map((m) => [m.imdb, m]).filter(([imdb]) => imdb));

  const episodeMisses = realItems.filter((it) => it.kind === 'episode' && EPISODE_REASONS.has(it.reason));
  const movieMisses = realItems.filter((it) => it.kind === 'movie' && MOVIE_REASONS.has(it.reason));
  const unmatched = realItems.filter((it) => UNMATCHED_REASONS.has(it.reason));
  const watchlistMisses = realItems.filter(
    (it) => WATCHLIST_REASONS.has(it.reason) && (it.kind === 'ptw-show' || it.kind === 'ptw-movie'),
  );
  const rewatchIssues = realItems.filter((it) => REWATCH_REASONS.has(it.reason));
  const wrongDates = realItems.filter((it) => it.kind === 'episode' && it.reason === 'date_mismatch');
  const other = realItems.filter(
    (it) =>
      !episodeMisses.includes(it) &&
      !movieMisses.includes(it) &&
      !unmatched.includes(it) &&
      !watchlistMisses.includes(it) &&
      !rewatchIssues.includes(it) &&
      !wrongDates.includes(it),
  );

  if (episodeMisses.length) {
    lines.push(
      "## Episodes the catalogue doesn't have",
      "*The service's catalogue doesn't list these, so there's nothing to add them to. Re-running the tool later may pick them up if the service adds them.*",
      '',
    );
    const counts = new Map();
    for (const it of episodeMisses) counts.set(String(it.tvdb), (counts.get(String(it.tvdb)) ?? 0) + 1);
    const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [tvdb, count] of rows) lines.push(`- ${showTitle(showByTvdb, tvdb)} — ${plural(count, 'episode')}`);
    lines.push(
      '',
      '*Note: TV Time counts some daily dramas as more episodes than the service lists (each aired half separately), so a show can appear here with a high count even though the full episodes are all present.*',
      '',
    );
  }

  if (movieMisses.length) {
    lines.push(
      "## Movies the catalogue doesn't have",
      "*The service's catalogue doesn't list these, so there's nothing to add them to. Re-running the tool later may pick them up if the service adds them.*",
      '',
    );
    for (const it of movieMisses) lines.push(`- ${movieLabel(movieByImdb, it)}`);
    lines.push('');
  }

  if (unmatched.length) {
    lines.push(
      "## Titles that couldn't be matched",
      "*The tool couldn't confidently match these to a catalogue entry — search the service by title to add them by hand if you want them.*",
      '',
    );
    for (const it of unmatched) lines.push(`- ${it.title ?? it.name ?? 'an untitled item'}`);
    lines.push('');
  }

  if (watchlistMisses.length) {
    lines.push(
      '## Watchlist items not added',
      '*Add these to your watchlist by searching the service for the title.*',
      '',
    );
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
    lines.push(
      '## Rewatches not fully recorded',
      "*The first watch is recorded; some extra rewatch plays couldn't be added.*",
      '',
    );
    for (const it of rewatchIssues) {
      const name = it.showName ?? showTitle(showByTvdb, it.tvdb);
      lines.push(`- ${name} S${it.season}E${it.episode}`);
    }
    lines.push('');
  }

  if (wrongDates.length) {
    lines.push(
      '## Wrong watch date',
      '*The date on the service differs from your TV Time date — you can correct it manually.*',
      '',
    );
    for (const it of wrongDates) {
      const label = `${showTitle(showByTvdb, it.tvdb)} S${it.season}E${it.episode}`;
      const dates = it.expected
        ? it.got
          ? ` — your date ${it.expected}, on the service ${it.got}`
          : ` — your date ${it.expected}`
        : '';
      lines.push(`- ${label}${dates}`);
    }
    lines.push('');
  }

  if (skippedLists.length) {
    lines.push(
      '## Lists you chose not to bring over',
      "*Your service's free plan allows only 5 custom lists, so these weren't created. You can add them by hand, remove another list to make room, or upgrade your plan.*",
      '',
    );
    for (const it of skippedLists) lines.push(`- ${it.name} (${plural(it.shows, 'show')})`);
    lines.push('');
  }

  if (other.length) {
    lines.push('## Other items');
    for (const it of other) lines.push(`- ${it.title ?? it.name ?? it.reason}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
