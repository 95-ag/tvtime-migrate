import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { renderManifest } from '../../trakt/manifest.mjs';

const master = {
  shows: [
    { tvdb: '101', title: 'Show A' },
    { tvdb: '202', title: 'Show B' },
  ],
  movies: [{ tvdb: '5', imdb: 'tt0001', title: 'Movie A', year: '2020' }],
};

describe('renderManifest (trakt)', () => {
  it('zero items → everything transferred', () => {
    const md = renderManifest([], master, 'Trakt');
    assert.match(md, /^# What didn't transfer to Trakt/);
    assert.match(md, /Everything transferred — nothing was left behind\./);
  });

  it('groups missing episodes by show name (not tvdb id) with counts, most-missing first, with correct pluralization', () => {
    const items = [
      { kind: 'episode', tvdb: '101', season: 1, episode: 1, reason: 'absent' },
      { kind: 'episode', tvdb: '101', season: 1, episode: 2, reason: 'absent' },
      { kind: 'episode', tvdb: '202', season: 1, episode: 1, reason: 'absent' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Episodes the catalogue doesn't have/);
    assert.match(md, /- Show A — 2 episodes/);
    assert.match(md, /- Show B — 1 episode\b/);
    assert.doesNotMatch(md, /1 episode\(s\)/);
    // Show A (2 missing) must be listed before Show B (1 missing).
    assert.ok(md.indexOf('Show A — 2') < md.indexOf('Show B — 1'));
    assert.doesNotMatch(md, /101|202/);
  });

  it('falls back to a generic label when a show tvdb has no master match', () => {
    const items = [{ kind: 'episode', tvdb: '999', season: 1, episode: 1, reason: 'absent' }];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /- TV show #999 — 1 episode\b/);
  });

  it('lists missing movies by title, using master lookup when the item has no title', () => {
    const items = [
      { kind: 'movie', imdb: 'tt9999', title: 'Standalone Movie', reason: 'absent' },
      { kind: 'movie', imdb: 'tt0001', reason: 'date_mismatch' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Movies the catalogue doesn't have/);
    assert.match(md, /- Standalone Movie/);
    assert.match(md, /- Movie A \(2020\)/);
  });

  it('never emits a bare "a movie" — falls back to an id, then an unidentified label', () => {
    const items = [
      { kind: 'movie', imdb: 'tt5555', reason: 'absent' },
      { kind: 'movie', tvdb: '777', reason: 'absent' },
      { kind: 'movie', reason: 'absent' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /- Movie \(imdb tt5555\)/);
    assert.match(md, /- Movie \(id 777\)/);
    assert.match(md, /- An unidentified movie \(the tool lost its title while matching\)/);
    assert.doesNotMatch(md, /- a movie\b/);
  });

  it('lists unmatched titles separately from catalogue-missing movies', () => {
    const items = [{ kind: 'movie', title: 'No Id Movie', reason: 'no_imdb_or_title_year' }];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Titles that couldn't be matched/);
    assert.match(md, /- No Id Movie/);
    assert.doesNotMatch(md, /## Movies the catalogue doesn't have/);
  });

  it('resolves watchlist items to show/movie names', () => {
    const items = [
      { kind: 'ptw-show', tvdb: '202', reason: 'absent_from_watchlist' },
      { kind: 'ptw-movie', imdb: 'zzz', reason: 'absent_from_watchlist' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Watchlist items not added/);
    assert.match(md, /- Show B/);
    assert.match(md, /- A watchlist movie \(no matching id\)/);
  });

  it('lists rewatch issues by show + episode', () => {
    const items = [
      { kind: 'episode', tvdb: '101', season: 1, episode: 3, reason: 'rewatch_play_count' },
      { showName: 'Show C', season: 2, episode: 4, reason: 'unbridged_rewatch' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Rewatches not fully recorded/);
    assert.match(md, /- Show A S1E3/);
    assert.match(md, /- Show C S2E4/);
  });

  it('shows both dates for a wrong watch date', () => {
    const items = [
      {
        kind: 'episode',
        tvdb: '101',
        season: 1,
        episode: 5,
        reason: 'date_mismatch',
        expected: '2020-01-01T00:00',
        got: '2020-01-02T00:00',
      },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Wrong watch date/);
    assert.match(md, /- Show A S1E5 — your date 2020-01-01T00:00, on the service 2020-01-02T00:00/);
  });

  it('lists lists you chose not to bring over separately, excluded from the headline count', () => {
    const items = [
      { kind: 'episode', tvdb: '101', season: 1, episode: 1, reason: 'absent' },
      { kind: 'episode', tvdb: '101', season: 1, episode: 2, reason: 'absent' },
      { kind: 'movie', imdb: 'tt9999', title: 'Missing Movie', reason: 'absent' },
      { name: 'Anime', shows: 36, movies: 9, reason: 'skipped_list_free_tier' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /`3` item\(s\) from your TV Time history aren't on Trakt/);
    assert.match(md, /## Lists you chose not to bring over/);
    assert.match(md, /- Anime \(36 shows\)/);
    assert.match(md, /Your service's free plan allows only 5 custom lists, so these weren't created\./);
  });

  it('pluralizes a single-show skipped list correctly', () => {
    const items = [{ name: 'Solo List', shows: 1, movies: 0, reason: 'skipped_list_free_tier' }];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /- Solo List \(1 show\)/);
    assert.doesNotMatch(md, /1 shows\)/);
  });

  it('summary line reports the real item count', () => {
    const items = [{ kind: 'episode', tvdb: '101', season: 1, episode: 1, reason: 'absent' }];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /`1` item\(s\) from your TV Time history aren't on Trakt/);
  });

  it('renders a reassurance summary line when summary stats are passed, omits it otherwise', () => {
    const items = [{ kind: 'episode', tvdb: '101', season: 1, episode: 1, reason: 'absent' }];
    const withSummary = renderManifest(items, master, 'Trakt', {
      matchedEpisodes: 15567,
      totalEpisodes: 15638,
      episodeCoverage: 0.9955,
      dateFidelity: 1,
    });
    assert.match(withSummary, /\*\*15567 of 15638 episodes \(99\.55%\) transferred, with 100\.00% of dates kept\.\*\*/);
    const withoutSummary = renderManifest(items, master, 'Trakt');
    assert.doesNotMatch(withoutSummary, /transferred, with/);
  });

  it('per-section guidance lines are present', () => {
    const items = [
      { kind: 'episode', tvdb: '101', season: 1, episode: 1, reason: 'absent' },
      { kind: 'movie', imdb: 'tt9999', title: 'Missing Movie', reason: 'absent' },
      { kind: 'movie', title: 'No Id Movie', reason: 'no_imdb_or_title_year' },
      { kind: 'ptw-show', tvdb: '202', reason: 'absent_from_watchlist' },
      { kind: 'episode', tvdb: '101', season: 1, episode: 3, reason: 'rewatch_play_count' },
      { kind: 'episode', tvdb: '101', season: 1, episode: 5, reason: 'date_mismatch', expected: 'x', got: 'y' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /The service's catalogue doesn't list these, so there's nothing to add them to\./);
    assert.match(md, /The tool couldn't confidently match these to a catalogue entry/);
    assert.match(md, /Add these to your watchlist by searching the service for the title\./);
    assert.match(md, /The first watch is recorded; some extra rewatch plays couldn't be added\./);
    assert.match(md, /The date on the service differs from your TV Time date/);
    assert.match(md, /TV Time counts some daily dramas as more episodes than the service lists/);
  });
});
