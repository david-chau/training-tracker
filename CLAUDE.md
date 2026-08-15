# Project context

Read this before changing anything. It's the accumulated context from the
design conversation — the constraints, the decisions, and the traps already
hit once.

## What this is

A workout logging app. Google Apps Script web app, backed by a Google Sheet.
One sheet per person.

**Framing is admin vs viewer, not coach vs client.** The admin link edits;
the viewer link is read-only. The admin may be a personal trainer recording
someone else's sessions, or a lifter logging their own. Docs must not assume
a trainer exists — the solo case is first-class. The original brief was the
trainer case because it is the harder one; the solo case falls out of it.

The originating trainer is **not technical**. The repo owner is doing the
building. Anything that requires a terminal, a server, or ongoing
maintenance by a non-technical admin is a non-starter.

## Hard constraints

| Constraint | Why |
|---|---|
| Must be free, no per-seat licensing | ~25 people; not a commercial product |
| No rate limits at that scale | Apps Script + Sheets handles it easily |
| Tablet-first, phone second | Entry happens mid-session, standing up |
| Entry must not require typing into cells | Too easy to mistype on a tablet |
| Must export / stay in Sheets | The sheet IS the database, not a mirror |
| Google SSO | Comes free with Apps Script |

## Why this stack, and what was rejected

- **wger (self-hosted)** — best option for many people at once, but needs a VPS the
  trainer can't run and the repo owner would have to admin indefinitely.
- **Vercel + Supabase (custom build)** — good stack, real SSO, real SQL
  analytics. Rejected once the requirements narrowed: no cross-log
  aggregation is needed, so Postgres bought nothing over Sheets.
- **Firebase** — Firestore can't do the group-by aggregation an overview
  view would need without precomputed rollups. Also no spending cap.
- **AppSheet** — fast to build, but sharing with each person needs paid
  per-user licenses.
- **Vercel/Netlify for wger** — architecturally impossible; wger is a
  stateful Django app.

Analytics were originally the priority, then the real workflow turned out
to be "look at last week, do slightly more." That reframing is what
killed the database options. If analytics come back as a requirement,
revisit Supabase.

## How the admin actually works

1. One sheet per person.
2. Looks at last week's numbers for that day type.
3. Prescribes slightly more this week. Example: chest press
   `10x20 / 8x30 / 8x35` becomes `12x25 / 10x30 / 10x35`.
4. Records RPE (1–10) for every set.
5. Only looks at the full dataset on an as-needed basis.

Step 3 is autoregulation, and it's what `progress()` in `Code.gs`
automates. The generated numbers are a **proposal** the admin overrides,
not a prescription.

## Day types

Not hardcoded. `getBootstrap()` = `Templates.day` + every distinct
`Log.Day` ever written, deduped, plus `CFG.blankDay` ('Custom') appended.
`['Push','Pull','Legs']` in that function is an empty-sheet fallback only.
Push/Pull/Legs is what the shipped template happens to contain; any split
works. Don't reintroduce a fixed list anywhere.

Removal exists now (set count 0), so the blank day defaulting to empty is a
convenience rather than a trap-avoidance measure.

`CFG.blankDay` *defaults* to starting empty. It's a default, not a rule:
the browser offers history / template / empty explicitly and the user
picks. `resolveSource(dayType, source)` maps an explicit source through,
or falls back to 'empty' for the blank day and 'auto' otherwise.

Only 'auto' chooses between history and template. Explicit 'history' and
'template' throw rather than falling back — silently building the wrong
thing is worse than an error. An empty session has no rows, so `exists`
is true only for the call that created it; adding the first exercise makes
it persist.

## Architecture

```
Google Sheet (named per person — the name is the app's heading and tab title)
├── Log        — one row per set. The only real data. 10 columns, A–J.
├── Exercises  — name | group | pattern | image | no weight | video |
│                time based. Autocomplete + optional picture URL + a flag
│                hiding the weight field + a how-to link + the unit for
│                Log column E. Both URLs http(s)-guarded. Ships 255 rows:
│                52 unweighted, 23 timed, a video search on every one.
│                No placeholder row — the name box is free text and ✎
│                renames in place, so `[Other]` was redundant.
├── Templates  — day | exercise | sets | reps | weight | include in new
│                session | group. Seeds a session; F="no" keeps a row out of
│                generation, G pairs rows into a superset. Ships 5 exercises
│                / 16 sets per day (~1hr), one "no" row per day, and one
│                paired accessory on Push, all as worked examples.
├── Settings   — key | value | help. pr_rep_targets, pr_metrics. Missing
│                keys fall back to DEFAULTS in Code.gs.
└── Records    — DERIVED OUTPUT. Rewritten wholesale; never a source.

Apps Script project (bound to the sheet)
├── Code.gs    — all server logic
└── Index.html — the whole UI, one file, no framework

Repo
├── data/build_template.py  — seed data (inline) + .xlsx generator
├── docs/                   — GitHub Pages site (just-the-docs remote theme)
│   └── download/training-tracker-template.xlsx  — generated; users import it
├── DEVELOPMENT.md          — clasp, template build, manual test loop
└── README.md               — summary + link to the Pages site, nothing else
```

### Weight is always pounds

Column F is `Weight (LB)` and stores pounds, whatever the UI shows. `lb`/`kg`
is a display toggle in the browser (`toDisplay` / `toPounds`), kept in
`localStorage` per device — not in the sheet, because it is a property of the
machine in front of you. Stepping happens in the displayed unit so kg lands
on clean 2.5s. Don't store kg, and don't add a per-row unit column: records
and progression compare column F against itself.

### Log columns (order matters — code reads by index, not header name)

```
A Date | B Day | C Exercise | D Set | E Reps / Secs | F Weight (LB) |
G RPE | H Auto note | I Notes | J Group
```

Column E is reps, or seconds when the exercise is flagged `time based` on
the Exercises tab. The unit is a property of the exercise, not the row —
deliberately, to avoid a tenth column and a migration for every live sheet.
Don't add a per-row unit column.

There is no separate target/done pair — the row is overwritten as the set is
logged, so it holds what actually happened. Column H is written by the
generator (`from template`, `was easy`, `repeat`, `backed off`). Column I is
the user's note. Don't merge them.

Column J is the superset label — a single letter shared by every row of every
exercise in one group, scoped to one session, blank for a normal exercise.
`setGroup()` is its only writer. Membership is by label, not adjacency: rows
are appended in the order they were added, so an exercise added later has to
be able to join a pair logged above it. It arrived after people were logging,
so `logSheet()` widens a nine-column sheet and writes the heading — blank J
means "not a superset", which is the whole migration.

Changing this layout means changing `COL` and `WIDTH` in `Code.gs` **and**
`LOG` in `data/build_template.py` together.

### Progression rule (`progress()`)

Per set, from that set's RPE:

- `<= 6.5` → +2 reps, +5 lb
- `7 – 8.5` → +2 reps, same weight
- `9 – 9.5` → repeat
- `10` → -2 reps, -5% weight

Blank RPE is treated as 8 (conservative middle) so a forgotten entry never
produces a wild jump. Tunable via `CFG` at the top of `Code.gs`.

`progress(set, noWeight, timed)` — `noWeight` keeps the rep changes but
passes weight through untouched, or an easy set of push-ups prescribes 5 lb
of push-up. `timed` swaps `CFG.repStep` (2) for `CFG.timeStep` (5), because
+2 seconds on a plank is not a session. The two are independent: a farmer
carry is timed *and* loaded. `fromHistory` looks both up by lowercased name
via `noWeightLookup()` / `timedLookup()`.

### Read-only mode

`doGet` compares `?key=` against `EDIT_KEY` in script properties. Writes
call `assertEdit(k)` server-side — hiding buttons is not the mechanism.

**`google.script.run` can call any global in the project**, not just the ones
the page happens to use. So every function that writes takes the key and calls
`assertEdit` itself, including the ones only a menu item invokes — menu code
runs as the owner and passes `editKey()`. A new writer that takes only plain
arguments is reachable by anyone holding the viewer link. The exceptions are
functions whose first argument is a live `Sheet` (unreachable across the
bridge) and `archiveSessions`, which throws outside a container UI.
Admin gets `…/exec?key=…`, viewers get bare `…/exec`.

### One card at a time

`paginate()` turns the session into pages — one exercise, or one superset.
Every page is rendered and all but the current one hidden; don't "optimise"
this into building the current page on demand. Cards hold live values,
`onChange` hooks and queue watchers, and re-creating one to switch pages
throws those away. A superset renders round by round (set 1 of each, then set
2), which is the order it is performed in.

## Traps already hit — don't reintroduce

- **Writes appearing to succeed but not landing.** Apps Script batches
  writes. `SpreadsheetApp.flush()` is required before returning. `saveSet`
  also reads the cell back and returns the actual value so the browser can
  prove the save landed.
- **`null` across `google.script.run`** is unreliable. Blank RPE travels as
  the sentinel `-1` (`BLANK_RPE`), never `null`.
- **Sheets sidebar steals keyboard focus** on desktop — typing into a
  sidebar input can land in the spreadsheet grid instead. Inputs claim
  focus on `mousedown` and stop `keydown` propagation. The deployed
  `/exec` URL doesn't have this problem; the sidebar is a test harness only.
- **Number fields clipping** (`8.5` rendering as `.5`). The ± buttons were
  eating the width. Buttons are fixed-width with a `min-width` floor on the
  input. Test any stepper change at 390px wide.
- **Notes losing text on blur.** Now saves three ways: explicit button,
  1.5s debounce while typing, and blur.
- **`lastByExercise()` returns values, not a string.** The browser renders
  last time under each field (`was 12`), so it needs `{reps, weight, rpe}`
  per set. Don't fold it back into one line.
- **"Last time" is per exercise, not per session.** It was keyed to the
  previous session of the same day type, which only works if every session
  repeats the last one. Skip a movement for a week, do it on another day, or
  add it mid-cycle and there was no comparison at all. Records were always
  per exercise; the two now agree. Sheet order is not date order, so the
  lookup never lets an earlier date overwrite a later one.
- **Row indices go stale** after add/remove. Every mutation returns a fresh
  `loadSession()` rather than patching client state.
- **Queued writes are addressed by row, and rows move.** `writeSet` verifies
  all of A–D (date, day, exercise, set) before writing. Exercise + set alone
  is NOT unique — the same "bench set 2" exists for every week logged, so a
  shifted row would pass and eat a write meant for another date. A mismatch
  is a permanent reject, never a retry. Structural ops (`setSetCount`,
  `addExercise`, `deleteSession`) are blocked client-side while the queue is
  non-empty, for the same reason.
- **An optimistic add has no row numbers yet.** The card renders before the
  server has appended anything, so its sets carry `row: 0`. `queueSave` marks
  those dirty instead of queueing — there is nothing to address — and
  `absorbAdd` moves the values onto the real rows and queues them when the
  response lands. `S.adding` blocks day, date and structural changes for the
  same reason the queue does, with a 25s guard that reloads rather than
  leaving the page wedged.
- **`localStorage` in the Apps Script iframe is best-effort.** The page is
  sandboxed `googleusercontent.com`; browsers may partition or block framed
  storage. Feature-detected, never assumed. Durability across a dropped
  connection comes from the in-memory queue; `localStorage` only adds
  surviving a reload, and `beforeunload` covers the rest. Don't promise more
  than that in the docs.
- **`ScriptApp.getService().getUrl()` is not trustworthy.** From a menu
  handler it returns the `/dev` URL (owner-only) or the `/exec` URL of a
  deployment that has since been replaced — which opens as "Sorry, unable to
  open the file at present". The real URL is pasted once and kept in
  `WEB_APP_URL`; `getUrl()` is only a fallback, and only when it matches
  `EXEC_URL`. Don't "simplify" this back to deriving the URL.
- **Day types differ by role.** Admin sees Templates + logged + blank day;
  a viewer sees only logged days. Templates and the blank day are entry-time
  concepts, and offering them read-only yields buttons that always answer
  "nothing logged". `getBootstrap(k)` takes the key for this reason.
- **Links must never navigate the app away.** `<base target="_blank">` is
  the backstop and anchors set `target`/`rel` themselves. The pending-write
  queue lives in memory; leaving the page can take it. It was `_top`.
- **Dates use the spreadsheet's time zone, not the script's.**
  `appsscript.json` ships a fixed `timeZone` and pasting the code into a
  project does not change it, so `Session.getScriptTimeZone()` is whatever
  this repo happened to commit. `logTimeZone()` prefers
  `getSpreadsheetTimeZone()` and falls back. An evening session under the
  wrong zone lands on the previous day, silently.
- **The add form's toggles only write flags for a NEW name.** Reps/Seconds and
  Weighted/Bodyweight follow the `Exercises` tab for a known exercise and say
  so; an explicit pick changes this session's rows and, for a name the tab has
  never seen, the row it appends (`rememberExercise(name, timed, noWeight)`).
  An existing exercise keeps its flags — fix those on the tab, or rename.
- **Structural writes are optimistic and debounced, not blocking.** Adding an
  exercise, pairing a superset and changing a set count all render at once and
  write behind it (`S.adding`, `S.working`, `S.resize`). Each round trip is
  seconds on gym wifi, and a dimmed page with a status line reads as a freeze —
  which is exactly what got reported. New rows carry `row: 0` until the server
  answers; `absorbAdd` / `absorbResize` move anything typed onto the real rows.
- **Every card has to answer `CAN_EDIT` for itself.** `card()` returns a
  read-only branch early; `supersetCard()` shipped without one and gave
  viewers a working note box and no set counts. The write was refused
  server-side, so typing looked like it worked and then did not. Any new card
  type needs the same branch.
- **`Index.html` is a template**, not static HTML. It uses `<?= canEdit ?>`
  and must be rendered with `createTemplateFromFile`.
- **Setup is browser-only.** Import the `.xlsx`, paste the two files into the
  Apps Script editor, deploy. `clasp` is a developer convenience and must
  never become a prerequisite in the user-facing docs.
- **The `.xlsx` template is generated, and there is exactly one copy** of it,
  under `docs/download/` so Pages serves it. Don't add a second under `data/`.
  Seed data lives inline in `data/build_template.py` — the `.tsv` files it
  used to read are gone.

## Personal records

Derived, never stored. `computeRecords(rows, cfg, skip)` is deliberately
free of SpreadsheetApp so it stays testable — keep it that way.

- `skip` excludes the session being viewed. Without it today's first set
  becomes the bar for today's second and nothing ever reads as a PR.
- The ★ is judged in the browser (`isPr()`), not shipped per set, so it
  updates as a value is typed.
- `refreshRecords()` runs on the menu item, `deleteSession` and archiving —
  NEVER on `saveBatch`, `addExercise`, `setSetCount`, `renameExercise` or
  `generateInto`. A rebuild is a whole-sheet scan plus a tab rewrite, so it
  gets slower as the log grows, and it was hanging off the one thing an admin
  does mid-session standing at a machine. Nothing in the app reads that tab.
  It also swallows its own errors: a failed rendering must not cost someone
  their logged set.
- `Records` tab is output. Anything typed there dies on the next rebuild.

## The report

`reportData(rows, timed, from, to)` is pure and testable, like `computeRecords`;
either bound may be blank. `reportSummary(k, from, to)` returns the numbers and
the browser draws them
(`reportView`) — that is the one place in the app that builds markup from
spreadsheet values, so everything sheet-derived goes through `esc()`.

**The PDF is the app's own page, printed.** There was a second implementation
that wrote a `Report` tab with live charts and handed back Sheets' own
`/export?format=pdf` URL; it was deleted in favour of this one, which looks
the same on paper as it does on screen and needs no access to the spreadsheet
to produce. Don't rebuild it. What that means for the print rules:

- `@media print` in `Index.html` is load-bearing, not decoration. It hides the
  session, un-modals the report and keeps background colours — browsers drop
  those by default, which took the bars, the chips and the day headers.
- Day cards print two across (`.daygrid`), as **columns, not a grid**. One
  column spilled a fourth card onto an otherwise blank second page; a grid
  fixed that until the rows grew, at which point a row too tall for the
  remaining page moved whole and left half a page blank. Multicol keeps
  filling.
- Chart bar heights are percentages. Pixels were sized against the 120px
  on-screen chart and overflowed the shorter print one, onto its own heading.
- `window.print()` inside the sandbox iframe prints *that frame*, so it
  paginates. Printing the top document instead clips at the iframe's height —
  which is what `page.pdf()` does, so a Playwright capture is not evidence
  about the real thing unless it renders the frame standalone.

Asking for a period never means losing sight of the whole log: the totals and
averages cards each carry an all-time line, and `reportData` returns
`lifetime` for it — the same aggregation re-run over every row, which it was
already doing for the per-exercise lifetimes. Both are null with no period,
because they would be the same numbers twice.

Each exercise row carries the period's range and, where it is wider, the
all-time one. Two numbers because one invites reading a good month as a
personal best.

`REPORT_ROWS` (12) caps the rows per day card, with the remainder counted on a
line beneath. Not only for length: a day card taller than the page cannot be
placed at all — `break-inside:avoid` sends it to the next page and leaves the
current one blank below the summary. 204 exercises was 7 pages with an empty
first one; it is 3 full ones now.

The chart is two lines over percentage-placed points, with the polylines the
only SVG (`preserveAspectRatio="none"` plus `vector-effect="non-scaling-stroke"`,
so they stretch without the strokes stretching). Volume and sessions each get
their own band — top half and bottom quarter — because on a good week both sit
near their own maximum and a shared height put a session marker through a
volume label. Past 24 points `byMonth()` rolls the series up to one point per month and the
card retitles itself — 50 weekly points cannot be labelled and read as texture.
A week counts towards the month its Monday is in; splitting a week across two
months would be worse than the rounding.

Long periods label only some weeks, and past 14 points only the labelled ones
keep a marker (`.chart.dense`) — at 50 weeks the dots merge into a bead chain
with the line buried under it. A label is never placed within `every` of the
last week, which is what stopped the final date printing over its neighbour.
Every week is still plotted either way. Checked at 12, 26, 50 and 104 weeks
with `generated/weeks.js`.

`reportPeriod(count, unit, from, to)` turns the panel into those two bounds —
days / weeks / months / years counted back from today, or an explicit range,
which wins when either date is set and is swapped if typed backwards. It is
separate from the panel so it can be tested without building one.

**The report shares one stylesheet with the app, and has taken an app class
name twice.** `.bar` (the fixed status bar) made chart bars `position:fixed`
and hid them from print; `.sess` (the previous/next session button) gave
session markers its border and background. `queue.test.js` now fails on any
report element wearing a name from that list — add to it rather than
rediscovering this a third time.

Volume is reps × weight and deliberately 0 for timed work; bodyweight sets
count as sets with no volume. Both still count as sessions.

## Speed, and why archiving exists

Every load reads the whole `Log` — no index, no cache, nothing to fall out of
step with the sheet. Measured on the demo log, three cold runs each:

| Rows | Open | Load a session | Build the report |
|---|---|---|---|
| ~230 | ~7s | ~3s | ~4s |
| ~1,800 | ~15s | ~19s | ~10s |

Loading a session is the one that hurts: it is what someone waits for between
sets. This is the reason the scheduled archive exists, and the reason to
resist adding anything else that scans the log on a hot path.

## Known gaps

- Removing an exercise is `setSetCount(..., 0)` — same path as shrinking,
  no separate delete. Don't add one.
- Partial offline only. Edits to an open session queue and replay; starting
  a session, adding an exercise and set counts still need the server,
  because rows are server-assigned.
- No roster view across logs. Deliberate — not needed yet.
- Weights seed at 0 from templates, and `+2 reps, same weight` keeps 0 at
  0 forever. Real weights must be entered once per exercise.
- Archiving is one-way: it writes a new spreadsheet named
  `<log>_<from>_<to>` with `Log` + `Records` tabs, then rewrites the source
  `Log` without those rows. Records are derived, so archiving removes those
  bests from the live app — the archive keeps its own copy. Nothing merges an
  archive back.
  `archivePlan(raw, cutoff)` decides, `runArchive(k, cutoff)` does, and both
  `archiveSessions` (menu) and `autoArchive` (weekly trigger, opt-in via
  `archive_after_months`) go through them. `runArchive` reads the archive back
  and compares row counts before deleting anything.
  **`autoArchive` cannot take an edit key** — a trigger passes an event, not
  arguments — so it checks `e.triggerUid` against `ScriptApp.getProjectTriggers()`
  instead. That id is never sent to a page, so the bridge has nothing to pass.
  Every other new writer (`runArchive`, `putSetting`, `noteArchiveRun`) takes
  the key and calls `assertEdit`.

## Testing

No test suite for the Apps Script side — no local runtime. Two automated
checks exist for the parts that can run locally, both stdlib-only:

- `node test/queue.test.js` — the pending-write queue out of `Index.html`,
  run against a stubbed DOM. Covers dedupe, retry, rejection, partial
  results, offline, and the overlay. Run it after touching anything in the
  queue; it is the only thing standing between a wifi drop and a lost set.
- `node test/records.test.js` — `computeRecords`/`recordRows` loaded from
  `Code.gs` in a vm. Note: `const` declarations do not land on the sandbox
  global, and arrays built in the vm fail `deepStrictEqual` on prototype —
  both worked around at the top of that file.
- `python3 data/build_template.py` — re-reads the `.xlsx` it just wrote and
  asserts tab names, the nine `Log` headings, and numeric typing.

Manual loop:

1. Training → Delete this day (wipes the session under test)
2. Pick day type → Start session → verify it builds from template or
   last week
3. Change values → confirm the status bar reports the actual row and
   values written
4. Open the bare `/exec` URL → confirm everything is read-only
