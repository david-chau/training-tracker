# Codex project instructions

Before changing anything, read `CLAUDE.md` in full. It is the canonical
project context and constraints for this repository; follow it as if its
instructions were written here.

Keep the app’s current architecture and data layout intact unless the user
explicitly asks for a change. Preserve validation, authorization, flush/read-
back checks, queue safety, tablet usability, and the browser-only setup.

Run the smallest relevant checks from `CLAUDE.md` after changes:

- `node test/queue.test.js` for queue or write-flow changes.
- `node test/records.test.js` for records changes.
- `python3 data/build_template.py` for template or seed-data changes.
