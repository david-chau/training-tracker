# scripts

Tools that talk to a live deployment: they read the demo log, render what the
app would render, measure it, and write the images the docs use.

They read `e2e/targets.json` for the links, same as the end-to-end tests, so
set that up first — see [DEVELOPMENT.md](../DEVELOPMENT.md).

Anything meant only for looking at goes to `generated/`, which is gitignored.
Images the docs actually publish go to `docs/img/`.

## The report, as the app draws it

| | |
|---|---|
| `report-render.js` | Loads `reportView` out of `src/Index.html` and runs it against data. A library the others use, not a command. |
| `report-shot.js` | Data from the live sheet, markup and CSS from the working copy → `generated/report-app.png` and `report-print.pdf`. Judge a change before deploying it. `FROM=2026-07-27` for a bounded period. |
| `report-live.js` | Screenshots the *deployed* app's own report. What `report-shot.js` claims, this proves. `N=6 UNIT=months`, or `FROM=` / `TO=`. |

## Pictures for the docs

| | |
|---|---|
| `doc-images.js` | Rebuilds `docs/img/report-week.png` and `report-year.png` — the chart at two ranges — plus the whole report. |
| `doc-crop.js` | The short crop the README and home page use, from the same render. |
| `doc-panel.js` | The report's period controls, from the deployed app. |
| `redact.js` | Paints a box over part of a PNG: `node scripts/redact.js docs/img/x.png 348 222 290 44`. The *Links* dialog shows a live edit key, so its screenshot always needs this. Check the result — coordinates are guesswork until you look. |

## Does it hold up

| | |
|---|---|
| `chart-scale.js` | The chart at 12, 26, 50 and 104 weeks. Half a year in, it stops drawing weeks and draws months. |
| `print-pages.js` | How many pages the printed report takes as exercises pile up. A day card taller than the page cannot be placed at all, which is why they are capped. |
| `bench.js` | Open, load a session, build a report — three cold runs each. `ROWS=1100` labels the output. |
| `bench-calls.js` | The same calls without the browser, against a no-op baseline. The floor is the bridge round trip; anything above it is ours. |
| `bench-load.js` | Where a page load goes: the HTML, the sandbox iframe, then the bootstrap call. |

## Filling and emptying the demo

| | |
|---|---|
| `seed-history.js` | Months of plausible history, built session by session through the app's own progression. `START=2026-02-16 UNTIL=2026-07-17`, `DRY=1` to see the plan. Slow — an hour for six months. |
| `archive.js` | Moves everything up to a date into its own spreadsheet: `node scripts/archive.js 2026-02-14`. Deletes rows from the live log, so it asks for a date rather than guessing one. |

`e2e/seed-demo.js` is the other half of the demo: the recent weeks the docs
describe, with their RPE, notes and superset. Run `seed-history.js` first if
you want both.
