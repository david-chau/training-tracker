---
title: Personal records
nav_order: 5
---

# Personal records
{: .no_toc }

Records are worked out from the log itself — nothing is entered twice, and
nothing can drift out of step with what you actually lifted. Correct a row in
the sheet and the records follow.

1. TOC
{:toc}

---

## In the app, while you train

Each exercise card carries a line under *Last time*:

```
  Barbell Bench Press                        4 sets
  Last time: 10 x 20 @8 · 8 x 30 @9
  Best: 8 x 100 · est 1RM 127 · 2026-07-19
```

That is the best set ever recorded for that exercise, and — if there is enough
to work from — an estimated one-rep max.

When a set you are entering beats it, the row highlights and a **★** appears
next to the set number:

```
     Reps    Weight (LB)    RPE
 1     8         100          8
 2 ★   8         105          9      ← heavier than anything before today
```

The star updates as you tap, so you can see a record fall as it happens. It
is judged against *everything except the session you are in*, so today's
earlier sets do not become the bar for today's later ones.

{: .note }
The star is a **weight** record. Bodyweight work sits at 0 lb, so it never
stars — its record is reps, which you will find on the Records tab.

---

## In the sheet

The **`Records`** tab lists every record, one per row:

| Exercise | Record | Value | Detail | Date | Day |
|---|---|---|---|---|---|
| Barbell Bench Press | Heaviest | 105 | 8 x 105 | 2026-08-09 | Push |
| Barbell Bench Press | Heaviest at 5+ reps | 100 | 8 x 100 | 2026-07-19 | Push |
| Barbell Bench Press | Est. 1RM | 132.3 | 8 x 105 | 2026-08-09 | Push |
| Pull-Up | Most reps | 12 | 12 x 0 | 2026-08-02 | Pull |

Sort it, filter it, chart it — it is an ordinary sheet.

It is rewritten whenever a session is started, deleted, or has an exercise or
set added, and on demand from **Training → Rebuild records**. It is *not*
rewritten on every value you tap, so that logging stays fast. If it looks a
few sets behind, use the menu item.

{: .warning }
The `Records` tab is output. Anything you type there is erased on the next
rebuild.

---

## Choosing which records to track

The **`Settings`** tab, two columns that matter:

| key | value |
|---|---|
| `pr_rep_targets` | `1,5,10` |
| `pr_metrics` | `est1rm,volume,reps` |

### `pr_rep_targets`

A comma-separated list of rep counts. Each one produces a *"heaviest weight
lifted for a set of at least this many reps"* record.

`1,5,10` gives you a heaviest single, a heaviest set of 5+, and a heaviest set
of 10+. Powerlifting-minded? `1,3,5`. Higher-rep work? `8,12,20`. Anything
you like, as many as you like.

`1` is worth keeping — "at least 1 rep" is just *heaviest ever*, and that is
the one the app shows on the card and stars against.

### `pr_metrics`

Which of the other records to keep. Any combination of:

| Value | Record |
|---|---|
| `est1rm` | Best estimated one-rep max |
| `volume` | Best single set by reps × weight |
| `reps` | Most reps in one set — the useful one for bodyweight work |
| `session` | Most total volume for that exercise in a single session |

Leave the cell blank to drop the lot and keep only the rep targets.

After editing either row, use **Training → Rebuild records**.

{: .note }
No `Settings` tab? Defaults apply — `1,5,10` and `est1rm,volume,reps`. An
older spreadsheet keeps working untouched; add the tab if you want to change
anything.

---

## About the estimated 1RM

Epley's formula: `weight × (1 + reps ÷ 30)`. Eight reps at 100 lb estimates
127 lb.

It exists to compare sets that are not otherwise comparable — is 5 × 100
better than 10 × 80? — and it drifts optimistic above about ten reps. Treat it
as a number for ranking your own sets against each other, not as a weight to
walk up to and attempt.

Sets logged at 0 lb produce no estimate at all.
