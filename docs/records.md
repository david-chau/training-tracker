---
title: Personal records
nav_order: 4
---

# Personal records

Worked out from the log itself. Nothing is entered twice and nothing can drift
— correct a row in the sheet and the records follow.

---

## While you train

One strip under each exercise name:

```
  Barbell Bench Press                                   [− 4 sets +]
  Best 8 × 100 lb  ·  est 1RM 127  ·  on 2026-07-19
```

Beat it and that set's boxes tint amber, with a tag on the strip:

```
  Best 8 × 100 lb · est 1RM 127 · on 2026-07-19 · ★ personal best today

     Reps    Weight (LB)    RPE
 1     8         100          8
 2     8         105          9      ← tinted: heavier than ever before
```

Both update as you tap. Judged against *everything except the session you are
in*, so today's earlier sets do not become the bar for today's later ones.

{: .note }
For a loaded lift the marker is a **weight** record. For an exercise marked
`no weight` there is nothing to load, so it tracks **reps** instead —
`Best 20 reps · on 2026-07-19`.

---

## In the sheet

The **`Records`** tab, one row per record:

| Exercise | Record | Value | Detail | Date | Day |
|---|---|---|---|---|---|
| Barbell Bench Press | Heaviest | 105 | 8 x 105 | 2026-08-09 | Push |
| Barbell Bench Press | Heaviest at 5+ reps | 100 | 8 x 100 | 2026-07-19 | Push |
| Barbell Bench Press | Est. 1RM | 132.3 | 8 x 105 | 2026-08-09 | Push |
| Pull-Up | Most reps | 12 | 12 x 0 | 2026-08-02 | Pull |

Rewritten when a session is started, deleted, or gains an exercise or set, and
on demand from **Training → Rebuild records**. Not on every tap, so logging
stays fast — the strip inside the app is live regardless.

{: .warning }
The `Records` tab is output. Anything you type there is erased on the next
rebuild.

---

## Choosing what to track

Two rows on the **`Settings`** tab:

| key | value |
|---|---|
| `pr_rep_targets` | `1,5,10` |
| `pr_metrics` | `est1rm,volume,reps` |

**`pr_rep_targets`** — a rep count list. Each one gives a *"heaviest weight
for a set of at least this many reps"* record. `1,3,5` for powerlifting,
`8,12,20` for higher-rep work, whatever you like.

Keep `1`: "at least 1 rep" is simply *heaviest ever*, and that is what the app
shows on the card and marks against.

**`pr_metrics`** — any combination of:

| Value | Record |
|---|---|
| `est1rm` | Best estimated one-rep max |
| `volume` | Best single set, reps × weight |
| `reps` | Most reps in one set — the useful one for bodyweight work |
| `session` | Most total volume for that exercise in one session |

Blank drops them all and keeps only the rep targets. Rebuild after editing.

{: .note }
No `Settings` tab? Defaults apply — `1,5,10` and `est1rm,volume,reps`. An
older spreadsheet keeps working untouched.

---

<details markdown="block">
<summary>About the estimated 1RM</summary>

Epley's formula: `weight × (1 + reps ÷ 30)`. Eight reps at 100 lb estimates
127 lb.

It exists to compare sets that are not otherwise comparable — is 5 × 100
better than 10 × 80? — and it drifts optimistic above about ten reps. Treat it
as a way of ranking your own sets against each other, not a weight to walk up
to and attempt.

Sets at 0 lb produce no estimate at all.

</details>

<details markdown="block">
<summary>What happens to records when you archive</summary>

Records come from what is in the `Log` tab, so
[archiving](admin.html#archiving-old-sessions) a period removes its bests from
the live app. The archive file keeps its own `Records` tab, so they are
preserved — just no longer competing with current training.

</details>
