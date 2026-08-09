---
title: Setup guide
nav_order: 2
---

# Setup guide
{: .no_toc }

Four steps, all in a web browser. No software to install, no command line.
Budget about fifteen minutes the first time.

You need a Google account. Anyone you share a viewer link with does not.

```
  1. Import the template      2. Paste in the code
     one .xlsx file              two files, copy and paste
              │                          │
              ▼                          ▼
  4. Send out the links  ◀──  3. Publish the web app
     admin + viewer              Deploy → Web app
```

1. TOC
{:toc}

---

## Step 1 — Import the spreadsheet template

The template is one file containing every tab, already named and already
filled with a starting exercise list. You import it once per person you are
tracking.

[Download the spreadsheet template]({{ site.baseurl }}/download/training-tracker-template.xlsx){: .btn .btn-primary }

1. Download the file above — it saves as `training-tracker-template.xlsx`.
2. Go to [sheets.new](https://sheets.new) — a blank spreadsheet opens.
3. **File → Import → Upload**, and drop the `.xlsx` file in.
4. Under *Import location* choose **Replace spreadsheet**, then **Import
   data**.
5. Click the name in the top left and call it something like
   **Training — Jane** or **Training — me**. One spreadsheet per person.

The name matters: the app shows it as its heading and uses it as the browser
tab title, so it is how you tell one person's log from another. You can rename
the spreadsheet at any time and the app follows.

You now have five tabs along the bottom:

| Tab | What it is |
|---|---|
| `Log` | Empty apart from the headings. Every set ever logged lands here. |
| `Exercises` | 250+ exercise names. Feeds the autocomplete, and grows on its own when you use a name that is not there yet. |
| `Templates` | The starting workout for each day type. |
| `Settings` | Which [personal records](records.html) to track. Fine to ignore. |
| `Records` | Output — your bests, rewritten from the log. Do not type in it. |

{: .warning }
Import it, do not open it. Double-clicking the `.xlsx` in Google Drive opens
it in Office-compatibility mode, which cannot run Apps Script. The
*File → Import → Replace spreadsheet* route above converts it into a real
Google Sheet, which can.

{: .tip }
Edit the `Templates` tab now if the first session should look different. It is
read only for the very first session of each day type — after that the app
works from history and stops looking at it.

Each day ships with **five exercises, sixteen sets** — about an hour once rest
is counted. That is a starting point, not a rule; add or remove rows freely.

Column **F**, `include in new session`, decides whether a row is used when a
session is generated from the template. Leave it blank for yes. Put `no`
against an exercise you want on the plan as a reminder without it being
generated — the leg press you sometimes do, not the one you always do.

Each day already has one such row as a worked example — `Cable Chest Fly` on
Push, `Hammer Curl` on Pull, `Standing Calf Raise` on Legs. They are listed but
never generated. Clear the `no` and they join the session; add `no` to another
row to take it out.

The day names in that tab are what become the buttons in the app. The template
ships with Push / Pull / Legs, but Upper / Lower, Full body, A / B or anything
else works — put the names you want in the `day` column. A **Custom** button
for ad-hoc sessions is always offered on top of whatever you choose. See
[day types are yours](admin.html#day-types-are-yours).

---

## Step 2 — Paste in the code

1. In the spreadsheet menu: **Extensions → Apps Script**. A new browser tab
   opens, titled *Untitled project*.
2. Click that title and rename it **Training log**.

### The server file

On the left is a file called `Code.gs` holding a few lines of sample code.

1. Click `Code.gs`, select everything in the editor, delete it.
2. Open [`src/Code.gs`]({{ site.repo }}/blob/main/src/Code.gs),
   click **Raw**, select all, copy.
3. Paste into the empty editor.

### The interface file

1. Next to *Files* on the left, click **+ → HTML**.
2. Name it exactly `Index` — the editor adds `.html` itself, so do not type
   the extension.
3. Delete the sample content it created.
4. Open [`src/Index.html`]({{ site.repo }}/blob/main/src/Index.html),
   click **Raw**, select all, copy, paste in.

### Save

Click the save icon, or `Ctrl`/`Cmd` + `S`. Switch back to the spreadsheet tab
and **reload the page**.

A new **Training** menu appears next to *Help*. That is how you know the code
is attached to the right spreadsheet. If it is missing, see
[Troubleshooting](troubleshooting.html#the-training-menu-is-missing).

---

## Step 3 — Publish the web app

Back in the Apps Script tab:

1. Top right: **Deploy → New deployment**.
2. Click the gear next to *Select type*, choose **Web app**.
3. Fill in:

   | Field | Set it to | Why |
   |---|---|---|
   | Description | `initial` | Just a label for you |
   | Execute as | **Me** | The app edits *your* sheet on everyone's behalf, so nobody else needs access to the spreadsheet itself |
   | Who has access | **Anyone** | A link opens without signing in. What it can *do* is decided by the key in the URL, not by this setting |

4. Click **Deploy**.

Google now asks for permission, because the script reads and writes your
spreadsheet.

1. **Authorize access**, choose your Google account.
2. You will see *Google hasn't verified this app*. That is expected — this is
   your own script and it was never submitted for review.
3. **Advanced → Go to Training log (unsafe) → Allow**.

Ignore the URL on the confirmation screen. The links you want come from step 4.

---

## Step 4 — The two links

Go back to the spreadsheet: **Training → Show shareable links**.

```
        …/exec?key=a1b2c3d4e5f6         …/exec
        ─────────────────────────       ────────────────
        ADMIN                           VIEWER
        start sessions                  view any session
        change reps / weight / RPE      read notes
        add + remove sets               ✗ cannot change anything
        write notes
        delete a day
```

Keep the admin link if you log your own training. Give it to your trainer if
they record your sessions for you. The viewer link is optional either way.

Read-only is enforced on the server, not by hiding buttons. Every write checks
the key before it touches the sheet, so someone who edits the page in their
browser still cannot save anything.

### About the admin link

**Treat it like a password.** Anyone holding it can edit this log, with no
sign-in of any kind. Send it privately — not in a shared document, a group
chat, or a calendar invite.

If it does leak, you can invalidate it in about thirty seconds — see
[rotating the admin key](#rotating-the-admin-key). The viewer link is
unaffected by that and never needs re-sending.

### About the viewer link

It is read-only but it is not secret: anyone who opens it sees the whole
training history. Treat it like any other private link and do not post it
publicly.

{: .tip }
On the tablet, open the admin link and use *Share → Add to Home Screen*. It
then behaves like an app icon, with no URL to mistype or lose.

---

## Check it works

1. Open the admin link.
2. Tap **Push**, then the **Start Push session on …** button (it shows
   today's date).
3. The exercises from the `Templates` tab appear, one card each.
4. Tap **+** on a weight. The grey bar at the bottom should read something
   like *Saved row 2: 8 x 2.5* — that is the row number and the values read
   back **out of the sheet**, not a guess.
5. Switch to the spreadsheet, look at the `Log` tab, confirm the number is
   really there.
6. Open the viewer link in a private window. Same session, no buttons, and a
   *Read only* badge at the top.
7. Back on the admin link: **Delete this day** to clear the test.

That is a complete working install.

---

## Adding another person

Relevant if you are a trainer tracking several people, or setting a log up for
someone in your household. Each person gets their own everything.

Start from step 1 again with a fresh import — it is a clean sheet with no
data to delete.

Alternatively, if you have customised the `Templates` tab and want to keep
those changes: open the working spreadsheet, **File → Make a copy**, then in
the copy delete every `Log` row from row 2 down (leave the headings).

Either way, the copy still needs its own deployment:

- **Extensions → Apps Script → Deploy → New deployment**, same settings as
  [step 3](#step-3--publish-the-web-app), authorize again.
- **Training → Show shareable links** for that person's pair of links.

Each copy is completely independent: its own sheet, its own deployment, its
own admin key. There is no shared server and nothing to keep in sync.

{: .warning }
*Make a copy* copies the code but **not** the deployment. Skipping the deploy
leaves the copy with no working links.

---

## Rotating the admin key

1. **Extensions → Apps Script → Project Settings** (the gear on the left).
2. Scroll to **Script Properties**.
3. Delete the row called `EDIT_KEY` and save.
4. In the spreadsheet: **Training → Show shareable links**. A new key has been
   generated, and the old link can no longer change anything.

---

## Updating to a newer version of the code

1. **Extensions → Apps Script**.
2. Replace the contents of `Code.gs` and `Index.html` as in
   [step 2](#step-2--paste-in-the-code).
3. Save.
4. **Deploy → Manage deployments**, click the pencil, set *Version* to **New
   version**, **Deploy**.

The links stay the same. Skipping step 4 saves the code but keeps serving the
old version to everyone.

---

## For developers

The browser route above is the supported path — it is what non-technical
admins use and what these docs are tested against. Pushing code with `clasp`, regenerating
the spreadsheet template, and the manual test loop are in
[DEVELOPMENT.md]({{ site.repo }}/blob/main/DEVELOPMENT.md).
