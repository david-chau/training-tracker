---
title: Troubleshooting
nav_order: 6
---

# Troubleshooting
{: .no_toc }

Symptoms in the order people hit them.

1. TOC
{:toc}

---

## The Training menu is missing

The **Training** menu is added by the script when the spreadsheet opens, so if
it is absent one of three things is true.

1. **You did not reload.** The menu only appears on a fresh page load, not
   when you switch back to the tab. Reload the spreadsheet.
2. **The code was not saved.** Go to *Extensions → Apps Script* and press the
   save icon, then reload the spreadsheet again.
3. **The spreadsheet is in Office mode.** Look at the title bar: if it says
   `.XLSX` next to the name, Google is editing the uploaded file rather than a
   real Google Sheet, and Apps Script cannot attach to it. Redo
   [step 1](setup.html#step-1--import-the-spreadsheet-template) using
   *File → Import → Replace spreadsheet*, which converts it properly.

---

## "Google hasn't verified this app"

Expected, and not a problem. This is your own script, published from your own
account, and it was never submitted to Google for review — there is no review
process worth doing for a private script.

Click **Advanced**, then **Go to Training log (unsafe)**, then **Allow**.

The permissions it asks for are to read and write the spreadsheet it is
attached to, and to show its own web page. Nothing else.

---

## The admin link says "Read only"

The key is missing or wrong. The URL must end with `?key=` followed by the
key, with no space and nothing after it:

```
   ✓  https://script.google.com/macros/s/AKfy…/exec?key=a1b2c3d4e5f6g7h8
   ✗  https://script.google.com/macros/s/AKfy…/exec?key=a1b2c3d4e5f6g7h8/
   ✗  https://script.google.com/macros/s/AKfy…/exec ?key=a1b2…
```

Get a fresh copy from the spreadsheet: **Training → Show shareable links**.
Chat apps and calendar invites are the usual culprits — they truncate long
URLs or turn them into shortened links that drop the query string.

---

## The bar says "N changes not saved yet"

Normal when the wifi is patchy, and not something you need to act on. Those
changes are queued on the tablet and the app is retrying — on reconnect, when
you return to the tab, and on a backoff up to every 30 seconds. **Retry now**
forces an immediate attempt.

Keep training. The numbers on screen are what you entered.

Two things not to do while it is amber:

- **Do not close the tab.** The browser warns you. Those changes have not
  reached the spreadsheet, and the app cannot always keep them on the device —
  storage inside a Google-hosted page is not guaranteed.
- **Do not expect set counts, new exercises or Delete this day to work.**
  They are deliberately refused until the queue drains, because they move rows
  around underneath the pending writes.

If it never clears, the connection is not coming back on its own — check the
wifi, or switch the tablet to mobile data.

---

## "Not saved: row 14 now holds something else"

A change was queued against a row that has since moved — usually because sets
were added or removed, or the day was deleted, somewhere else (another tab, or
the spreadsheet itself) while that change was waiting.

The app drops that one change and reloads the session, because replaying it
would write onto whatever occupies that row now. **Re-enter that one value.**
Nothing else in the session is affected.

---

## "Save failed" in the bottom bar

The message after the colon is the real cause.

| Message contains | Meaning | Fix |
|---|---|---|
| `Read-only view` | The key stopped matching mid-session, usually because the key was rotated | Reopen the current admin link |
| `No sheet named "Log"` | The tab was renamed or deleted | Rename it back to exactly `Log` |
| `is no longer in that session` | A note was queued for an exercise that has since been removed | Re-add the note if you still want it |

---

## "No history and no template for Push"

You are starting a day type that has never been logged and has no rows in the
`Templates` tab. Either:

- use the **Custom** button instead — it always starts empty and expects you
  to add exercises by hand, or
- add rows for that day to the `Templates` tab (`day | exercise | sets | reps
  | weight`).

Day-type buttons come from the `Templates` tab plus everything ever logged, so
a new day type appears on the next page load once either exists. See
[day types are yours](admin.html#day-types-are-yours).

---

## The numbers do not go up when I tap +

Almost always one of:

- **You are on the viewer link.** No buttons at all, just values. Check for
  the *Read only* badge at the top.
- **You tapped the number, not the button.** Tapping the number selects it for
  typing. Tap elsewhere to commit, or use the `−` / `+` either side.
- **RPE is already at its limit.** RPE clamps to 1–10, and set counts to 1–10.

---

## The sheet shows values I did not enter

Starting a session writes the proposed rows immediately, before anything is
tapped. Those are the app's proposal, generated from last week's numbers and
RPEs — see [the progression rule](admin.html#how-next-weeks-numbers-are-worked-out).

Change them freely; the row is overwritten as you go.

---

## I deleted the wrong day

The app has no undo, but the spreadsheet does:

1. Open the spreadsheet.
2. **File → Version history → See version history**.
3. Pick the version from before the deletion and **Restore this version**.

Or, if the sheet tab is still open and nothing else has happened,
*Edit → Undo* works normally.

---

## Changes to the code are not showing up

Saving in the Apps Script editor does not change what the published links
serve. A deployment is pinned to a version.

**Deploy → Manage deployments → pencil icon → Version: New version →
Deploy.** The URLs stay the same.

The exception is the sidebar (*Training → Open entry form*), which always runs
the latest saved code. That is why it is useful for testing — and why
something can work in the sidebar and not on the link.

---

## Typing in the sidebar goes into the spreadsheet instead

A known Google Sheets quirk: the grid steals keyboard focus from a sidebar.
The app fights back by claiming focus on `mousedown`, but it is not perfect.

The sidebar is a test harness. Use the deployed `/exec` link for real
sessions — it is a normal web page and does not have this problem.

---

## An exercise autocompletes to the wrong name, or not at all

The autocomplete list is the `Exercises` tab. Anything typed into **+ Add
exercise** that is not already there is appended to that tab automatically, so
a typo becomes a permanent suggestion.

Fix it by editing the `Exercises` tab directly — delete the bad row. Existing
`Log` rows keep the name they were saved with; correct those in the `Log` tab
if it matters.

{: .note }
The same exercise cannot be added to one session twice. *"Barbell Row is
already in this session"* means it is already on the page, further up.

---

## Everything is fine but the page is blank

Reload once. If it is still blank, open the link in a private window — an
extension or a signed-in second Google account is the usual cause. Apps Script
web apps get confused when a browser is signed into several accounts at once,
and the fix is to open the link in a window signed into only one.
