# Training tracker

A workout log that runs on Google Apps Script over a Google Sheet — free, no
server, and the sheet stays the source of truth.

Open it on a tablet at the rack and tap numbers up and down. Each set carries
an RPE, and next week's session is generated from it: same exercises, slightly
more work, offered as a proposal to override at will.

Every log has an **admin link** (edits) and a **viewer link** (read-only,
enforced server-side). Hold the admin link yourself, or hand it to a personal
trainer who records your sessions.

<img src="docs/img/clip-tour.gif" width="320"
     alt="Starting a Push session from last week, stepping reps and weight up, and moving on to the next exercise">

One exercise on screen at a time, last week's numbers under each field, and
every tap read back out of the spreadsheet before it counts as saved.

**[Open the live demo →](https://script.google.com/macros/s/AKfycbxdLep_VYq7ZnH6yGTcM_UzKGZWp7t5jYmtz84GnSGAWTpuydB7OsHtC6-rtqqHaFhIYQ/exec)**  ·  **[Documentation →](https://david-chau.github.io/training-tracker/)**

## What it looks like

| | |
|:---:|:---:|
| <img src="docs/img/clip-start.gif" width="260" alt="Picking a day type and starting a session from last week's numbers"> | <img src="docs/img/clip-logging.gif" width="260" alt="Stepping reps and weight with the plus and minus buttons, and the status bar confirming the save"> |
| **Start from last week** — pick a day, and the session arrives filled in and nudged up. [More →](https://david-chau.github.io/training-tracker/admin.html#2-start-it) | **Log without typing** — every number is a − / + button, read back out of the sheet before it counts. [More →](https://david-chau.github.io/training-tracker/admin.html#3-train-and-adjust) |
| <img src="docs/img/clip-superset.gif" width="260" alt="Pairing two exercises into a superset, which then renders as one card round by round"> | <img src="docs/img/clip-records.gif" width="260" alt="A set beating a previous best, marked with a star as the number is typed"> |
| **Supersets** — pair two exercises and they become one card, laid out round by round. [More →](https://david-chau.github.io/training-tracker/admin.html#supersets) | **Personal bests** — worked out from the log and starred on the card as you train. [More →](https://david-chau.github.io/training-tracker/records.html) |

Ask it for a report over any period and it draws one — volume and sessions
week by week, or month by month once you ask for more than half a year, with
each exercise's range for the period against your all-time range. **Save as
PDF** prints what you are looking at.

<img src="docs/img/report-top.png" width="360"
     alt="The report: a line chart of volume and sessions by month, with totals and averages beneath it">

## Documentation

- [Setup guide](https://david-chau.github.io/training-tracker/setup.html) — import
  the template, paste in the code, publish, share the links
- [Admin guide](https://david-chau.github.io/training-tracker/admin.html)
- [Viewer guide](https://david-chau.github.io/training-tracker/viewer.html)
- [Personal records](https://david-chau.github.io/training-tracker/records.html)
- [Training terminology](https://david-chau.github.io/training-tracker/terminology.html)
- [Architecture](https://david-chau.github.io/training-tracker/architecture.html)
- [Troubleshooting](https://david-chau.github.io/training-tracker/troubleshooting.html)

## Try the read-only demo

- [Open the demo viewer](https://script.google.com/macros/s/AKfycbxdLep_VYq7ZnH6yGTcM_UzKGZWp7t5jYmtz84GnSGAWTpuydB7OsHtC6-rtqqHaFhIYQ/exec)
- [View the demo spreadsheet](https://docs.google.com/spreadsheets/d/1_xVY-Ha2tO6oNJ_I-BWMPHeAT4BM2ww-aGzm7jnab1Y/edit?usp=sharing)

Both are read-only. The log holds about six months of seeded training — some
1,100 sets over 70 sessions — chosen to show the things worth seeing:

| Day type | Sessions | What it demonstrates |
|---|---|---|
| **Push** | ~24, weekly | Months of the same lifts, so weights climb and the `was 95` line under each field has something to say. The newest sessions carry RPE and a note. |
| **Pull** | ~23, weekly | Includes `Pull-Up` — no weight field at all |
| **Legs** | ~20, weekly | The heaviest numbers, so records read clearly |
| **Custom** | one, in August | `Plank` in seconds, `Push-Up` unweighted, `Farmer Carry` both timed *and* loaded |

Use **‹ Previous session** to walk back through them — landing on today shows
nothing, because nothing is logged today. Anything older than six months is
[archived off](https://david-chau.github.io/training-tracker/admin.html#history-costs-speed),
which is what keeps the demo quick.

{: .note }
It is a live spreadsheet, not a fixture, so exact numbers may drift. Regenerate
it with `node e2e/seed-demo.js` — see
[DEVELOPMENT.md](DEVELOPMENT.md#the-demo-data).

Working on the code: [DEVELOPMENT.md](DEVELOPMENT.md).
