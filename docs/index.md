---
title: Home
nav_order: 1
---

# Training tracker

A workout log that runs inside Google Sheets. Nothing to install, nothing to
pay for, no account to create beyond the Google account you already have.

Open it on a tablet at the rack, tap numbers up and down, and the sheet fills
itself in. Next week it looks at what was lifted and how hard it felt, then
proposes slightly more.

---

## Two roles, one link each

Every log has an **admin link** and a **viewer link**.

```
    ADMIN                              VIEWER
    …/exec?key=a1b2c3…                 …/exec

    starts sessions                    reads any session
    changes reps / weight / RPE        reads the notes
    adds and removes sets              ✗ cannot change anything
    writes notes
    deletes a day
```

Who holds the admin link is up to you:

- **Logging your own training?** Keep both. You are the admin. The viewer link
  is optional — hand it to a training partner, or never use it at all.
- **Working with a personal trainer?** They hold the admin link and record the
  numbers during the session. You get the viewer link and can look up any
  session afterwards.

Read-only is enforced on the server, not by hiding buttons, so a viewer link
genuinely cannot write.

---

## Which page do I want?

| I am… | Start here |
|---|---|
| Setting this up for the first time | [Setup guide](setup.html) |
| The one recording sets — myself or a trainer | [Admin guide](admin.html) |
| Someone who was sent a view-only link | [Viewer guide](viewer.html) |
| Hitting something odd | [Troubleshooting](troubleshooting.html) |
| Curious how it is built | [Architecture](architecture.html) |

Setting it up starts with one file:

[Download the spreadsheet template]({{ site.baseurl }}/download/training-tracker-template.xlsx){: .btn .btn-primary }
[Setup guide](setup.html){: .btn }

---

## What it does

- **One sheet per person.** The spreadsheet is the database, not a copy of it.
  Export, sort, chart, or delete it like any other sheet.
- **Builds this week from last week.** Start a session and the exercises,
  sets, reps and weights appear already filled in, nudged up from last time.
- **Records RPE.** Every set gets a 1–10 "how hard was that", which is what
  drives next week's numbers.
- **No typing into cells.** Everything is a plus or minus button. Mistyping a
  weight on a tablet mid-set is the thing this design exists to prevent.
- **Scales by copying.** A trainer with twenty-five people runs twenty-five
  independent copies. Nothing shared, nothing to sync.

## What it deliberately does not do

- No dashboard across several logs. One person at a time, by design.
- No full offline mode. Changes to an open session survive a dropped
  connection and save themselves when it returns, but *starting* a session
  needs the network.
- No charts or analytics. The real workflow is "look at last week, do slightly
  more", and that already lives in the app.

Full list in [known gaps](architecture.html#known-gaps).
