---
title: Admin
parent: User guide
nav_order: 1
---

# Admin guide

Running a session with the admin link. Written for a tablet, same on a phone.

Applies whether you are logging your own training or recording someone else's
— "you" means whoever holds the admin link.

---

## The screen

![A Push session open in the admin view, showing the date and session
navigation, day-type buttons, and two exercise cards with their records and
last-time values]({{ site.baseurl }}/img/admin-session.png)

Top to bottom:

| | |
|---|---|
| **Training — David** | The spreadsheet's name. Tap it to open the sheet itself. |
| **‹ date ›** | One calendar day at a time. |
| **‹ Previous session** / **Next session ›** | The nearest date that has a session of this day type. Greyed out when there is none. |
| **Push / Pull / Legs / Custom** | Day type. |
| **lb / kg** | Which unit weights are shown and typed in. See [pounds or kilograms](#pounds-or-kilograms). |
| **Best 8 × 15 lb · est 1RM 19** | [Records](records.html) for that exercise, with a **★ personal best today** tag when a set beats them. |
| **was 8 · was 5 · was 7** | What you did for that same set **the last time you did that exercise**, under the field it belongs to. |
| **last done 2026-08-05** | Only when that date is not the one the status bar names — see [what "last time" means](#what-last-time-means). |
| **Comparing against 2026-08-09** | The status bar. After a save it reports the row and the values read back **out of the spreadsheet**. |

The heading and the status bar stay put as you scroll.

While a day is loading, or while a change that rewrites rows is in flight, the
session dims and the controls disable until it settles.

Tapping reps, weight or RPE is **exempt** — those stay instant however fast
you tap. A burst of presses collapses into a single write, sent once you stop
for about half a second, so holding **+** costs one save rather than twenty.

{: .note }
Every link in the app opens in a **new tab**, on purpose. Navigating away
mid-session would take any not-yet-saved changes with it.

---

## Running a session

<video src="{{ site.baseurl }}/img/tablet-demo.mp4"
       autoplay loop muted playsinline controls
       aria-label="A Push session being started and logged on a tablet"
       style="max-width:360px;width:100%;border-radius:12px;border:1px solid #e3e3e0;display:block;margin:1.5rem 0">
</video>

### 1. Pick the date and day

| Control | Moves |
|---|---|
| **‹ ›** beside the date | One calendar day, logged or not |
| **‹ Previous session** / **Next session ›** | To the nearest date with a session of this day type |

Then tap a day type. **Push / Pull / Legs** are just what the starter template
contains — see [day types are yours](#day-types-are-yours). **Custom** is
always offered.

### 2. Start it

If nothing is logged for that day and date, you choose how to begin:

<img src="{{ site.baseurl }}/img/clip-start.gif" loading="lazy"
     alt="The start chooser offering From last time, From the template and Empty; choosing From last time builds the session"
     style="max-width:340px;width:100%;border-radius:12px;border:1px solid #e3e3e0;display:block;margin:1.5rem 0">

| Choice | What you get |
|---|---|
| **From last time** | The most recent session of that day type, with the [progression rule](#how-next-weeks-numbers-are-worked-out) applied per set. The normal week-to-week choice. |
| **From the template** | A fresh copy of the `Templates` tab for that day. Use it to reset after a layoff, or when last week was not representative. |
| **Empty** | Nothing. Add exercises as you go. |

Only possible choices appear. The first is the suggestion — *From last time*
normally, *Empty* for **Custom**.

<details markdown="block">
<summary>What happens when you choose</summary>

Starting a session **writes to the sheet immediately** — the proposed numbers
are rows before you touch anything. Changing a value overwrites that row, so
the sheet holds what actually happened, not what was proposed.

An **empty** session has no rows to save, so it does not survive a reload
until you add the first exercise. Nothing is lost, because nothing had been
entered.

**Custom** defaults to *Empty* rather than being restricted to it — if you did
the same thing last Custom day, *From last time* is offered and works.

</details>

### 3. Train and adjust

| Field | Steps by | Range |
|---|---|---|
| **Reps** *or* **Seconds** | 1 / 5 | 0 and up |
| **Weight (LB)** | 2.5 | 0 and up |
| **RPE** | 0.5 | 1–10, or blank |

Use **−** and **+**, or tap the number and type. Changes save themselves about
half a second later; there is no save button.

Under each field is what you did for **that same set** last time — `was 10`,
`was 20`, `was 8`. A blank means there was no matching set.

### What "last time" means

The last time you did **that exercise**, whenever that was and whatever day
type it was under — not whatever happened in the previous session of this day
type.

That distinction matters as soon as sessions stop being identical. Skip an
exercise one week, do it on a Custom day instead, or add it halfway through a
cycle, and the old rule had nothing to show you even with months of it in the
log.

The status bar still names the previous session of this day type, since that
is what *From last time* would build from. When a card's comparison comes from
a different date, the card says so:

```
   Bulgarian Split Squat                        [− 3 sets +]
   Best 12 × 30 lb  ·  est 1RM 42  ·  on 2026-08-11  ·  last done 2026-08-05
```

Personal records were already per exercise and are unchanged.

<img src="{{ site.baseurl }}/img/clip-logging.gif" loading="lazy"
     alt="Reps and weight being stepped up on the first set, and the status bar reporting the row and values it read back"
     style="max-width:340px;width:100%;border-radius:12px;border:1px solid #e3e3e0;display:block;margin:1.5rem 0">

The bar reports the row and the values it read back out of the spreadsheet, so
a save you can see is a save that landed.

### 4. Record RPE

How hard the set was, 1 to 10. This is what next week is calculated from.

| RPE | Meaning |
|---|---|
| 10 | Nothing left |
| 9 | One more rep in the tank |
| 8 | Two more |
| 7 | Three more |
| 6 or less | Could have kept going |

Clear the field to leave it blank; a blank counts as 8 next week, which is
deliberately unexciting.

### 5. Watch for records

```
   Barbell Bench Press                          [− 4 sets +]
   Best 8 × 30 lb  ·  est 1RM 38  ·  on 2026-07-19
```

Beat it and a **★ personal best today** tag joins the strip, and the one set
that actually takes the record gets a star by its number and a faint tint.

Only that set is marked, not every set that clears the old number. A generated
session steps up together, so most weeks *all* of them beat last time — and
marking them all lit up the whole card and said nothing.

Both update as you tap. Configurable — see [personal records](records.html).

---

## When the wifi drops

Nothing is lost. Every tap is queued on the device and retried until the sheet
confirms it. The bar turns amber:

```
   │ 3 changes not saved yet — waiting for   [ Retry now ]│
```

Carry on training. It retries on reconnect and when you return to the tab.

{: .warning }
Do not close the tab while it is amber — the browser will warn you. Set
counts, adding an exercise and *Delete this day* are refused until it clears,
because they shuffle rows underneath changes that have not landed.

---

## Changing the workout

### Sets, and removing an exercise

The **− n sets +** counter adds or removes sets from the end. Adding copies
the last set's reps and weight.

Going **below one set removes the exercise** from the session. It asks first,
then deletes those rows from the sheet.

### A different exercise

**+ Add exercise**, type the name — it autocompletes from the `Exercises` tab,
which ships with 255 movements — then choose **Reps** or **Seconds** and
set the numbers.

```
   ┌────────────────────────────────────────────┐
   │ Plank                                    ▾ │
   ├──────────────────────┬─────────────────────┤
   │        Reps          │      Seconds        │  ← pre-picked from the
   ├──────────────────────┴─────────────────────┤     Exercises tab, yours
   │  Sets 3   │  Seconds 30  │                 │     to override
   └────────────────────────────────────────────┘
```

<img src="{{ site.baseurl }}/img/clip-unit.gif" loading="lazy"
     alt="Adding Plank to an empty session: the unit toggle flips itself to Seconds, the weight box disappears, and the seconds are set to 45"
     style="max-width:340px;width:100%;border-radius:12px;border:1px solid #e3e3e0;display:block;margin:1.5rem 0">

Pick a known exercise and the toggle follows the `Exercises` tab and says so.
Change it and your choice wins for this add. The weight box disappears
entirely for exercises that carry none — `Plank` above is timed and unloaded,
so it offers **Seconds** and no weight.

The name is **free text** — it autocompletes, but nothing stops you typing
something that is not on the list. The same exercise cannot be added to one
session twice.

**The card appears straight away** and the rows are written behind it, so you
can start logging the first set while the sheet catches up. Its edge stays
dashed until the sheet has it. Anything typed in that window is kept and
saved the moment the rows exist — nothing is thrown away by the response
landing.

While an add is in flight the app will not let you change day, date or set
counts: those move rows, and the add is about to be given some. It clears in a
second or two, and a stuck one falls back to reloading from the sheet rather
than leaving the page wedged.

{: .note }
**A name that is not on the list gets added to the `Exercises` tab**, so it
autocompletes from then on — and if you set the toggle to *Seconds*, the new
row is marked `time based` too. An existing exercise keeps whatever unit the
tab already says it uses; the toggle only changes this one session's rows.

### Pounds or kilograms

The **lb / kg** switch beside the heading changes every weight on screen —
the fields, the `was` lines, the records, the add form. Tap it when you walk
up to a machine marked in the other unit; it takes effect immediately and
mid-session is a normal time to use it.

**The sheet is always pounds.** Column F stays `Weight (LB)`, so records,
progression and every comparison keep working on one unit. Kilograms are
converted as you read and type, nothing more.

| | |
|---|---|
| Typing `60` in kg | Stores `132.3` lb, reads back as `60` |
| **+** in kg | Steps 2.5 kg — clean numbers, not what 2.5 lb converts to |
| Switching unit | Changes nothing in the sheet and saves nothing |

The choice is remembered on that device, not in the log, because it belongs to
the machine in front of you rather than to the person training. The admin's
tablet and a viewer's phone can disagree.

{: .note }
Progression is worked out in pounds, so a kg user sees steps of 2.3 kg rather
than a round 2.5. The generated number is a proposal you overwrite anyway.

### Renaming an exercise

The **✎** beside an exercise name opens a full-width text box across the top of
the card. Rename, press Enter, done — no trip to the spreadsheet. Escape
cancels. Useful when you logged something under a
[throwaway name](#when-you-cannot-name-it-mid-session).

<img src="{{ site.baseurl }}/img/clip-rename.gif" loading="lazy"
     alt="The pencil beside Lat Pulldown opening a full-width box, the name being retyped as Machine by the window, and the card reloading under the new name"
     style="max-width:340px;width:100%;border-radius:12px;border:1px solid #e3e3e0;display:block;margin:1.5rem 0">

{: .note }
It renames **this session only**. The same exercise in earlier sessions keeps
its old name, deliberately — rewriting history would change what progression
and records were built from. The new name joins the `Exercises` tab so it
autocompletes next time.

<details markdown="block">
<summary>When you cannot name it mid-session</summary>

Type anything — the box is free text, not a fixed list. `Machine by the
window` is a perfectly good name for one session, and **✎** renames it the
moment you find out what it is really called.

{: .warning }
If you do use a throwaway name, rename it before the next session of that day
type. Progression matches on the name, so two different movements both logged
as `temp` get progressed into each other.

</details>

### Notes

The box at the bottom of each card is free text — form cues, a niggle, a
machine setting. It belongs to the exercise, not one set, so it survives
adding and removing sets.

It saves three ways: the **Save note** button, a second and a half after you
stop typing, and when you tap out. Last week's note appears underneath.

### Starting over

**Delete this day** removes every row for that day type and date. No undo in
the app — but the spreadsheet has *File → Version history*.

---

## Exercises measured in time

A plank is 30 seconds, not 30 reps. Exercises flagged as timed show
**Seconds** where the others show **Reps**, and the field steps by 5:

```
      Seconds     RPE                  instead of
   1 [− 30 +]  [− 7 +]                 Reps · RPE
      was 25      was 8
```

Everything else follows: progression adds or removes **seconds** rather than
reps, records read *Longest hold* instead of *Most reps*, and no estimated 1RM
is offered — the number means nothing for a hold.

Column **G** of the `Exercises` tab, headed `time based`, controls it — `yes`
for seconds, blank for reps. 23 rows ship marked: the planks and holds, wall
sits, carries, sled work, and every cardio machine.

{: .note }
Timed and loaded are independent. A farmer carry is *both* — seconds in the
first field, and a weight that still progresses. A plank is timed with no
weight, and a bench press is neither.

The `Log` tab keeps one column for both, headed `Reps / Secs`. Which unit a
row means is a property of the exercise, so changing that flag re-reads the
history in the new unit.

---

## Exercises with no weight

Push-ups, planks, pull-ups, the rower: nothing to load, so the weight field is
hidden and the card shows reps and RPE only.

```
        Reps       RPE                 instead of
     1 [− 20 +]  [− 7 +]               Reps · Weight · RPE
        was 18     was 8
```

An easy set then earns **reps** rather than weight, so a push-up never becomes
a 5 lb push-up. Records track most reps instead of heaviest. **+ Add
exercise** drops the weight box for these too.

Column **E** of the `Exercises` tab, headed `no weight`, controls it — `yes`
to hide the field, blank otherwise. 52 rows ship marked.

{: .note }
Doing weighted pull-ups or dips? Clear the `yes` on that row. `Weighted
Pull-Up` and `Weighted Chin-Up` already ship unflagged.

---

## Showing what the movement is

Two columns on the `Exercises` tab, both optional.

**Column F, `video`** — every exercise ships with one already: a **▶ How to**
link beside the name that opens a YouTube search for that movement, in a new
tab. Replace any of them with a specific video you trust.

{: .note }
A search rather than one fixed video, because a search never rots, covers all
250-odd rows, and stays current. Picking *the* video for an exercise is a
judgement worth making yourself.

**Column D, `image`** — paste a picture or GIF URL and that exercise gets a
thumbnail; tap it, or the name, to see it full width. Blank by default,
because an image URL has to be one you are allowed to use.

<details markdown="block">
<summary>Which image links work</summary>

It must be a **direct link to the image**, reachable without signing in and
ending in `.jpg`, `.png`, `.gif` or `.webp`. A link to a page *containing* an
image will not work — that is what column F is for.

For a picture in your own Google Drive:

1. Upload it, then **Share → Anyone with the link**.
2. Copy the link — `https://drive.google.com/file/d/FILE_ID/view?usp=sharing`.
3. Take `FILE_ID` from the middle and use this instead:

   ```
   https://drive.google.com/thumbnail?id=FILE_ID&sz=w640
   ```

Reload the app after editing the tab. A dead link shows no thumbnail rather
than breaking the card.

</details>

---

## Day types are yours

Nothing about Push / Pull / Legs is built in. The buttons are assembled on
every load:

```
   Templates tab   +   Log tab            +   always
   (day column)        (Day column)           appended
   Push                everything ever        Custom
   Pull                logged
   Legs
        └──────────── duplicates removed ────────────┘
                            ▼
              [ Push ] [ Pull ] [ Legs ] [ Custom ]
```

Put whatever names you like in the `day` column of `Templates` — Upper /
Lower, Full body, A / B, one day, five. A day type also appears the moment
anything is logged against it.

<details markdown="block">
<summary>Renaming and removing day types</summary>

Rename in the `Log` tab: select the column, *Edit → Find and replace*, replace
the old name with the new. The old button disappears on the next reload.

Removing is the same in reverse — once no rows and no template lines mention
it, the button stops appearing. **Custom** is the exception; it is always
offered.

Each person's day types live in their own spreadsheet, so two people tracked
by the same trainer need not match.

</details>

---

## How next week's numbers are worked out

Each set is looked at on its own and adjusted by its own RPE:

```
  RPE of that set          becomes                    note written
  ─────────────────        ───────────────────        ────────────
  6.5 or less        →     +2 reps, +5 lb             "was easy"
  7 to 8.5           →     +2 reps, same weight       —
  9 to 9.5           →     same reps, same weight     "repeat"
  10                 →     −2 reps, −5% weight        "backed off"

  blank RPE          →     treated as 8
```

Weights round to the nearest 2.5 lb. The note lands in the *Auto note* column
so you can see why a number moved.

**These are a proposal.** Override them freely — the app's job is to save you
doing the arithmetic for thirty sets, not to decide the training.

{: .note }
An exercise at 0 lb stays at 0 forever, because "+2 reps, same weight" never
moves it. Type the real weight in once and the rule takes over. Templates seed
weights at 0 on purpose.

---

## Housekeeping

### Archiving old sessions

**Training → Archive old sessions…** lifts a closed period out into its own
spreadsheet and removes it from this one.

Give it a cut-off date. Everything up to and including that date is copied to
a new file named after the range — `Training — David_2024-01-01_2024-12-31` —
and then deleted here. It tells you how many rows and sessions before doing
anything.

{: .warning }
Records are worked out from what is left, so bests set in the archived period
stop showing in the app. The archive keeps its own `Records` tab, so they are
not lost — just no longer live.

### The spreadsheet underneath

The `Log` tab is the actual record; the app is a convenient front door. Sort,
filter, chart, export or edit it freely — the app reads it fresh each time.

| Column | Holds |
|---|---|
| A–D | Date, Day type, Exercise, Set number |
| E–G | Reps, Weight (LB), RPE |
| H | Auto note — the app's (`from template`, `was easy`, `repeat`, `backed off`) |
| I | Notes — yours |

{: .warning }
Keep the column order. The code reads columns by position, not by heading.
