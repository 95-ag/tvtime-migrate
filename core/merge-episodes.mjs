// Master watched-episode list: Refract spine (canonical) + Rescue graft (episodes Refract lacks).
// Keyed on (showTvdb, season, episode) — never raw episode id (41 TheTVDB re-index mismatches, lessons.md).
const key = (showTvdb, season, episode) => `${showTvdb}|${season}|${episode}`;
const bySSE = (a, b) =>
  String(a.showTvdb).localeCompare(String(b.showTvdb), undefined, { numeric: true }) ||
  a.season - b.season ||
  a.episode - b.episode;

export function buildEpisodes(refractWatched, rescueEpisodes) {
  const master = new Map();
  for (const r of refractWatched) {
    const k = key(r.seriesTvdb, r.season, r.episode);
    if (master.has(k)) continue; // dedup: first canonical row wins
    master.set(k, {
      showTvdb: r.seriesTvdb,
      showImdb: r.seriesImdb,
      showTitle: r.title,
      season: r.season,
      episode: r.episode,
      watchedAt: r.watchedAt,
      epTvdb: r.epTvdb,
      special: r.special,
      source: 'refract',
      dateConfidence: 'canonical',
    });
  }
  for (const s of rescueEpisodes) {
    const k = key(s.showTvdb, s.season, s.episode);
    if (master.has(k)) continue; // Refract already has it — canonical date wins
    master.set(k, {
      showTvdb: s.showTvdb,
      showImdb: null,
      showTitle: s.title,
      season: s.season,
      episode: s.episode,
      watchedAt: s.watchedAt,
      epTvdb: s.epTvdb,
      special: s.special,
      source: 'rescue',
      dateConfidence: 'insert-time',
    });
  }
  return [...master.values()].sort(bySSE);
}
