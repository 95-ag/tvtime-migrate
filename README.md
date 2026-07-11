# tvtime-migrate

Migrate a **TV Time** watch-history export into **Simkl** and **Trakt** via their APIs — preserving the per-episode watch dates that the CSV importers drop.

## Why

TV Time shuts down 2026-07-15. The web/CSV importers keep only one date per title (assumed sequential) and drop rewatch history; each service's `/sync/history` API preserves every episode's real watch date. This tool reconciles the TV Time exports into one master dataset and pushes full history to both targets via API.

TV Time's own official (GDPR) export can't drive the migration on its own: its episode timeline is empty and the dates it carries are database insert-times, not watch dates. The real per-episode watch history comes from browser-extension scrapes of the live site, with the official export used only for rewatch counts and the fields it uniquely holds.

## Status

- **`core/` complete** — reconciles the four overlapping exports (hybrid per-category source-of-truth: Refract per-episode spine + Rescue coverage graft + GDPR rewatch/unique fields) into one PII-free master dataset with row-level + id-integrity verification.
- **`simkl/` complete** — full Simkl importer: PIN auth, `/sync/history` import (episodes + per-episode dates, movies, plan-to-watch, native status buckets), an **identity-based franchise-aware verify** gate, and a **franchise recovery** step that resolves anime Simkl splits per-cour or renumbers absolutely.
- **`trakt/` complete** — full Trakt importer: OAuth device auth, `/sync/history` import (episodes + per-episode dates, movies via imdb, rewatch plays, plan-to-watch, favorites, 5 custom lists), an identity-based verify gate, and recovery for anime renumbering, stale-tvdb shows, and season-splits. Like `simkl/`, the module is **data-independent** — all account-specific config (the list plan, id maps, alt-title/season-split/id overrides) lives in gitignored `build/`, never in source.

**Both targets are API-based** — Simkl `/sync/history` (PIN), Trakt `/sync/history` (OAuth device); the web importers were rejected (Trakt's native TV Time import is broken; CSV/JSON drop rewatch). **Free-tier v1 scope:** watched episodes + dates, movies, plan-to-watch, status buckets; rewatch is Trakt-only (Simkl gates it behind VIP); custom lists/ratings/comments deferred or out of scope.

### Cross-catalog note (why anime needs extra machinery)

TheTVDB (the source ids) and Simkl organize anime differently: Simkl **splits** a franchise TheTVDB keeps under one id into separate per-cour series, uses **absolute** episode numbering, and files anime films under its anime library. The importer discovers this at run time via a **franchise episode-map** — `(tvdb season, episode) → (Simkl anime, episode)` built from Simkl's `/anime/episodes/{id}` — used by both recovery (send to the right id) and verify (check the right id). A small manual-override table (`simkl/overrides.mjs`) covers the handful of shows whose ids Simkl can't auto-resolve. The master dataset stays deliberately target-neutral (tvdb ids + episodes only).

## Layout

```
data/{refract,gdpr,data-extractor,rescue}/   # exports, one folder per source (gitignored)
core/                                         # merge four exports → master dataset (dedup · normalize · bucket-map)
build/                                        # master.json · payloads · id maps · list-plan · reports · manifests (gitignored)
simkl/                                        # Simkl importer:
  config·payload·client·manifest·auth        #   tunables · master→payload · HTTP · failure log · PIN auth
  dry-run·probe·import                        #   validate · live gate · paced commit
  franchise·overrides·recover·verify          #   identity map+cache · manual ids · gap recovery · trustworthy gate
trakt/                                        # Trakt importer:
  config·payload·favorites·lists·client·auth #   tunables · master→payload · favorites · list-plan builder · HTTP · OAuth device
  dry-run·manifest·probe·import·verify        #   validate · failure log · live gate · paced commit · identity gate
  recover·resolve-shows·season-splits         #   anime renumber · stale-tvdb by title · separate-season shows
trakt-list-plan.example.json                  # template for build/trakt-list-plan.json (committed)
logs/  tmp/                                   # run artifacts · scratch (gitignored)
```

## Setup

1. `nvm use` (Node ≥24).
2. `cp .env.example .env` and fill the client id(s) for the target(s) you're importing to:
   - Simkl — register an app at https://simkl.com/settings/developer/ (free, instant).
   - Trakt — register an app at https://trakt.tv/oauth/applications.
3. Simkl workflow (idempotent — Simkl dedups by item + watch date, so every step is safe to re-run):

   ```
   npm run build      # reconcile exports → build/master.json
   npm run auth       # Simkl PIN auth (enter the code at simkl.com/pin) → .simkl-token.json (gitignored)
   npm run dry-run    # assemble + validate the payload, no writes
   npm run probe      # GATE: 1-item live idempotency/date/anime-mapping check before any bulk send
   npm run import     # paced, chunked /sync/history commit
   npm run franchise  # build the anime franchise episode-map cache (build/franchise-map.json)
   npm run verify     # identity-based read-back gate → coverage / date-fidelity / manifest
   npm run recover    # route verify's gaps to the correct Simkl sub-anime via the franchise map
   npm run verify     # re-check
   ```

4. Trakt workflow (Trakt has **no** server-side dedup — wipe the account's history via the Trakt UI before importing, then the chunk-label state makes each step resume-safe):

   ```
   npm run build         # reconcile exports → build/master.json (shared with Simkl)
   npm run auth:trakt    # OAuth device flow (approve the code at trakt.tv/activate) → .trakt-token.json (gitignored)
   npm run dry-run:trakt # assemble + validate all payloads → build/trakt-payload.json, no writes
   npm run probe:trakt   # GATE: send 1 episode, read back, assert id/date land at minute precision
   npm run import:trakt  # paced /sync/history + watchlist + favorites + custom lists
   npm run verify:trakt  # identity read-back gate → coverage / date-fidelity / manifest
   npm run recover:trakt # re-import anime whose Trakt numbering differs from TheTVDB (epTvdb map)
   npm run resolve:trakt # re-import shows Trakt lists under a different id, by title+year (--commit to write)
   npm run split:trakt   # re-import a show's later season that Trakt catalogues as a separate show (--commit)
   ```

   **Trakt config (all account-specific, all in gitignored `build/`):**

   - `build/trakt-list-plan.json` — **required for custom lists.** Selects which TV Time lists to migrate into Trakt's 5-list free cap and how. Copy `trakt-list-plan.example.json` and edit:

     ```json
     {
       "keep": ["C-Drama", "C-drama minis"],
       "split": { "source": "K-drama", "cap": 250, "oldName": "K-drama Old", "newName": "K-drama New" },
       "dropped": { "name": "Dropped" }
     }
     ```

     `keep` — list names migrated as-is. `split` — one oversized list divided by watch order into two (earliest-watched `cap` shows → `oldName`, the rest → `newName`); omit if unused. `dropped` — name of the list built from `dropped`-status shows; omit to skip. Any master list not named in `keep`/`split` is left out (surfaced in the manifest).

   - Optional recovery overrides (created as needed, all gitignored): `trakt-alt-titles.json` (`{ "<ourTvdb>": <traktId> }` — a show Trakt lists under a wholly different title), `trakt-season-splits.json` (`[{ourTvdb, ourSeason, traktId}]`), `trakt-id-overrides.json` (`{ watchlistShows: {tvdb: traktId}, movies: {imdb: traktId} }` — so verify credits items added under a resolved id). The `*-map.json` files are generated by the recovery scripts and consumed by verify.

## Data

`data/` holds four overlapping exports, one folder per source (gitignored — personal watch data, read-only):

- **refract** — browser-extension scrape of the live TV Time site; the per-episode record of truth (canonical watch dates, tvdb ids, status, movies).
- **rescue** — processed from the official GDPR export; the coverage gap-filler (broadest episode/show set, fills what refract misses).
- **gdpr** — TV Time's official data export; the source for rewatch counts and unique fields, but with no usable watch timeline (see [Why](#why)).
- **data-extractor** — a second site scrape; a redundant clone of refract, dropped from the pipeline.

The master dataset built from these is PII-free by construction.
