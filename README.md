# tvtime-migrate

Migrate a **TV Time** watch-history export into **Simkl** and **Trakt** via their APIs — preserving the per-episode watch dates that the CSV importers drop.

## Why

TV Time shuts down 2026-07-15. The web/CSV importers keep only one date per title (assumed sequential) and drop rewatch history; each service's `/sync/history` API preserves every episode's real watch date. This tool reconciles the TV Time exports into one master dataset and pushes full history to both targets via API.

TV Time's own official (GDPR) export can't drive the migration on its own: its episode timeline is empty and the dates it carries are database insert-times, not watch dates. The real per-episode watch history comes from browser-extension scrapes of the live site, with the official export used only for rewatch counts and the fields it uniquely holds.

## Status

Analysis, target research, and specs are complete — build is next.

- **Source-of-truth reconciled** — the export arrived as four overlapping dumps of differing lineage; source-of-truth is hybrid per-category (Refract per-episode spine + Rescue coverage graft + GDPR rewatch/unique fields).
- **Both targets are API-based** — Simkl `/sync/history` (PIN auth), Trakt `/sync/history` (OAuth device). The web importers were rejected (Trakt's native TV Time import is broken; CSV/JSON drop rewatch).
- **Free-tier v1 scope locked** — imports watched episodes + dates, movies, plan-to-watch, and status buckets to both; rewatch is Trakt-only (Simkl gates it behind VIP); custom lists, ratings, and comments are deferred or out of scope.

Next: build `core/` (the master dataset), then the Simkl and Trakt importers.

## Layout

```
data/{refract,gdpr,data-extractor,rescue}/   # exports, one folder per source (gitignored)
core/                                         # merge four exports → master dataset (dedup · normalize · bucket-map)
build/master.json                            # generated master dataset (gitignored)
simkl/                                        # Simkl API importer
trakt/                                        # Trakt API importer
logs/  tmp/                                   # run artifacts · scratch (gitignored)
```

## Setup

1. `nvm use` (Node ≥24).
2. `cp .env.example .env` and fill the client id(s) for the target(s) you're importing to:
   - Simkl — register an app at https://simkl.com/settings/developer/ (free, instant).
   - Trakt — register an app at https://trakt.tv/oauth/applications.
3. Run dry-run / import / verify per `package.json` scripts. Every import dry-runs before it writes, and is idempotent on re-run.

## Data

`data/` holds four overlapping exports, one folder per source (gitignored — personal watch data, read-only):

- **refract** — browser-extension scrape of the live TV Time site; the per-episode record of truth (canonical watch dates, tvdb ids, status, movies).
- **rescue** — processed from the official GDPR export; the coverage gap-filler (broadest episode/show set, fills what refract misses).
- **gdpr** — TV Time's official data export; the source for rewatch counts and unique fields, but with no usable watch timeline (see [Why](#why)).
- **data-extractor** — a second site scrape; a redundant clone of refract, dropped from the pipeline.

The master dataset built from these is PII-free by construction.
