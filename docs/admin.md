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

```
┌──────────────────────────────────────────────┐
│  Training — David                            │  ← sheet name, links to it
│  TRAINING LOG                                │
│                                              │
│  [ ‹ ]  [ 2026-08-09 ]  [ › ]                │  ← one calendar day
│  [ ‹ Previous session ][ Next session › ]    │  ← jump to a logged session
│                                              │
│  [ Push ]  [ Pull ]  [ Legs ]  [ Custom ]    │  ← day type
│  [ Delete this day ]                         │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Barbell Bench Press        [− 4 sets +]│  │
│  │ Best 8 × 30 lb · est 1RM 38 · on …     │  │  ← records
│  │                                        │  │
│  │    Reps    Weight (LB)    RPE          │  │
│  │ 1 [− 12 +]  [− 25 +]    [− 8 +]        │  │
│  │    was 10    was 20      was 8         │  │  ← last time, per field
│  │                                        │  │
│  │ Notes …                     [Save note]│  │
│  └────────────────────────────────────────┘  │
│  [ + Add exercise ]                          │
├──────────────────────────────────────────────┤
│  Saved row 14: 12 x 25 @ RPE 8               │  ← status bar
└──────────────────────────────────────────────┘
```

The heading is the spreadsheet's name — tap it to open the sheet itself. The
bottom bar reports the row and the values read back **out of the spreadsheet**
after saving. Both stay put as you scroll.

---

## Running a session

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

```
   ┌──────────────────────────────────────────────────────┐
   │ From last time                2026-08-02 + progression│  ← suggested
   ├──────────────────────────────────────────────────────┤
   │ From the template                        5 exercises  │
   ├──────────────────────────────────────────────────────┤
   │ Empty                                   add as you go │
   └──────────────────────────────────────────────────────┘
```

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
| **Reps** | 1 | 0 and up |
| **Weight (LB)** | 2.5 | 0 and up |
| **RPE** | 0.5 | 1–10, or blank |

Use **−** and **+**, or tap the number and type. Changes save themselves about
half a second later; there is no save button.

Under each field is what you did for **that same set** last time — `was 10`,
`was 20`, `was 8`. A blank means there was no matching set.

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

Beat it and that set's boxes tint amber, with a **★ personal best today** tag
joining the strip. Both update as you tap. Configurable — see
[personal records](records.html).

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
which ships with over 250 movements — then set sets, reps and weight.

An unknown name is added to the `Exercises` tab automatically. The same
exercise cannot be added twice.

<details markdown="block">
<summary>When you cannot name it mid-session</summary>

The list includes **`[Other]`**. Pick it when nothing matches and you do not
want to stop and think — an unlabelled machine, an improvised movement, a
rehab drill.

Rename it afterwards in the `Log` tab: find the `[Other]` rows for that date
and type the real name over them.

{: .warning }
Rename it before the next session of that day type. Progression matches by
name, so two different movements both left as `[Other]` get progressed into
each other.

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

## Pictures of the exercises

Put an image or GIF URL in column **D** of the `Exercises` tab and that
exercise gets a thumbnail — tap it, or the name, to see it full width. Worth a
lot when someone is new to a movement.

Blank is fine and is the default; nothing breaks.

<details markdown="block">
<summary>Which links work</summary>

It must be a **direct link to the image**, reachable without signing in and
ending in `.jpg`, `.png`, `.gif` or `.webp`. A link to a page *containing* an
image will not work.

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
