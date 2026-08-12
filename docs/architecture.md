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

## Ownership model: bring your own Google Workspace

This repository is a **starting point, not a hosted service**. The tracker is
free to copy and run: there is no subscription, per-user charge, or separate
hosting bill from this project. It does not operate a shared web app, database,
account system, or central copy of anyone's training data.

{: .note }
**Free does not mean a new Google account is supplied.** The implementation
runs inside the Google account or Workspace you choose. Any cost for that
account, its storage, or its Workspace plan remains between you and Google;
the tracker itself adds no fee.

When you implement the tracker, you make a copy of the spreadsheet template,
paste in the code, and publish the Apps Script web app from **your own Google
account or Workspace**. That account owns the spreadsheet, the bound script,
the deployment, and the sharing decisions. The project supplies templates and
source code that you can change to fit your own training, clients, terminology,
and workflow.

```
  THIS REPOSITORY                         YOUR GOOGLE WORKSPACE
  ───────────────                         ─────────────────────
  template + source code  ── copy ──▶     Sheet + training data
                                             bound Apps Script
                                             web-app deployment
                                             admin/viewer links
                                             your customisations
```

There is deliberately nothing to sign up for, no common database to migrate
from, and no platform operator with access to all logs. Each implementation is
independent; keeping it current or changing it is the responsibility of the
person or organisation that owns that copy.

### What that means in practice

| Concern | Who owns it |
|---|---|
| **Google account and Workspace plan** | The implementing person or organisation. The tracker adds no separate hosting bill, but it runs within the Google account, quotas, storage, and any Workspace plan they choose. |
| **Data and access** | The owner of that Google Workspace: they decide who can access the Sheet, who receives the admin or viewer link, and how long the data is retained. |
| **Deployment and availability** | The implementer. Google serves the Apps Script web app, but each owner publishes and maintains their own deployment. |
| **Custom features and fixes** | The implementer, their developer, or whoever they arrange to support the copy. A change here is a template or source update, not an automatic update to existing installations. |
| **Operational support** | The implementer. This project is not a managed SaaS product and does not provide monitoring, incident response, uptime commitments, or an on-call developer for individual installations. |

That separation is intentional. It keeps the project lightweight and lets an
owner adapt a copy freely, but it also means adopting the tracker is an
implementation decision: make a copy, customise it as needed, and decide who
will maintain it over time.

---

## Where it lives in Google Workspace

There is no project-hosted server, common database, or deployment pipeline to
join. Every moving part in your implementation is something Google already
runs for you:

```
  GOOGLE DRIVE (the admin's Google account)
  ╔══════════════════════════════════════════════════════════════════╗
  ║                                                                  ║
  ║   ┌────────────────────────────────┐                             ║
  ║   │  Google Sheet                  │   the database              ║
  ║   │  "Training — Jane Doe"         │                             ║
  ║   │                                │                             ║
  ║   │   Log         every set ever   │                             ║
  ║   │   Exercises   names + links    │                             ║
  ║   │   Templates   first session    │                             ║
  ║   │   Settings    which records    │                             ║
  ║   │   Records     derived output   │                             ║
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
    │ render()         │           │  getBootstrap()   day types, exercises
    │ paginate()       │           │  listDates()      sessions that exist
    │ card()           │           │  loadSession()    one day's sets
    │ supersetCard()   │           │  ─────────────────────────────────
    │ setRow()         │           │  computeRecords() personal bests
    │ stepper()        │           │  lastByExercise() what to compare with
    │ noteField()      │           │  ─────────────────────────────────
    └────────┬─────────┘           │  saveBatch()      ┐
             │                     │  setSetCount()    │
             │ google.script.run   │  addExercise()    │ all call
             ├────────────────────▶│  renameExercise() │ assertEdit(k)
             │                     │  setGroup()       │ first
             │◀────────────────────┤  deleteSession()  ┘
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

`Log` is the only real data. Two tabs feed it, one configures, and one is
derived from it.

```
   Log        the record — one row per set
   ┌────┬─────┬──────────┬────┬─────┬────────┬─────┬──────────┬───────┬───┐
   │ A  │  B  │    C     │ D  │  E  │   F    │  G  │    H     │   I   │ J │
   │Date│ Day │ Exercise │Set │Reps │Weight  │ RPE │Auto note │ Notes │Grp│
   │    │     │          │    │/Sec │  (LB)  │     │          │       │   │
   ├────┼─────┼──────────┼────┼─────┼────────┼─────┼──────────┼───────┼───┤
   │8-09│Push │Bench     │ 1  │ 12  │  25    │ 8   │          │ elbow │   │
   │8-09│Push │Bench     │ 2  │ 10  │  30    │ 9   │ repeat   │ elbow │   │
   │8-09│Push │Dead Bug  │ 1  │ 12  │   0    │     │ added    │       │ A │
   │8-09│Push │Battle Rop│ 1  │ 30  │   0    │     │ added    │       │ A │
   └────┴─────┴──────────┴────┴─────┴────────┴─────┴──────────┴───────┴───┘
          │                          ▲                  ▲        ▲
          │                          │                  │        │
          │            what actually happened     written by  written by
          │            (the row is overwritten     progress()  the admin
          │             as the set is logged)
          │
   Exercises  ┌──────────┬───────┬─────────┬───────┬───────────┬───────┬────────────┐
              │ exercise │ group │ pattern │ image │ no weight │ video │ time based │
              └──────────┴───────┴─────────┴───────┴───────────┴───────┴────────────┘
              autocomplete source; grows when a new name is used, with
              E and G set from the add form's two toggles. D optional
              picture URL, F a how-to link — both http(s) only. E hides
              the weight field and stops progress() adding load. G makes
              column E of the Log mean seconds

   Templates  ┌─────┬──────────┬──────┬──────┬────────┬────────────────┬───────┐
              │ day │ exercise │ sets │ reps │ weight │ include in new │ group │
              └─────┴──────────┴──────┴──────┴────────┴────────────────┴───────┘
              the "from the template" source; `day` also defines the
              day-type buttons. F = "no" keeps a row on the plan
              without it being generated, G pairs rows into a superset

   Settings   ┌─────┬───────┬──────────────┐
              │ key │ value │ what it does │  key/value; C is for the human.
              └─────┴───────┴──────────────┘  Missing keys fall back to
                                              DEFAULTS in Code.gs

   Records    ┌──────────┬────────┬───────┬────────┬──────┬─────┐
              │ exercise │ record │ value │ detail │ date │ day │  OUTPUT
              └──────────┴────────┴───────┴────────┴──────┴─────┘  only
```

Removing an exercise from a session is `setSetCount` with a count of zero:
shrinking to no sets and deleting the rows are the same operation, so there is
no second code path for it.

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
        admin picks one of the offered ways to start
                                     │
                                     ▼
             loadSession(day, date, create=true, key, source)
                                     │
                             assertEdit(key)
                                     │
                       resolveSource(day, source)
                       explicit  → history | template | empty
                       otherwise → empty if day is CFG.blankDay
                                   else 'auto'
                                     │
        ┌────────────┬───────────────┼───────────────┐
        ▼            ▼               ▼               ▼
     empty        history        template          auto
        │            │               │               │
   write        most recent     Templates rows    history if any
   nothing      <day>, with     for <day> where    earlier <day>
        │       progress() per  column F is not    exists, else
        │       set             "no"               template
        │            │               │               │
        │            └───────┬───────┴───────────────┘
        │                    ▼
        │       append rows to Log, flush()
        └────────────────────┬──────────────────────┘
                             ▼
                 re-read and return the session
```

Rows are written to the sheet **before** the admin touches anything. The
proposal is data from the moment it appears, which is why there is no separate
"save session" step and no unsaved state to lose.

`history` and `template` fail loudly when they cannot deliver — *"No earlier
Push to build from"* rather than silently falling back to the other. `auto`
is the only mode that chooses, and it is what the day-type default resolves
to. The browser only ever offers a source it can see is available
(`priorDate`, `templateCount`), so the errors are a backstop for a stale
page, not a normal path.

Day types are not a fixed list. `getBootstrap()` builds them from the
`Templates` tab plus every distinct value ever written to the `Log` tab's
`Day` column, deduped, with `CFG.blankDay` appended. The `['Push', 'Pull',
'Legs']` in that function is a fallback for a completely empty sheet, not a
schema.

An empty start is the one case with no persistent representation: it has no
rows, so "started" cannot be read back off the sheet. `exists` is therefore
true only for the call that created it. Adding one exercise
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

  Exercises flagged "no weight" take the same rep changes with the
  weight column passed straight through, untouched. Without that,
  an easy set of push-ups would prescribe 5 lb of push-up next week.

  Exercises flagged "time based" step by CFG.timeStep (5 seconds)
  instead of CFG.repStep (2). The rule keeps its shape; only the
  unit and the step change.
```

### One column, two units

Column E of the `Log` holds repetitions for most exercises and seconds for
the ones flagged `time based`. The unit is a property of the *exercise*, not
of the row.

That is a deliberate trade. Storing the unit per row would be more
self-describing, but it costs a tenth Log column and a migration for every
sheet already in use, to record something that is already knowable. The cost
is that re-flagging an exercise re-reads its history in the new unit — which
is the right answer anyway if the flag was wrong.

Everything that renders or steps that field asks first: `progress()` takes a
`timed` argument, `recordRows()` takes a name → timed map for its wording, and
the browser has `isTimed()` behind the field label, the step size, the *was*
line and the record strip.

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

## Personal records

Records are **derived, never stored**. `computeRecords()` folds the whole Log
into one pass and returns a record set per exercise; the `Records` tab is a
rendering of that, not a source. Edit a row in the Log by hand and the records
follow on the next rebuild — there is no second copy to fall out of step.

```
   Log rows ──▶ computeRecords(rows, cfg, skip) ──┬──▶ loadSession()
                          │                       │    per-exercise best,
                          │                       │    sent to the browser
                 heaviest │ byReps[N]             │
                 est1rm   │ volume                └──▶ recordRows() ──▶ the
                 reps     │ session                    Records tab

   cfg  ◀── Settings tab: pr_rep_targets, pr_metrics
   skip ◀── the session being viewed, so today is not its own record to beat
```

The `skip` argument is the whole trick behind the ★ in the UI. Without it,
the first set you log today becomes the record the second set is measured
against, and nothing ever reads as a personal best.

Two deliberate asymmetries:

- **The browser judges the star, not the server.** `loadSession` ships the
  record; the comparison happens in `isPr()` on the page, so the star appears
  as a weight is typed rather than on the next reload.
- **The Records tab is refreshed off the interactive path entirely** — the
  menu item, deleting a day, and archiving. Never on `saveBatch`, and no
  longer on adding an exercise, changing a set count, renaming, or starting a
  session. A full rebuild is a whole-sheet scan and a tab rewrite, so it got
  slower as the log grew and it was hanging off the things an admin does
  standing at a machine. Nothing in the app reads that tab — the ★ and the
  record strip come from `computeRecords()` on every load — so only the tab
  itself can lag, and it is a rendering, not a source. `refreshRecords()` also
  swallows its own errors: a failed rendering must never cost someone their
  logged set.

---

## Per-set history

`lastByExercise(rows, dayKey, names)` returns, for each exercise on screen,
the values from the last time **that exercise** was done — `{reps, weight,
rpe}` per set number, plus the date and note it came from. Values rather than
a formatted string, because the browser renders each number under the field it
belongs to. It used to be joined into one `Last time: 10 x 20 @8 · 8 x 30 @9`
line at the top of the card, which made the reader match set to number by
counting.

**Per exercise, not per session.** It was keyed to the previous session of the
same day type, which is right only when every session repeats the last one
exactly. Skip an exercise for a week, move it to another day, or add it
mid-cycle and there was no comparison at all despite a log full of it. The
lookup now walks every earlier row for the exercise and keeps the latest,
whatever day type it was logged under.

Sheet order is not date order — rows are appended, and a day recorded late
lands after newer ones — so an earlier date can never overwrite a later one.

Because two exercises in one session can now compare against two different
dates, each card carries a `last done <date>` cell when its date is not the
one the status bar names.

`BLANK_RPE` travels here too — an unrecorded RPE last time shows as `was —`
rather than `was 0`.

---

## Pages and supersets

A session renders as a list of **pages**: one exercise, or one superset of two
or more. `paginate()` walks the exercises in sheet order and folds any that
share a column J label into a single page, positioned where the first member
sits — so pairing something added late does not shuffle the session around.

```
   Log rows (sheet order)          pages
   ─────────────────────           ─────
   Bench          J:              ① Bench
   Dead Bug       J: A            ② Dead Bug + Battle Ropes   (superset A)
   Battle Ropes   J: A            ③ Seated Leg Curl
   Seated Leg Curl J:
```

Every page is rendered and all but the current one hidden, rather than built
on demand. A card holds live values, `onChange` hooks and registered queue
watchers; re-creating one to switch pages would throw those away and could
drop an edit that had not yet been queued.

A superset card renders **round by round** — set 1 of each exercise, then set
2 — because that is the order it is performed in, and because putting one
exercise's sets above the other's is the scrolling the pages exist to remove.
Set counts can differ, so a round only renders the exercises that have a set
that far in.

`setGroup()` is the only writer of column J. It normalises to a single letter,
allocates a fresh one when asked for a new group, and clears any label left
holding a single exercise — a superset of one is just an exercise. Membership
is by label rather than by adjacency because rows are appended in the order
they were added, and an exercise added later has to be able to join a pair
logged above it.

---

## Pounds, kilograms, and what is stored

Column F is `Weight (LB)` and always holds pounds. Records, the progression
rule and every comparison read it, and a column that mixed units could not be
compared with itself.

Kilograms are a **display choice**, converted on the way in and on the way
out: `toDisplay()` when a weight is rendered, `toPounds()` when one is typed
or stepped. Stepping happens in the unit on screen, so kg lands on clean 2.5s
instead of on whatever 2.5 lb converts to, and stored pounds are rounded to
one decimal so the round trip is stable.

The choice lives in `localStorage` per device, not in the sheet — it is a
property of the machine in front of you, not of the log. Switching it
re-renders from the response already in hand (`redraw()`); it never writes,
and never touches the queue.

---

## Showing the movement

Two optional columns on `Exercises`, both shipped to the browser by
`getBootstrap()` as name → URL maps.

**Column F, `video`** — rendered as a *▶ How to* link beside the exercise
name. Every shipped row has one: a YouTube search for the exercise, generated
by `fill_videos()` in `build_template.py` rather than stored per row.

A search rather than a video id is a deliberate trade. Ids rot, need curating
255 times, and amount to the project picking someone's coaching. A search is
none of those and is trivially replaceable per row.

{: .note }
Images were tried first and rejected on quality. Matching the catalogue
against `yuhonas/free-exercise-db` (873 exercises, Unlicense, so licensing
was never the obstacle) reached about 58%, and produced matches like
*Barbell Bench Press → Barbell Guillotine Bench Press* — a different and
riskier lift. A wrong picture is worse than none.

**Column D, `image`** — a thumbnail on the card, expanded on tap. Blank by
default, since a shippable image URL would have to be one the project has
rights to.

Both are user-supplied data reaching the DOM, so both are guarded: only
`http(s)` passes (`exerciseImages()`, `exerciseVideos()`), and the value is
assigned to `img.src` / `a.href` as a property rather than concatenated into
`innerHTML`. Exercise names get the same treatment — `textContent`, never
markup. A dead image link removes its own thumbnail via `onerror`.

{: .warning }
`<base target="_blank">`. Every link leaves in a new tab, because the
pending-write queue lives in memory and navigating away can take it. It was
`_top` — inherited from the Apps Script scaffold — which would have done
exactly that.

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

One person tracking their own training needs one installation. A trainer with
twenty-five people has twenty-five, identical and fully independent. There is
no multi-tenancy anywhere in the design.

```
   David         Jill           Arden            each is:
   ┌────┐        ┌────┐        ┌────┐              · one Sheet
   │Sheet│       │Sheet│       │Sheet│             · one bound script
   │  +  │       │  +  │       │  +  │             · one deployment
   │Script│      │Script│      │Script│            · its own EDIT_KEY
   └──┬─┘        └──┬─┘        └──┬─┘
      │             │             │              nothing shared,
      ▼             ▼             ▼              nothing to sync,
   2 links       2 links       2 links           nothing to migrate
```

The cost of that is real: a code change means updating each project separately.
The benefit is that each owner retains control of their own copy, one person's
data cannot leak into another's, there is no database to administer, and
deleting someone is deleting a file. At twenty-five logs the trade is worth
it. At two hundred it would not be.

### Quotas, and what they mean at 25 people

Every deployment runs **as the account that published it**, so all 25 logs draw
on *one* account's quota rather than 25. That is the number that matters, and it
is not obvious from the architecture.

Most of Apps Script's published limits do not apply here. The app sends no
email, makes no `UrlFetch` calls, and installs no triggers — so the daily
trigger runtime, mail recipients and fetch quotas are all irrelevant. Three
things actually bind:

| Limit | Value | How this app uses it |
|---|---|---|
| Runtime per execution | 6 min | Every read scans the whole `Log`. Fine for years of sessions; [archiving](admin.html#archiving-old-sessions) is the release valve. |
| Simultaneous executions | 30 | One per tap in flight. 25 people rarely train in the same minute, and taps are batched. |
| Properties read/write | 50,000/day consumer, 500,000 Workspace | One read per page load and one per `saveBatch`, for the edit key. |

A worked estimate, since "will it fit" deserves arithmetic rather than
reassurance. A session is roughly 30 sets; taps collapse into one `saveBatch`
per ~600 ms of stillness, so call it 40–80 writes plus a handful of reads —
**under 100 property reads per session**.

| Load | Property reads/day | Consumer quota used |
|---|---|---|
| 5 sessions a day, all clients | ~500 | ~1% |
| 25 clients × 1 session/day | ~2,500 | ~5% |
| 25 clients × 5 sessions/day | ~12,500 | ~25% |

So yes — 25 people fits, with room to spare even at five sessions each per
day. On a `@gmail.com` account the first thing to bite would be property
reads at around 500 sessions a day, which is twenty times the intended load.

{: .warning }
The limit that will actually be felt first is none of the above: it is the
6-minute execution ceiling meeting a `Log` that has grown for years, because
every read scans all of it and every structural write rebuilds `Records`.
Archive old seasons and it stays quick.

---

## Why this stack

Analytics were the first priority. Once the real workflow turned out to be
"look at last week, do slightly more", the case for a database evaporated —
and that reframing decided everything else. If analytics ever come back as a
requirement, revisit Supabase; nothing else on the list becomes right again.

<details markdown="block">
<summary>What was considered, and why it lost</summary>

The original brief was a personal trainer with roughly twenty-five people —
the hardest version of the problem, with the solo case falling out of it for
free. It also had to leave control with the person using it: their data in
their Workspace, a copy they can tailor without depending on a product
operator.

| Option | Why not |
|---|---|
| **wger** (self-hosted) | Best feature set for many people at once, but needs a VPS the trainer cannot run and someone would have to administer indefinitely. |
| **Vercel + Supabase** | Good stack, real SSO, real SQL. But with no aggregation across logs required, Postgres bought nothing over Sheets. |
| **Firebase** | Firestore cannot do the group-by an overview would need without precomputed rollups. No spending cap either. |
| **AppSheet** | Fast to build; sharing with each person needs a paid per-user licence. |
| **Vercel/Netlify for wger** | Architecturally impossible — wger is a stateful Django app. |

What the constraints actually demanded:

| Constraint | Why it matters |
|---|---|
| **Free, no per-seat licence** | About 25 people, not a commercial product. |
| **No upkeep burden on the user** | They may not be technical; a terminal is a non-starter. |
| **Tablet-first** | Entry happens standing up, mid-session. |
| **No typing into cells** | It is too easy to mistype a weight on glass. |
| **Stays in Sheets** | The sheet is the database, not a mirror. |

</details>

---

## Known gaps

Accepted, documented, not accidental:

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
- **Archiving is manual and one-way.** *Archive old sessions* moves a closed
  period into its own spreadsheet, but nothing prompts for it and there is no
  merge back. Until it is run, a `Log` grows forever and every read pulls the
  whole sheet.
- **No test suite for the Apps Script half.** The queue and the record maths
  run under `node`; everything touching `SpreadsheetApp` is tested by hand.
  The loop is in
  [DEVELOPMENT.md]({{ site.repo }}/blob/main/DEVELOPMENT.md#testing).
