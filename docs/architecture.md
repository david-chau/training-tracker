---
title: Architecture
nav_order: 5
---

# Architecture
{: .no_toc }

How the app is put together, and why it is put together that way. Written for
someone about to change the code.

1. TOC
{:toc}

---

## Where it lives in Google Workspace

There is no server, no hosting bill and no deploy pipeline. Every moving part
is something Google already runs for you:

```
  GOOGLE DRIVE (the admin's Google account)
  ╔══════════════════════════════════════════════════════════════════╗
  ║                                                                  ║
  ║   ┌────────────────────────────────┐                             ║
  ║   │  Google Sheet                  │   the database              ║
  ║   │  "Training — Jane Doe"         │                             ║
  ║   │                                │                             ║
  ║   │   Log         every set ever   │                             ║
  ║   │   Exercises   autocomplete     │                             ║
  ║   │   Templates   first session    │                             ║
  ║   └───────────────┬────────────────┘                             ║
  ║                   │ bound to                                     ║
  ║                   ▼                                              ║
  ║   ┌────────────────────────────────┐                             ║
  ║   │  Apps Script project           │   the application           ║
  ║   │                                │                             ║
  ║   │   Code.gs      server logic    │                             ║
  ║   │   Index.html   the whole UI    │                             ║
  ║   └───────────────┬────────────────┘                             ║
  ║                   │ Deploy → Web app                             ║
  ╚═══════════════════╪══════════════════════════════════════════════╝
                      │
                      ▼
        https://script.google.com/…/exec        served by Google,
                      │                          runs as the owner
        ┌─────────────┴─────────────┐
        ▼                           ▼
   ?key=a1b2c3…                  (no key)
   admin, read/write               viewer, read only
```

**Bound, not standalone.** The script belongs to that one spreadsheet.
`SpreadsheetApp.getActive()` therefore needs no ID, no credentials and no API
call — it is simply the sheet the script lives in. That is also why every
person needs their own copy of the whole thing.

**Executes as the owner.** The deployment runs under the account that
published it, so the app can write to the sheet on behalf of a visitor who has
no access to the spreadsheet at all. Viewers never appear in the sharing
dialog.

---

## The two files

```
  BROWSER                          │  GOOGLE'S SERVERS
                                   │
  Index.html                       │  Code.gs
  ─────────────                    │  ────────────
  one page, no framework,          │  doGet(e)
  no build step, no npm            │    ├─ reads ?key=
                                   │    └─ renders Index.html
    ┌──────────────────┐           │       with canEdit / editKey
    │ render()         │           │
    │ card()           │           │  getBootstrap()   day types, exercises
    │ setRow()         │           │  listDates()      sessions that exist
    │ stepper()        │           │  loadSession()    one day's sets
    │ noteField()      │           │  ─────────────────────────────────
    └────────┬─────────┘           │  saveSet()        ┐
             │                     │  setSetCount()    │ all call
             │ google.script.run   │  saveNote()       │ assertEdit(k)
             ├────────────────────▶│  addExercise()    │ first
             │                     │  deleteSession()  ┘
             │◀────────────────────┤
             │   plain JS objects  │  progress()       the progression rule
                                   │
```

`google.script.run` is Apps Script's RPC bridge: call a server function by
name from the page, get the return value in a callback. No REST API, no
routing, no serialisation code to write.

{: .warning }
`Index.html` is a **template**, not static HTML. It contains `<?= canEdit ?>`
and must be rendered with `createTemplateFromFile`, never `createHtmlOutput`.

---

## The sheet

`Log` is the only real data. The other two tabs are inputs to it.

```
   Log        the record — one row per set
   ┌────┬─────┬──────────┬────┬─────┬────────┬─────┬──────────┬───────┐
   │ A  │  B  │    C     │ D  │  E  │   F    │  G  │    H     │   I   │
   │Date│ Day │ Exercise │Set │Reps │Weight  │ RPE │Auto note │ Notes │
   │    │     │          │    │     │  (LB)  │     │          │       │
   ├────┼─────┼──────────┼────┼─────┼────────┼─────┼──────────┼───────┤
   │8-09│Push │Bench     │ 1  │ 12  │  25    │ 8   │          │ elbow │
   │8-09│Push │Bench     │ 2  │ 10  │  30    │ 9   │ repeat   │ elbow │
   └────┴─────┴──────────┴────┴─────┴────────┴─────┴──────────┴───────┘
          │                          ▲                  ▲        ▲
          │                          │                  │        │
          │            what actually happened     written by  written by
          │            (the row is overwritten     progress()  the admin
          │             as the set is logged)
          │
   Exercises  ┌──────────┬───────┬─────────┐
              │ exercise │ group │ pattern │  autocomplete source;
              └──────────┴───────┴─────────┘  grows when a new name is used

   Templates  ┌─────┬──────────┬──────┬──────┬────────┐
              │ day │ exercise │ sets │ reps │ weight │  first session only;
              └─────┴──────────┴──────┴──────┴────────┘  `day` also defines
                                                         the day-type buttons
```

{: .warning }
`Code.gs` reads columns **by position**, not by heading — `COL.reps` is
literally index 4. Reordering or inserting a column silently corrupts every
read. Change `COL` and `WIDTH` in `Code.gs` and `LOG` in
`data/build_template.py` together, or not at all.

Columns H and I are both notes and are deliberately separate: H is machine
output, I is human input. Merging them means the generator would overwrite
what the admin wrote.

---

## Starting a session

The only branch that matters in the whole app:

```
                  admin taps "Start <day> session on 2026-08-09"
                                     │
                                     ▼
                       loadSession(day, date, create=true)
                                     │
                             assertEdit(key)
                                     │
                        ┌────────────┴────────────┐
                        │  day === CFG.blankDay?  │
                        └────────────┬────────────┘
                              yes    │    no
              ┌──────────────────────┘    └───────────────┐
              ▼                                           ▼
      write nothing.                        ┌─────────────────────────┐
      exists = true for this                │ any earlier <day> on    │
      call only, so the UI                  │ record?                 │
      renders "+ Add exercise"              └────────────┬────────────┘
      with no cards                            yes       │       no
              │                        ┌─────────────────┘└──────────────┐
              │                        ▼                                 ▼
              │                fromHistory()                     fromTemplate()
              │                most recent <day>,                Templates tab,
              │                progress() per set                sets × rows,
              │                                                  "from template"
              │                        └────────────┬────────────┘
              │                                     ▼
              │                        append rows to Log, flush()
              └──────────────────────┬──────────────┘
                                     ▼
                        re-read and return the session
```

Rows are written to the sheet **before** the admin touches anything. The
proposal is data from the moment it appears, which is why there is no separate
"save session" step and no unsaved state to lose.

Day types are not a fixed list. `getBootstrap()` builds them from the
`Templates` tab plus every distinct value ever written to the `Log` tab's
`Day` column, deduped, with `CFG.blankDay` appended. The `['Push', 'Pull',
'Legs']` in that function is a fallback for a completely empty sheet, not a
schema.

The blank day is the one case with no persistent representation: an empty
session has no rows, so "started" cannot be read back off the sheet. `exists`
is therefore true only for the call that created it. Adding one exercise
writes rows and makes it real; reloading before that returns to the Start
button. Recording emptiness would mean either a placeholder row or a second
place to keep state, and neither is worth it for a session with nothing in it
yet.

---

## The progression rule

`progress()` runs per set, on that set's own RPE. One barbell row set at 9 and
the next at 6.5 progress differently — the exercise is not treated as a unit.

```
      RPE          reps        weight        auto note
   ──────────   ─────────   ────────────   ─────────────
    ≤ 6.5         + 2         + 5 lb       "was easy"
    7 – 8.5       + 2          same        (blank)
    9 – 9.5       same         same        "repeat"
    10            − 2          − 5 %       "backed off"

    blank    →  treated as 8 (CFG.defaultRpe)
    weight   →  rounded to nearest 2.5 (CFG.roundTo)
    reps     →  floored at 1
```

Blank RPE resolving to 8 is a safety property, not a convenience: a forgotten
entry produces the dullest possible outcome rather than a wild jump.

The thresholds, steps and rounding are all in `CFG` at the top of `Code.gs`.

{: .note }
`+2 reps, same weight` leaves a weight of 0 at 0 forever. Templates seed
weights at 0, so the real number has to be typed in once per exercise. This is
a known and accepted gap — see below.

---

## Saving a value

Two traps shape this path. Apps Script batches writes, so a write can appear
to succeed and never land — hence the read-back. And gym wifi drops mid-set,
so nothing is sent directly: every edit is queued first and replayed until the
sheet confirms it.

```
  admin taps [+] on a weight
        │
        │  the number on screen changes immediately
        ▼
  enqueue({kind:'set', row, date, day, exercise, set, reps, weight, rpe})
        │
        │  keyed by row, so holding [+] down leaves ONE entry, not fifteen
        ▼
  ┌───────────────────────────────┐
  │ PEND.items  (+ localStorage)  │◀── reloaded on next page load
  └───────────────┬───────────────┘
                  │ 600 ms debounce · retry with backoff to 30 s
                  │ also fires on: online event, tab refocus, Retry now
                  ▼
        navigator.onLine === false ? ──yes──▶ hold, repaint, wait
                  │ no
                  ▼
  google.script.run.saveBatch(key, [items])   one round trip for the lot
        │                                     20 s timeout — the bridge can
        │                                     hang rather than fail
        ▼  ┌──────────────────────────────────────────────┐
           │ assertEdit(key)            ← server-side     │
           │ per item, independently:                     │
           │   verify A–D still match (date, day,         │
           │     exercise, set) ── mismatch ▶ {ok:false}  │
           │   range(row, E:G).setValues(...)             │
           │   SpreadsheetApp.flush()   ← forces the write│
           │   read range.getValues()   ← reads it BACK   │
           └────────────────────┬─────────────────────────┘
                                ▼
              per-item verdicts, in the order sent
                                │
        ┌───────────────────────┼───────────────────────┐
        ▼                       ▼                       ▼
   {ok:true}               {ok:false}              no verdict
   drop from queue         drop + tell the         leave queued,
                           user, reload            send again
                                ▼
  status bar: "Saved row 14: 12 x 25 @ RPE 8"
              └──────────────┬─────────────┘
                    these are the sheet's values, not the browser's
```

The bottom bar is a receipt, and it is also the honest answer to "is my
session safe to close". While anything is outstanding it turns amber and reads
*"3 changes not saved yet"*, with a **Retry now** button; `beforeunload` warns
if the tab is closed in that state. Notes go through the same queue, keeping
their three triggers — the **Save note** button, a 1.5 s debounce, and blur.

### Why the queue verifies four columns

A queued write is addressed by row number, and row numbers move — deleting a
day or shrinking a set count shifts everything below. Checking that the row
still holds the expected exercise and set number is **not** enough, because
the same "bench press, set 2" exists for every week ever logged; a shifted row
could pass that test and swallow a write meant for a different date. So
`writeSet` compares all of A–D, and a mismatch is a permanent rejection rather
than a retry.

For the same reason, adding or removing sets, adding an exercise and deleting
a day are all refused while the queue is non-empty. Those operations move rows
out from under queued writes, and the honest fix is to drain first rather than
race.

{: .note }
Blank RPE crosses the bridge as the sentinel `-1` (`BLANK_RPE`), never `null`.
`null` through `google.script.run` is unreliable and arrives as `undefined` or
not at all.

{: .warning }
`localStorage` is best-effort here. The page runs in a sandboxed
`googleusercontent.com` iframe, and browsers may partition or block storage
for framed content — so surviving a **reload** is not guaranteed, and is
feature-detected rather than assumed. Surviving a dropped connection does not
depend on it: that queue lives in memory, and the unload warning covers the
gap.

---

## Permissions

```
   URL                       canEdit    what happens
   ───────────────────────   ───────    ─────────────────────────────
   /exec?key=<EDIT_KEY>       true      buttons rendered, writes pass
   /exec                      false     read-only view, writes throw
   /exec?key=wrong            false     read-only view, writes throw

   ┌──────────────────────────────────────────────────────────────┐
   │  doGet()          decides what the page LOOKS like           │
   │  assertEdit(k)    decides what the page can DO               │
   └──────────────────────────────────────────────────────────────┘
        every write function calls assertEdit() as its first line
```

Hiding buttons is presentation. The guarantee is `assertEdit(k)` at the top of
`saveSet`, `setSetCount`, `saveNote`, `addExercise`, `deleteSession`, and
`loadSession` when `create` is true. A viewer who opens the console and calls
the function directly gets `Read-only view — changes are not saved.`

`EDIT_KEY` is a 16-character UUID fragment generated on first use and kept in
script properties. Deleting the property rotates the key; the viewer URL is
unaffected.

The threat model is deliberately small: this is a training log, the admin
controls distribution of one link, and the cost of a leak is one rotated key.

---

## Scaling to many logs

One person tracking their own training needs exactly one installation. A
trainer with twenty-five people has twenty-five of them — identical and fully
independent. There is no multi-tenancy anywhere in the design.

```
   Jane          Marcus         Priya            each is:
   ┌────┐        ┌────┐        ┌────┐              · one Sheet
   │Sheet│       │Sheet│       │Sheet│             · one bound script
   │  +  │       │  +  │       │  +  │             · one deployment
   │Script│      │Script│      │Script│            · its own EDIT_KEY
   └──┬─┘        └──┬─┘        └──┬─┘
      │             │             │              nothing shared,
      ▼             ▼             ▼              nothing to sync,
   2 links       2 links       2 links           nothing to migrate
```

The cost of that is real: a code change means re-pasting into every project.
The benefit is that one person's data cannot leak into another's, there is no
database to administer, and deleting someone is deleting a file. At
twenty-five logs the trade is worth it. At two hundred it would not be.

Quotas are not a concern at this size — Apps Script allows thousands of
executions a day per account, and a session is a few dozen calls.

---

## Why this stack

The original brief was a personal trainer with roughly twenty-five people,
which is the hardest version of the problem — the solo case falls out of it
for free. Analytics were the first priority. Once the real workflow turned out
to be "look at last week, do slightly more", the case for a database
evaporated, and that reframing decided everything below.

| Option | Why not |
|---|---|
| **wger** (self-hosted) | Best feature set for many people at once, but needs a VPS the trainer cannot run and someone would have to administer indefinitely. |
| **Vercel + Supabase** | Good stack, real SSO, real SQL. But with no aggregation across logs required, Postgres bought nothing over Sheets. |
| **Firebase** | Firestore cannot do the group-by an overview would need without precomputed rollups. No spending cap either. |
| **AppSheet** | Fast to build; sharing with each person needs a paid per-user licence. |
| **Vercel/Netlify for wger** | Architecturally impossible — wger is a stateful Django app. |

What the constraints actually demanded:

```
  free, no per-seat licence     ~25 people, not a commercial product
  no upkeep burden on the user  may not be technical; a terminal is a
                                non-starter
  tablet-first                  entry happens standing up, mid-session
  no typing into cells          too easy to mistype a weight on glass
  stays in Sheets               the sheet IS the database, not a mirror
```

If analytics ever come back as a requirement, revisit Supabase. Nothing else
on that list becomes right again.

---

## Known gaps

Accepted, documented, not accidental:

- **No way to remove one exercise from a session.** Drop it to a single set,
  or delete the rows in the sheet. This is also why the blank day never
  carries the previous session forward.
- **An empty session does not survive a reload**, because there is nothing to
  write. Only affects the blank day before its first exercise is added.
- **Partial offline support.** Edits to an open session are queued and
  replayed, so a dropped connection delays a save rather than losing it. But
  *starting* a session, adding an exercise and changing set counts all need
  the server, because row numbers come from it. Full offline would need a
  service worker and client-assigned IDs — a different design.
- **No roster view across logs.** Deliberate — the workflow is one
  log at a time.
- **Weights seeded at 0 stay at 0**, because `+2 reps, same weight` never
  moves them. Type the real weight in once.
- **Nothing archives or deletes old data.** A `Log` tab grows forever, and
  every read pulls the whole sheet. Fine for years at one session a day;
  not fine forever.
- **No test suite.** Apps Script has no local runtime, so testing is the
  manual loop in
  [DEVELOPMENT.md]({{ site.repo }}/blob/main/DEVELOPMENT.md#testing).
