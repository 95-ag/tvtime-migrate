// Build-time id-integrity guard: the tvdb ids we key on must agree across the two independent lineages
// (Refract site-scrape vs Rescue, GDPR-derived), joined on an independent key (show name). Proven once in
// Task 1 (analyze.mjs, 620/620, 0 mismatch); re-asserted per build so a future data swap can't silently
// introduce a wrong-id mapping. Unjoinable names (language variants) are allowed; only a genuine tvdb
// DISAGREEMENT on a shared name throws.
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

export function checkIdIntegrity(refractSeries, rescueShows) {
  const refractByName = new Map();
  for (const s of refractSeries) if (s.tvdb) refractByName.set(norm(s.title), s.tvdb);
  const mismatches = [];
  let matched = 0,
    unjoinable = 0;
  for (const r of rescueShows) {
    if (!r.tvdb) continue;
    const rt = refractByName.get(norm(r.title));
    if (rt === undefined) {
      unjoinable++;
      continue;
    }
    if (rt === r.tvdb) matched++;
    else mismatches.push({ title: r.title, refract: rt, rescue: r.tvdb });
  }
  if (mismatches.length) {
    throw new Error(
      `id-integrity: ${mismatches.length} tvdb mismatch(es) across lineages: ${JSON.stringify(mismatches.slice(0, 5))}`,
    );
  }
  return { matched, unjoinable };
}
