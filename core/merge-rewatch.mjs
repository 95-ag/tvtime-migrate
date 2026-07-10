// GDPR rewatch (fullest: 2,817 replays) has no external id — bridge tv_show_name -> tvdb via a name map.
// Emits per-episode play COUNTS only. Turning counts into dated Trakt plays is a Phase 3 decision;
// core never fabricates replay dates (data-integrity rule). Unbridged rows are dropped here and land
// on the failure manifest at import time.
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function buildNameToTvdb(shows) {
  const map = new Map();
  for (const s of shows) if (s.tvdb) map.set(norm(s.title), s.tvdb);
  return map;
}

export function buildRewatch(gdprRewatch, nameToTvdb) {
  const out = [];
  for (const r of gdprRewatch) {
    const tvdb = nameToTvdb.get(norm(r.showName));
    if (!tvdb) continue;
    out.push({ showTvdb: tvdb, season: r.season, episode: r.episode, plays: r.cpt });
  }
  return out.sort((a, b) =>
    String(a.showTvdb).localeCompare(String(b.showTvdb), undefined, { numeric: true }) ||
    a.season - b.season || a.episode - b.episode);
}
