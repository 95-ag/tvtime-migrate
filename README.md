# tvtime-migrate

Move your **TV Time** watch history to **Simkl** and **Trakt** — keeping the real date you watched every episode, which the built-in CSV importers throw away.

## Why

TV Time shuts down on **2026-07-15**. Its official export and the usual CSV importers keep only one date per show and drop your rewatches. This tool reads your full TV Time history and uploads it to Simkl and/or Trakt through their APIs, so every episode keeps its actual watch date — along with movies, rewatches, plan-to-watch, and your lists.

## What gets migrated

- ✅ Episodes, each with its **real watch date**
- ✅ Movies
- ✅ Plan-to-watch and watch status (watching / finished / dropped)
- ✅ Favorites and custom lists **(Trakt — up to 5 lists on the free plan)**
- ⚠️ Rewatches — **Trakt only** (Simkl keeps rewatch counts behind VIP)
- ❌ Ratings and comments are not migrated

## 1. Get your TV Time data

TV Time has no single complete export, so this tool combines three, in a `data/` folder with three subfolders. **All three are needed for a full run** (more sources = better coverage and accurate dates):

- **`data/refract/`** — the source of your real per-episode watch dates (the most important one). Install the **"TV Time Out by Refract"** Chrome extension → https://chromewebstore.google.com/detail/tv-time-out-by-refract/pmejpdpjbkjklfceogdkolmgclldogbi , run it on your TV Time profile, and put its `tvtime-*.csv` and `tvtime-*.json` files here.
- **`data/rescue/`** — fills coverage gaps the scrape misses. Convert your data at **https://vemias.com/tvtime-rescue** and save its episode and show CSVs as `episodes.csv` and `shows.csv`.
- **`data/gdpr/`** — your rewatch counts. Request the official export at **https://gdpr.tvtime.com/gdpr/self-service** (sign in with your TV Time email), and copy `rewatched_episode.csv` out of the ZIP into this folder.

Your `data/` folder should end up looking like this:

```
data/
  refract/   tvtime-series-episodes-*.csv   tvtime-series-*.csv   tvtime-movies-*.csv
             tvtime-lists-*.json   tvtime-series-*.json   tvtime-movies-*.json
  rescue/    episodes.csv   shows.csv
  gdpr/      rewatched_episode.csv
```

(`*` is whatever date the export tool puts in the filename — the tool finds them automatically. `data/` stays on your machine; it's never committed.)

## 2. Install

```
nvm use        # Node 24+
npm install
```

## 3. Register a free API app

Create an app on the service you're importing to, then `cp .env.example .env` and paste in the credentials:

- **Simkl** → https://simkl.com/settings/developer/ — copy the **Client ID** into `.env`.
- **Trakt** → https://trakt.tv/oauth/applications — set **Redirect URI** to `urn:ietf:wg:oauth:2.0:oob` and leave the permission checkboxes unticked; copy the **Client ID** and **Client Secret** into `.env`.

## 4. Import to Simkl

Simkl is safe to re-run at any time — it ignores anything already imported.

```
npm run build     # combine your exports into one dataset
npm run auth      # sign in (enter the PIN at simkl.com/pin)
npm run dry-run   # preview what will be sent — nothing is uploaded yet
npm run import    # upload your history
npm run verify    # check what landed, and list anything that didn't
```

If `verify` flags missing anime, run `npm run franchise` then `npm run recover`, and verify again.

## 5. Import to Trakt

Trakt does **not** ignore duplicates, so **clear your Trakt history first**: at https://trakt.tv/settings open the data section and remove your watched history (and watchlist/lists if you've used them). Then:

```
npm run build          # combine your exports into one dataset
npm run auth:trakt     # sign in (approve the code at trakt.tv/activate)
npm run dry-run:trakt  # preview — nothing is uploaded yet
npm run probe:trakt    # quick one-episode test that uploading works
npm run import:trakt   # upload history, movies, plan-to-watch, favorites, and lists
npm run verify:trakt   # check what landed, and list anything that didn't
```

If `verify` reports missing shows, these usually recover them (each explains what it's doing when you run it): `npm run recover:trakt`, `npm run resolve:trakt`, `npm run split:trakt`.

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
