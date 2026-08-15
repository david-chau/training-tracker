// Checks the pure rules in src/Code.gs — personal records, the progression
// rule, and the Exercises/Templates flag helpers.
//
//     node test/records.test.js
//
// These are deliberately free of SpreadsheetApp, so they can be run here
// against plain arrays. The Apps Script globals they do touch are stubbed.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const sandbox = {
  console,
  // dateKey() formats through Utilities/Session in Apps Script.
  Utilities: {
    formatDate: d => d.toISOString().slice(0, 10),
    getUuid: () => 'test'
  },
  Session: { getScriptTimeZone: () => 'UTC' },
  SpreadsheetApp: { getActive: () => null },
  PropertiesService: { getScriptProperties: () => ({ getProperty: () => 'k' }) }
};

vm.createContext(sandbox);
vm.runInContext(
  fs.readFileSync(path.join(__dirname, '..', 'src', 'Code.gs'), 'utf8'),
  sandbox
);

// `function` declarations land on the sandbox global but `const` ones do
// not, so COL has to be read from inside the context.
const { computeRecords, recordRows, epley, better, progress, isYes, isNo,
        resolveSource } = sandbox;
const COL = vm.runInContext('COL', sandbox);

// Arrays built inside the vm have that realm's prototype, which
// deepStrictEqual treats as a difference. Copy them back out first.
const plain = a => Array.from(a);

// date, day, exercise, set, reps, weight, rpe, auto note, note
const row = (date, day, exercise, set, reps, weight) => {
  const r = new Array(9).fill('');
  r[COL.date] = date; r[COL.day] = day; r[COL.exercise] = exercise;
  r[COL.set] = set; r[COL.reps] = reps; r[COL.weight] = weight;
  return r;
};

const CFG = { targets: [1, 5, 10], metrics: ['est1rm', 'volume', 'reps'] };

let passed = 0;
function test(name, fn) { fn(); passed++; console.log('  ok  ' + name); }

// ---------- tests ----------

test('heaviest set wins, and more reps breaks a tie at equal weight', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Push', 'Bench', 1, 5, 100),
    row('2026-08-08', 'Push', 'Bench', 1, 8, 100),
    row('2026-08-15', 'Push', 'Bench', 1, 3, 95)
  ], CFG, null);

  assert.strictEqual(recs.Bench.heaviest.weight, 100);
  assert.strictEqual(recs.Bench.heaviest.reps, 8, 'tie at 100 goes to more reps');
  assert.strictEqual(recs.Bench.heaviest.date, '2026-08-08');
});

test('heaviest at N+ reps only counts sets that reach N', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Push', 'Bench', 1, 3, 140),   // heavy, few reps
    row('2026-08-08', 'Push', 'Bench', 1, 6, 120),
    row('2026-08-15', 'Push', 'Bench', 1, 12, 80)
  ], CFG, null);

  const r = recs.Bench.byReps;
  assert.strictEqual(r[1].weight, 140, 'any set qualifies at 1+');
  assert.strictEqual(r[5].weight, 120, '140 was only a triple');
  assert.strictEqual(r[10].weight, 80);
});

test('a rep target nobody has reached yields no record', () => {
  const recs = computeRecords(
    [row('2026-08-01', 'Push', 'Bench', 1, 3, 140)], CFG, null);

  assert.ok(recs.Bench.byReps[1]);
  assert.strictEqual(recs.Bench.byReps[5], undefined);
  assert.strictEqual(recs.Bench.byReps[10], undefined);
});

test('estimated 1RM can beat a heavier set done for fewer reps', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Push', 'Bench', 1, 1, 140),   // 140.0 * (1 + 1/30)
    row('2026-08-08', 'Push', 'Bench', 1, 10, 120)   // 120.0 * (1 + 10/30)
  ], CFG, null);

  assert.strictEqual(recs.Bench.heaviest.weight, 140);
  assert.strictEqual(recs.Bench.est1rm.weight, 120, 'the 10-rep set estimates higher');
  assert.strictEqual(recs.Bench.est1rm.value, epley(10, 120));
  assert.strictEqual(epley(10, 120), 160);
});

test('bodyweight work records reps but no weight record', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Pull', 'Pull-Up', 1, 8, 0),
    row('2026-08-08', 'Pull', 'Pull-Up', 1, 12, 0)
  ], CFG, null);

  assert.strictEqual(recs['Pull-Up'].reps.reps, 12);
  assert.strictEqual(recs['Pull-Up'].est1rm, null, 'no 1RM from zero weight');
  assert.strictEqual(recs['Pull-Up'].volume, null);
  assert.strictEqual(recs['Pull-Up'].heaviest.weight, 0);
});

test('best set volume is reps times weight, not the heaviest set', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Legs', 'Squat', 1, 3, 200),   // 600
    row('2026-08-08', 'Legs', 'Squat', 1, 10, 100)   // 1000
  ], CFG, null);

  assert.strictEqual(recs.Squat.volume.value, 1000);
  assert.strictEqual(recs.Squat.volume.weight, 100);
});

test('session volume sums an exercise across one day', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Legs', 'Squat', 1, 5, 100),
    row('2026-08-01', 'Legs', 'Squat', 2, 5, 100),
    row('2026-08-01', 'Legs', 'Squat', 3, 5, 100),   // 1500 total
    row('2026-08-08', 'Legs', 'Squat', 1, 5, 140)    // 700 total
  ], { targets: [1], metrics: ['session'] }, null);

  assert.strictEqual(recs.Squat.session.value, 1500);
  assert.strictEqual(recs.Squat.session.sets, 3);
  assert.strictEqual(recs.Squat.session.date, '2026-08-01');
});

test('skipping a session hides it from its own records', () => {
  const rows = [
    row('2026-08-01', 'Push', 'Bench', 1, 5, 100),
    row('2026-08-08', 'Push', 'Bench', 1, 5, 200)    // today, huge
  ];

  const all = computeRecords(rows, CFG, null);
  assert.strictEqual(all.Bench.heaviest.weight, 200);

  const before = computeRecords(rows, CFG, { day: 'Push', date: '2026-08-08' });
  assert.strictEqual(before.Bench.heaviest.weight, 100,
    'today must not be its own record to beat');
});

test('skipping matches on day type as well as date', () => {
  const rows = [
    row('2026-08-08', 'Push', 'Bench', 1, 5, 100),
    row('2026-08-08', 'Custom', 'Bench', 1, 5, 200)
  ];
  const recs = computeRecords(rows, CFG, { day: 'Push', date: '2026-08-08' });
  assert.strictEqual(recs.Bench.heaviest.weight, 200,
    'the Custom session on the same date still counts');
});

test('exercises are kept apart and rows without reps ignored', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Push', 'Bench', 1, 5, 100),
    row('2026-08-01', 'Push', 'Lateral Raise', 1, 15, 10),
    row('2026-08-01', 'Push', 'Dip', 1, 0, 0)
  ], CFG, null);

  assert.strictEqual(recs.Bench.heaviest.weight, 100);
  assert.strictEqual(recs['Lateral Raise'].heaviest.weight, 10);
  assert.strictEqual(recs.Dip, undefined, 'a set of zero reps is not a record');
});

test('the Records tab lists configured metrics and skips absent ones', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Pull', 'Pull-Up', 1, 10, 0),
    row('2026-08-01', 'Push', 'Bench', 1, 5, 100)
  ], CFG, null);

  const rows = recordRows(recs, CFG);
  const labels = rows.filter(r => r[0] === 'Bench').map(r => r[1]);

  assert.deepStrictEqual(plain(labels),
    ['Heaviest', 'Heaviest at 5+ reps', 'Est. 1RM', 'Best set volume', 'Most reps']);

  // Bodyweight rows carry no weight record, only the rep one.
  const pull = rows.filter(r => r[0] === 'Pull-Up').map(r => r[1]);
  assert.deepStrictEqual(plain(pull), ['Most reps']);

  assert.deepStrictEqual(plain(rows[0]).slice(0, 5),
    ['Bench', 'Heaviest', 100, '5 x 100', '2026-08-01']);
});

test('an unknown metric name is ignored rather than crashing', () => {
  const recs = computeRecords(
    [row('2026-08-01', 'Push', 'Bench', 1, 5, 100)], CFG, null);
  const rows = recordRows(recs, { targets: [1], metrics: ['nonsense'] });

  assert.deepStrictEqual(plain(rows.map(r => r[1])), ['Heaviest']);
});

test('better() is the single tie-break rule', () => {
  assert.strictEqual(better({ reps: 5, weight: 100 }, null), true);
  assert.strictEqual(better({ reps: 1, weight: 101 }, { reps: 10, weight: 100 }), true);
  assert.strictEqual(better({ reps: 6, weight: 100 }, { reps: 5, weight: 100 }), true);
  assert.strictEqual(better({ reps: 5, weight: 100 }, { reps: 5, weight: 100 }), false);
});

// ---------- the progression rule ----------

const done = (reps, weight, rpe) => {
  const r = new Array(9).fill('');
  r[COL.reps] = reps; r[COL.weight] = weight; r[COL.rpe] = rpe;
  return r;
};

test('an easy set earns reps and weight', () => {
  const next = progress(done(8, 100, 6), false, false);
  assert.strictEqual(next.reps, 10);
  assert.strictEqual(next.weight, 105);
  assert.strictEqual(next.note, 'was easy');
});

test('a hard set backs the weight off and rounds to 2.5', () => {
  const next = progress(done(8, 100, 10), false, false);
  assert.strictEqual(next.reps, 6);
  assert.strictEqual(next.weight, 95);
});

test('an unweighted exercise never gains load, only reps', () => {
  const easy = progress(done(20, 0, 6), true, false);
  assert.strictEqual(easy.reps, 22);
  assert.strictEqual(easy.weight, 0, 'a push-up must not become a 5 lb push-up');
  assert.strictEqual(easy.note, 'was easy');

  const hard = progress(done(20, 0, 10), true, false);
  assert.strictEqual(hard.reps, 18);
  assert.strictEqual(hard.weight, 0, 'nor may 5% come off nothing');
});

test('reps never fall below one', () => {
  assert.strictEqual(progress(done(1, 50, 10), false, false).reps, 1);
  assert.strictEqual(progress(done(1, 0, 10), true, false).reps, 1);
});

test('a blank RPE is treated as 8 — reps up, weight held', () => {
  const next = progress(done(8, 100, ''), false, false);
  assert.strictEqual(next.reps, 10);
  assert.strictEqual(next.weight, 100);
  assert.strictEqual(next.note, '');
});

// ---------- time-based exercises ----------

test('a timed exercise moves in seconds, not reps', () => {
  // A plank: no load, measured in time.
  const easy = progress(done(30, 0, 6), true, true);
  assert.strictEqual(easy.reps, 35, '+5 seconds, not +2');
  assert.strictEqual(easy.weight, 0);

  const hard = progress(done(30, 0, 10), true, true);
  assert.strictEqual(hard.reps, 25, '-5 seconds');
});

test('a loaded carry gains weight while its time steps in seconds', () => {
  const next = progress(done(45, 50, 6), false, true);
  assert.strictEqual(next.reps, 50, 'seconds step by 5');
  assert.strictEqual(next.weight, 55, 'and it still earns load');
});

test('rep-based exercises are unaffected by the timed step', () => {
  assert.strictEqual(progress(done(8, 100, 6), false, false).reps, 10);
  assert.strictEqual(progress(done(8, 100, 6), false, undefined).reps, 10);
});

test('the Records tab words timed exercises differently', () => {
  const recs = computeRecords([
    row('2026-08-01', 'Core', 'Plank', 1, 45, 0),
    row('2026-08-01', 'Core', 'Farmer Carry', 1, 40, 50)
  ], CFG, null);

  const rows = recordRows(recs, CFG, { Plank: true, 'Farmer Carry': true });

  // A hold has no weight record and no meaningful 1RM — just the duration.
  const plank = rows.filter(r => r[0] === 'Plank');
  assert.deepStrictEqual(plain(plank.map(r => r[1])), ['Longest hold']);
  assert.strictEqual(plank[0][2], 45);

  const carry = rows.filter(r => r[0] === 'Farmer Carry').map(r => r[1]);
  assert.ok(!plain(carry).includes('Est. 1RM'), 'no 1RM for a timed lift');
  assert.ok(plain(carry).some(l => l.includes('seconds')),
    'rep targets read as seconds: ' + plain(carry).join(', '));

  // Detail strings carry the unit.
  assert.ok(plank[0][3].startsWith('45s'), plank[0][3]);
});

test('untimed exercises keep the rep wording', () => {
  const recs = computeRecords(
    [row('2026-08-01', 'Push', 'Bench', 1, 5, 100)], CFG, null);
  const labels = plain(recordRows(recs, CFG, {}).map(r => r[1]));

  assert.ok(labels.includes('Est. 1RM'));
  assert.ok(labels.some(l => l.includes('reps')));
});

// ---------- how a new session is sourced ----------

test('an explicit source is taken at its word', () => {
  ['history', 'template', 'empty'].forEach(src => {
    assert.strictEqual(resolveSource('Push', src), src);
    assert.strictEqual(resolveSource('Custom', src), src,
      'the blank day must not override an explicit choice');
  });
});

test('no source means auto, except on the blank day', () => {
  assert.strictEqual(resolveSource('Push', undefined), 'auto');
  assert.strictEqual(resolveSource('Push', ''), 'auto');
  assert.strictEqual(resolveSource('Push', 'nonsense'), 'auto');
  assert.strictEqual(resolveSource('Custom', undefined), 'empty');
  assert.strictEqual(resolveSource('custom', undefined), 'empty', 'case-insensitive');
});

// ---------- the sheet flag columns ----------

test('the no-weight and default flags read the spellings people type', () => {
  ['yes', 'Yes', 'Y', 'TRUE', '1', 'x'].forEach(v =>
    assert.strictEqual(isYes(v), true, v));
  ['', '  ', 'no', 'maybe', null, undefined].forEach(v =>
    assert.strictEqual(isYes(v), false, String(v)));

  ['no', 'No', 'N', 'false', '0', 'off', 'skip', 'optional'].forEach(v =>
    assert.strictEqual(isNo(v), true, v));
  // Blank means "include it" — the common case must not need filling in.
  ['', '  ', 'yes', null, undefined].forEach(v =>
    assert.strictEqual(isNo(v), false, String(v)));
});

// ---------- what "last time" compares against ----------
//
// Per exercise, not per session: keying it to the previous session of the same
// day type left an exercise with plenty of history showing no comparison at
// all if it had been skipped, moved, or added mid-cycle.

const { lastByExercise } = sandbox;

// row() only fills the columns the record rules need; these need the note too.
const noted = (date, day, ex, set, reps, weight, note) => {
  const r = row(date, day, ex, set, reps, weight);
  r[COL.userNote] = note;
  return r;
};

test('last time is the last time that exercise was done, not last week', () => {
  const rows = [
    row('2026-07-20', 'Push', 'Bench', 1, 8, 95),
    row('2026-07-27', 'Push', 'Bench', 1, 8, 100),
    row('2026-08-03', 'Push', 'Lateral Raise', 1, 15, 10)   // Bench skipped
  ];
  const hist = lastByExercise(rows, '2026-08-10', ['Bench']);

  assert.strictEqual(hist.bench.date, '2026-07-27');
  assert.strictEqual(hist.bench.sets[1].weight, 100);
});

test('an exercise done under another day type still has a comparison', () => {
  const rows = [
    row('2026-07-31', 'Legs', 'Split Squat', 1, 10, 30),
    row('2026-08-05', 'Custom', 'Split Squat', 1, 12, 35)
  ];
  const hist = lastByExercise(rows, '2026-08-11', ['Split Squat']);

  assert.strictEqual(hist['split squat'].date, '2026-08-05',
    'the most recent one wins whatever day it was logged under');
  assert.strictEqual(hist['split squat'].sets[1].reps, 12);
});

test('the session being viewed is never its own comparison', () => {
  const rows = [
    row('2026-08-11', 'Legs', 'Split Squat', 1, 10, 30),
    row('2026-08-18', 'Legs', 'Split Squat', 1, 12, 35)      // a later session
  ];
  const hist = lastByExercise(rows, '2026-08-11', ['Split Squat']);
  assert.strictEqual(hist['split squat'], undefined, 'nothing earlier exists');
});

test('sheet order is not date order, so an older row cannot overwrite', () => {
  const rows = [
    row('2026-08-05', 'Custom', 'Plank', 1, 45, 0),
    row('2026-07-01', 'Custom', 'Plank', 1, 20, 0)    // appended out of order
  ];
  const hist = lastByExercise(rows, '2026-08-11', ['Plank']);

  assert.strictEqual(hist.plank.date, '2026-08-05');
  assert.strictEqual(hist.plank.sets[1].reps, 45);
});

test('the note comes from the same session the numbers did', () => {
  const rows = [
    noted('2026-07-20', 'Push', 'Bench', 1, 8, 95, 'old cue'),
    noted('2026-07-27', 'Push', 'Bench', 1, 8, 100, 'elbows tucked')
  ];
  const hist = lastByExercise(rows, '2026-08-03', ['Bench']);
  assert.strictEqual(hist.bench.note, 'elbows tucked');
});

test('only the exercises asked for are looked up', () => {
  const rows = [
    row('2026-07-20', 'Push', 'Bench', 1, 8, 95),
    row('2026-07-20', 'Push', 'Lateral Raise', 1, 15, 10)
  ];
  const hist = lastByExercise(rows, '2026-08-03', ['Bench']);
  assert.deepStrictEqual(Object.keys(hist), ['bench']);
});

// ---------- the report ----------
//
// Pure, like computeRecords: the browser draws what this returns.

const { reportData, weekStart } = sandbox;

test('a week runs Monday to Sunday, whatever day the session was', () => {
  assert.strictEqual(weekStart('2026-08-10'), '2026-08-10', 'a Monday is its own');
  assert.strictEqual(weekStart('2026-08-13'), '2026-08-10', 'Thursday');
  assert.strictEqual(weekStart('2026-08-16'), '2026-08-10', 'Sunday closes it');
  assert.strictEqual(weekStart('2026-08-17'), '2026-08-17', 'Monday opens the next');
});

test('the report totals sessions, sets and volume', () => {
  const rows = [
    row('2026-08-10', 'Push', 'Bench', 1, 8, 100),
    row('2026-08-10', 'Push', 'Bench', 2, 8, 100),
    row('2026-08-10', 'Push', 'Lateral Raise', 1, 15, 10),
    row('2026-08-13', 'Legs', 'Squat', 1, 5, 200)
  ];
  const out = reportData(rows, {}, '');

  assert.strictEqual(out.sessions, 2, 'two days, two sessions');
  assert.strictEqual(out.sets, 4);
  assert.strictEqual(out.volume, 8 * 100 * 2 + 15 * 10 + 5 * 200);
  assert.strictEqual(out.from, '2026-08-10');
  assert.strictEqual(out.to, '2026-08-13');
  assert.strictEqual(out.weeks.length, 1, 'both fall in the same week');
  assert.strictEqual(out.weeks[0].sessions, 2);
});

test('each exercise gets its sessions in order, with its top set', () => {
  const rows = [
    row('2026-08-03', 'Push', 'Bench', 1, 8, 100),
    row('2026-08-10', 'Push', 'Bench', 1, 5, 110),
    row('2026-08-10', 'Push', 'Bench', 2, 8, 105)
  ];
  const bench = reportData(rows, {}, '').exercises[0];

  assert.strictEqual(bench.name, 'Bench');
  assert.deepStrictEqual(plain(bench.sessions.map(d => d.date)),
    ['2026-08-03', '2026-08-10']);
  assert.strictEqual(bench.sessions[1].topWeight, 110, 'heaviest, not last');
  assert.strictEqual(bench.sessions[1].sets, 2);
  assert.strictEqual(bench.sessions[1].volume, 5 * 110 + 8 * 105);
});

test('the weekly summary carries its own week-on-week trend', () => {
  const rows = [
    row('2026-07-20', 'Push', 'Bench', 1, 8, 100),   // 800 in week one
    row('2026-07-27', 'Push', 'Bench', 1, 8, 150),   // 1200 in week two
    row('2026-08-03', 'Push', 'Bench', 1, 8, 75)     // 600 in week three
  ];
  const weeks = reportData(rows, {}, '').weeks;

  assert.strictEqual(weeks[0].change, null, 'nothing before the first week');
  assert.strictEqual(weeks[1].change, 50, '800 to 1200');
  assert.strictEqual(weeks[2].change, -50, '1200 to 600');
});

test('each exercise is summarised: first, latest, best and how far it moved', () => {
  const rows = [
    row('2026-07-20', 'Push', 'Bench', 1, 8, 95),
    row('2026-07-20', 'Push', 'Bench', 2, 8, 95),
    row('2026-08-03', 'Push', 'Bench', 1, 8, 105)
  ];
  const t = reportData(rows, {}, '').exercises[0].total;

  assert.strictEqual(t.sessions, 2);
  assert.strictEqual(t.sets, 3);
  assert.strictEqual(t.first.topWeight, 95);
  assert.strictEqual(t.last.topWeight, 105);
  assert.strictEqual(t.best, epley(8, 105), 'the best estimate of the period');
  assert.strictEqual(t.change, 10.5, '95 to 105 is +10.5%');
  assert.strictEqual(t.volume, 8 * 95 * 2 + 8 * 105);
});

test('bodyweight progress is measured in reps, since there is no load', () => {
  const rows = [
    row('2026-07-20', 'Pull', 'Pull-Up', 1, 8, 0),
    row('2026-08-03', 'Pull', 'Pull-Up', 1, 12, 0)
  ];
  const t = reportData(rows, {}, '').exercises[0].total;

  assert.strictEqual(t.change, 50, '8 to 12 reps is +50%');
  assert.strictEqual(t.low.topReps, 8);
  assert.strictEqual(t.high.topReps, 12);
});

test('more reps at the same weight is progress, not 0%', () => {
  const rows = [
    row('2026-07-20', 'Push', 'Press', 1, 10, 20),
    row('2026-08-03', 'Push', 'Press', 1, 12, 20)
  ];
  const t = reportData(rows, {}, '').exercises[0].total;
  assert.strictEqual(t.change, 20, '10 to 12 reps at the same load is +20%');
});

test('one session has nothing to compare against', () => {
  const rows = [row('2026-08-03', 'Push', 'Press', 1, 10, 20)];
  assert.strictEqual(reportData(rows, {}, '').exercises[0].total.change, null);
});

test('lowest and highest come from the whole period, not its ends', () => {
  const rows = [
    row('2026-07-20', 'Push', 'Bench', 1, 8, 100),
    row('2026-07-27', 'Push', 'Bench', 1, 8, 115),   // best, mid-period
    row('2026-08-03', 'Push', 'Bench', 1, 8, 90),    // worst, mid-period
    row('2026-08-10', 'Push', 'Bench', 1, 8, 105)
  ];
  const t = reportData(rows, {}, '').exercises[0].total;

  assert.strictEqual(t.high.topWeight, 115, 'the best week counts');
  assert.strictEqual(t.low.topWeight, 90, 'so does the worst');
  assert.strictEqual(t.first.topWeight, 100);
  assert.strictEqual(t.last.topWeight, 105);
});

test('the same exercise on two day types is two lines', () => {
  const rows = [
    row('2026-07-20', 'Push', 'Bench', 1, 8, 100),
    row('2026-08-05', 'Custom', 'Bench', 1, 8, 80)
  ];
  const out = reportData(rows, {}, '');

  assert.strictEqual(out.exercises.length, 2, 'grouped by day type');
  assert.deepStrictEqual(plain(out.exercises.map(e => e.day)), ['Custom', 'Push']);
});

test('a timed exercise contributes sets but no volume or 1RM', () => {
  const rows = [
    row('2026-08-10', 'Custom', 'Plank', 1, 45, 0),
    row('2026-08-10', 'Custom', 'Farmer Carry', 1, 40, 50)
  ];
  const out = reportData(rows, { plank: true, 'farmer carry': true }, '');

  assert.strictEqual(out.sets, 2);
  assert.strictEqual(out.volume, 0, 'seconds x pounds is not volume');
  out.exercises.forEach(e => assert.strictEqual(e.sessions[0].est1rm, 0));
});

test('a period also reports the all-time low and high', () => {
  const rows = [
    row('2026-01-05', 'Push', 'Bench', 1, 8, 60),    // lifetime low
    row('2026-06-01', 'Push', 'Bench', 1, 8, 140),   // lifetime high
    row('2026-08-03', 'Push', 'Bench', 1, 8, 100),   // in the period
    row('2026-08-10', 'Push', 'Bench', 1, 8, 110)
  ];
  const bench = reportData(rows, {}, '2026-08-01').exercises[0];

  assert.strictEqual(bench.total.low.topWeight, 100, 'the period low');
  assert.strictEqual(bench.total.high.topWeight, 110, 'the period high');
  assert.strictEqual(bench.lifetime.low.topWeight, 60, 'the all-time low');
  assert.strictEqual(bench.lifetime.high.topWeight, 140, 'the all-time high');
  assert.strictEqual(bench.lifetime.sessions, 4, 'across every session ever');
});

test('one session in the period is compared with the one before it', () => {
  const rows = [
    row('2026-07-20', 'Pull', 'Row', 1, 8, 85),      // before the period
    row('2026-08-05', 'Pull', 'Row', 1, 8, 90)       // the only one inside it
  ];
  const t = reportData(rows, {}, '2026-08-01').exercises[0].total;

  assert.strictEqual(t.sessions, 1);
  assert.strictEqual(t.change, 5.9, '85 to 90 is +5.9%, not "nothing to compare"');
});

test('a star needs history to beat, not just a first session', () => {
  const fresh = reportData([
    row('2026-08-05', 'Pull', 'Row', 1, 8, 90)
  ], {}, '2026-08-01').exercises[0];
  assert.strictEqual(fresh.lifetime.sessions, 1,
    'nothing before it, so nothing was beaten');

  const beat = reportData([
    row('2026-07-20', 'Pull', 'Row', 1, 8, 85),
    row('2026-08-05', 'Pull', 'Row', 1, 8, 90)
  ], {}, '2026-08-01').exercises[0];
  assert.strictEqual(beat.lifetime.sessions, 2);
  assert.strictEqual(beat.lifetime.high.topWeight, 90, 'the period set the best');
  assert.strictEqual(beat.lifetime.before.topWeight, 85, 'and it had one to beat');
});

test('with no period there is nothing to compare a lifetime against', () => {
  const rows = [row('2026-08-03', 'Push', 'Bench', 1, 8, 100)];
  const bench = reportData(rows, {}, '').exercises[0];
  assert.strictEqual(bench.lifetime, null, 'the period is the whole log');
});

test('the report can start from a date', () => {
  const rows = [
    row('2026-07-01', 'Push', 'Bench', 1, 8, 95),
    row('2026-08-10', 'Push', 'Bench', 1, 8, 100)
  ];
  const out = reportData(rows, {}, '2026-08-01');

  assert.strictEqual(out.sessions, 1);
  assert.strictEqual(out.from, '2026-08-10', 'the earlier session is excluded');

  // Excluded from the period, still counted in what the period is a slice of.
  assert.strictEqual(out.lifetime.sessions, 2, 'both sessions are all-time');
  assert.strictEqual(out.lifetime.volume, 8 * 95 + 8 * 100, 'and all the volume');
  assert.strictEqual(out.lifetime.from, '2026-07-01', 'back to the first row');
  assert.ok(out.lifetime.weeks >= 2, 'over the weeks it actually spans');
});

test('one read of the Exercises tab gives what five helpers gave', () => {
  // getBootstrap used to call exerciseList, exerciseImages, exerciseVideos,
  // noWeightNames and timedNames, each re-reading the sheet. This returns the
  // same five things from one read, and "the same" has to stay true.
  const rows = [
    ['Barbell Bench Press', 'chest', 'push', 'https://i/bench.gif', '', 'https://v/bench', ''],
    ['Pull-Up', 'back', 'pull', '', 'yes', '', ''],
    ['Plank', 'core', 'hold', '', 'yes', 'https://v/plank', 'yes'],
    ['Farmer Carry', 'core', 'carry', '', '', '', 'yes'],
    ['Barbell Bench Press', 'chest', 'push', '', '', '', ''],   // a duplicate
    ['Sketchy', 'x', 'y', 'javascript:alert(1)', '', 'ftp://nope', '']
  ];
  const cat = sandbox.exerciseCatalogue(rows);

  assert.deepStrictEqual(plain(cat.list),
    ['Barbell Bench Press', 'Farmer Carry', 'Plank', 'Pull-Up', 'Sketchy'],
    'deduped and sorted, as the autocomplete expects');
  assert.strictEqual(cat.images['Barbell Bench Press'], 'https://i/bench.gif');
  assert.strictEqual(cat.videos['Plank'], 'https://v/plank');
  // Both URL columns are http(s)-guarded, and that guard has to survive.
  assert.ok(!('Sketchy' in cat.images), 'javascript: is not an image');
  assert.ok(!('Sketchy' in cat.videos), 'ftp: is not a video');
  assert.deepStrictEqual(plain(Object.keys(cat.noWeight).sort()),
    ['Plank', 'Pull-Up']);
  assert.deepStrictEqual(plain(Object.keys(cat.timed).sort()),
    ['Farmer Carry', 'Plank']);
});

test('the report is readable without a key, and writes nothing', () => {
  // The one function the bridge can reach that does not assert: it aggregates
  // rows a viewer can already page through, and returns them. If it ever
  // writes — a tab, a file, anything in the owner's Drive — it needs the key
  // back, so this reads the source rather than trusting the comment.
  const src = sandbox.reportSummary.toString();
  assert.ok(!/assertEdit/.test(src), 'the report does not demand an edit key');
  assert.ok(!/setValue|insertSheet|SpreadsheetApp\.create|getRange\(.*\)\.set/
    .test(src), 'and it writes nothing');
});

test('the scheduled archive refuses to run for anyone who just asks', () => {
  // It takes a trigger event, not a key, so the guard is that the event has
  // to name a trigger this project holds. Nothing sends that id to a page.
  sandbox.ScriptApp = { getProjectTriggers: () => [{ getUniqueId: () => 'real' }] };

  [undefined, {}, { triggerUid: '' }, { triggerUid: 'guessed' }].forEach(e => {
    assert.throws(() => sandbox.autoArchive(e), /Read-only/,
      'a caller supplying ' + JSON.stringify(e) + ' got through');
  });
});

test('a cutoff is months back, not thirty days times months', () => {
  assert.strictEqual(sandbox.archiveCutoff(6, new Date('2026-08-14T12:00:00Z')),
    '2026-02-14', 'six months back is the same day in February');
  assert.strictEqual(sandbox.archiveCutoff(0, new Date('2026-08-14T12:00:00Z')), '',
    'zero is off, not today');
  assert.strictEqual(sandbox.archiveCutoff(12, new Date('2026-08-14T12:00:00Z')),
    '2025-08-14', 'a year is a year');
});

test('the report can end at a date as well as start at one', () => {
  const rows = [
    row('2026-07-01', 'Push', 'Bench', 1, 8, 95),
    row('2026-08-10', 'Push', 'Bench', 1, 8, 100),
    row('2026-08-20', 'Push', 'Bench', 1, 8, 105)
  ];
  const out = reportData(rows, {}, '2026-07-15', '2026-08-15');

  assert.strictEqual(out.sessions, 1, 'only the session inside the range');
  assert.strictEqual(out.from, '2026-08-10');
  assert.strictEqual(out.to, '2026-08-10');
  // Both ends excluded something, and all-time still counts all three.
  assert.strictEqual(out.lifetime.sessions, 3, 'the log is the log');
});

test('an end date alone still counts as a period', () => {
  const rows = [
    row('2026-07-01', 'Push', 'Bench', 1, 8, 95),
    row('2026-08-20', 'Push', 'Bench', 1, 8, 105)
  ];
  const out = reportData(rows, {}, '', '2026-08-01');
  assert.strictEqual(out.sessions, 1, 'the later session is excluded');
  assert.ok(out.period, 'and it is not reported as the whole log');
  assert.ok(out.lifetime, 'so there is something to compare against');
});

test('with no period there are no all-time totals to show either', () => {
  const out = reportData([row('2026-08-03', 'Push', 'Bench', 1, 8, 100)], {}, '');
  assert.strictEqual(out.lifetime, null, 'they would be the same numbers twice');
});

// ---------- the write surface ----------
//
// google.script.run can call ANY global in the project, so every function
// that writes has to check the key itself — a viewer holds the same page and
// the same bridge, just without the key.

test('writing functions refuse a wrong key', () => {
  const guarded = {
    rebuildRecords: k => sandbox.rebuildRecords(k),
    writeArchive: k => sandbox.writeArchive(k, 'x', []),
    generateInto: k => sandbox.generateInto(k, 'Push', '2026-08-01', [], 'auto'),
    rememberExercise: k => sandbox.rememberExercise(k, 'Bench', false, false),
    // Archiving deletes rows, and the scheduled one does it unattended.
    runArchive: k => sandbox.runArchive(k, '2026-01-01'),
    putSetting: k => sandbox.putSetting(k, 'archive_after_months', '999'),
    noteArchiveRun: k => sandbox.noteArchiveRun(k, 'x')
  };

  Object.keys(guarded).forEach(name => {
    assert.throws(() => guarded[name]('not-the-key'), /Read-only/,
      name + ' let a wrong key through');
    assert.throws(() => guarded[name](''), /Read-only/,
      name + ' let an empty key through');
  });
});

console.log('\n' + passed + ' passed');
