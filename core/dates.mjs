// Normalize a source watched_at to ISO-8601 UTC seconds (…Z), or null if absent.
// Refract dates already carry Z; Rescue dates are "YYYY-MM-DD HH:MM:SS" (tz-less insert-time,
// treated as UTC). Never emit a sentinel for a missing date — return null (data-integrity rule).
export function normalizeWatchedAt(raw) {
  const s = String(raw ?? '').trim();
  if (s === '') return null;
  const iso = s.replace(' ', 'T');
  const m = iso.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  return `${m[1]}Z`;
}
