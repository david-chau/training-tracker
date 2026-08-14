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

<img src="{{ site.baseurl }}/img/clip-tour.gif" loading="lazy"
     alt="Starting a Push session from last week, stepping reps and weight up, and moving on to the next exercise"
     style="max-width:340px;width:100%;border-radius:12px;border:1px solid #e3e3e0;display:block;margin:1.5rem 0">

---

## Try the read-only demo

- [Open the demo viewer](https://script.google.com/macros/s/AKfycbxH2TaEs7AR-EeINAF9mTYqQ9Dc5-Cy1hST8BP4mw4arttqKQwOKpRMhq5yX7QMyu4BEQ/exec)
- [View the demo spreadsheet](https://docs.google.com/spreadsheets/d/1fjs3pzBXt2AzUgrJWjDrNwbWoD0WaNhlwGPTqTbHaS8/edit?usp=sharing)

Both links are read-only and use the same sample training log.

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
    deletes a session
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
| Setting this up for the first time | [Setup guide →](setup.html) |
| The one recording sets — myself or a trainer | [User guide → Admin →](admin.html) |
| Someone who was sent a view-only link | [User guide → Viewer →](viewer.html) |
| After personal bests | [Personal records →](records.html) |
| Unsure what a training term means | [Training terminology →](terminology.html) |
| Hitting something odd | [Troubleshooting →](troubleshooting.html) |
| Curious how it is built | [Architecture →](architecture.html) |


---

## What it does

- **One sheet per person.** The spreadsheet is the database, not a copy of it.
  Export, sort, chart, or delete it like any other sheet.
- **Builds this week from last week.** Start a session and the exercises,
  sets, reps and weights appear already filled in, nudged up from last time.
- **Records RPE.** Every set gets a 1–10 "how hard was that", which is what
  drives next week's numbers.
- **Never edited in the spreadsheet.** Entry happens in the app, where every
  number is a **−** / **+** button — you can still tap a field and type, but
  hunting for the right cell on a tablet mid-set is what this avoids.
- **Tracks personal bests.** Worked out from the log, shown on the card as you
  train, and listed on their own tab. [Configurable](records.html).
- **One exercise on screen at a time**, with the whole session listed above it
  — including supersets, which are one card laid out round by round.
- **Reads in lb or kg.** A switch per device; the sheet always stores pounds.
- **Shows you the movement.** Every exercise carries a **▶ How to** link, and
  you can add your own picture or GIF beside it — worth a lot if you are new
  to a lift.
- **Survives bad wifi.** Changes queue on the device and save themselves when
  the connection comes back.
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
