import { statusToSimkl, statusToTrakt } from './buckets.mjs';

const byTvdb = (a, b) => String(a.tvdb).localeCompare(String(b.tvdb), undefined, { numeric: true });

export function buildMovies(movies) {
  return movies
    .map((m) => ({
      tvdb: m.tvdb,
      imdb: m.imdb,
      uuid: m.uuid,
      title: m.title,
      year: m.year,
      watchedAt: m.watchedAt,
      watched: m.watched,
    }))
    .sort(byTvdb);
}

// Refract series own the 5-value status; Rescue-only follows (not in Refract) are followed-but-unwatched,
// mapped to not_started_yet (== plantowatch). Documented assumption — see PROJECT.md scope for the 16 follows.
export function buildShows(refractSeries, rescueShows) {
  const seen = new Set(refractSeries.map((s) => s.tvdb));
  const shows = refractSeries.map((s) => ({
    tvdb: s.tvdb,
    imdb: s.imdb,
    title: s.title,
    status: s.status,
    simklBucket: statusToSimkl(s.status),
    traktTreatment: statusToTrakt(s.status),
  }));
  for (const r of rescueShows) {
    if (r.tvdb === null || seen.has(r.tvdb)) continue;
    seen.add(r.tvdb);
    shows.push({
      tvdb: r.tvdb,
      imdb: null,
      title: r.title,
      status: 'not_started_yet',
      simklBucket: statusToSimkl('not_started_yet'),
      traktTreatment: statusToTrakt('not_started_yet'),
    });
  }
  return shows.sort(byTvdb);
}

export function buildPlanToWatch(refractSeries, rescueShows, movies) {
  const shows = [];
  for (const s of refractSeries) {
    if (s.status === 'watch_later' || s.status === 'not_started_yet') {
      shows.push({ tvdb: s.tvdb, title: s.title, from: s.status });
    }
  }
  const seen = new Set(refractSeries.map((s) => s.tvdb));
  for (const r of rescueShows) {
    if (r.tvdb !== null && !seen.has(r.tvdb)) shows.push({ tvdb: r.tvdb, title: r.title, from: 'rescue-follow' });
  }
  const ptwMovies = movies
    .filter((m) => !m.watched)
    .map((m) => ({ tvdb: m.tvdb, imdb: m.imdb, uuid: m.uuid, title: m.title }));
  return { shows: shows.sort(byTvdb), movies: ptwMovies.sort(byTvdb) };
}

export function buildDropped(refractSeries) {
  return refractSeries
    .filter((s) => s.status === 'stopped')
    .map((s) => ({ tvdb: s.tvdb, title: s.title }))
    .sort(byTvdb);
}
