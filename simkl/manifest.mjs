// simkl/manifest.mjs — every not-imported item, accounted for. Pure.
export function buildManifest({ notFound = { shows: [], movies: [], episodes: [] }, missingFromReadback = [] }) {
  const items = [];
  for (const kind of ['show', 'movie', 'episode']) {
    for (const it of notFound[`${kind}s`] ?? []) items.push({ ...it, kind, reason: 'not_found' });
  }
  for (const it of missingFromReadback) items.push({ ...it, reason: 'not_confirmed' });
  return { count: items.length, items };
}
