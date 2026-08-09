// Workout log — server code
// Sheet "Log" columns, in order:
// A date | B day | C exercise | D set | E reps | F weight | G rpe
// H auto note | I user note

const CFG = {
  logSheet: 'Log',
  exerciseSheet: 'Exercises',
  templateSheet: 'Templates',
  weightStep: 5,
  repStep: 2,
  roundTo: 2.5,
  defaultRpe: 8,
  blankDay: 'Custom'   // always offered, always starts empty
};

const COL = {
  date: 0, day: 1, exercise: 2, set: 3,
  reps: 4, weight: 5, rpe: 6, note: 7,
  userNote: 8   // column I — free text, never touched by the generator
};

const WIDTH = 9;

const BLANK_RPE = -1;   // sentinel: google.script.run is unreliable with null


// ---------- entry points ----------

function doGet(e) {
  const supplied = (e && e.parameter && e.parameter.key) || '';
  const canEdit = supplied !== '' && supplied === editKey();
  return renderApp(canEdit);
}

function renderApp(canEdit) {
  const t = HtmlService.createTemplateFromFile('Index');
  t.canEdit = canEdit ? 'true' : 'false';
  t.editKey = canEdit ? editKey() : '';
  return t.evaluate()
    .setTitle('Training log')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// Generated once and kept in script properties. Whoever has it can write.
function editKey() {
  const props = PropertiesService.getScriptProperties();
  let k = props.getProperty('EDIT_KEY');
  if (!k) {
    k = Utilities.getUuid().replace(/-/g, '').slice(0, 16);
    props.setProperty('EDIT_KEY', k);
  }
  return k;
}

function assertEdit(k) {
  if (String(k) !== editKey()) {
    throw new Error('Read-only view — changes are not saved.');
  }
}

// Menu helper: prints both links.
function showLinks() {
  const base = ScriptApp.getService().getUrl();
  const ui = SpreadsheetApp.getUi();
  if (!base) {
    return ui.alert('Deploy the web app first (Deploy > New deployment > Web app).');
  }
  ui.alert(
    'Links',
    'ADMIN (can edit):\n' + base + '?key=' + editKey() +
    '\n\nVIEWER (read only):\n' + base +
    '\n\nKeep the first one, or give it to whoever records your sessions. ' +
    'Anyone holding it can write.',
    ui.ButtonSet.OK
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Training')
    .addItem('Open entry form', 'showSidebar')
    .addItem('Show shareable links', 'showLinks')
    .addItem('Refresh exercise dropdown', 'setupExerciseValidation')
    .addToUi();
}

function showSidebar() {
  SpreadsheetApp.getUi().showSidebar(renderApp(true).setTitle('Training log'));
}


// ---------- reads ----------

// Day types are data, not a hardcoded list: whatever is in Templates plus
// whatever has ever been logged, with the blank day always available last.
function getBootstrap() {
  const logged = allRows().map(function (r) { return String(r[COL.day]).trim(); });
  const planned = templateRows().map(function (r) { return String(r[0]).trim(); });
  let days = dedupe(planned.concat(logged)).filter(Boolean);
  if (!days.length) days = ['Push', 'Pull', 'Legs'];
  if (!days.some(function (d) { return sameDay(d, CFG.blankDay); })) {
    days.push(CFG.blankDay);
  }
  return {
    days: days,
    exercises: exerciseList(),
    today: dateKey(new Date())
  };
}

// Names from the Exercises tab, for the autocomplete list.
function exerciseList() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CFG.exerciseSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return dedupe(
    sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
      .map(function (r) { return String(r[0]).trim(); })
      .filter(Boolean)
  ).sort();
}

function logSheet() {
  const s = SpreadsheetApp.getActive().getSheetByName(CFG.logSheet);
  if (!s) throw new Error('No sheet named "' + CFG.logSheet + '".');
  return s;
}

function allRows() {
  const sheet = logSheet();
  if (sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, WIDTH).getValues()
    .map(function (r, i) { r.sheetRow = i + 2; return r; })
    .filter(function (r) { return r[COL.date] && r[COL.exercise]; });
}

function templateRows() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CFG.templateSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, 5).getValues()
    .filter(function (r) { return r[0] && r[1]; });
}


// Sessions that exist for a day type, newest first. Powers the date picker.
function listDates(dayType) {
  const dates = allRows()
    .filter(function (r) { return sameDay(r[COL.day], dayType); })
    .map(function (r) { return dateKey(r[COL.date]); });
  return dedupe(dates).sort().reverse();
}


// Load one session. Never writes unless create === true.
function loadSession(dayType, dayKey, create, k) {
  if (create) assertEdit(k);
  let rows = allRows();
  let mine = rows.filter(function (r) {
    return dateKey(r[COL.date]) === dayKey && sameDay(r[COL.day], dayType);
  });

  if (!mine.length && create) {
    generateInto(dayType, dayKey, rows);
    rows = allRows();
    mine = rows.filter(function (r) {
      return dateKey(r[COL.date]) === dayKey && sameDay(r[COL.day], dayType);
    });
  }

  const priorKey = listDates(dayType).filter(function (d) { return d < dayKey; })[0] || null;
  const history = priorKey ? snapshot(rows, dayType, priorKey) : {};

  const sets = mine.map(function (r) {
    return {
      row: r.sheetRow,
      exercise: String(r[COL.exercise]),
      set: num(r[COL.set]),
      reps: num(r[COL.reps]),
      weight: num(r[COL.weight]),
      rpe: r[COL.rpe] === '' ? BLANK_RPE : num(r[COL.rpe]),
      note: String(r[COL.userNote] || ''),
      last: history[key(r[COL.exercise], num(r[COL.set]))] || null
    };
  });

  const lastNotes = priorKey ? notesOn(rows, dayType, priorKey) : {};

  // A blank day has no rows until an exercise is added, so "started" can't be
  // read back off the sheet — it only holds for the call that started it.
  const blank = sameDay(dayType, CFG.blankDay);

  return {
    exists: mine.length > 0 || (blank && !!create),
    blank: blank,
    sets: sets,
    priorDate: priorKey,
    lastNotes: lastNotes
  };
}

// One note per exercise from a given day — the first non-empty wins.
function notesOn(rows, dayType, dayKey) {
  const map = {};
  rows.filter(function (r) {
    return sameDay(r[COL.day], dayType) && dateKey(r[COL.date]) === dayKey;
  }).forEach(function (r) {
    const txt = String(r[COL.userNote] || '').trim();
    const name = String(r[COL.exercise]);
    if (txt && !map[name]) map[name] = txt;
  });
  return map;
}


function snapshot(rows, dayType, dayKey) {
  const map = {};
  rows.filter(function (r) {
    return sameDay(r[COL.day], dayType) && dateKey(r[COL.date]) === dayKey;
  }).forEach(function (r) {
    const reps = num(r[COL.reps]);
    const wt = num(r[COL.weight]);
    const rpe = r[COL.rpe] === '' ? null : num(r[COL.rpe]);
    map[key(r[COL.exercise], num(r[COL.set]))] =
      reps + ' x ' + wt + (rpe === null ? '' : ' @' + rpe);
  });
  return map;
}


// ---------- writes ----------

// The browser queues edits locally and replays them here, so this takes a
// batch: one round trip on reconnect instead of one per changed set.
// Each item is judged on its own — a single bad row must not discard the
// rest of a session's work.
function saveBatch(k, items) {
  assertEdit(k);
  const sheet = logSheet();
  const list = items || [];

  const out = list.map(function (it) {
    try {
      if (it.kind === 'note') {
        return { ok: true, text: writeNote(sheet, it.day, it.date, it.exercise, it.text) };
      }
      return { ok: true, set: writeSet(sheet, it) };
    } catch (err) {
      // Permanent: replaying will not help, so the client drops it and says so.
      return { ok: false, error: String(err && err.message || err) };
    }
  });

  SpreadsheetApp.flush();
  return out;
}


// Returns what is actually in the sheet after writing, so the browser can
// prove the save landed rather than trusting a silent success.
//
// Verifies the row still holds the same date, day, exercise and set number
// the browser thought it did. A queued edit can outlive the layout it was
// made against — rows shift when sets are added or a day is deleted — and
// writing blind would silently overwrite someone else's set.
//
// All four matter. Exercise and set number alone are not unique: the same
// bench press set 2 exists for every week logged, so a shifted row could
// pass that check and take the write meant for a different date.
function writeSet(sheet, it) {
  const row = Math.round(num(it.row));
  if (row < 2) throw new Error('Bad row ' + it.row + '.');
  if (row > sheet.getLastRow()) throw new Error('Row ' + row + ' no longer exists.');

  const guard = sheet.getRange(row, 1, 1, 4).getValues()[0];   // A–D
  if (dateKey(guard[COL.date]) !== String(it.date) ||
      !sameDay(guard[COL.day], it.day) ||
      String(guard[COL.exercise]).trim() !== String(it.exercise).trim() ||
      num(guard[COL.set]) !== num(it.set)) {
    throw new Error('Row ' + row + ' now holds something else — reload and re-enter.');
  }

  const target = sheet.getRange(row, COL.reps + 1, 1, 3);
  target.setValues([[num(it.reps), num(it.weight), it.rpe === BLANK_RPE ? '' : num(it.rpe)]]);
  SpreadsheetApp.flush();

  const back = target.getValues()[0];
  return {
    row: row,
    reps: num(back[0]),
    weight: num(back[1]),
    rpe: back[2] === '' ? BLANK_RPE : num(back[2])
  };
}


// Add or remove rows so this exercise has exactly `count` sets.
function setSetCount(k, dayType, dayKey, exercise, count) {
  assertEdit(k);
  const sheet = logSheet();
  count = Math.max(1, Math.min(10, Math.round(count)));

  const mine = allRows().filter(function (r) {
    return dateKey(r[COL.date]) === dayKey &&
      sameDay(r[COL.day], dayType) &&
      String(r[COL.exercise]) === exercise;
  });

  if (count > mine.length) {
    const last = mine[mine.length - 1];
    const reps = last ? num(last[COL.reps]) : 8;
    const wt = last ? num(last[COL.weight]) : 0;
    const add = [];
    for (var i = mine.length + 1; i <= count; i++) {
      add.push(buildRow(parseKey(dayKey), dayType, exercise, i, reps, wt, ''));
    }
    sheet.getRange(sheet.getLastRow() + 1, 1, add.length, WIDTH).setValues(add);
    sheet.getRange(sheet.getLastRow() - add.length + 1, 1, add.length, 1)
      .setNumberFormat('yyyy-mm-dd');
  } else if (count < mine.length) {
    mine.slice(count).map(function (r) { return r.sheetRow; })
      .sort(function (a, b) { return b - a; })
      .forEach(function (rowNum) { sheet.deleteRow(rowNum); });
  }

  SpreadsheetApp.flush();
  return loadSession(dayType, dayKey, false, k);
}


// Notes are per exercise, not per set. Written to every row of that
// exercise so adding or removing sets never loses the text.
function writeNote(sheet, dayType, dayKey, exercise, text) {
  const clean = String(text == null ? '' : text).slice(0, 500);

  const rows = allRows().filter(function (r) {
    return dateKey(r[COL.date]) === dayKey &&
      sameDay(r[COL.day], dayType) &&
      String(r[COL.exercise]) === exercise;
  });
  if (!rows.length) throw new Error(exercise + ' is no longer in that session.');

  rows.forEach(function (r) {
    sheet.getRange(r.sheetRow, COL.userNote + 1).setValue(clean);
  });

  SpreadsheetApp.flush();
  return clean;
}


// Add an exercise to a session that's already underway. Unknown names get
// appended to the Exercises tab so they're autocompleted next time.
function addExercise(k, dayType, dayKey, name, sets, reps, weight) {
  assertEdit(k);
  name = String(name).trim();
  if (!name) throw new Error('Name required.');

  sets = Math.max(1, Math.min(10, Math.round(num(sets) || 3)));
  reps = Math.max(1, Math.round(num(reps) || 10));
  weight = Math.max(0, num(weight));

  const already = allRows().some(function (r) {
    return dateKey(r[COL.date]) === dayKey &&
      sameDay(r[COL.day], dayType) &&
      String(r[COL.exercise]).toLowerCase() === name.toLowerCase();
  });
  if (already) throw new Error(name + ' is already in this session.');

  const when = parseKey(dayKey);
  const out = [];
  for (var i = 1; i <= sets; i++) {
    out.push(buildRow(when, dayType, name, i, reps, weight, 'added'));
  }

  const sheet = logSheet();
  sheet.getRange(sheet.getLastRow() + 1, 1, out.length, WIDTH).setValues(out);
  sheet.getRange(sheet.getLastRow() - out.length + 1, 1, out.length, 1)
    .setNumberFormat('yyyy-mm-dd');

  rememberExercise(name);
  SpreadsheetApp.flush();
  return loadSession(dayType, dayKey, false, k);
}


function rememberExercise(name) {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CFG.exerciseSheet);
  if (!sheet) return;
  const known = exerciseList().map(function (n) { return n.toLowerCase(); });
  if (known.indexOf(name.toLowerCase()) === -1) sheet.appendRow([name, '', '']);
}


// Wipe an entire day. Returns how many rows went.
function deleteSession(k, dayType, dayKey) {
  assertEdit(k);
  const sheet = logSheet();
  const doomed = allRows().filter(function (r) {
    return dateKey(r[COL.date]) === dayKey && sameDay(r[COL.day], dayType);
  }).map(function (r) { return r.sheetRow; })
    .sort(function (a, b) { return b - a; });

  doomed.forEach(function (rowNum) { sheet.deleteRow(rowNum); });
  SpreadsheetApp.flush();
  return doomed.length;
}


function generateInto(dayType, dayKey, rows) {
  // The blank day is ad hoc by definition — never carry last time forward,
  // because there is no way to remove an exercise you didn't want.
  if (sameDay(dayType, CFG.blankDay)) return;

  const prior = rows.filter(function (r) {
    return sameDay(r[COL.day], dayType) && dateKey(r[COL.date]) < dayKey;
  });
  const output = prior.length
    ? fromHistory(prior, dayType, dayKey)
    : fromTemplate(dayType, dayKey);

  if (!output.length) throw new Error('No history and no template for "' + dayType + '".');

  const sheet = logSheet();
  sheet.getRange(sheet.getLastRow() + 1, 1, output.length, WIDTH).setValues(output);
  sheet.getRange(sheet.getLastRow() - output.length + 1, 1, output.length, 1)
    .setNumberFormat('yyyy-mm-dd');
  SpreadsheetApp.flush();
}

function fromHistory(prior, dayType, dayKey) {
  const latest = prior.map(function (r) { return dateKey(r[COL.date]); }).sort().pop();
  const when = parseKey(dayKey);
  return prior.filter(function (r) { return dateKey(r[COL.date]) === latest; })
    .map(function (set) {
      const next = progress(set);
      return buildRow(when, dayType, set[COL.exercise], set[COL.set],
                      next.reps, next.weight, next.note);
    });
}

// Templates sheet: A day | B exercise | C sets | D reps | E weight
function fromTemplate(dayType, dayKey) {
  const when = parseKey(dayKey);
  const out = [];
  templateRows().filter(function (r) { return sameDay(r[0], dayType); })
    .forEach(function (r) {
      const sets = Math.max(1, num(r[2]) || 3);
      for (var i = 1; i <= sets; i++) {
        out.push(buildRow(when, dayType, r[1], i, num(r[3]), num(r[4]), 'from template'));
      }
    });
  return out;
}


// The progression rule, applied per set from that set's RPE.
function progress(set) {
  const reps = num(set[COL.reps]);
  const weight = num(set[COL.weight]);
  const rpe = num(set[COL.rpe]) || CFG.defaultRpe;

  if (rpe <= 6.5) {
    return { reps: reps + CFG.repStep, weight: round(weight + CFG.weightStep), note: 'was easy' };
  }
  if (rpe <= 8.5) return { reps: reps + CFG.repStep, weight: weight, note: '' };
  if (rpe <= 9.5) return { reps: reps, weight: weight, note: 'repeat' };
  return { reps: Math.max(1, reps - CFG.repStep), weight: round(weight * 0.95), note: 'backed off' };
}


// ---------- helpers ----------

function buildRow(date, dayType, exercise, setNo, reps, weight, note) {
  const out = new Array(WIDTH).fill('');
  out[COL.date] = date;
  out[COL.day] = dayType;
  out[COL.exercise] = exercise;
  out[COL.set] = setNo;
  out[COL.reps] = reps;
  out[COL.weight] = weight;
  out[COL.note] = note;
  return out;
}

function key(exercise, setNo) { return String(exercise) + '|' + setNo; }

function dedupe(arr) {
  const seen = {}, out = [];
  arr.forEach(function (v) { if (!seen[v]) { seen[v] = 1; out.push(v); } });
  return out;
}

function sameDay(a, b) {
  return String(a).trim().toLowerCase() === String(b).trim().toLowerCase();
}

function dateKey(d) {
  const dt = (d instanceof Date) ? d : new Date(d);
  return Utilities.formatDate(dt, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function parseKey(k) {
  const p = String(k).split('-');
  return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
}

function num(v) {
  const n = parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function round(w) {
  return Math.round(w / CFG.roundTo) * CFG.roundTo;
}


function setupExerciseValidation() {
  const ss = SpreadsheetApp.getActive();
  const log = ss.getSheetByName(CFG.logSheet);
  const list = ss.getSheetByName(CFG.exerciseSheet);
  if (!log || !list) {
    return SpreadsheetApp.getUi().alert('Need both "' + CFG.logSheet + '" and "' + CFG.exerciseSheet + '" sheets.');
  }
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(list.getRange('A2:A' + list.getLastRow()), true)
    .setAllowInvalid(true).build();
  log.getRange(2, COL.exercise + 1, 2000, 1).setDataValidation(rule);
  SpreadsheetApp.getUi().alert('Exercise dropdown refreshed.');
}
