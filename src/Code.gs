// Workout log — server code
// Sheet "Log" columns, in order:
// A date | B day | C exercise | D set | E reps-or-seconds | F weight |
// G rpe | H auto note | I user note
//
// Column E is reps for most exercises and seconds for the ones flagged
// "time based" on the Exercises tab. The unit is a property of the exercise,
// not of the row, which is why the Log needs no extra column.

const CFG = {
  logSheet: 'Log',
  exerciseSheet: 'Exercises',
  templateSheet: 'Templates',
  settingsSheet: 'Settings',
  recordsSheet: 'Records',
  weightStep: 5,
  repStep: 2,
  timeStep: 5,        // seconds, for exercises measured in time
  roundTo: 2.5,
  defaultRpe: 8,
  blankDay: 'Custom'   // always offered, always starts empty
};

// Used when the Settings tab is missing or a key is blank, so an older
// spreadsheet keeps working without being edited.
const DEFAULTS = {
  pr_rep_targets: '1,5,10',
  pr_metrics: 'est1rm,volume,reps'
};

const COL = {
  date: 0, day: 1, exercise: 2, set: 3,
  reps: 4, weight: 5, rpe: 6, note: 7,
  userNote: 8   // column I — free text, never touched by the generator
};

const WIDTH = 9;

// Must stay in step with LOG in data/build_template.py. Only used when
// creating a sheet from scratch — reads go by position, never by heading.
const HEADERS = ['Date', 'Day', 'Exercise', 'Set', 'Reps / Secs',
                 'Weight (LB)', 'RPE', 'Auto note', 'Notes'];
const RECORD_HEADERS = ['Exercise', 'Record', 'Value', 'Detail', 'Date', 'Day'];

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
  // The spreadsheet's own name becomes the browser tab title — with one log
  // per person, that is the only thing telling a row of open tabs apart.
  return t.evaluate()
    .setTitle(logName())
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

// The spreadsheet's own time zone, not the script's.
//
// appsscript.json ships a fixed timeZone and pasting the code into a project
// does not change it — so without this, someone in Sydney would have sessions
// dated by Toronto's clock, and an evening workout could land on the previous
// day. The spreadsheet's zone is the one its owner actually set.
function logTimeZone() {
  try {
    return SpreadsheetApp.getActive().getSpreadsheetTimeZone() ||
           Session.getScriptTimeZone();
  } catch (e) {
    return Session.getScriptTimeZone();
  }
}

function logName() {
  return String(SpreadsheetApp.getActive().getName() || 'Training log').trim();
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

// A deployed web app URL, or '' if we have not got a trustworthy one.
//
// ScriptApp.getService().getUrl() cannot be relied on: from a menu handler it
// returns either the /dev URL — which only ever works for the owner — or the
// /exec URL of a deployment that may since have been replaced, which opens as
// "Sorry, unable to open the file at present". So the real URL is pasted once
// and kept in script properties, and getUrl() is only a fallback.
const URL_PROP = 'WEB_APP_URL';
const EXEC_URL = /^https:\/\/script\.google\.com\/(a\/macros\/[^\/]+|macros)\/s\/[\w-]+\/exec$/;

function webAppUrl() {
  const saved = PropertiesService.getScriptProperties().getProperty(URL_PROP);
  if (saved && EXEC_URL.test(saved)) return saved;

  let auto = '';
  try { auto = ScriptApp.getService().getUrl() || ''; } catch (e) { auto = ''; }
  return EXEC_URL.test(auto) ? auto : '';
}

// Prompts for the /exec URL and stores it. Returns '' if the user cancels or
// pastes something that is not a deployment URL.
function askForUrl(ui) {
  const res = ui.prompt(
    'Web app link',
    'In the Apps Script editor: Deploy > Manage deployments, then copy the\n' +
    'Web app URL. It ends in /exec.\n\n' +
    'Paste it here:',
    ui.ButtonSet.OK_CANCEL
  );
  if (res.getSelectedButton() !== ui.Button.OK) return '';

  const url = String(res.getResponseText() || '').trim().replace(/[?#].*$/, '').replace(/\/+$/, '');
  if (!EXEC_URL.test(url)) {
    ui.alert(
      'That does not look like a deployment link',
      'It needs to look like:\n\n' +
      'https://script.google.com/macros/s/AKfy…/exec\n\n' +
      'A link ending in /dev is the test link and only works for you. Take the\n' +
      'one from Deploy > Manage deployments.',
      ui.ButtonSet.OK
    );
    return '';
  }

  PropertiesService.getScriptProperties().setProperty(URL_PROP, url);
  return url;
}

// Menu: paste or replace the deployment link. Creating a *new* deployment
// mints a new URL, so this needs re-running after that; editing an existing
// deployment keeps the same one.
function setWebAppLink() {
  const ui = SpreadsheetApp.getUi();
  const url = askForUrl(ui);
  if (url) showLinks();
}

// Menu helper: prints both links.
function showLinks() {
  const ui = SpreadsheetApp.getUi();
  const base = webAppUrl() || askForUrl(ui);
  if (!base) return;

  ui.alert(
    'Links',
    'ADMIN (can edit):\n' + base + '?key=' + editKey() +
    '\n\nVIEWER (read only):\n' + base +
    '\n\nKeep the first one, or give it to whoever records your sessions. ' +
    'Anyone holding it can write.\n\n' +
    'Wrong link? Training > Set web app link.',
    ui.ButtonSet.OK
  );
}

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Training')
    .addItem('Open entry form', 'showSidebar')
    .addItem('Show shareable links', 'showLinks')
    .addItem('Set web app link…', 'setWebAppLink')
    .addItem('Rebuild records', 'showRecords')
    .addItem('Archive old sessions…', 'archiveSessions')
    .addItem('Refresh exercise dropdown', 'setupExerciseValidation')
    .addToUi();
}

function showSidebar() {
  SpreadsheetApp.getUi().showSidebar(renderApp(true).setTitle('Training log'));
}


// ---------- reads ----------

// Day types are data, not a hardcoded list.
//
// For whoever is entering: everything in Templates plus everything ever
// logged, with the blank day appended — those are the days you could start.
//
// For a viewer: only days that actually have sessions. The Templates tab and
// the blank day are planning tools, so offering them read-only just produces
// buttons that always answer "nothing logged".
function getBootstrap(k) {
  const canEdit = String(k) === editKey();
  const logged = allRows().map(function (r) { return String(r[COL.day]).trim(); });

  let days = dedupe(logged).filter(Boolean);
  if (canEdit) {
    const planned = templateRows().map(function (r) { return String(r[0]).trim(); });
    days = dedupe(planned.concat(logged)).filter(Boolean);
    if (!days.length) days = ['Push', 'Pull', 'Legs'];
    if (!days.some(function (d) { return sameDay(d, CFG.blankDay); })) {
      days.push(CFG.blankDay);
    }
  }

  // If something is already logged for today, the app opens straight into it
  // rather than asking which day type you meant.
  const today = dateKey(new Date());
  const openToday = dedupe(allRows()
    .filter(function (r) { return dateKey(r[COL.date]) === today; })
    .map(function (r) { return String(r[COL.day]).trim(); }))
    .filter(function (d) {
      return days.some(function (x) { return sameDay(x, d); });
    })[0] || '';

  return {
    days: days,
    openDay: openToday,
    exercises: exerciseList(),
    images: exerciseImages(),
    videos: exerciseVideos(),
    noWeight: noWeightNames(),
    timed: timedNames(),
    name: logName(),
    // Only for whoever can edit — a viewer has no access to the spreadsheet
    // itself, so the link would only ever land them on a request-access page.
    sheetUrl: canEdit ? SpreadsheetApp.getActive().getUrl() : '',
    today: dateKey(new Date())
  };
}

// Exercises tab: A name | B group | C pattern | D image | E no weight |
// F video | G time based. Anything past A may not exist on an older sheet,
// hence the clamp.
function exerciseRows() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CFG.exerciseSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = Math.min(7, Math.max(1, sheet.getLastColumn()));
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()
    .filter(function (r) { return String(r[0]).trim(); });
}

function isYes(v) { return /^(y|yes|true|1|x)$/i.test(String(v == null ? '' : v).trim()); }

// Exercises that carry no external load — push-ups, planks, the rower.
// Their weight field is hidden and the progression rule leaves weight alone,
// so "+5 lb" can never turn a push-up into a 5 lb push-up.
function noWeightNames() {
  const map = {};
  exerciseRows().forEach(function (r) {
    if (isYes(r[4])) map[String(r[0]).trim()] = true;
  });
  return map;
}

// Exercises measured in seconds rather than reps — planks, carries, the
// rower. Column E of the Log holds seconds for these; the unit is a property
// of the exercise, not of the row, which is why the Log needs no extra
// column and older sheets keep working.
function timedNames() {
  const map = {};
  exerciseRows().forEach(function (r) {
    if (isYes(r[6])) map[String(r[0]).trim()] = true;
  });
  return map;
}

function timedLookup() {
  const lower = {};
  Object.keys(timedNames()).forEach(function (n) { lower[n.toLowerCase()] = true; });
  return lower;
}

function noWeightLookup() {
  const lower = {};
  Object.keys(noWeightNames()).forEach(function (n) { lower[n.toLowerCase()] = true; });
  return lower;
}

// Names from the Exercises tab, for the autocomplete list.
function exerciseList() {
  return dedupe(exerciseRows().map(function (r) { return String(r[0]).trim(); })).sort();
}

// name -> image URL, for the ones that have one. Only http(s) is accepted:
// the value is user-supplied and ends up as an image source.
function exerciseImages() {
  const map = {};
  exerciseRows().forEach(function (r) {
    const url = String(r[3] || '').trim();
    if (/^https?:\/\//i.test(url)) map[String(r[0]).trim()] = url;
  });
  return map;
}

// name -> "how to" link. Same http(s) guard as images: the value comes from
// the sheet and ends up as a href.
function exerciseVideos() {
  const map = {};
  exerciseRows().forEach(function (r) {
    const url = String(r[5] || '').trim();
    if (/^https?:\/\//i.test(url)) map[String(r[0]).trim()] = url;
  });
  return map;
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

// Templates tab: A day | B exercise | C sets | D reps | E weight |
// F include in new session. F may not exist on an older sheet, hence the
// width clamp.
function templateRows() {
  const sheet = SpreadsheetApp.getActive().getSheetByName(CFG.templateSheet);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const width = Math.min(6, Math.max(2, sheet.getLastColumn()));
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, width).getValues()
    .filter(function (r) { return r[0] && r[1]; });
}

function isNo(v) {
  return /^(n|no|false|0|off|skip|optional)$/i.test(String(v == null ? '' : v).trim());
}


// Sessions that exist for a day type, newest first. Powers the date picker.
function listDates(dayType) {
  const dates = allRows()
    .filter(function (r) { return sameDay(r[COL.day], dayType); })
    .map(function (r) { return dateKey(r[COL.date]); });
  return dedupe(dates).sort().reverse();
}


// How a new session gets its rows. 'auto' is what the Start button used to
// do implicitly; the others are the browser saying which it wants.
function resolveSource(dayType, source) {
  if (source === 'history' || source === 'template' || source === 'empty') return source;
  return sameDay(dayType, CFG.blankDay) ? 'empty' : 'auto';
}

// Load one session. Never writes unless create === true.
function loadSession(dayType, dayKey, create, k, source) {
  if (create) assertEdit(k);
  const from = resolveSource(dayType, source);
  let rows = allRows();
  let mine = rows.filter(function (r) {
    return dateKey(r[COL.date]) === dayKey && sameDay(r[COL.day], dayType);
  });

  if (!mine.length && create) {
    generateInto(dayType, dayKey, rows, from);
    rows = allRows();
    mine = rows.filter(function (r) {
      return dateKey(r[COL.date]) === dayKey && sameDay(r[COL.day], dayType);
    });
  }

  const priorKey = listDates(dayType).filter(function (d) { return d < dayKey; })[0] || null;
  const history = priorKey ? snapshot(rows, dayType, priorKey) : {};

  // Records exclude this session, so "personal best" means "better than
  // anything before today" rather than "better than the set I just typed".
  const cfg = prConfig();
  const records = computeRecords(rows, cfg, { day: dayType, date: dayKey });

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

  // Only what is on screen — no need to ship the whole history.
  const shown = {};
  dedupe(mine.map(function (r) { return String(r[COL.exercise]); })).forEach(function (name) {
    const rec = records[name];
    if (!rec || !rec.heaviest) return;
    shown[name] = {
      heaviest: rec.heaviest,
      est1rm: rec.est1rm ? rec.est1rm.value : null,
      reps: rec.reps || null          // the only record an unweighted lift has
    };
  });

  const lastNotes = priorKey ? notesOn(rows, dayType, priorKey) : {};

  // An empty session has no rows until an exercise is added, so "started"
  // can't be read back off the sheet — it only holds for the call that
  // started it.
  const blank = sameDay(dayType, CFG.blankDay);

  return {
    exists: mine.length > 0 || (!!create && from === 'empty'),
    blank: blank,
    templateCount: templateCount(dayType),
    sets: sets,
    priorDate: priorKey,
    lastNotes: lastNotes,
    records: shown
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


// Last week's numbers, per set, as values rather than a rendered string —
// the browser shows them under the field they belong to.
function snapshot(rows, dayType, dayKey) {
  const map = {};
  rows.filter(function (r) {
    return sameDay(r[COL.day], dayType) && dateKey(r[COL.date]) === dayKey;
  }).forEach(function (r) {
    map[key(r[COL.exercise], num(r[COL.set]))] = {
      reps: num(r[COL.reps]),
      weight: num(r[COL.weight]),
      rpe: r[COL.rpe] === '' ? BLANK_RPE : num(r[COL.rpe])
    };
  });
  return map;
}


// ---------- personal records ----------
//
// Records are derived, never stored. The Log is the only truth, so a record
// cannot drift out of sync with it — edit a row by hand and the record
// follows. The Records tab is a rendering of this, not a source.

// Settings tab: A key | B value. Anything missing falls back to DEFAULTS.
function settings() {
  const out = {};
  Object.keys(DEFAULTS).forEach(function (k) { out[k] = DEFAULTS[k]; });

  const sheet = SpreadsheetApp.getActive().getSheetByName(CFG.settingsSheet);
  if (!sheet || sheet.getLastRow() < 2) return out;

  sheet.getRange(2, 1, sheet.getLastRow() - 1, 2).getValues().forEach(function (r) {
    const key = String(r[0]).trim();
    const val = String(r[1]).trim();
    if (key && val) out[key] = val;
  });
  return out;
}

function prConfig() {
  const s = settings();

  const targets = dedupe(String(s.pr_rep_targets).split(',')
    .map(function (n) { return Math.round(num(n)); })
    .filter(function (n) { return n > 0; }))
    .sort(function (a, b) { return a - b; });

  const metrics = String(s.pr_metrics).split(',')
    .map(function (m) { return m.trim().toLowerCase(); })
    .filter(Boolean);

  return { targets: targets, metrics: metrics };
}


// Pure: takes Log rows and returns one record set per exercise. Kept free of
// SpreadsheetApp so it can be tested outside Apps Script.
//
// `skip` optionally excludes one session (day + date) — that is what makes
// "is this a personal best?" answerable during the session that might set it.
function computeRecords(rows, cfg, skip) {
  const byExercise = {};

  rows.forEach(function (r) {
    const name = String(r[COL.exercise]).trim();
    if (!name) return;

    const date = dateKey(r[COL.date]);
    const day = String(r[COL.day]).trim();
    if (skip && date === skip.date && sameDay(day, skip.day)) return;

    const reps = num(r[COL.reps]);
    const weight = num(r[COL.weight]);
    if (reps <= 0) return;

    const rec = byExercise[name] || (byExercise[name] = {
      heaviest: null, byReps: {}, est1rm: null, volume: null, reps: null,
      session: null, sessions: {}
    });
    const hit = { reps: reps, weight: weight, date: date, day: day };

    if (better(hit, rec.heaviest)) rec.heaviest = hit;

    cfg.targets.forEach(function (n) {
      if (reps >= n && better(hit, rec.byReps[n])) rec.byReps[n] = hit;
    });

    if (weight > 0) {
      const e = epley(reps, weight);
      if (!rec.est1rm || e > rec.est1rm.value) {
        rec.est1rm = { value: e, reps: reps, weight: weight, date: date, day: day };
      }
    }

    const vol = reps * weight;
    if (vol > 0 && (!rec.volume || vol > rec.volume.value)) {
      rec.volume = { value: vol, reps: reps, weight: weight, date: date, day: day };
    }

    if (!rec.reps || reps > rec.reps.reps ||
        (reps === rec.reps.reps && weight > rec.reps.weight)) {
      rec.reps = hit;
    }

    const key = date + '|' + day;
    const tally = rec.sessions[key] || (rec.sessions[key] = { value: 0, sets: 0, date: date, day: day });
    tally.value += vol;
    tally.sets++;
  });

  Object.keys(byExercise).forEach(function (name) {
    const rec = byExercise[name];
    Object.keys(rec.sessions).forEach(function (k) {
      const t = rec.sessions[k];
      if (t.value > 0 && (!rec.session || t.value > rec.session.value)) rec.session = t;
    });
    delete rec.sessions;
  });

  return byExercise;
}

// Heavier wins; at equal weight, more reps wins.
function better(hit, best) {
  if (!best) return true;
  if (hit.weight !== best.weight) return hit.weight > best.weight;
  return hit.reps > best.reps;
}

// Epley. Only ever a comparison aid between sets, never a prescription.
function epley(reps, weight) {
  return Math.round(weight * (1 + reps / 30) * 10) / 10;
}

const RECORD_LABELS = {
  est1rm: 'Est. 1RM',
  volume: 'Best set volume',
  reps: 'Most reps',
  session: 'Best session volume'
};

// One row per exercise per record, for the Records tab.
//
// `timed` maps exercise name -> true for the ones measured in seconds. Only
// the wording changes: "most reps" is a longest hold, a rep target is a time
// held, and an estimated 1RM means nothing for a plank so it is left out.
function recordRows(records, cfg, timed) {
  const out = [];
  const isTimed = function (name) { return !!(timed && timed[name]); };

  Object.keys(records).sort().forEach(function (name) {
    const rec = records[name];
    const t = isTimed(name);
    const unit = t ? 's' : '';

    cfg.targets.forEach(function (n) {
      const hit = rec.byReps[n];
      if (!hit || hit.weight <= 0) return;
      out.push([
        name,
        n === 1 ? 'Heaviest'
                : 'Heaviest at ' + n + '+ ' + (t ? 'seconds' : 'reps'),
        hit.weight, hit.reps + unit + ' x ' + hit.weight, hit.date, hit.day
      ]);
    });

    cfg.metrics.forEach(function (m) {
      if (t && m === 'est1rm') return;      // meaningless for a hold
      const hit = rec[m];
      if (!hit) return;
      const label = (t && m === 'reps') ? 'Longest hold' : RECORD_LABELS[m];
      if (!label) return;
      out.push([
        name, label,
        m === 'reps' ? hit.reps : hit.value,
        hit.reps + unit + ' x ' + hit.weight +
          (m === 'session' ? ' … ' + hit.sets + ' sets' : ''),
        hit.date, hit.day
      ]);
    });
  });

  return out;
}


// Rewrites the Records tab from the Log. Cheap enough to run by hand, so it
// is not on the save path — a session's saves stay fast, and the app's own
// display is computed live regardless of when this last ran.
function rebuildRecords() {
  const ss = SpreadsheetApp.getActive();
  const sheet = ss.getSheetByName(CFG.recordsSheet) || ss.insertSheet(CFG.recordsSheet);
  const cfg = prConfig();
  const out = recordRows(computeRecords(allRows(), cfg, null), cfg, timedNames());

  sheet.clear();
  sheet.getRange(1, 1, 1, 6).setValues([RECORD_HEADERS]).setFontWeight('bold');
  if (out.length) sheet.getRange(2, 1, out.length, 6).setValues(out);
  sheet.setFrozenRows(1);
  SpreadsheetApp.flush();
  return out.length;
}

function showRecords() {
  const n = rebuildRecords();
  SpreadsheetApp.getUi().alert('Records rebuilt — ' + n +
    ' on the "' + CFG.recordsSheet + '" tab.');
}

// ---------- archiving ----------
//
// A Log grows forever and every read pulls the whole sheet. Archiving lifts
// a closed period out into its own spreadsheet and removes it from this one.
function archiveSessions() {
  const ui = SpreadsheetApp.getUi();

  const asked = ui.prompt(
    'Archive old sessions',
    'Move every session up to and including this date into its own\n' +
    'spreadsheet, and remove it from this one.\n\n' +
    'Date (YYYY-MM-DD), e.g. 2024-12-31:',
    ui.ButtonSet.OK_CANCEL
  );
  if (asked.getSelectedButton() !== ui.Button.OK) return;

  const cutoff = String(asked.getResponseText() || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff)) {
    return ui.alert('The date needs to look like 2024-12-31.');
  }

  const sheet = logSheet();
  const last = sheet.getLastRow();
  if (last < 2) return ui.alert('Nothing logged yet.');

  // Read raw rather than through allRows(), so anything the sheet holds that
  // is not a log row is left exactly where it is rather than being tidied
  // away by the rewrite below.
  const raw = sheet.getRange(2, 1, last - 1, WIDTH).getValues();
  const isOld = function (r) {
    return r[COL.date] && r[COL.exercise] && dateKey(r[COL.date]) <= cutoff;
  };

  const doomed = raw.filter(isOld);
  if (!doomed.length) return ui.alert('Nothing logged on or before ' + cutoff + '.');

  const dates = doomed.map(function (r) { return dateKey(r[COL.date]); }).sort();
  const from = dates[0];
  const to = dates[dates.length - 1];
  const name = logName() + '_' + from + '_' + to;
  const sessions = dedupe(doomed.map(function (r) {
    return dateKey(r[COL.date]) + '|' + String(r[COL.day]).trim();
  })).length;

  const go = ui.alert(
    'Archive ' + doomed.length + ' rows?',
    doomed.length + ' rows, ' + sessions + ' sessions, ' + from + ' to ' + to + '.\n\n' +
    'They are copied to a new spreadsheet in your Drive:\n' + name + '\n\n' +
    'and then deleted from this one. Personal records are worked out from\n' +
    'what is left, so bests set in that period will stop showing here — the\n' +
    'archive keeps its own copy of them.\n\nContinue?',
    ui.ButtonSet.YES_NO
  );
  if (go !== ui.Button.YES) return;

  writeArchive(name, doomed);

  const keep = raw.filter(function (r) { return !isOld(r); });
  sheet.getRange(2, 1, last - 1, WIDTH).clearContent();
  if (keep.length) {
    sheet.getRange(2, 1, keep.length, WIDTH).setValues(keep);
    sheet.getRange(2, 1, keep.length, 1).setNumberFormat('yyyy-mm-dd');
  }
  SpreadsheetApp.flush();
  refreshRecords();

  ui.alert(
    'Archived',
    doomed.length + ' rows moved to "' + name + '" in your Google Drive.\n\n' +
    'This sheet now starts at ' + (keep.length ? nextDate(keep) : '(empty)') + '.',
    ui.ButtonSet.OK
  );
}

function nextDate(rows) {
  return rows.map(function (r) { return r[COL.date] ? dateKey(r[COL.date]) : ''; })
    .filter(Boolean).sort()[0] || '(empty)';
}

// The archive is a standalone spreadsheet: the rows, plus the records for
// that period so they survive being taken out of the live log.
function writeArchive(name, rows) {
  const book = SpreadsheetApp.create(name);

  const log = book.getSheets()[0].setName(CFG.logSheet);
  log.getRange(1, 1, 1, WIDTH).setValues([HEADERS]).setFontWeight('bold');
  log.getRange(2, 1, rows.length, WIDTH).setValues(rows);
  log.getRange(2, 1, rows.length, 1).setNumberFormat('yyyy-mm-dd');
  log.setFrozenRows(1);

  const cfg = prConfig();
  const out = recordRows(computeRecords(rows, cfg, null), cfg, timedNames());
  const rec = book.insertSheet(CFG.recordsSheet);
  rec.getRange(1, 1, 1, 6).setValues([RECORD_HEADERS]).setFontWeight('bold');
  if (out.length) rec.getRange(2, 1, out.length, 6).setValues(out);
  rec.setFrozenRows(1);

  SpreadsheetApp.flush();
  return book;
}


// Called after the operations that change which rows exist. Never on the
// save path, and never allowed to break the write that triggered it — a
// failed rendering of the records must not cost someone their logged set.
function refreshRecords() {
  try {
    rebuildRecords();
  } catch (err) {
    console.error('Records refresh failed: ' + err);
  }
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
// Zero is allowed and means "take it out of this session altogether" —
// removing the rows is the same operation as shrinking to none of them.
function setSetCount(k, dayType, dayKey, exercise, count) {
  assertEdit(k);
  const sheet = logSheet();
  count = Math.max(0, Math.min(10, Math.round(count)));

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
  refreshRecords();
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
  refreshRecords();
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
  refreshRecords();
  return doomed.length;
}


// How many exercises the template would contribute to this day.
function templateCount(dayType) {
  return dedupe(templateRows()
    .filter(function (r) { return sameDay(r[0], dayType) && !isNo(r[5]); })
    .map(function (r) { return String(r[1]).trim(); })).length;
}

function generateInto(dayType, dayKey, rows, from) {
  if (from === 'empty') return;

  const prior = rows.filter(function (r) {
    return sameDay(r[COL.day], dayType) && dateKey(r[COL.date]) < dayKey;
  });

  let output;
  if (from === 'history') {
    if (!prior.length) throw new Error('No earlier "' + dayType + '" to build from.');
    output = fromHistory(prior, dayType, dayKey);
  } else if (from === 'template') {
    output = fromTemplate(dayType, dayKey);
    if (!output.length) throw new Error('No template rows for "' + dayType + '".');
  } else {
    output = prior.length
      ? fromHistory(prior, dayType, dayKey)
      : fromTemplate(dayType, dayKey);
  }

  if (!output.length) throw new Error('No history and no template for "' + dayType + '".');

  const sheet = logSheet();
  sheet.getRange(sheet.getLastRow() + 1, 1, output.length, WIDTH).setValues(output);
  sheet.getRange(sheet.getLastRow() - output.length + 1, 1, output.length, 1)
    .setNumberFormat('yyyy-mm-dd');
  SpreadsheetApp.flush();
  refreshRecords();
}

function fromHistory(prior, dayType, dayKey) {
  const latest = prior.map(function (r) { return dateKey(r[COL.date]); }).sort().pop();
  const when = parseKey(dayKey);
  const noWeight = noWeightLookup();
  const timed = timedLookup();
  return prior.filter(function (r) { return dateKey(r[COL.date]) === latest; })
    .map(function (set) {
      const key = String(set[COL.exercise]).trim().toLowerCase();
      const next = progress(set, noWeight[key], timed[key]);
      return buildRow(when, dayType, set[COL.exercise], set[COL.set],
                      next.reps, next.weight, next.note);
    });
}

// Column F says whether the row is used when generating a session. Marking
// it "no" keeps the exercise on the plan for that day without it being
// generated — a reminder you can still add by hand.
function fromTemplate(dayType, dayKey) {
  const when = parseKey(dayKey);
  const out = [];
  templateRows()
    .filter(function (r) { return sameDay(r[0], dayType) && !isNo(r[5]); })
    .forEach(function (r) {
      const sets = Math.max(1, num(r[2]) || 3);
      for (var i = 1; i <= sets; i++) {
        out.push(buildRow(when, dayType, r[1], i, num(r[3]), num(r[4]), 'from template'));
      }
    });
  return out;
}


// The progression rule, applied per set from that set's RPE.
// `reps` is whatever column E measures for this exercise — repetitions, or
// seconds when it is a timed one. The rule is the same shape either way; only
// the step size differs, because +2 seconds on a plank is not a session.
function progress(set, noWeight, timed) {
  const reps = num(set[COL.reps]);
  const weight = num(set[COL.weight]);
  const rpe = num(set[COL.rpe]) || CFG.defaultRpe;
  const step = timed ? CFG.timeStep : CFG.repStep;

  // Nothing to add load to, so an easy set earns reps (or seconds) and a
  // brutal one gives them back. Weight passes straight through, untouched.
  if (noWeight) {
    if (rpe <= 6.5) return { reps: reps + step, weight: weight, note: 'was easy' };
    if (rpe <= 8.5) return { reps: reps + step, weight: weight, note: '' };
    if (rpe <= 9.5) return { reps: reps, weight: weight, note: 'repeat' };
    return { reps: Math.max(1, reps - step), weight: weight, note: 'backed off' };
  }

  if (rpe <= 6.5) {
    return { reps: reps + step, weight: round(weight + CFG.weightStep), note: 'was easy' };
  }
  if (rpe <= 8.5) return { reps: reps + step, weight: weight, note: '' };
  if (rpe <= 9.5) return { reps: reps, weight: weight, note: 'repeat' };
  return { reps: Math.max(1, reps - step), weight: round(weight * 0.95), note: 'backed off' };
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
  return Utilities.formatDate(dt, logTimeZone(), 'yyyy-MM-dd');
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
  if (list.getLastRow() < 2) {
    return SpreadsheetApp.getUi().alert('The "' + CFG.exerciseSheet +
      '" tab has no exercises in it yet.');
  }
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInRange(list.getRange('A2:A' + list.getLastRow()), true)
    .setAllowInvalid(true).build();
  log.getRange(2, COL.exercise + 1, 2000, 1).setDataValidation(rule);
  SpreadsheetApp.getUi().alert('Exercise dropdown refreshed.');
}
