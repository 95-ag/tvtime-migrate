// simkl/overrides.mjs — manual Simkl-id overrides for shows tvdb-lookup can't resolve (or resolves wrong).
// The explicit fallback layer. Season-specific entries win over whole-show entries.
export const OVERRIDES = [
  { tvdb: '245521', simkl: 25227, type: 'tv' }, // 49 Days — master tvdb stale (Simkl tvdb 475026)
  { tvdb: '405494', season: 2, simkl: 3161260, type: 'anime' }, // No Doubt In Us S2 — separate Simkl anime
  { tvdb: '429656', simkl: 2084801, type: 'tv' }, // My Uncanny Destiny — a drama, not anime
];

export function lookupOverride(tvdb, season) {
  const t = String(tvdb);
  return (
    OVERRIDES.find((o) => o.tvdb === t && o.season === season) ??
    OVERRIDES.find((o) => o.tvdb === t && o.season === undefined) ??
    null
  );
}
