# Training tracker

A workout log that runs on Google Apps Script over a Google Sheet — free, no
server, and the sheet stays the source of truth.

Open it on a tablet at the rack and tap numbers up and down. Each set carries
an RPE, and next week's session is generated from it: same exercises, slightly
more work, offered as a proposal to override at will.

Every log has an **admin link** (edits) and a **viewer link** (read-only,
enforced server-side). Hold the admin link yourself, or hand it to a personal
trainer who records your sessions.

[![A Push session open on a tablet: exercise cards showing personal bests,
last week's numbers under each field, and the status bar reporting an unsaved
change](docs/img/tablet-demo-poster.png)](https://david-chau.github.io/training-tracker/)

**[▶ Watch the tablet demo](https://david-chau.github.io/training-tracker/)** —
40 seconds: starting a session, logging sets, adding an exercise. It plays
inline at the top of the documentation site.

## Documentation

**[Documentation home →](https://david-chau.github.io/training-tracker/)**

- [Setup guide](https://david-chau.github.io/training-tracker/setup.html) — import
  the template, paste in the code, publish, share the links
- [Admin guide](https://david-chau.github.io/training-tracker/admin.html)
- [Viewer guide](https://david-chau.github.io/training-tracker/viewer.html)
- [Personal records](https://david-chau.github.io/training-tracker/records.html)
- [Training terminology](https://david-chau.github.io/training-tracker/terminology.html)
- [Architecture](https://david-chau.github.io/training-tracker/architecture.html)
- [Troubleshooting](https://david-chau.github.io/training-tracker/troubleshooting.html)

## Try the read-only demo

- [Open the demo viewer](https://script.google.com/macros/s/AKfycbxH2TaEs7AR-EeINAF9mTYqQ9Dc5-Cy1hST8BP4mw4arttqKQwOKpRMhq5yX7QMyu4BEQ/exec)
- [View the demo spreadsheet](https://docs.google.com/spreadsheets/d/1fjs3pzBXt2AzUgrJWjDrNwbWoD0WaNhlwGPTqTbHaS8/edit?usp=sharing)

Working on the code: [DEVELOPMENT.md](DEVELOPMENT.md).
