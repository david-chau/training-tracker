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

`CFG.blankDay` always starts empty and **never** carries the previous
session forward — there's no way to remove an unwanted exercise, so
inheriting would trap the user. An empty session has no rows, so `exists`
is true only for the call that created it; adding the first exercise makes
it persist.

## Architecture

```
Google Sheet (named per person — the name is the app's heading and tab title)
├── Log        — one row per set. The only real data. 9 columns, A–I.
├── Exercises  — name | group | pattern | image | no weight. Autocomplete +
│                optional picture URL (http(s) only) + a flag hiding the
│                weight field. Grows on use. Ships 256 rows including the
│                `[Other]` placeholder and 52 unweighted ones.
├── Templates  — day | exercise | sets | reps | weight | default. Seeds a
│                first session; F="no" keeps a row off the default form.
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

### Log columns (order matters — code reads by index, not header name)

```
A Date | B Day | C Exercise | D Set | E Reps | F Weight (LB) | G RPE
H Auto note | I Notes
```

There is no separate target/done pair — the row is overwritten as the set is
logged, so it holds what actually happened. Column H is written by the
generator (`from template`, `was easy`, `repeat`, `backed off`). Column I is
the user's note. Don't merge them.

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

`progress(set, noWeight)` — when `noWeight`, the rep changes are identical
but weight passes through untouched. Otherwise an easy set of push-ups
prescribes 5 lb of push-up. `fromHistory` looks the flag up by lowercased
name via `noWeightLookup()`.

### Read-only mode

`doGet` compares `?key=` against `EDIT_KEY` in script properties. Writes
call `assertEdit(k)` server-side — hiding buttons is not the mechanism.
Admin gets `…/exec?key=…`, viewers get bare `…/exec`.

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
- **`snapshot()` returns values, not a string.** The browser renders last
  week under each field (`was 12`), so it needs `{reps, weight, rpe}` per
  set. Don't fold it back into one line.
- **Row indices go stale** after add/remove. Every mutation returns a fresh
  `loadSession()` rather than patching client state.
- **Queued writes are addressed by row, and rows move.** `writeSet` verifies
  all of A–D (date, day, exercise, set) before writing. Exercise + set alone
  is NOT unique — the same "bench set 2" exists for every week logged, so a
  shifted row would pass and eat a write meant for another date. A mismatch
  is a permanent reject, never a retry. Structural ops (`setSetCount`,
  `addExercise`, `deleteSession`) are blocked client-side while the queue is
  non-empty, for the same reason.
- **`localStorage` in the Apps Script iframe is best-effort.** The page is
  sandboxed `googleusercontent.com`; browsers may partition or block framed
  storage. Feature-detected, never assumed. Durability across a dropped
  connection comes from the in-memory queue; `localStorage` only adds
  surviving a reload, and `beforeunload` covers the rest. Don't promise more
  than that in the docs.
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
- `refreshRecords()` runs on structural writes and the menu only — NEVER on
  `saveBatch`. A rebuild is a whole-sheet scan plus a tab rewrite; putting
  it on the save path taxes every tap. It also swallows its own errors: a
  failed rendering must not cost someone their logged set.
- `Records` tab is output. Anything typed there dies on the next rebuild.

## Known gaps

- No way to remove a single exercise from a session (only set count → 1,
  or edit the sheet).
- Partial offline only. Edits to an open session queue and replay; starting
  a session, adding an exercise and set counts still need the server,
  because rows are server-assigned.
- No roster view across logs. Deliberate — not needed yet.
- Weights seed at 0 from templates, and `+2 reps, same weight` keeps 0 at
  0 forever. Real weights must be entered once per exercise.
- Nothing removes a person's data or archives old sessions.

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
