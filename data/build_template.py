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
from xml.sax.saxutils import escape

OUT = (Path(__file__).parent.parent
       / "docs" / "download" / "training-tracker-template.xlsx")

LOG = [
    ["Date", "Day", "Exercise", "Set", "Reps", "Weight (LB)", "RPE",
     "Auto note", "Notes"],
]

# name | muscle group | day it usually belongs to | optional image URL
#
# Column D is left blank on purpose: an image URL has to be one the person
# setting up is allowed to use, so there is nothing safe to ship here.
EXERCISES = [
    ["exercise", "group", "pattern", "image"],
    # Placeholder
    ['[Other]', 'Placeholder', 'Any'],
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
    ['Push-Up', 'Chest', 'Push'],
    ['Incline Push-Up', 'Chest', 'Push'],
    ['Decline Push-Up', 'Chest', 'Push'],
    ['Diamond Push-Up', 'Chest', 'Push'],
    ['Deficit Push-Up', 'Chest', 'Push'],
    ['Chest Dip', 'Chest', 'Push'],
    ['Ring Dip', 'Chest', 'Push'],
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
    ['Bench Dip', 'Triceps', 'Push'],
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
    ['Inverted Row', 'Back', 'Pull'],
    # Lats
    ['Lat Pulldown', 'Lats', 'Pull'],
    ['Wide-Grip Lat Pulldown', 'Lats', 'Pull'],
    ['Close-Grip Lat Pulldown', 'Lats', 'Pull'],
    ['Reverse-Grip Lat Pulldown', 'Lats', 'Pull'],
    ['Single-Arm Lat Pulldown', 'Lats', 'Pull'],
    ['Straight-Arm Pulldown', 'Lats', 'Pull'],
    ['Pull-Up', 'Lats', 'Pull'],
    ['Weighted Pull-Up', 'Lats', 'Pull'],
    ['Chin-Up', 'Lats', 'Pull'],
    ['Weighted Chin-Up', 'Lats', 'Pull'],
    ['Neutral-Grip Pull-Up', 'Lats', 'Pull'],
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
    ['Sissy Squat', 'Quads', 'Legs'],
    ['Wall Sit', 'Quads', 'Legs'],
    # Hamstrings
    ['Romanian Deadlift', 'Hamstrings', 'Legs'],
    ['Dumbbell Romanian Deadlift', 'Hamstrings', 'Legs'],
    ['Single-Leg Romanian Deadlift', 'Hamstrings', 'Legs'],
    ['Stiff-Leg Deadlift', 'Hamstrings', 'Legs'],
    ['Lying Leg Curl', 'Hamstrings', 'Legs'],
    ['Seated Leg Curl', 'Hamstrings', 'Legs'],
    ['Standing Leg Curl', 'Hamstrings', 'Legs'],
    ['Nordic Curl', 'Hamstrings', 'Legs'],
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
    ['Copenhagen Plank', 'Adductors', 'Legs'],
    ['Sumo Squat', 'Adductors', 'Legs'],
    ['Cossack Squat', 'Adductors', 'Legs'],
    # Abductors
    ['Abductor Machine', 'Abductors', 'Legs'],
    ['Cable Hip Abduction', 'Abductors', 'Legs'],
    ['Banded Lateral Walk', 'Abductors', 'Legs'],
    ['Clamshell', 'Abductors', 'Legs'],
    # Calves
    ['Standing Calf Raise', 'Calves', 'Legs'],
    ['Seated Calf Raise', 'Calves', 'Legs'],
    ['Leg Press Calf Raise', 'Calves', 'Legs'],
    ['Smith Machine Calf Raise', 'Calves', 'Legs'],
    ['Single-Leg Calf Raise', 'Calves', 'Legs'],
    ['Donkey Calf Raise', 'Calves', 'Legs'],
    ['Tibialis Raise', 'Calves', 'Legs'],
    # Core
    ['Plank', 'Core', 'Core'],
    ['Side Plank', 'Core', 'Core'],
    ['RKC Plank', 'Core', 'Core'],
    ['Hollow Body Hold', 'Core', 'Core'],
    ['Dead Bug', 'Core', 'Core'],
    ['Bird Dog', 'Core', 'Core'],
    ['Hanging Leg Raise', 'Core', 'Core'],
    ['Hanging Knee Raise', 'Core', 'Core'],
    ["Captain's Chair Leg Raise", 'Core', 'Core'],
    ['Lying Leg Raise', 'Core', 'Core'],
    ['Toes-to-Bar', 'Core', 'Core'],
    ['Dragon Flag', 'Core', 'Core'],
    ['V-Up', 'Core', 'Core'],
    ['Sit-Up', 'Core', 'Core'],
    ['Decline Sit-Up', 'Core', 'Core'],
    ['Crunch', 'Core', 'Core'],
    ['Bicycle Crunch', 'Core', 'Core'],
    ['Reverse Crunch', 'Core', 'Core'],
    ['Cable Crunch', 'Core', 'Core'],
    ['Ab Wheel Rollout', 'Core', 'Core'],
    ['Russian Twist', 'Core', 'Core'],
    ['Pallof Press', 'Core', 'Core'],
    ['Landmine Twist', 'Core', 'Core'],
    ['Woodchopper', 'Core', 'Core'],
    ['Mountain Climber', 'Core', 'Core'],
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
    ['Burpee', 'Full body', 'Full body'],
    ['Man Maker', 'Full body', 'Full body'],
    ['Sled Push', 'Full body', 'Full body'],
    ['Sled Pull', 'Full body', 'Full body'],
    ['Battle Ropes', 'Full body', 'Full body'],
    ['Box Jump', 'Full body', 'Full body'],
    ['Broad Jump', 'Full body', 'Full body'],
    ['Medicine Ball Slam', 'Full body', 'Full body'],
    ['Medicine Ball Chest Pass', 'Full body', 'Full body'],
    # Conditioning
    ['Rowing Machine', 'Conditioning', 'Conditioning'],
    ['Assault Bike', 'Conditioning', 'Conditioning'],
    ['Ski Erg', 'Conditioning', 'Conditioning'],
    ['Treadmill Run', 'Conditioning', 'Conditioning'],
    ['Incline Treadmill Walk', 'Conditioning', 'Conditioning'],
    ['Stationary Bike', 'Conditioning', 'Conditioning'],
    ['Stair Climber', 'Conditioning', 'Conditioning'],
    ['Elliptical', 'Conditioning', 'Conditioning'],
    ['Jump Rope', 'Conditioning', 'Conditioning'],
    ['Sprint Interval', 'Conditioning', 'Conditioning'],
]

# Weights seed at 0 on purpose — the real number gets typed in once, during
# the first session of that day.
TEMPLATES = [
    ["day", "exercise", "sets", "reps", "weight"],
    ["Push", "Barbell Bench Press", 4, 8, 0],
    ["Push", "Incline Dumbbell Press", 3, 10, 0],
    ["Push", "Seated Dumbbell Shoulder Press", 3, 10, 0],
    ["Push", "Cable Chest Fly", 3, 12, 0],
    ["Push", "Lateral Raise", 3, 15, 0],
    ["Push", "Triceps Rope Pushdown", 3, 12, 0],
    ["Pull", "Barbell Row", 4, 8, 0],
    ["Pull", "Lat Pulldown", 3, 10, 0],
    ["Pull", "Seated Cable Row", 3, 10, 0],
    ["Pull", "Face Pull", 3, 15, 0],
    ["Pull", "Dumbbell Bicep Curl", 3, 12, 0],
    ["Pull", "Hammer Curl", 3, 12, 0],
    ["Legs", "Back Squat", 4, 6, 0],
    ["Legs", "Romanian Deadlift", 3, 8, 0],
    ["Legs", "Leg Press", 3, 12, 0],
    ["Legs", "Bulgarian Split Squat", 3, 10, 0],
    ["Legs", "Lying Leg Curl", 3, 12, 0],
    ["Legs", "Standing Calf Raise", 4, 15, 0],
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
        assert ">[Other]</t>" in ex, "the [Other] placeholder must ship"

        # Duplicate names would show twice in autocomplete and split a
        # exercise's history in two.
        names = [r[0] for r in EXERCISES[1:]]
        assert len(names) == len(set(names)), \
            "duplicate exercise: " + str(sorted(n for n in names if names.count(n) > 1)[:3])

        tpl = z.read("xl/worksheets/sheet3.xml").decode()
        assert tpl.count("<row ") == len(TEMPLATES)
        assert "<v>4</v>" in tpl, "set counts must be numbers, not text"

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
