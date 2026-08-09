---
title: Admin guide
nav_order: 3
---

# Admin guide
{: .no_toc }

How to run a session with the admin link. Written for the tablet, works the
same on a phone.

Everything here applies whether you are logging your own training or recording
someone else's — the app does not know the difference. Where it says "you",
read it as "whoever holds the admin link".

1. TOC
{:toc}

---

## The screen, top to bottom

```
┌──────────────────────────────────────────────┐
│  Training log                                │
│                                              │
│  [ Push ]  [ Pull ]  [ Legs ]                │  ← day type
│                                              │
│  [ ‹ ]  [ 2026-08-09 ]  [ › ]                │  ← which session
│                                              │
│  [ Delete this day ]                         │
│                                              │
│  ┌────────────────────────────────────────┐  │
│  │ Barbell Bench Press        [− 4 sets +]│  │  ← one card
│  │ Last time: 10 x 20 @8 · 8 x 30 @9      │  │    per exercise
│  │                                        │  │
│  │    Reps    Weight (LB)    RPE          │  │
│  │ 1 [− 12 +]  [− 25 +]    [− 8 +]        │  │
│  │ 2 [− 10 +]  [− 30 +]    [−   +]        │  │
│  │                                        │  │
│  │ Notes …                     [Save note]│  │
│  └────────────────────────────────────────┘  │
│                                              │
│  [ + Add exercise ]                          │
├──────────────────────────────────────────────┤
│  Saved row 14: 12 x 25 @ RPE 8               │  ← status bar
└──────────────────────────────────────────────┘
```

The grey bar along the bottom is worth watching. It is not decoration — it
reports the row number and the values it read back **out of the spreadsheet**
after saving. If it says *Saved*, the number is in the sheet.

---

## Running a session

### 1. Pick the day

Tap a day type along the top. **Push**, **Pull** and **Legs** are only what
the starter template happens to contain — see
[day types are yours](#day-types-are-yours) below.

The last button, **Custom**, is always there and always starts empty.

### 2. Check the date

The date box shows today. Leave it alone for a normal session.

The **‹** and **›** arrows skip between sessions that actually exist for that
day type — **‹** goes back in time, **›** forward. They are the fastest way to
look at what happened three Pushes ago without scrolling the sheet.

### 3. Start it

If nothing has been logged for that day and date yet, you get one button:

> **Start Push session on 2026-08-09**
> *Will build from 2026-08-02.*

Tap it. The app copies the most recent Push, applies the progression rule to
every set, and writes the new rows into the sheet. If there is no earlier Push
at all, it builds from the `Templates` tab instead.

{: .note }
Starting a session **writes to the sheet immediately** — the proposed numbers
are saved as rows before you touch anything. Changing a value during the
session overwrites that row. What ends up in the sheet is what actually
happened, not what was originally proposed.

**Custom** is the exception. It starts with nothing, every time, and waits for
you to add exercises:

> **Start Custom session on 2026-08-09**
> *Starts empty — add exercises as you go.*

That is what it is for — a one-off, a class, a rehab session, anything that
does not repeat. It never carries last week's exercises forward, because there
is no way to remove one you did not want.

{: .warning }
An empty Custom session is not saved anywhere until you add the first
exercise — there are no rows to save. If you tap away or reload before adding
one, you get the Start button again. Nothing is lost, because nothing had been
entered.

### 4. Train and adjust

Each card is one exercise. Each numbered row is one set, with three fields:

| Field | Steps by | Range |
|---|---|---|
| **Reps** | 1 | 0 and up |
| **Weight (LB)** | 2.5 | 0 and up |
| **RPE** | 0.5 | 1–10, or blank |

Use **−** and **+**. You can also tap the number and type into it — the field
selects itself so you overwrite rather than edit, and it tidies the value up
when you tap away.

Every change saves on its own about half a second later. There is no save
button for the numbers.

### 5. Record RPE

RPE is *rate of perceived exertion* — how hard that set was, 1 to 10.

| RPE | Meaning |
|---|---|
| 10 | Nothing left, could not have done another rep |
| 9 | One more rep in the tank |
| 8 | Two more |
| 7 | Three more |
| 6 or less | Comfortable, could have kept going |

This is the single most important number in the app, because it is what next
week is calculated from. Clear the field to leave it blank; a blank is treated
as 8 next week, which is deliberately unexciting.

---

## Day types are yours

Nothing about **Push / Pull / Legs** is built into the app. The buttons along
the top are assembled fresh on every load from two sources:

```
   Templates tab            Log tab                  always
   (day column)             (Day column)             appended
   ────────────────         ─────────────────        ────────
   Push                     everything ever          Custom
   Pull            +        logged, in the      +
   Legs                     order it appears
        │                          │                    │
        └──────────────────────────┴────────────────────┘
                            │
                       duplicates removed
                            ▼
              [ Push ] [ Pull ] [ Legs ] [ Custom ]
```

So you can run whatever split you like:

- **Upper / Lower**, **Full body**, **A / B**, five named days, one day — put
  the names you want in the `day` column of the `Templates` tab and reload the
  page.
- A day type also appears the moment anything is logged against it, which is
  how a session started from **Custom** and then renamed in the sheet turns
  into a permanent button.
- Anyone can have a different set. The day types live in that person's own
  spreadsheet, so two people tracked by the same trainer need not match.

To rename a day type after the fact, change it in the `Log` tab — select the
column, *Edit → Find and replace*, tick *Search using regular expressions*
off, and replace the old name with the new one. The old button disappears on
the next reload.

{: .tip }
Deleting a day type is the same operation in reverse: once no rows and no
template lines mention it, the button stops appearing. **Custom** is the one
exception — it is always offered.

---

## Changing the workout

### More or fewer sets

Use the **− n sets +** counter in the corner of a card. Adding a set copies
the last set's reps and weight. Removing takes them off the end. Minimum 1,
maximum 10.

{: .warning }
There is no button to remove an exercise from a session. Drop it to one set
and ignore it, or delete those rows in the `Log` tab of the spreadsheet by
hand.

### A different exercise

Tap **+ Add exercise** at the bottom, type the name — it autocompletes from
the `Exercises` tab — set sets, reps and weight, then **Add**.

A name that is not on the list yet gets added to the `Exercises` tab
automatically, so it autocompletes from then on. The same exercise cannot be
added to a session twice.

### Notes

The box at the bottom of each card is free text: form cues, a niggle, the
seat setting on a machine. It belongs to the exercise, not to one set, so it
survives adding and removing sets.

It saves three ways — the **Save note** button, about a second and a half
after you stop typing, and when you tap out of the box. The little label next
to the button tells you which state it is in (*Unsaved*, *Saving…*, *Saved*).

Last week's note for the same exercise appears in italics underneath.

### Starting over

**Delete this day** removes every row for that day type and date. It asks
first. There is no undo in the app — but the spreadsheet has one:
*Edit → Undo* in the Sheets tab, or **File → Version history**.

---

## How next week's numbers are worked out

When you start a session, each set from last time is looked at on its own and
adjusted by its own RPE:

```
  RPE of that set          becomes                    note written
  ─────────────────        ───────────────────        ────────────
  6.5 or less        →     +2 reps, +5 lb             "was easy"
  7 to 8.5           →     +2 reps, same weight       —
  9 to 9.5           →     same reps, same weight     "repeat"
  10                 →     −2 reps, −5% weight        "backed off"

  blank RPE          →     treated as 8
```

Weights are rounded to the nearest 2.5 lb. The note lands in the *Auto note*
column of the sheet, so you can see afterwards why a number moved.

**These are a proposal, not a prescription.** Override them freely — that is
what the plus and minus buttons are for. The app's job is to save you doing
the arithmetic for thirty sets, not to decide the training.

{: .note }
An exercise whose weight is 0 stays at 0 forever, because "+2 reps, same
weight" never moves it. Type the real weight in once and the rule takes over
from there. Templates seed every weight at 0 on purpose.

---

## The spreadsheet underneath

The app is a convenient front door. The `Log` tab is the actual record and you
can edit it directly whenever the app is in the way.

| Column | What it holds |
|---|---|
| A | Date |
| B | Day type |
| C | Exercise |
| D | Set number |
| E | Reps |
| F | Weight (LB) |
| G | RPE |
| H | Auto note — written by the app (`from template`, `was easy`, `repeat`, `backed off`) |
| I | Notes — yours |

Sorting, filtering, charting, or exporting this tab is all fine. Deleting rows
is fine. The app reads the sheet fresh every time it loads, so it will simply
agree with whatever is there.

Keep column order as it is — the code reads columns by position, not by
heading.
