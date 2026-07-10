import { parseCsv, parseCsvObjects } from './csv.mjs';
import { normalizeWatchedAt } from './dates.mjs';

const nullIfEmpty = (v) => { const s = String(v ?? '').trim(); return s === '' ? null : s; };

// Fail loud if the header doesn't contain every required column (column-shift guard).
export function assertColumns(header, required, label) {
  for (const col of required) {
    if (!header.includes(col)) throw new Error(`${label}: missing required column "${col}"`);
  }
}

const REFRACT_EP_COLS = ['series_tvdb_id', 'series_imdb_id', 'title', 'season', 'episode',
  'tvdb_id', 'is_watched', 'watched_at', 'rewatch_count', 'special'];

export function loadRefractEpisodes(text) {
  assertColumns(parseCsv(text)[0] ?? [], REFRACT_EP_COLS, 'refract episodes');
  return parseCsvObjects(text)
    .filter((r) => r.is_watched === 'true')
    .map((r) => ({
      seriesTvdb: nullIfEmpty(r.series_tvdb_id),
      seriesImdb: nullIfEmpty(r.series_imdb_id),
      title: r.title,
      season: Number(r.season),
      episode: Number(r.episode),
      epTvdb: nullIfEmpty(r.tvdb_id),
      watchedAt: normalizeWatchedAt(r.watched_at),
      rewatchCount: Number(r.rewatch_count) || 0,
      special: r.special === 'true',
    }));
}

const REFRACT_SERIES_COLS = ['tvdb_id', 'imdb_id', 'title', 'status'];
export function loadRefractSeries(text) {
  assertColumns(parseCsv(text)[0] ?? [], REFRACT_SERIES_COLS, 'refract series');
  return parseCsvObjects(text).map((r) => ({
    tvdb: nullIfEmpty(r.tvdb_id), imdb: nullIfEmpty(r.imdb_id), title: r.title, status: r.status,
  }));
}

const REFRACT_MOVIE_COLS = ['uuid', 'tvdb_id', 'imdb_id', 'title', 'year', 'watched_at', 'is_watched'];
export function loadRefractMovies(text) {
  assertColumns(parseCsv(text)[0] ?? [], REFRACT_MOVIE_COLS, 'refract movies');
  return parseCsvObjects(text).map((r) => ({
    uuid: nullIfEmpty(r.uuid), tvdb: nullIfEmpty(r.tvdb_id), imdb: nullIfEmpty(r.imdb_id),
    title: r.title, year: nullIfEmpty(r.year),
    watchedAt: normalizeWatchedAt(r.watched_at), watched: r.is_watched === 'true',
  }));
}

const RESCUE_EP_COLS = ['show', 'tvdb_show_id', 'season', 'episode', 'tvdb_episode_id', 'watched_at'];
export function loadRescueEpisodes(text) {
  assertColumns(parseCsv(text)[0] ?? [], RESCUE_EP_COLS, 'rescue episodes');
  return parseCsvObjects(text).map((r) => ({
    showTvdb: nullIfEmpty(r.tvdb_show_id), title: r.show,
    season: Number(r.season), episode: Number(r.episode),
    epTvdb: nullIfEmpty(r.tvdb_episode_id), watchedAt: normalizeWatchedAt(r.watched_at),
    special: r.season === '0' || r.special === 'true',
  }));
}

const RESCUE_SHOW_COLS = ['name', 'tvdb_id', 'status'];
export function loadRescueShows(text) {
  assertColumns(parseCsv(text)[0] ?? [], RESCUE_SHOW_COLS, 'rescue shows');
  return parseCsvObjects(text).map((r) => ({
    tvdb: nullIfEmpty(r.tvdb_id), title: r.name, status: r.status,
  }));
}

const GDPR_REWATCH_COLS = ['tv_show_name', 'episode_season_number', 'episode_number', 'cpt'];
export function loadGdprRewatch(text) {
  assertColumns(parseCsv(text)[0] ?? [], GDPR_REWATCH_COLS, 'gdpr rewatch');
  return parseCsvObjects(text).map((r) => ({
    showName: r.tv_show_name, season: Number(r.episode_season_number),
    episode: Number(r.episode_number), cpt: Number(r.cpt) || 0,
  }));
}
