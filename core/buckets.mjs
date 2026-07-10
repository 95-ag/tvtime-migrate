// TV Time 5-value status -> per-target bucket. Source of truth: PROJECT.md -> Status -> bucket mapping.
// Unknown status throws — a mis-bucketed show is a silent data error, not a default.
const SIMKL = {
  up_to_date: 'completed', continuing: 'watching',
  not_started_yet: 'plantowatch', watch_later: 'plantowatch', stopped: 'dropped',
};
const TRAKT = {
  up_to_date: 'watched-progress', continuing: 'watched-progress',
  not_started_yet: 'watchlist', watch_later: 'watchlist', stopped: 'dropped-list',
};
export function statusToSimkl(status) {
  if (!(status in SIMKL)) throw new Error(`unknown status for Simkl bucket: ${status}`);
  return SIMKL[status];
}
export function statusToTrakt(status) {
  if (!(status in TRAKT)) throw new Error(`unknown status for Trakt treatment: ${status}`);
  return TRAKT[status];
}
