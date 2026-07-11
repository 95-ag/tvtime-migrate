# tvtime-migrate

Move your **TV Time** watch history to **Simkl** and **Trakt** — keeping the real date you watched every episode, which the built-in CSV importers throw away.

## Why

TV Time shuts down on **2026-07-15**. Its official export and the usual CSV importers keep only one date per show and drop your rewatches. This tool reads your full TV Time history and uploads it to Simkl and/or Trakt through their APIs, so every episode keeps its actual watch date — along with movies, rewatches, plan-to-watch, and your lists.

## What you need

- **Node 24+** — run `nvm use` and it picks the right version.
- Your **TV Time export** in the `data/` folder (see [Your data](#your-data)).
- A free developer app on the service you're importing to:
  - Simkl → https://simkl.com/settings/developer/
  - Trakt → https://trakt.tv/oauth/applications

  Then `cp .env.example .env` and paste in the client id (and, for Trakt, the client secret).

## Import to Simkl

Simkl is safe to re-run at any time — it ignores anything already imported.

```
npm run build     # read your exports into one dataset
npm run auth      # sign in (enter the PIN at simkl.com/pin)
npm run dry-run   # preview what will be sent — nothing is uploaded yet
npm run import    # upload your history
npm run verify    # check what landed, and list anything that didn't
```

If `verify` flags missing anime, run `npm run franchise` then `npm run recover`, and verify again.

## Import to Trakt

Trakt does **not** ignore duplicates, so **clear your Trakt history first** (trakt.tv → Settings → your data) before importing.

```
npm run build          # read your exports into one dataset
npm run auth:trakt     # sign in (approve the code at trakt.tv/activate)
npm run dry-run:trakt  # preview — nothing is uploaded yet
npm run probe:trakt    # quick one-episode test that uploading works
npm run import:trakt   # upload history, movies, plan-to-watch, favorites, and lists
npm run verify:trakt   # check what landed, and list anything that didn't
```

If `verify` reports missing shows, these usually recover them (each explains what it's doing when you run it):
`npm run recover:trakt`, `npm run resolve:trakt`, `npm run split:trakt`.

### Copying your lists to Trakt

Trakt's free plan allows 5 custom lists. To choose which TV Time lists to bring over, copy the example and edit it:

```
cp trakt-list-plan.example.json build/trakt-list-plan.json
```

```json
{
  "keep": ["C-Drama", "C-drama minis"],
  "split": { "source": "K-drama", "cap": 250, "oldName": "K-drama Old", "newName": "K-drama New" },
  "dropped": { "name": "Dropped" }
}
```

- **keep** — lists to copy across as-is.
- **split** — split one big list into two by watch order (the oldest `cap` shows you watched go to the first list, the rest to the second). Leave it out if you don't need it.
- **dropped** — makes a list of shows you dropped. Leave it out to skip.

Any list you don't mention is left out (and noted in the run's report).

## Your data

Put your TV Time exports in `data/` — it's kept out of git, since it's your personal history. The tool reads:

- **refract** — a capture of the live TV Time site: your real per-episode watch dates (the main source).
- **rescue** — built from TV Time's official export: fills any gaps the capture missed.
- **gdpr** — TV Time's official export: rewatch counts and a few extra fields.

Nothing leaves your computer except the uploads you choose to run, and the combined dataset the tool builds contains no personal information.
