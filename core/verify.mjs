// Executable Phase-1 exit gate. Each check throws on the first violation (fail loud).
import { buildMaster } from './build.mjs';

const PII_FIELDS = ['user_id', 'device_id', 'ip', 'country', 'email', 'access_token', 'refresh_token'];
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

export function checkPiiFree(master) {
  const walk = (v, path) => {
    if (v && typeof v === 'object') {
      for (const [k, val] of Object.entries(v)) {
        if (PII_FIELDS.includes(k)) throw new Error(`PII field "${k}" at ${path}`);
        if (typeof val === 'string' && EMAIL_RE.test(val)) throw new Error(`email-shaped value at ${path}.${k}`);
        walk(val, `${path}.${k}`);
      }
    }
  };
  walk(master, 'master');
}

export function checkRowShapes(master) {
  for (const e of master.episodes) {
    if (!e.showTvdb) throw new Error(`episode missing showTvdb: ${JSON.stringify(e)}`);
    if (typeof e.season !== 'number' || typeof e.episode !== 'number')
      throw new Error(`episode S/E not numeric: ${JSON.stringify(e)}`);
    if (e.watchedAt !== null && !ISO_RE.test(e.watchedAt))
      throw new Error(`episode watchedAt not ISO-Z: ${JSON.stringify(e)}`);
    if (!['refract', 'rescue'].includes(e.source))
      throw new Error(`episode bad source: ${JSON.stringify(e)}`);
  }
  for (const m of master.movies) {
    if (!m.tvdb && !m.imdb) throw new Error(`movie has no tvdb or imdb: ${JSON.stringify(m)}`);
    if (m.watched && (m.watchedAt === null || !ISO_RE.test(m.watchedAt)))
      throw new Error(`watched movie missing valid date: ${JSON.stringify(m)}`);
  }
  for (const s of master.shows) {
    if (!s.simklBucket || !s.traktTreatment) throw new Error(`show missing bucket: ${JSON.stringify(s)}`);
  }
}

export function checkCounts(master) {
  const c = master.counts;
  const between = (n, lo, hi, label) => {
    if (n < lo || n > hi) throw new Error(`${label}=${n} outside [${lo}, ${hi}]`);
  };
  between(c.episodes, 15000, 15800, 'episodes');
  between(c.movies, 140, 145, 'movies');
  between(c.shows, 620, 645, 'shows');
  if (c.droppedShows !== 19) throw new Error(`droppedShows=${c.droppedShows}, expected 19`);
  between(c.rewatchPlays, 1000, 3000, 'rewatchPlays');
}

function main() {
  const master = buildMaster();
  checkRowShapes(master);
  checkPiiFree(master);
  checkCounts(master);
  console.log('core/verify: PASS', JSON.stringify(master.counts));
}
if (import.meta.url === `file://${process.argv[1]}`) main();
