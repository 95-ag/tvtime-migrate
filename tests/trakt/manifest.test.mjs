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

  it('groups missing episodes by show name (not tvdb id) with counts, most-missing first', () => {
    const items = [
      { kind: 'episode', tvdb: '101', season: 1, episode: 1, reason: 'absent' },
      { kind: 'episode', tvdb: '101', season: 1, episode: 2, reason: 'absent' },
      { kind: 'episode', tvdb: '202', season: 1, episode: 1, reason: 'absent' },
    ];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Episodes the catalogue doesn't have/);
    assert.match(md, /- Show A — 2 episode\(s\)/);
    assert.match(md, /- Show B — 1 episode\(s\)/);
    // Show A (2 missing) must be listed before Show B (1 missing).
    assert.ok(md.indexOf('Show A — 2') < md.indexOf('Show B — 1'));
    assert.doesNotMatch(md, /101|202/);
  });

  it('falls back to a generic label when a show tvdb has no master match', () => {
    const items = [{ kind: 'episode', tvdb: '999', season: 1, episode: 1, reason: 'absent' }];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /- TV show #999 — 1 episode\(s\)/);
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

  it('lists skipped custom lists with show counts', () => {
    const items = [{ name: 'Anime', shows: 36, movies: 9, reason: 'skipped_list_free_tier' }];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /## Custom lists skipped \(free-plan limit\)/);
    assert.match(md, /- Anime \(36 shows\)/);
  });

  it('summary line reports the real item count', () => {
    const items = [{ kind: 'episode', tvdb: '101', season: 1, episode: 1, reason: 'absent' }];
    const md = renderManifest(items, master, 'Trakt');
    assert.match(md, /`1` item\(s\) from your TV Time history aren't on Trakt/);
  });
});
