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
const { computeRecords, recordRows, epley, better, progress, isYes, isNo } = sandbox;
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

console.log('\n' + passed + ' passed');
