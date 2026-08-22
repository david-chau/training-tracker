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
scripts/                     tools against a live deployment: doc images,
                             benchmarks, seeding, archiving — scripts/README.md
generated/                   where those tools put things to look at; gitignored
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

It writes the `.xlsx` and then re-reads it, asserting the tab names, the `Log`
headings, and that numeric template values were written as numbers. A
failed assertion means the file would have been broken on import.

## Log schema

Eleven columns. **`Code.gs` reads them by position, not by heading**, so the
order is load-bearing — changing it means changing `COL` and `WIDTH` in
`Code.gs` and `LOG` in `build_template.py` together.

```
A Date | B Day | C Exercise | D Set | E Reps / Secs | F Weight (LB) |
G RPE | H Auto note | I Notes | J Group | K Drop set
```

Column E is reps, or seconds for exercises flagged `time based` on the
`Exercises` tab. The unit is a property of the exercise rather than the row,
which is what keeps that from needing a column of its own.

Column J is the superset label: rows sharing a letter within one session are
performed back to back and shown as one card. Blank is the normal case. It
arrived after people were already logging, so `logSheet()` widens a nine-column
sheet and writes the heading on first use — blank J means "not a superset", so
that is the whole migration. Column K marks a row performed immediately after
the preceding set; consecutive marked rows form a drop-set chain.

The other tabs are looser. `Exercises` is read A–G with the width clamped, so
a sheet predating the `image`, `no weight` or `video` columns still works;
`Templates` the same for `include in new session`. `Settings` is key/value
from A and B. `Records` is output and cleared on every rebuild.

Column H is written by the generator (`from template`, `was easy`, `repeat`,
`backed off`). Column I is the admin's free text. They are separate on
purpose.

## The demo data

The links in the README point at a real log. `e2e/seed-demo.js` rebuilds its
contents:

```bash
node e2e/seed-demo.js --dry     # print the plan, touch nothing
node e2e/seed-demo.js           # rebuild every session in it
```

It needs `e2e/targets.json` for the admin URL. Each session is deleted and
rebuilt, so running it twice leaves the same data rather than doubling it.

Apps Script has no HTTP write API — `google.script.run` is only reachable from
inside the page — so this drives the UI exactly as a person would. That makes
it slow (a few minutes) and means it has to respect the app's own guards:

- **Wait for the app's signals, not for time.** `awaitLoad()` waits for the
  spinner to *appear and then go*; waiting only for it to detach races with it
  never having appeared, which lets stale cards from the previous date look
  like the new session.
- **`count()` does not wait.** Asking "is the chooser there?" before the render
  lands reads "no" when the truth is "not yet". Wait for `.choice, .addex`
  first, then ask.
- **Structural writes are refused while the queue is busy**, correctly.
  `awaitQueue()` waits for the amber bar to clear before deleting or adding.

> [!WARNING]
> Adds get slower as the log grows, because every call rescans the whole `Log`
> — not because of the `Records` tab, which adds deliberately never touch.
> That is why the timeouts here are minutes rather than seconds.

> [!NOTE]
> `scripts/seed-history.js` fills months of history behind that, session by
> session through the app's own progression rule — which is what gives the
> report and the archive something to work on. It takes about an hour for six
> months, because every call rescans the log.

## Recording the doc clips

`e2e/record-clips.js` records the short animations on the documentation pages,
one per feature, by driving the live app and converting Playwright's webm to a
GIF.

```bash
node e2e/record-clips.js            # all of them
node e2e/record-clips.js rename     # just one
```

Each clip works on the same scratch date the tests use, and the day is deleted
afterwards — in a separate browser context, so the wipe is never in frame.
`CLIP_DAY` says which day type each one used; `null` means it only reads, like
the viewer clip, and nothing is tidied.

Two things keep the files small enough to put on a page. Playwright records a
whole browser context, but most of that is scaffolding: navigating to the
scratch date, waiting on Apps Script, adding the exercise the clip is *about*.
Each clip calls `mark()` once the scene is set, and everything before that is
seeked past on conversion — 8 to 31 seconds per clip. The frame is then cropped
by `BANNER_PX` to drop Google's "created by a Google Apps Script user" strip.

> [!NOTE]
> Screen recordings are the good case for GIF — flat colour, a static
> background, a small changing region — which is why these compress to a few
> hundred KB each. Hand-held footage is the opposite: an earlier phone recording
> of a tablet came out at 39 MB as a GIF and had to ship as an MP4, which GitHub
> then refused to play in the README (its `media-src` CSP allows only its own
> hosts). Recording the app directly removed both problems, and the README shows
> a GIF inline.
> [!WARNING]
> Do not run this at the same time as the test suite. Both drive the same
> spreadsheet, and both launch browsers — running them together produced 180
> second launch timeouts and a poisoned 40 minute test run.

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
- **Chromium, not a device preset.** `devices['iPad …']` carries
  `defaultBrowserType: 'webkit'`, and the workflow installs chromium only — so
  the preset failed in CI with a bare launch timeout that named no cause. The
  config pins `browserName` and sets a tablet-sized touch viewport instead.
- **A live app can be older than this repo.** Users paste the two files by hand
  and then have to redeploy. Tests for a feature the deployment lacks skip with
  a message naming it, rather than failing — a red suite for a pending deploy
  teaches you to ignore red.

`.github/workflows/e2e.yml` runs them on demand and weekly, never on push.

> [!NOTE]
> Feature-detect against the `<style>` block, not rendered markup. A class like
> `.rename` only appears as an attribute once a card exists, so its absence at
> bootstrap proves nothing; the stylesheet ships either way.

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
