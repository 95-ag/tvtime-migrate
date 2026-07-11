// simkl/manifest.mjs — every not-imported item, accounted for. Pure.
export function buildManifest({ notFound = { shows: [], movies: [], episodes: [] }, missingFromReadback = [] }) {
  const items = [];
  for (const kind of ['show', 'movie', 'episode']) {
    for (const it of notFound[`${kind}s`] ?? []) items.push({ ...it, kind, reason: 'not_found' });
  }
  for (const it of missingFromReadback) items.push({ ...it, reason: 'not_confirmed' });
  return { count: items.length, items };
}

function tvdbOf(item) {
  return item.ids?.tvdb ?? item.tvdb;
}
function imdbOf(item) {
  return item.ids?.imdb ?? item.imdb;
}

function showTitle(showByTvdb, tvdb) {
  return showByTvdb.get(String(tvdb)) ?? `TV show #${tvdb}`;
}

function movieLabel(movieByImdb, item) {
  if (item.title) return item.year ? `${item.title} (${item.year})` : item.title;
  const found = imdbOf(item) ? movieByImdb.get(imdbOf(item)) : undefined;
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

  const episodeMisses = items.filter(
    (it) =>
      it.kind === 'episode' &&
      (it.reason === 'not_found' || it.reason_detail === 'absent_on_simkl' || it.reason_detail === 'unmapped'),
  );
  const wrongDates = items.filter((it) => it.kind === 'episode' && it.reason_detail === 'date_mismatch');
  const movieMisses = items.filter((it) => it.kind === 'movie');
  const watchlistMisses = items.filter((it) => it.kind === 'plantowatch-show' || it.kind === 'plantowatch-movie');
  const other = items.filter(
    (it) =>
      !episodeMisses.includes(it) &&
      !wrongDates.includes(it) &&
      !movieMisses.includes(it) &&
      !watchlistMisses.includes(it),
  );

  if (episodeMisses.length) {
    const counts = new Map();
    for (const it of episodeMisses) {
      const tvdb = String(tvdbOf(it));
      counts.set(tvdb, (counts.get(tvdb) ?? 0) + 1);
    }
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

  if (watchlistMisses.length) {
    lines.push('## Watchlist items not added');
    for (const it of watchlistMisses) {
      if (it.kind === 'plantowatch-show') lines.push(`- ${showTitle(showByTvdb, tvdbOf(it))}`);
      else {
        const found = movieByImdb.get(imdbOf(it));
        lines.push(`- ${found ? movieLabel(movieByImdb, found) : 'A watchlist movie (no matching id)'}`);
      }
    }
    lines.push('');
  }

  if (wrongDates.length) {
    lines.push('## Wrong watch date');
    for (const it of wrongDates) lines.push(`- ${showTitle(showByTvdb, tvdbOf(it))} S${it.season}E${it.episode}`);
    lines.push('');
  }

  if (other.length) {
    lines.push('## Other items');
    for (const it of other) lines.push(`- ${it.title ?? it.name ?? it.reason_detail ?? it.reason}`);
    lines.push('');
  }

  return `${lines.join('\n').trimEnd()}\n`;
}
