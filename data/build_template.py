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

# name | muscle group | day it usually belongs to
EXERCISES = [
    ["exercise", "group", "pattern"],
    ["Barbell Bench Press", "Chest", "Push"],
    ["Incline Barbell Bench Press", "Chest", "Push"],
    ["Dumbbell Bench Press", "Chest", "Push"],
    ["Incline Dumbbell Press", "Chest", "Push"],
    ["Machine Chest Press", "Chest", "Push"],
    ["Cable Chest Fly", "Chest", "Push"],
    ["Pec Deck", "Chest", "Push"],
    ["Push-Up", "Chest", "Push"],
    ["Dip", "Chest", "Push"],
    ["Overhead Barbell Press", "Shoulders", "Push"],
    ["Seated Dumbbell Shoulder Press", "Shoulders", "Push"],
    ["Arnold Press", "Shoulders", "Push"],
    ["Lateral Raise", "Shoulders", "Push"],
    ["Cable Lateral Raise", "Shoulders", "Push"],
    ["Front Raise", "Shoulders", "Push"],
    ["Triceps Rope Pushdown", "Triceps", "Push"],
    ["Triceps Cable Pushdown", "Triceps", "Push"],
    ["Skull Crusher", "Triceps", "Push"],
    ["Overhead Triceps Extension", "Triceps", "Push"],
    ["Close-Grip Bench Press", "Triceps", "Push"],
    ["Deadlift", "Back", "Pull"],
    ["Barbell Row", "Back", "Pull"],
    ["Pendlay Row", "Back", "Pull"],
    ["Dumbbell Row", "Back", "Pull"],
    ["Chest-Supported Row", "Back", "Pull"],
    ["Seated Cable Row", "Back", "Pull"],
    ["Lat Pulldown", "Back", "Pull"],
    ["Wide-Grip Lat Pulldown", "Back", "Pull"],
    ["Straight-Arm Pulldown", "Back", "Pull"],
    ["Pull-Up", "Back", "Pull"],
    ["Chin-Up", "Back", "Pull"],
    ["Assisted Pull-Up", "Back", "Pull"],
    ["T-Bar Row", "Back", "Pull"],
    ["Face Pull", "Rear delts", "Pull"],
    ["Reverse Pec Deck", "Rear delts", "Pull"],
    ["Barbell Shrug", "Traps", "Pull"],
    ["Dumbbell Shrug", "Traps", "Pull"],
    ["Barbell Curl", "Biceps", "Pull"],
    ["Dumbbell Bicep Curl", "Biceps", "Pull"],
    ["Hammer Curl", "Biceps", "Pull"],
    ["Incline Dumbbell Curl", "Biceps", "Pull"],
    ["Preacher Curl", "Biceps", "Pull"],
    ["Cable Curl", "Biceps", "Pull"],
    ["Back Squat", "Quads", "Legs"],
    ["Front Squat", "Quads", "Legs"],
    ["Goblet Squat", "Quads", "Legs"],
    ["Hack Squat", "Quads", "Legs"],
    ["Leg Press", "Quads", "Legs"],
    ["Bulgarian Split Squat", "Quads", "Legs"],
    ["Walking Lunge", "Quads", "Legs"],
    ["Step-Up", "Quads", "Legs"],
    ["Leg Extension", "Quads", "Legs"],
    ["Romanian Deadlift", "Hamstrings", "Legs"],
    ["Stiff-Leg Deadlift", "Hamstrings", "Legs"],
    ["Lying Leg Curl", "Hamstrings", "Legs"],
    ["Seated Leg Curl", "Hamstrings", "Legs"],
    ["Good Morning", "Hamstrings", "Legs"],
    ["Hip Thrust", "Glutes", "Legs"],
    ["Glute Bridge", "Glutes", "Legs"],
    ["Cable Kickback", "Glutes", "Legs"],
    ["Standing Calf Raise", "Calves", "Legs"],
    ["Seated Calf Raise", "Calves", "Legs"],
    ["Plank", "Core", "Core"],
    ["Hanging Leg Raise", "Core", "Core"],
    ["Cable Crunch", "Core", "Core"],
    ["Ab Wheel Rollout", "Core", "Core"],
    ["Russian Twist", "Core", "Core"],
    ["Farmer Carry", "Core", "Core"],
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

SHEETS = [("Log", LOG), ("Exercises", EXERCISES), ("Templates", TEMPLATES)]


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
            "Log", "Exercises", "Templates"], "tab names or order wrong"

        log = z.read("xl/worksheets/sheet1.xml").decode()
        assert log.count("<row ") == 1, "Log must ship empty apart from headings"
        assert log.count("<c ") == 9, "Log needs exactly 9 headings, A to I"
        assert ">Notes</t>" in log, "last heading missing"

        assert z.read("xl/worksheets/sheet2.xml").decode().count("<row ") == len(EXERCISES)

        tpl = z.read("xl/worksheets/sheet3.xml").decode()
        assert tpl.count("<row ") == len(TEMPLATES)
        assert "<v>4</v>" in tpl, "set counts must be numbers, not text"


if __name__ == "__main__":
    build()
    check()
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes)")
