// simkl/dry-run.mjs — assemble + validate + report the Simkl payload from build/master.json. No network.
import { readFileSync, writeFileSync } from 'node:fs';
import { buildHistoryPayload, buildPlanToWatchPayload } from './payload.mjs';

const VALID_STATUS = new Set(['completed', 'watching', 'dropped', 'plantowatch']);
const ISO_Z = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/;

export function validatePayload({ history, planToWatch }) {
  const errors = [];
  const checkIds = (ids, where) => {
    if (typeof ids?.tvdb !== 'number')
      errors.push(`${where}: ids.tvdb must be a number, got ${JSON.stringify(ids?.tvdb)}`);
  };
  for (const s of history.shows) {
    checkIds(s.ids, `show ${s.title ?? s.ids?.tvdb}`);
    if ('status' in s && !VALID_STATUS.has(s.status)) errors.push(`show ${s.ids?.tvdb}: invalid status ${s.status}`);
    for (const se of s.seasons ?? [])
      for (const e of se.episodes ?? [])
        if (!e.watched_at) errors.push(`show ${s.ids?.tvdb} S${se.number}E${e.number}: missing watched_at`);
        else if (!ISO_Z.test(e.watched_at))
          errors.push(`show ${s.ids?.tvdb} S${se.number}E${e.number}: watched_at not ISO-Z: ${e.watched_at}`);
  }
  for (const mv of history.movies) {
    checkIds(mv.ids, `movie ${mv.title ?? mv.ids?.tvdb}`);
    if (!mv.watched_at) errors.push(`movie ${mv.ids?.tvdb}: missing watched_at`);
    else if (!ISO_Z.test(mv.watched_at)) errors.push(`movie ${mv.ids?.tvdb}: watched_at not ISO-Z: ${mv.watched_at}`);
    if (!VALID_STATUS.has(mv.status)) errors.push(`movie ${mv.ids?.tvdb}: invalid status ${mv.status}`);
  }
  for (const s of planToWatch.shows) {
    checkIds(s.ids, `ptw show`);
    if (s.status !== 'plantowatch') errors.push(`ptw show ${s.ids?.tvdb}: status must be plantowatch`);
  }
  for (const mv of planToWatch.movies) {
    checkIds(mv.ids, `ptw movie`);
    if (mv.status !== 'plantowatch') errors.push(`ptw movie ${mv.ids?.tvdb}: status must be plantowatch`);
  }
  return errors;
}

export function summarize({ history, planToWatch }) {
  const historyEpisodes = history.shows.reduce((n, s) => n + s.seasons.reduce((m, se) => m + se.episodes.length, 0), 0);
  const byStatus = {};
  for (const s of history.shows) byStatus[s.status ?? '(resolve)'] = (byStatus[s.status ?? '(resolve)'] || 0) + 1;
  return {
    historyShows: history.shows.length,
    historyEpisodes,
    historyMovies: history.movies.length,
    ptwShows: planToWatch.shows.length,
    ptwMovies: planToWatch.movies.length,
    showsByStatus: byStatus,
  };
}

export function assemble(masterPath = 'build/master.json') {
  const master = JSON.parse(readFileSync(masterPath, 'utf8'));
  return { history: buildHistoryPayload(master), planToWatch: buildPlanToWatchPayload(master) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const payload = assemble();
  const errors = validatePayload(payload);
  const summary = summarize(payload);
  writeFileSync('build/simkl-payload.json', JSON.stringify(payload, null, 2));
  console.log('Simkl dry-run summary:', JSON.stringify(summary, null, 2));
  if (errors.length) {
    console.error(`\n${errors.length} validation error(s):`);
    for (const e of errors) console.error('  -', e);
    process.exitCode = 1;
  } else console.log('\nValidation: OK. Payload written to build/simkl-payload.json (no data sent).');
}
