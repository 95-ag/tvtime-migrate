// simkl/overrides.mjs — manual Simkl-id override fallback for shows tvdb-lookup can't resolve (or resolves
// wrong). Data-independent: the seed ships EMPTY; add your own account-specific entries here (or wire a local
// gitignored source). Entry shape: { tvdb: string, season?: number, simkl: number, type: 'tv'|'anime'|'movie' }.
// Example: { tvdb: '245521', simkl: 25227, type: 'tv' }. Season-specific entries win over whole-show entries.
export const OVERRIDES = [];

export function lookupOverride(tvdb, season, overrides = OVERRIDES) {
  const t = String(tvdb);
  return (
    overrides.find((o) => o.tvdb === t && o.season === season) ??
    overrides.find((o) => o.tvdb === t && o.season === undefined) ??
    null
  );
}
