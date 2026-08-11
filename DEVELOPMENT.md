# Development

For working on the code. If you only want to get a log running, use the
[setup guide](https://david-chau.github.io/training-tracker/setup.html) instead —
it is browser-only and needs none of this.

Design decisions, constraints, and the traps already hit live in
[CLAUDE.md](CLAUDE.md).

## Layout

```
src/Code.gs        server logic — reads, writes, the progression rule
src/Index.html     the entire UI (a template, uses <?= ?>)
src/appsscript.json  manifest
data/build_template.py       seed data + the .xlsx generator
test/queue.test.js           pending-write queue, run with plain node
test/records.test.js         personal-record maths, run with plain node
e2e/                         Playwright, against a live deployment
e2e/targets.example.json     copy to targets.json (gitignored) and fill in
docs/              the GitHub Pages site
docs/download/training-tracker-template.xlsx   generated; what users import
```

## Pushing code with clasp

Apps Script has no local runtime, so everything is tested against a live
sheet. Use a scratch copy of a spreadsheet, never one in real use.

```bash
npm install -g @google/clasp
clasp login
```

Get the script ID from the sheet: **Extensions → Apps Script → Project
Settings → Script ID**.

Write it into a `.clasp.json` at the repo root — gitignored, since it points
at one specific person's spreadsheet:

```json
{ "scriptId": "PASTE_IT_HERE", "rootDir": "src" }
```

`rootDir` matters: the manifest and both source files live in `src/`, and
clasp pushes from wherever it is told to look.

```bash
clasp push
clasp deploy --description "initial"
```

Day to day:

```bash
clasp push --watch     # push on save
clasp open             # open the editor in a browser
```

A deployment serves the version it was created with. After `clasp push`,
either `clasp deploy` again or edit the existing deployment in the editor
(**Deploy → Manage deployments → pencil → Version: New version**), otherwise
the published URLs keep serving the old code.

## The spreadsheet template

`docs/download/training-tracker-template.xlsx` is generated, and lives under
`docs/` so GitHub Pages serves it — the setup guide links straight at it, so
there is only ever one copy. The seed exercise list and day templates live as
plain Python lists at the top of `data/build_template.py`, which is also the
only human-diffable copy of them.

```bash
python3 data/build_template.py     # stdlib only, no dependencies
```

It writes the `.xlsx` and then re-reads it, asserting the tab names, the nine
`Log` headings, and that numeric template values were written as numbers. A
failed assertion means the file would have been broken on import.

## Log schema

Nine columns. **`Code.gs` reads them by position, not by heading**, so the
order is load-bearing — changing it means changing `COL` and `WIDTH` in
`Code.gs` and `LOG` in `build_template.py` together.

```
A Date | B Day | C Exercise | D Set | E Reps / Secs | F Weight (LB) |
G RPE | H Auto note | I Notes
```

Column E is reps, or seconds for exercises flagged `time based` on the
`Exercises` tab. The unit is a property of the exercise rather than the row,
which is what keeps this at nine columns.

The other tabs are looser. `Exercises` is read A–G with the width clamped, so
a sheet predating the `image`, `no weight` or `video` columns still works;
`Templates` the same for `include in new session`. `Settings` is key/value
from A and B. `Records` is output and cleared on every rebuild.

Column H is written by the generator (`from template`, `was easy`, `repeat`,
`backed off`). Column I is the admin's free text. They are separate on
purpose.

## The demo clip

`docs/img/tablet-demo.mp4` is generated from a phone recording of a tablet,
which is kept out of the repo. It is silent — `-an`, not just muted playback.

```bash
ffmpeg -i example.mp4 -an -vf "crop=612:915:60:57,scale=540:-2" \
  -c:v libx264 -crf 30 -preset slow -pix_fmt yuv420p -movflags +faststart \
  -y docs/img/tablet-demo.mp4
```

The crop trims the desk around the tablet. `+faststart` moves the index to
the front so it starts playing before it has finished downloading.

`docs/img/tablet-demo-poster.png` is a still from it, used in the README.

{: .note }
The README cannot play the clip inline. GitHub's `media-src` CSP allows only
its own hosts — `github.com`, `*.githubusercontent.com` user uploads, and its
asset S3 bucket. Neither the Pages URL nor `raw.githubusercontent.com` is on
that list, so a `<video>` pointing at a repo file renders as nothing. Only
files uploaded through GitHub's browser attachment flow get a playable URL.
Hence the poster image, linked to the documentation home page where the clip
plays inline — a blob link works too, but lands on a download rather than a
player. The docs pages have no such restriction and use `<video>` directly.

A GIF was tried and dropped. Hand-held footage is the worst case for the
format — camera shake changes every pixel every frame, so inter-frame
compression has nothing to work with. Even cropped, at 5 fps and 64 colours,
it was 5.9 MB and visibly banded, against 1.2 MB of much better H.264. Both
GitHub and the Pages site render `<video>`, so there is no reason to carry
the GIF.

## End-to-end tests

`e2e/` drives a real deployed web app with Playwright. There is no local
server to start — Apps Script *is* the server — so the tests need a live
deployment to point at.

```bash
npm ci
npx playwright install chromium
cp e2e/targets.example.json e2e/targets.json    # then fill it in
npm run e2e
```

`e2e/targets.json` is **gitignored**: the admin URL embeds the edit key, which
is the write credential for that log. CI reads the same values from
`TT_VIEWER_URL`, `TT_ADMIN_URL`, `TT_SHEET_URL` secrets instead.

Three things are worth knowing before running them:

- **The admin specs write to the real sheet.** They work on a date five years
  out, where nothing real is ever logged, and each deletes the day it created.
  `allowWrites: false` (or `TT_ALLOW_WRITES=false`) skips them.
- **The app lives in an iframe.** Apps Script serves it inside a sandbox frame
  on a `googleusercontent` origin, so nothing is reachable from the top-level
  document. `appFrame()` finds whichever frame contains the app rather than
  hardcoding `#sandboxFrame`, which Google has renamed before.
- **A live app can be older than this repo.** Users paste the two files by hand
  and then have to redeploy. Tests for a feature the deployment lacks skip with
  a message naming it, rather than failing — a red suite for a pending deploy
  teaches you to ignore red.

`.github/workflows/e2e.yml` runs them on demand and weekly, never on push.

{: .note }
Feature-detect against the `<style>` block, not rendered markup. A class like
`.rename` only appears as an attribute once a card exists, so its absence at
bootstrap proves nothing; the stylesheet ships either way.

## Testing

`.github/workflows/checks.yml` runs all of this on every push and pull
request: both test files, a template rebuild that must produce no diff (the
build is byte-reproducible, so a diff means the committed `.xlsx` is stale),
and a check that every image the docs reference exists.

Two things run locally, neither needing a dependency:

```bash
node test/queue.test.js          # the pending-write queue
node test/records.test.js        # the personal-record maths
python3 data/build_template.py   # rebuilds and self-checks the .xlsx
```

`test/queue.test.js` pulls the real script block out of `src/Index.html`,
runs it against a stubbed DOM and a fake `google.script.run`, and drives the
queue by hand — dedupe, retry and backoff, permanent rejection, partial
results, offline deferral, and the pending-over-server overlay. It is worth
keeping honest: a bug there loses a logged set.

Everything else needs the live sheet. The manual loop, against a scratch one:

1. **Training → Delete this day** — wipe the session under test.
2. Start a **Custom** session → confirm it opens empty, that adding one
   exercise persists it, and that reloading before adding anything returns
   the Start button.
3. Pick a day type → **Start session** → confirm it builds from the template
   or from last week.
4. Change values → confirm the status bar reports the actual row number and
   the values read back out of the sheet.
5. Open the bare `/exec` URL → confirm everything is read-only.

Test any change to the steppers at 390px wide. The ± buttons have eaten the
input width before now, and `8.5` rendered as `.5`.
