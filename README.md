# tvtime-migrate

Move your **TV Time** watch history to **[Simkl](https://simkl.com)** or **[Trakt](https://trakt.tv)** — keeping the **real date you watched every episode**, which the usual importers throw away.

This is a small command-line tool. It's a bit more effort than a one-click import, but it's the only way to bring your history across in full (see [Why not just use their built-in import?](#why-not-just-use-their-built-in-import)).

## Why not just use their built-in import?

Simkl and Trakt both offer a TV Time / CSV import, but those lose most of your data:

- They keep only **one date per show** (assuming you watched it straight through) — every episode's real watch date is lost.
- They **drop your rewatches** completely.
- Trakt's official "import from TV Time" has been **broken** for a long time.

This tool uploads through each service's **history API** instead, which keeps **every episode's actual watch date**, plus rewatches, movies, plan-to-watch, favorites, and your custom lists.

## What it can and can't do

**Brings across:**

- Every watched episode, with its **real watch date**
- Movies
- Plan-to-watch, and watch status (watching / finished / dropped)
- Favorites and custom lists (Trakt)

**Limitations:**

- **Rewatches import to Trakt only** — Simkl keeps rewatch counts behind its paid VIP plan.
- **Custom lists:** Trakt's free plan allows **5 lists**, so you choose which ones to bring over (see [Copying your lists](#copying-your-lists-to-trakt)).
- **Ratings and comments are not migrated.**
- Only titles that exist in **Trakt/Simkl's own catalog** can be imported — a few very new or obscure shows may not be there. The tool lists everything it couldn't import, so nothing disappears silently.
- Trakt stores watch times **to the minute**, so imported dates are accurate to the minute (not the second).
- There's no single TV Time export with everything, so you gather a few files first (Step 1). This takes some patience.

## Step 1 — Back up your TV Time data (do this first)

**Request your data as early as possible** — TV Time shuts down **2026-07-15**, and exports get slow when the service is busy.

This tool combines **three** exports for the best coverage and the most accurate dates. You'll drop the files into a `data` folder (with `refract`, `rescue`, and `gdpr` sub-folders) after you download the tool in Step 2 — for now, just collect them.

**A. Official export (GDPR)** — gives your rewatch counts

1. Open the export page: **[gdpr.tvtime.com/gdpr/self-service](https://gdpr.tvtime.com/gdpr/self-service)**
2. Sign in with your TV Time email and password. *(Forgot it? Use the reset-password link on that page.)*
3. Request your personal data export, and wait for TV Time to prepare it.
4. Download the ZIP file when it's ready.
5. Open the ZIP and pull out the file **`rewatched_episode.csv`** — it goes in `data/gdpr/`.

**B. "TV Time Out by Refract" extension** — gives your real watch dates (the most important source)

1. Install **[TV Time Out by Refract](https://chromewebstore.google.com/detail/tv-time-out-by-refract/pmejpdpjbkjklfceogdkolmgclldogbi)** (Chrome or Edge).
2. Open your TV Time profile and run the extension to export.
3. The files it makes are named `tvtime-…` (for example `tvtime-series-episodes-2026-07-07.csv`) — they go in `data/refract/`.

**C. "TV Time Rescue"** — fills any gaps the extension misses

1. Go to **[TV Time Rescue](https://vemias.com/tvtime-rescue)** and convert your data.
2. Save its episode and show files as `episodes.csv` and `shows.csv` — they go in `data/rescue/`.

When you're finished, your `data` folder should look like this:

```
data/
  refract/   tvtime-series-episodes-*.csv   tvtime-series-*.csv   tvtime-movies-*.csv
             tvtime-lists-*.json   tvtime-series-*.json   tvtime-movies-*.json
  rescue/    episodes.csv   shows.csv
  gdpr/      rewatched_episode.csv
```

You don't need to rename anything — the `*` is just whatever date is in the filename. Your `data` folder stays on your computer; nothing is uploaded except the history you choose to import.

> Also handy as a spare backup (not used by this tool): the **[TV Time Data Extractor](https://chromewebstore.google.com/detail/tv-time-data-extractor/jmpoblamjmpbhnggdihhcoejomkpkgpp)** extension makes a simple CSV of your data.

## Step 2 — Install the tool

Works the same on **Windows, macOS, and Linux** — it's a small [Node.js](https://nodejs.org) program with no other dependencies.

1. **Install Node.js 24 or newer** from **[nodejs.org](https://nodejs.org)** (choose the installer for your system and accept the defaults).
2. **Download this project:** click the green **Code** button at the top of this page → **Download ZIP**, then unzip it. *(If you use git instead: `git clone` the repo.)*
3. **Open a terminal in the unzipped folder** — this is the window where you type the commands:
   - **Windows:** open the folder in File Explorer, click the address bar at the top, type `cmd`, and press Enter.
   - **macOS:** right-click the folder → *New Terminal at Folder*.
   - **Linux:** open your terminal app and `cd` into the folder.
4. **Install the tool** (one time). Type this and press Enter:

   ```
   npm install
   ```

Every step from here is a command you type into that same terminal and run with Enter.

## Step 3 — Add your data and your app login

1. **Put the files from Step 1 into a `data` folder** inside the project, in the `refract` / `rescue` / `gdpr` layout shown above.
2. **Register a free API app** on the service you're importing to, and save its login into a file called `.env`. First copy the example:

   ```
   cp .env.example .env       # macOS / Linux
   copy .env.example .env     # Windows
   ```

   Then open `.env` in any text editor and fill in:
   - **Simkl** — create an app at **[simkl.com/settings/developer](https://simkl.com/settings/developer/)**, then paste its **Client ID** into `.env`.
   - **Trakt** — create an app at **[trakt.tv/oauth/applications](https://trakt.tv/oauth/applications)**. For **Redirect URI** enter `urn:ietf:wg:oauth:2.0:oob` and leave the permission checkboxes unticked. Then paste its **Client ID** and **Client Secret** into `.env`.

## Step 4 — Import

Run these in order. The **`dry-run`** step uploads nothing — it just shows what *will* be sent, so you can check first.

### Import to Simkl

Simkl is safe to re-run at any time — it ignores anything already imported.

1. `npm run build` — combine your exports into one dataset.
2. `npm run auth` — sign in (it shows a code; enter it at **[simkl.com/pin](https://simkl.com/pin)**).
3. `npm run dry-run` — preview what will be sent (nothing is uploaded yet).
4. `npm run import` — upload your history.
5. `npm run verify` — check what landed, and list anything that didn't.
6. If `verify` flags missing anime: `npm run franchise`, then `npm run recover`, then `npm run verify` again.

### Import to Trakt

Trakt does **not** ignore duplicates, so **clear your Trakt history first**: go to **[trakt.tv/settings](https://trakt.tv/settings)**, open the data section, and remove your watched history (and your watchlist/lists if you've used them).

1. `npm run build` — combine your exports into one dataset.
2. `npm run auth:trakt` — sign in (it shows a code; approve it at **[trakt.tv/activate](https://trakt.tv/activate)**).
3. `npm run dry-run:trakt` — preview (nothing is uploaded yet).
4. `npm run probe:trakt` — a quick one-episode test that uploading works.
5. `npm run import:trakt` — upload history, movies, plan-to-watch, favorites, and lists.
6. `npm run verify:trakt` — check what landed, and list anything that didn't.
7. If `verify` reports missing shows, these often recover them (each explains itself when you run it): `npm run recover:trakt`, `npm run resolve:trakt`, `npm run split:trakt`.

## Copying your lists to Trakt

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
- **dropped** — makes a list of the shows you dropped. Leave it out to skip.

Any list you don't mention is left out (and noted in the run's report).
