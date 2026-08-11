#!/usr/bin/env python3
"""Build training-tracker-template.xlsx — the file people import into Sheets.

    python3 data/build_template.py

It is written into docs/download/ because that is where GitHub Pages serves
it from: the setup guide links straight at it. There is only ever one copy.

The seed data below is the editable source; the .xlsx is generated from it,
because a binary nobody can regenerate is worse than a build step nobody
runs. Stdlib only, no dependencies.

Log column order matters — Code.gs reads columns by position, not by
heading. Changing the order here means changing COL in src/Code.gs.
"""

import re
import zipfile
from pathlib import Path
from urllib.parse import quote_plus
from xml.sax.saxutils import escape

OUT = (Path(__file__).parent.parent
       / "docs" / "download" / "training-tracker-template.xlsx")

LOG = [
    ["Date", "Day", "Exercise", "Set", "Reps / Secs", "Weight (LB)", "RPE",
     "Auto note", "Notes"],
]

# name | group | pattern | image | no weight | video | time based
#
# Rows are authored with the first three columns; finish_rows() below pads
# them and fills in the rest.
#
#   D  image      blank on purpose — an image URL has to be one the person
#                 setting up is allowed to use, so nothing is safe to ship
#   E  no weight  no external load: push-ups, planks, the rower. The app
#                 hides the weight field and never tries to add plates
#   F  video      a YouTube search for the name, from finish_rows(). A search
#                 rather than a fixed id: it never rots, covers every row, and
#                 leaves picking a video to whoever is training
#   G  time based measured in seconds, not reps. Column E of the Log then
#                 holds seconds, and progression steps by CFG.timeStep
EXERCISES = [
    ["exercise", "group", "pattern", "image", "no weight", "video", "time based"],
    # Chest
    ['Barbell Bench Press', 'Chest', 'Push'],
    ['Incline Barbell Bench Press', 'Chest', 'Push'],
    ['Decline Barbell Bench Press', 'Chest', 'Push'],
    ['Dumbbell Bench Press', 'Chest', 'Push'],
    ['Incline Dumbbell Press', 'Chest', 'Push'],
    ['Decline Dumbbell Press', 'Chest', 'Push'],
    ['Machine Chest Press', 'Chest', 'Push'],
    ['Incline Machine Press', 'Chest', 'Push'],
    ['Smith Machine Bench Press', 'Chest', 'Push'],
    ['Floor Press', 'Chest', 'Push'],
    ['Pin Press', 'Chest', 'Push'],
    ['Board Press', 'Chest', 'Push'],
    ['Spoto Press', 'Chest', 'Push'],
    ['Cable Chest Fly', 'Chest', 'Push'],
    ['Low-to-High Cable Fly', 'Chest', 'Push'],
    ['High-to-Low Cable Fly', 'Chest', 'Push'],
    ['Dumbbell Fly', 'Chest', 'Push'],
    ['Incline Dumbbell Fly', 'Chest', 'Push'],
    ['Pec Deck', 'Chest', 'Push'],
    ['Svend Press', 'Chest', 'Push'],
    ['Push-Up', 'Chest', 'Push', "", "yes"],
    ['Incline Push-Up', 'Chest', 'Push', "", "yes"],
    ['Decline Push-Up', 'Chest', 'Push', "", "yes"],
    ['Diamond Push-Up', 'Chest', 'Push', "", "yes"],
    ['Deficit Push-Up', 'Chest', 'Push', "", "yes"],
    ['Chest Dip', 'Chest', 'Push', "", "yes"],
    ['Ring Dip', 'Chest', 'Push', "", "yes"],
    # Shoulders
    ['Overhead Barbell Press', 'Shoulders', 'Push'],
    ['Seated Barbell Shoulder Press', 'Shoulders', 'Push'],
    ['Push Press', 'Shoulders', 'Push'],
    ['Push Jerk', 'Shoulders', 'Push'],
    ['Seated Dumbbell Shoulder Press', 'Shoulders', 'Push'],
    ['Standing Dumbbell Shoulder Press', 'Shoulders', 'Push'],
    ['Arnold Press', 'Shoulders', 'Push'],
    ['Machine Shoulder Press', 'Shoulders', 'Push'],
    ['Smith Machine Shoulder Press', 'Shoulders', 'Push'],
    ['Landmine Press', 'Shoulders', 'Push'],
    ['Z Press', 'Shoulders', 'Push'],
    ['Behind-the-Neck Press', 'Shoulders', 'Push'],
    ['Lateral Raise', 'Shoulders', 'Push'],
    ['Cable Lateral Raise', 'Shoulders', 'Push'],
    ['Machine Lateral Raise', 'Shoulders', 'Push'],
    ['Leaning Lateral Raise', 'Shoulders', 'Push'],
    ['Front Raise', 'Shoulders', 'Push'],
    ['Cable Front Raise', 'Shoulders', 'Push'],
    ['Plate Front Raise', 'Shoulders', 'Push'],
    ['Upright Row', 'Shoulders', 'Push'],
    ['Cable Upright Row', 'Shoulders', 'Push'],
    # Triceps
    ['Close-Grip Bench Press', 'Triceps', 'Push'],
    ['Triceps Rope Pushdown', 'Triceps', 'Push'],
    ['Triceps Cable Pushdown', 'Triceps', 'Push'],
    ['Straight-Bar Pushdown', 'Triceps', 'Push'],
    ['Reverse-Grip Pushdown', 'Triceps', 'Push'],
    ['Overhead Triceps Extension', 'Triceps', 'Push'],
    ['Cable Overhead Extension', 'Triceps', 'Push'],
    ['Skull Crusher', 'Triceps', 'Push'],
    ['EZ-Bar Skull Crusher', 'Triceps', 'Push'],
    ['Dumbbell Skull Crusher', 'Triceps', 'Push'],
    ['JM Press', 'Triceps', 'Push'],
    ['Tate Press', 'Triceps', 'Push'],
    ['Triceps Kickback', 'Triceps', 'Push'],
    ['Bench Dip', 'Triceps', 'Push', "", "yes"],
    ['Machine Triceps Extension', 'Triceps', 'Push'],
    # Back
    ['Deadlift', 'Back', 'Pull'],
    ['Sumo Deadlift', 'Back', 'Pull'],
    ['Trap Bar Deadlift', 'Back', 'Pull'],
    ['Deficit Deadlift', 'Back', 'Pull'],
    ['Rack Pull', 'Back', 'Pull'],
    ['Barbell Row', 'Back', 'Pull'],
    ['Pendlay Row', 'Back', 'Pull'],
    ['Yates Row', 'Back', 'Pull'],
    ['Dumbbell Row', 'Back', 'Pull'],
    ['Chest-Supported Row', 'Back', 'Pull'],
    ['Seal Row', 'Back', 'Pull'],
    ['T-Bar Row', 'Back', 'Pull'],
    ['Landmine Row', 'Back', 'Pull'],
    ['Meadows Row', 'Back', 'Pull'],
    ['Seated Cable Row', 'Back', 'Pull'],
    ['Wide-Grip Seated Row', 'Back', 'Pull'],
    ['Single-Arm Cable Row', 'Back', 'Pull'],
    ['Machine Row', 'Back', 'Pull'],
    ['Inverted Row', 'Back', 'Pull', "", "yes"],
    # Lats
    ['Lat Pulldown', 'Lats', 'Pull'],
    ['Wide-Grip Lat Pulldown', 'Lats', 'Pull'],
    ['Close-Grip Lat Pulldown', 'Lats', 'Pull'],
    ['Reverse-Grip Lat Pulldown', 'Lats', 'Pull'],
    ['Single-Arm Lat Pulldown', 'Lats', 'Pull'],
    ['Straight-Arm Pulldown', 'Lats', 'Pull'],
    ['Pull-Up', 'Lats', 'Pull', "", "yes"],
    ['Weighted Pull-Up', 'Lats', 'Pull'],
    ['Chin-Up', 'Lats', 'Pull', "", "yes"],
    ['Weighted Chin-Up', 'Lats', 'Pull'],
    ['Neutral-Grip Pull-Up', 'Lats', 'Pull', "", "yes"],
    ['Assisted Pull-Up', 'Lats', 'Pull'],
    ['Machine Pullover', 'Lats', 'Pull'],
    ['Dumbbell Pullover', 'Lats', 'Pull'],
    # Rear delts
    ['Face Pull', 'Rear delts', 'Pull'],
    ['Reverse Pec Deck', 'Rear delts', 'Pull'],
    ['Bent-Over Reverse Fly', 'Rear delts', 'Pull'],
    ['Cable Reverse Fly', 'Rear delts', 'Pull'],
    ['Prone Y Raise', 'Rear delts', 'Pull'],
    ['Band Pull-Apart', 'Rear delts', 'Pull'],
    # Traps
    ['Barbell Shrug', 'Traps', 'Pull'],
    ['Dumbbell Shrug', 'Traps', 'Pull'],
    ['Trap Bar Shrug', 'Traps', 'Pull'],
    ['Cable Shrug', 'Traps', 'Pull'],
    ['Machine Shrug', 'Traps', 'Pull'],
    # Biceps
    ['Barbell Curl', 'Biceps', 'Pull'],
    ['EZ-Bar Curl', 'Biceps', 'Pull'],
    ['Dumbbell Bicep Curl', 'Biceps', 'Pull'],
    ['Alternating Dumbbell Curl', 'Biceps', 'Pull'],
    ['Hammer Curl', 'Biceps', 'Pull'],
    ['Cross-Body Hammer Curl', 'Biceps', 'Pull'],
    ['Incline Dumbbell Curl', 'Biceps', 'Pull'],
    ['Preacher Curl', 'Biceps', 'Pull'],
    ['Machine Preacher Curl', 'Biceps', 'Pull'],
    ['Cable Curl', 'Biceps', 'Pull'],
    ['Bayesian Cable Curl', 'Biceps', 'Pull'],
    ['Concentration Curl', 'Biceps', 'Pull'],
    ['Spider Curl', 'Biceps', 'Pull'],
    ['Drag Curl', 'Biceps', 'Pull'],
    ['Reverse Curl', 'Biceps', 'Pull'],
    # Forearms
    ['Wrist Curl', 'Forearms', 'Pull'],
    ['Reverse Wrist Curl', 'Forearms', 'Pull'],
    ['Behind-the-Back Wrist Curl', 'Forearms', 'Pull'],
    ['Wrist Roller', 'Forearms', 'Pull'],
    ['Plate Pinch', 'Forearms', 'Pull'],
    # Quads
    ['Back Squat', 'Quads', 'Legs'],
    ['High-Bar Back Squat', 'Quads', 'Legs'],
    ['Low-Bar Back Squat', 'Quads', 'Legs'],
    ['Front Squat', 'Quads', 'Legs'],
    ['Goblet Squat', 'Quads', 'Legs'],
    ['Zercher Squat', 'Quads', 'Legs'],
    ['Box Squat', 'Quads', 'Legs'],
    ['Pause Squat', 'Quads', 'Legs'],
    ['Safety Bar Squat', 'Quads', 'Legs'],
    ['Smith Machine Squat', 'Quads', 'Legs'],
    ['Belt Squat', 'Quads', 'Legs'],
    ['Hack Squat', 'Quads', 'Legs'],
    ['Machine Hack Squat', 'Quads', 'Legs'],
    ['Pendulum Squat', 'Quads', 'Legs'],
    ['Leg Press', 'Quads', 'Legs'],
    ['Single-Leg Press', 'Quads', 'Legs'],
    ['Bulgarian Split Squat', 'Quads', 'Legs'],
    ['Split Squat', 'Quads', 'Legs'],
    ['Walking Lunge', 'Quads', 'Legs'],
    ['Reverse Lunge', 'Quads', 'Legs'],
    ['Forward Lunge', 'Quads', 'Legs'],
    ['Lateral Lunge', 'Quads', 'Legs'],
    ['Curtsy Lunge', 'Quads', 'Legs'],
    ['Deficit Reverse Lunge', 'Quads', 'Legs'],
    ['Step-Up', 'Quads', 'Legs'],
    ['Leg Extension', 'Quads', 'Legs'],
    ['Single-Leg Extension', 'Quads', 'Legs'],
    ['Sissy Squat', 'Quads', 'Legs', "", "yes"],
    ['Wall Sit', 'Quads', 'Legs', "", "yes"],
    # Hamstrings
    ['Romanian Deadlift', 'Hamstrings', 'Legs'],
    ['Dumbbell Romanian Deadlift', 'Hamstrings', 'Legs'],
    ['Single-Leg Romanian Deadlift', 'Hamstrings', 'Legs'],
    ['Stiff-Leg Deadlift', 'Hamstrings', 'Legs'],
    ['Lying Leg Curl', 'Hamstrings', 'Legs'],
    ['Seated Leg Curl', 'Hamstrings', 'Legs'],
    ['Standing Leg Curl', 'Hamstrings', 'Legs'],
    ['Nordic Curl', 'Hamstrings', 'Legs', "", "yes"],
    ['Glute-Ham Raise', 'Hamstrings', 'Legs'],
    ['Good Morning', 'Hamstrings', 'Legs'],
    ['Back Extension', 'Hamstrings', 'Legs'],
    ['45-Degree Back Extension', 'Hamstrings', 'Legs'],
    # Glutes
    ['Hip Thrust', 'Glutes', 'Legs'],
    ['Barbell Hip Thrust', 'Glutes', 'Legs'],
    ['Single-Leg Hip Thrust', 'Glutes', 'Legs'],
    ['Machine Hip Thrust', 'Glutes', 'Legs'],
    ['Glute Bridge', 'Glutes', 'Legs'],
    ['Cable Kickback', 'Glutes', 'Legs'],
    ['Machine Glute Kickback', 'Glutes', 'Legs'],
    ['Cable Pull-Through', 'Glutes', 'Legs'],
    ['Frog Pump', 'Glutes', 'Legs'],
    # Adductors
    ['Adductor Machine', 'Adductors', 'Legs'],
    ['Copenhagen Plank', 'Adductors', 'Legs', "", "yes"],
    ['Sumo Squat', 'Adductors', 'Legs'],
    ['Cossack Squat', 'Adductors', 'Legs', "", "yes"],
    # Abductors
    ['Abductor Machine', 'Abductors', 'Legs'],
    ['Cable Hip Abduction', 'Abductors', 'Legs'],
    ['Banded Lateral Walk', 'Abductors', 'Legs', "", "yes"],
    ['Clamshell', 'Abductors', 'Legs', "", "yes"],
    # Calves
    ['Standing Calf Raise', 'Calves', 'Legs'],
    ['Seated Calf Raise', 'Calves', 'Legs'],
    ['Leg Press Calf Raise', 'Calves', 'Legs'],
    ['Smith Machine Calf Raise', 'Calves', 'Legs'],
    ['Single-Leg Calf Raise', 'Calves', 'Legs'],
    ['Donkey Calf Raise', 'Calves', 'Legs'],
    ['Tibialis Raise', 'Calves', 'Legs'],
    # Core
    ['Plank', 'Core', 'Core', "", "yes"],
    ['Side Plank', 'Core', 'Core', "", "yes"],
    ['RKC Plank', 'Core', 'Core', "", "yes"],
    ['Hollow Body Hold', 'Core', 'Core', "", "yes"],
    ['Dead Bug', 'Core', 'Core', "", "yes"],
    ['Bird Dog', 'Core', 'Core', "", "yes"],
    ['Hanging Leg Raise', 'Core', 'Core', "", "yes"],
    ['Hanging Knee Raise', 'Core', 'Core', "", "yes"],
    ["Captain's Chair Leg Raise", 'Core', 'Core', "", "yes"],
    ['Lying Leg Raise', 'Core', 'Core', "", "yes"],
    ['Toes-to-Bar', 'Core', 'Core', "", "yes"],
    ['Dragon Flag', 'Core', 'Core', "", "yes"],
    ['V-Up', 'Core', 'Core', "", "yes"],
    ['Sit-Up', 'Core', 'Core', "", "yes"],
    ['Decline Sit-Up', 'Core', 'Core', "", "yes"],
    ['Crunch', 'Core', 'Core', "", "yes"],
    ['Bicycle Crunch', 'Core', 'Core', "", "yes"],
    ['Reverse Crunch', 'Core', 'Core', "", "yes"],
    ['Cable Crunch', 'Core', 'Core'],
    ['Ab Wheel Rollout', 'Core', 'Core'],
    ['Russian Twist', 'Core', 'Core'],
    ['Pallof Press', 'Core', 'Core'],
    ['Landmine Twist', 'Core', 'Core'],
    ['Woodchopper', 'Core', 'Core'],
    ['Mountain Climber', 'Core', 'Core', "", "yes"],
    ['Farmer Carry', 'Core', 'Core'],
    ['Suitcase Carry', 'Core', 'Core'],
    # Neck
    ['Neck Curl', 'Neck', 'Core'],
    ['Neck Extension', 'Neck', 'Core'],
    ['Neck Harness Raise', 'Neck', 'Core'],
    # Full body
    ['Power Clean', 'Full body', 'Full body'],
    ['Hang Clean', 'Full body', 'Full body'],
    ['Clean and Jerk', 'Full body', 'Full body'],
    ['Snatch', 'Full body', 'Full body'],
    ['Power Snatch', 'Full body', 'Full body'],
    ['Hang Snatch', 'Full body', 'Full body'],
    ['Clean Pull', 'Full body', 'Full body'],
    ['Snatch Pull', 'Full body', 'Full body'],
    ['Overhead Squat', 'Full body', 'Full body'],
    ['Thruster', 'Full body', 'Full body'],
    ['Kettlebell Swing', 'Full body', 'Full body'],
    ['Kettlebell Clean', 'Full body', 'Full body'],
    ['Kettlebell Snatch', 'Full body', 'Full body'],
    ['Turkish Get-Up', 'Full body', 'Full body'],
    ['Burpee', 'Full body', 'Full body', "", "yes"],
    ['Man Maker', 'Full body', 'Full body'],
    ['Sled Push', 'Full body', 'Full body'],
    ['Sled Pull', 'Full body', 'Full body'],
    ['Battle Ropes', 'Full body', 'Full body', "", "yes"],
    ['Box Jump', 'Full body', 'Full body', "", "yes"],
    ['Broad Jump', 'Full body', 'Full body', "", "yes"],
    ['Medicine Ball Slam', 'Full body', 'Full body'],
    ['Medicine Ball Chest Pass', 'Full body', 'Full body'],
    # Conditioning
    ['Rowing Machine', 'Conditioning', 'Conditioning', "", "yes"],
    ['Assault Bike', 'Conditioning', 'Conditioning', "", "yes"],
    ['Ski Erg', 'Conditioning', 'Conditioning', "", "yes"],
    ['Treadmill Run', 'Conditioning', 'Conditioning', "", "yes"],
    ['Incline Treadmill Walk', 'Conditioning', 'Conditioning', "", "yes"],
    ['Stationary Bike', 'Conditioning', 'Conditioning', "", "yes"],
    ['Stair Climber', 'Conditioning', 'Conditioning', "", "yes"],
    ['Elliptical', 'Conditioning', 'Conditioning', "", "yes"],
    ['Jump Rope', 'Conditioning', 'Conditioning', "", "yes"],
    ['Sprint Interval', 'Conditioning', 'Conditioning', "", "yes"],
]

# Weights seed at 0 on purpose — the real number gets typed in once, during
# the first session of that day.
#
# Five exercises per day is roughly an hour once rest is counted, so that is
# what each day generates. A sixth accessory is listed against each day with
# "include in new session" = no: it stays on the plan as a suggestion without
# being generated, and doubles as a worked example of that column.
TEMPLATES = [
    ["day", "exercise", "sets", "reps", "weight", "include in new session"],
    ["Push", "Barbell Bench Press", 4, 8, 0],
    ["Push", "Incline Dumbbell Press", 3, 10, 0],
    ["Push", "Seated Dumbbell Shoulder Press", 3, 10, 0],
    ["Push", "Cable Chest Fly", 3, 12, 0, "no"],
    ["Push", "Lateral Raise", 3, 15, 0],
    ["Push", "Triceps Rope Pushdown", 3, 12, 0],
    ["Pull", "Barbell Row", 4, 8, 0],
    ["Pull", "Lat Pulldown", 3, 10, 0],
    ["Pull", "Seated Cable Row", 3, 10, 0],
    ["Pull", "Face Pull", 3, 15, 0],
    ["Pull", "Dumbbell Bicep Curl", 3, 12, 0],
    ["Pull", "Hammer Curl", 3, 12, 0, "no"],
    ["Legs", "Back Squat", 4, 6, 0],
    ["Legs", "Romanian Deadlift", 3, 8, 0],
    ["Legs", "Leg Press", 3, 12, 0],
    ["Legs", "Bulgarian Split Squat", 3, 10, 0],
    ["Legs", "Lying Leg Curl", 3, 12, 0],
    ["Legs", "Standing Calf Raise", 4, 15, 0, "no"],
]

# Read as key/value from columns A and B; column C is for the human.
SETTINGS = [
    ["key", "value", "what it does"],
    ["pr_rep_targets", "1,5,10",
     "Track the heaviest weight lifted for a set of at least this many reps. "
     "Comma-separated, e.g. 1,3,5,8,10."],
    ["pr_metrics", "est1rm,volume,reps",
     "Extra records to track. Any of: est1rm (estimated one-rep max), "
     "volume (best single set), reps (most reps in a set), "
     "session (best total volume for one exercise in one session)."],
]

# Output only — Training > Rebuild records rewrites it from the Log.
RECORDS = [
    ["Exercise", "Record", "Value", "Detail", "Date", "Day"],
]

VIDEO_SEARCH = "https://www.youtube.com/results?search_query="

# Measured in seconds rather than repetitions: holds, carries, and anything
# on a machine with a timer. Column E of the Log holds seconds for these.
TIMED = {
    "Plank", "Side Plank", "RKC Plank", "Hollow Body Hold", "Copenhagen Plank",
    "Wall Sit", "Mountain Climber",
    "Farmer Carry", "Suitcase Carry", "Plate Pinch",
    "Sled Push", "Sled Pull", "Battle Ropes",
    "Rowing Machine", "Assault Bike", "Ski Erg", "Treadmill Run",
    "Incline Treadmill Walk", "Stationary Bike", "Stair Climber", "Elliptical",
    "Jump Rope", "Sprint Interval",
}


def finish_rows(rows):
    """Pad every exercise row to seven columns, add the how-to link and unit."""
    out = [rows[0]]
    for row in rows[1:]:
        row = list(row) + [""] * (7 - len(row))
        name = row[0]
        row[5] = VIDEO_SEARCH + quote_plus(name + " proper form")
        if name in TIMED:
            row[6] = "yes"
        out.append(row)
    return out


EXERCISES = finish_rows(EXERCISES)

SHEETS = [
    ("Log", LOG),
    ("Exercises", EXERCISES),
    ("Templates", TEMPLATES),
    ("Settings", SETTINGS),
    ("Records", RECORDS),
]


def col_name(i):
    name = ""
    while i >= 0:
        name = chr(ord("A") + i % 26) + name
        i = i // 26 - 1
    return name


def sheet_xml(rows):
    out = []
    for r, row in enumerate(rows, start=1):
        cells = []
        for c, value in enumerate(row):
            ref = f"{col_name(c)}{r}"
            if value == "":
                continue
            if isinstance(value, (int, float)):
                cells.append(f'<c r="{ref}"><v>{value}</v></c>')
            else:
                cells.append(
                    f'<c r="{ref}" t="inlineStr"><is><t xml:space="preserve">'
                    f"{escape(value)}</t></is></c>"
                )
        out.append(f'<row r="{r}">{"".join(cells)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<sheetData>{"".join(out)}</sheetData></worksheet>'
    )


def add(z, name, data):
    """Write one part with a fixed timestamp.

    zipfile stamps the current mtime by default, which makes every rebuild a
    byte-different file and so a spurious diff on a tracked binary.
    """
    info = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    info.external_attr = 0o644 << 16
    z.writestr(info, data)


def build():
    ns_r = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
    types = "http://schemas.openxmlformats.org/package/2006/content-types"
    n = len(SHEETS)

    tabs = "".join(
        f'<sheet name="{escape(name)}" sheetId="{i}" r:id="rId{i}"/>'
        for i, (name, _) in enumerate(SHEETS, start=1)
    )
    rels = "".join(
        f'<Relationship Id="rId{i}" Type="{ns_r}/worksheet" '
        f'Target="worksheets/sheet{i}.xml"/>'
        for i in range(1, n + 1)
    )
    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{i}.xml" ContentType='
        '"application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for i in range(1, n + 1)
    )

    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as z:
        add(z,
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            f'<Types xmlns="{types}">'
            '<Default Extension="rels" ContentType='
            '"application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType='
            '"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            f"{overrides}</Types>",
        )
        add(z,
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f'<Relationship Id="rId1" Type="{ns_r}/officeDocument" Target="xl/workbook.xml"/>'
            "</Relationships>",
        )
        add(z,
            "xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
            f'xmlns:r="{ns_r}"><sheets>{tabs}</sheets></workbook>',
        )
        add(z,
            "xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            f"{rels}</Relationships>",
        )
        for i, (_, rows) in enumerate(SHEETS, start=1):
            add(z, f"xl/worksheets/sheet{i}.xml", sheet_xml(rows))


def check():
    """Re-read what was written and assert the shape Code.gs expects."""
    with zipfile.ZipFile(OUT) as z:
        book = z.read("xl/workbook.xml").decode()
        assert re.findall(r'<sheet name="([^"]+)"', book) == [
            "Log", "Exercises", "Templates", "Settings", "Records"
        ], "tab names or order wrong"

        log = z.read("xl/worksheets/sheet1.xml").decode()
        assert log.count("<row ") == 1, "Log must ship empty apart from headings"
        assert log.count("<c ") == 9, "Log needs exactly 9 headings, A to I"
        assert ">Notes</t>" in log, "last heading missing"

        ex = z.read("xl/worksheets/sheet2.xml").decode()
        assert ex.count("<row ") == len(EXERCISES)
        assert ">image</t>" in ex, "Exercises needs the image column, D"
        assert ">no weight</t>" in ex, "Exercises needs the no-weight column, E"
        assert ">video</t>" in ex, "Exercises needs the video column, F"
        assert ">time based</t>" in ex, "Exercises needs the time column, G"

        # Every name in TIMED has to exist, or the flag silently does nothing.
        names = {r[0] for r in EXERCISES[1:]}
        missing = TIMED - names
        assert not missing, "TIMED names not in the catalogue: " + str(sorted(missing))

        timed = [r[0] for r in EXERCISES[1:] if r[6] == "yes"]
        assert len(timed) == len(TIMED), "timed flags lost"
        assert "Plank" in timed and "Barbell Bench Press" not in timed

        # Every real exercise gets a how-to link; the placeholder does not.
        linked = [r[0] for r in EXERCISES[1:] if r[5]]
        assert len(linked) == len(EXERCISES) - 1, "a row is missing its video link"
        assert all(r[5].startswith("https://") for r in EXERCISES[1:] if r[5])

        flagged = [r[0] for r in EXERCISES[1:] if len(r) > 4 and r[4] == "yes"]
        assert "Push-Up" in flagged and "Plank" in flagged, "bodyweight flags lost"
        assert "Barbell Bench Press" not in flagged, "a loaded lift got flagged"

        # Duplicate names would show twice in autocomplete and split a
        # exercise's history in two.
        names = [r[0] for r in EXERCISES[1:]]
        assert len(names) == len(set(names)), \
            "duplicate exercise: " + str(sorted(n for n in names if names.count(n) > 1)[:3])

        tpl = z.read("xl/worksheets/sheet3.xml").decode()
        assert tpl.count("<row ") == len(TEMPLATES)
        assert "<v>4</v>" in tpl, "set counts must be numbers, not text"
        assert ">include in new session</t>" in tpl, "Templates needs column F"

        # Five per day is the shipped default — an hour of training. The
        # sixth row of each day is the "no" example.
        from collections import Counter
        per_day = Counter(r[0] for r in TEMPLATES[1:]
                          if not (len(r) > 5 and r[5] == "no"))
        assert set(per_day.values()) == {5}, "each day should generate 5: " + str(per_day)
        assert len(TEMPLATES) - 1 == sum(per_day.values()) + len(per_day), \
            "expected exactly one optional row per day"

        # Settings keys must match what Code.gs looks for, or the defaults
        # silently win and the tab looks decorative.
        cfg = z.read("xl/worksheets/sheet4.xml").decode()
        for key in ("pr_rep_targets", "pr_metrics"):
            assert ">" + key + "</t>" in cfg, "missing setting " + key

        assert z.read("xl/worksheets/sheet5.xml").decode().count("<row ") == 1, \
            "Records ships as headings only"


if __name__ == "__main__":
    build()
    check()
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
