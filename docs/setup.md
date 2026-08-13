---
title: Setup guide
nav_order: 2
---

# Setup guide

Four steps, all in a browser. No software, no command line, about fifteen
minutes the first time.

You need a Google account. Anyone you send a viewer link to does not.

1. **Import the template** into a new Google Sheet
2. **Paste in the code** — two files, into the Apps Script editor
3. **Publish the web app**
4. **Send out the links** — one that edits, one that only reads

---

## 1. Import the spreadsheet

[Download the template]({{ site.baseurl }}/download/training-tracker-template.xlsx){: .btn .btn-primary }

1. Go to [sheets.new](https://sheets.new).
2. **File → Import → Upload**, drop the `.xlsx` in.
3. Choose **Replace spreadsheet**, then **Import data**.
4. Name it — **Training — Jane**, **Training — me**. One per person.

{: .warning }
Import it, do not open it. Double-clicking the file in Drive opens it in
Office-compatibility mode, which cannot run Apps Script.

The name becomes the app's heading and browser tab title, so it is how you
tell one person's log from another. Rename any time; the app follows.

You now have five tabs:

| Tab | What it is |
|---|---|
| `Log` | Empty but for headings. Every set ever logged lands here. |
| `Exercises` | 255 names for autocomplete, each with a how-to video link. Grows on use. |
| `Templates` | The starting workout for each day type. |
| `Settings` | Which [records](records.html) to track. Fine to ignore. |
| `Records` | Output. Do not type in it. |

<details markdown="block">
<summary>Tailoring the template first (optional)</summary>

The `Templates` tab is read only for the *very first* session of each day
type — after that the app works from history.

Each day ships with **five exercises, sixteen sets** — about an hour with
rest. Add or remove rows freely.

Column **F**, `include in new session`, decides whether a row is generated.
Blank means yes; `no` keeps it on the plan as a reminder without putting it in
the session. Each day has one as a worked example — `Cable Chest Fly`,
`Hammer Curl`, `Standing Calf Raise`.

The `day` column becomes the buttons in the app. Push / Pull / Legs is just
what ships; Upper / Lower, A / B, anything works. A **Custom** button is
always offered on top. See
[day types are yours](admin.html#day-types-are-yours).

</details>

---

## 2. Paste in the code

**Extensions → Apps Script**, and rename the project **Training log**.

**The server file** — click `Code.gs`, select all, delete. Open
[`src/Code.gs`]({{ site.repo }}/blob/main/src/Code.gs), click **Raw**, copy,
paste in.

**The interface file** — **+ → HTML**, name it exactly `Index` (no extension).
Delete the sample. Open
[`src/Index.html`]({{ site.repo }}/blob/main/src/Index.html), **Raw**, copy,
paste in.

{: .warning }
Replace, do not append. Select everything in `Code.gs` and delete it before
pasting, and do not add a second `.gs` file — Apps Script joins every `.gs`
file into one scope, so a duplicate stops the whole script with
`Identifier 'CFG' has already been declared`.

Save. It should look like this:

![The Apps Script editor with Code.gs and Index.html]({{ site.baseurl }}/img/apps-script-editor.jpeg)

Back in the spreadsheet, **reload the page**. A **Training** menu appears:

![The Training menu open in Google Sheets]({{ site.baseurl }}/img/training-menu.png)

That is how you know the code is attached to the right spreadsheet. Missing?
See [troubleshooting](troubleshooting.html#the-training-menu-is-missing).

{: .note }
Dates follow **your spreadsheet's** time zone — *File → Settings → Time zone*
in the sheet. Worth a glance if you train late in the evening, since that is
when a wrong zone would file a session under the previous day.

---

## 3. Publish the web app

**Deploy → New deployment**, gear icon → **Web app**.

| Field | Set to | Why |
|---|---|---|
| Execute as | **Me** | The app edits *your* sheet on everyone's behalf, so nobody else needs access to it |
| Who has access | **Anyone** | Links open without signing in. What they can *do* is decided by the key in the URL |

**Deploy**, then authorize — pick your account, **Advanced → Go to Training
log (unsafe) → Allow**.

<details markdown="block">
<summary>"Google hasn't verified this app"</summary>

Expected. This is your own script and was never submitted for review. It asks
only to read and write the spreadsheet it is attached to, and to show its own
web page.

</details>

When it finishes, copy the **Web app URL** ending in `/exec`. Step 4 needs it.

---

## 4. The two links

In the spreadsheet: **Training → Show shareable links**. The first time it
asks you to paste that `/exec` URL. Paste, OK — it is remembered.

{: .warning }
It must be the link ending in **`/exec`**. The `/dev` one is the editor's test
link and only ever works for you. Made a *new* deployment later? That mints a
new URL — run **Training → Set web app link**.

```
        …/exec?key=a1b2c3d4e5f6         …/exec
        ADMIN                           VIEWER
        start sessions                  view any session
        change reps / weight / RPE      read notes
        add + remove exercises          ✗ cannot change anything
        write notes, delete a day
```

Keep the admin link if you log your own training; give it to your trainer if
they record your sessions. The viewer link is optional either way.

**Treat the admin link like a password** — anyone holding it can edit this
log, with no sign-in. Send it privately. If it leaks, see
[rotating the key](#rotating-the-admin-key).

The viewer link is read-only but not secret: it shows the whole training
history to anyone who opens it.

{: .tip }
On a tablet, open the admin link and use *Share → Add to Home Screen*. It then
behaves like an app icon.

---

## Check it works

1. Open the admin link, tap **Push**, then **From the template**.
2. Tap **+** on a weight. The bottom bar should read *Saved row 2: 8 x 2.5* —
   the row and the values read back **out of the sheet**.
3. Confirm the number really is in the `Log` tab.
4. Open the viewer link in a private window: same session, no buttons.
5. Back on the admin link, **Delete this session** to clear the test.

---

## Afterwards

<details markdown="block">
<summary>Adding another person</summary>

Start from step 1 with a fresh import — a clean sheet with no data to delete.

To keep `Templates` customisations instead: **File → Make a copy**, then
delete every `Log` row from row 2 down.

Either way the copy needs **its own deployment** (step 3) and its own link
(step 4). *Make a copy* copies the code but not the deployment.

Each copy is fully independent — own sheet, own deployment, own admin key.

</details>

<details markdown="block">
<summary>Rotating the admin key</summary>

1. **Extensions → Apps Script → Project Settings**.
2. Under **Script Properties**, delete the `EDIT_KEY` row, save.
3. **Training → Show shareable links** for the new one.

The old admin link stops editing. The viewer link is unaffected.

</details>

<details markdown="block">
<summary>Updating to a newer version of the code</summary>

1. Replace `Code.gs` and `Index.html` as in step 2, save.
2. **Deploy → Manage deployments → pencil → Version: New version → Deploy.**

The links stay the same. Skipping step 2 keeps serving the old version.

{: .warning }
**Do not re-import the template to update.** *File → Import → Replace
spreadsheet* replaces the **whole spreadsheet**, and the template ships a `Log`
containing nothing but headings — so every session you have ever logged is
gone. The code lives in Apps Script, not in the spreadsheet, so updating it
never requires an import.

To pick up template changes — new exercises, a new column — copy just the tab
you want:

1. Import the new template into a **separate, throwaway** spreadsheet.
2. Right-click the tab you want → **Copy to → Existing spreadsheet**, and pick
   your log.
3. In your log, delete the old tab and rename the copy to the original name.

Your `Log` is never touched. If you have already lost data this way,
*File → Version history → See version history* still has it.

</details>

<details markdown="block">
<summary>For developers</summary>

The browser route above is the supported path. `clasp`, regenerating the
template and the manual test loop are in
[DEVELOPMENT.md]({{ site.repo }}/blob/main/DEVELOPMENT.md).

</details>
