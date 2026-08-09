---
title: Troubleshooting
nav_order: 6
---

# Troubleshooting

Find the symptom, open it.

---

## Setting up

### The Training menu is missing

One of three things:

1. **You did not reload.** The menu is added when the spreadsheet opens.
2. **The code was not saved.** *Extensions → Apps Script*, hit save, reload.
3. **The spreadsheet is in Office mode.** If the title bar says `.XLSX`,
   Apps Script cannot attach. Redo
   [step 1](setup.html#step-1--import-the-spreadsheet-template) via
   *File → Import → Replace spreadsheet*.

<details markdown="block">
<summary>"Google hasn't verified this app"</summary>

Expected. It is your own script and was never submitted for review.

**Advanced → Go to Training log (unsafe) → Allow.**

It asks only to read and write the spreadsheet it is attached to, and to show
its own web page.

</details>

<details markdown="block">
<summary>"Sorry, unable to open the file at present"</summary>

The link points at a deployment that is not live.

```
   ✓  https://script.google.com/macros/s/AKfy…/exec     share this
   ✗  https://script.google.com/macros/s/AKfy…/dev      owner-only test link
```

- **It is the `/dev` link** — the editor's test link, useless to anyone else.
- **The stored link is stale.** A *new* deployment mints a new URL. Run
  **Training → Set web app link** and paste the current one from
  *Deploy → Manage deployments*.
- **Nothing is deployed.** Saving is not deploying — see
  [step 3](setup.html#step-3--publish-the-web-app).

The app cannot work this URL out reliably for itself, which is why it asks you
to paste it once.

</details>

<details markdown="block">
<summary>The admin link says "Read only"</summary>

The key is missing or mangled. It must end `?key=` + the key, nothing after:

```
   ✓  …/exec?key=a1b2c3d4e5f6g7h8
   ✗  …/exec?key=a1b2c3d4e5f6g7h8/
```

Get a fresh copy from **Training → Show shareable links**. Chat apps and
calendar invites are the usual culprits — they shorten links and drop the
query string.

</details>

<details markdown="block">
<summary>Changes to the code are not showing up</summary>

Saving in the editor does not change what the links serve; a deployment is
pinned to a version.

**Deploy → Manage deployments → pencil → Version: New version → Deploy.**

The sidebar (*Training → Open entry form*) always runs the latest saved code,
which is why something can work there and not on the link.

</details>

---

## During a session

### The bar says "N changes not saved yet"

Normal on patchy wifi, and nothing to act on. The changes are queued and being
retried — on reconnect, on returning to the tab, and on a backoff up to 30
seconds. **Retry now** forces an attempt.

Keep training. The numbers on screen are what you entered.

{: .warning }
Do not close the tab while it is amber, and expect set counts, new exercises
and *Delete this day* to be refused until it clears — they move rows around
underneath the pending writes.

<details markdown="block">
<summary>"Not saved: row 14 now holds something else"</summary>

A change was queued against a row that has since moved, usually because sets
were added or removed elsewhere while it waited.

That one change is dropped and the session reloads, because replaying it would
write onto whatever occupies the row now. **Re-enter that one value.** Nothing
else is affected.

</details>

<details markdown="block">
<summary>"Save failed …"</summary>

| Message | Meaning | Fix |
|---|---|---|
| `Read-only view` | The key was rotated mid-session | Reopen the current admin link |
| `No sheet named "Log"` | The tab was renamed | Rename it back to exactly `Log` |
| `is no longer in that session` | A note was queued for an exercise since removed | Re-add it if you still want it |

</details>

<details markdown="block">
<summary>"No earlier Push to build from" / "No template rows for Push"</summary>

You picked a way to start that has nothing behind it. The app only offers
sources it can see are available, so this usually means the page has been open
a while — reload it.

**Empty** is always available. To make *From the template* work for a day, add
rows for it to the `Templates` tab.

</details>

<details markdown="block">
<summary>The numbers do not go up when I tap +</summary>

- **You are on the viewer link** — check for the *Read only* badge.
- **You tapped the number, not the button.** Tapping selects it for typing.
- **It is at its limit.** RPE clamps to 1–10, set counts to 0–10.

</details>

<details markdown="block">
<summary>The sheet shows values I did not enter</summary>

Starting a session writes its proposed rows immediately, before anything is
tapped — see
[the progression rule](admin.html#how-next-weeks-numbers-are-worked-out).
Change them freely; each row is overwritten as you go.

</details>

---

## Data and display

### A record looks wrong

Records are read straight from the `Log` tab, so a wrong record means a wrong
row. Usually a mistyped weight — `1000` for `100` wins every record it
touches. Fix the row, then **Training → Rebuild records**.

Also worth knowing: two spellings of an exercise are two different exercises,
and bodyweight work only ever produces a *Most reps* record.

<details markdown="block">
<summary>The Records tab looks out of date</summary>

It is rewritten when a session is started or deleted, or an exercise or set is
added — not on every tap, so logging stays quick.
**Training → Rebuild records** catches it up.

The `Best` strip inside the app is always live regardless.

</details>

<details markdown="block">
<summary>An exercise picture does not show</summary>

The `image` column needs a **direct link to the image file**, public, ending
in `.jpg`, `.png`, `.gif` or `.webp`.

- A link to a *page* containing the image will not work.
- A Google Drive `/view` link is a page. Convert it to
  `https://drive.google.com/thumbnail?id=FILE_ID&sz=w640` — see
  [pictures of the exercises](admin.html#pictures-of-the-exercises).
- Share it as *Anyone with the link*.

Reload the app after editing. A broken link shows no thumbnail rather than
breaking the card.

</details>

<details markdown="block">
<summary>A viewer sees no day buttons, or fewer than I do</summary>

Deliberate. The admin sees every day type they *could* start — `Templates`,
everything logged, and **Custom**. A viewer sees only day types that have
sessions, because the rest would be buttons that always answer "nothing
logged".

A brand-new log shows a viewer *"Nothing has been logged yet."*

</details>

<details markdown="block">
<summary>An exercise autocompletes to the wrong name, or not at all</summary>

The list is the `Exercises` tab, and anything typed into **+ Add exercise**
that is not already there gets appended — so a typo becomes a permanent
suggestion. Delete the bad row from that tab.

Existing `Log` rows keep the name they were saved with; correct those
separately if it matters.

</details>

---

## Recovery

### I deleted the wrong day, or removed the wrong exercise

The app has no undo. The spreadsheet does:

**File → Version history → See version history**, pick the version from before
it happened, **Restore this version**.

If nothing else has happened since, *Edit → Undo* in the sheet works normally.

<details markdown="block">
<summary>Typing in the sidebar goes into the spreadsheet instead</summary>

A Google Sheets quirk — the grid steals keyboard focus from a sidebar. The app
fights back but not perfectly.

The sidebar is a test harness. Use the deployed link for real sessions.

</details>

<details markdown="block">
<summary>The page is blank</summary>

Reload once. Still blank: open it in a private window. Apps Script web apps
get confused when a browser is signed into several Google accounts at once.

</details>
