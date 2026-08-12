// Checks the pending-write queue in src/Index.html.
//
//     node test/queue.test.js
//
// The Apps Script half has no local runtime, but the queue is ordinary
// browser JavaScript and it is the one piece where a bug loses a logged set.
// So: stub just enough DOM, run the real script, drive it by hand.

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

// ---------- stubs ----------

function node() {
  const n = {
    style: {}, className: '', textContent: '', innerHTML: '', value: '',
    hidden: false, rows: 0, placeholder: '', type: '', inputMode: '',
    disabled: false, title: '', href: '', target: '', rel: '', alt: '',
    loading: '', src: '',
    // A real element always has .children, so the stub must too — code
    // legitimately reads .length off it before appending anything.
    children: [],
    // Per element, not shared: whether *one particular row* is marked is the
    // whole point of the personal-best rule.
    classes: {},
    classList: {
      toggle(name, on) {
        const has = on === undefined ? !n.classes[name] : !!on;
        if (has) n.classes[name] = true; else delete n.classes[name];
      },
      add(name) { n.classes[name] = true; },
      remove(name) { delete n.classes[name]; },
      contains(name) { return !!n.classes[name]; }
    },
    appendChild(c) { this.children.push(c); return c; },
    insertBefore(c) { this.children.unshift(c); return c; },
    insertAdjacentHTML() {}, addEventListener() {}, setAttribute() {},
    replaceWith() {}, focus() {}, select() {}, blur() {}, remove() {},
    querySelector() { return null; }, querySelectorAll() { return []; },
    // Real code reads firstChild after setting innerHTML to a <label>, so the
    // stub has to offer something with a textContent to write to.
    get firstChild() { return (this._fc = this._fc || node()); },
    get childNodes() { return this.children; },
    get lastChild() { return this.children.slice(-1)[0] || node(); }
  };
  return n;
}

const store = new Map();
const nodes = {};

const sandbox = {
  console,
  setTimeout, clearTimeout, setInterval, clearInterval,
  navigator: { onLine: true },
  alert: () => {},
  confirm: () => false,
  localStorage: {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k)
  },
  document: {
    getElementById: id => (nodes[id] = nodes[id] || node()),
    createElement: () => node(),
    createTextNode: t => ({ nodeValue: String(t), textContent: String(t) }),
    querySelectorAll: () => [],
    addEventListener: () => {}
  },
  window: { addEventListener: () => {}, focus: () => {} }
};
sandbox.window = Object.assign(sandbox.window, sandbox);

// Captures each server call instead of making one. Tests supply the verdict.
// The chain has to carry both handlers — withSuccess().withFailure() must
// not forget the first one.
let outbox = [];
function runner(state) {
  return {
    withSuccessHandler(f) { return runner(Object.assign({}, state, { ok: f })); },
    withFailureHandler(f) { return runner(Object.assign({}, state, { bad: f })); },
    saveBatch(key, batch) { outbox.push(Object.assign({ batch, key }, state)); },
    getBootstrap() {}, listDates() {}, loadSession() {},
    setSetCount() {}, addExercise() {}, deleteSession() {}
  };
}
sandbox.google = { script: { run: runner({}) } };

// ---------- load the real script out of the template ----------

const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
assert.ok(blocks.length >= 2, 'expected the bootstrap and main script blocks');

const source = blocks[blocks.length - 1]
  .replace('<?= canEdit ?>', 'true')
  .replace('<?= editKey ?>', 'testkey');

vm.createContext(sandbox);
vm.runInContext('var CAN_EDIT = true; var KEY = "testkey";' + source, sandbox);

const G = sandbox;
G.S.day = 'Push';
G.S.date = '2026-08-09';

const bodyClasses = () => sandbox.document.getElementById('body').classes;

function reset() {
  const bc = bodyClasses();
  Object.keys(bc).forEach(k => delete bc[k]);
  clearTimeout(G.PEND.saveTimer);
  G.PEND.items = {};
  G.PEND.sending = false;
  G.PEND.backoff = 1000;
  G.PEND.note = '';
  clearTimeout(G.PEND.timer);
  store.clear();
  outbox = [];
}

const set = (row, reps, weight, rpe) => ({
  row, exercise: 'Barbell Bench Press', set: 1, reps, weight, rpe
});

let passed = 0;
function test(name, fn) {
  reset();
  fn();
  clearTimeout(G.PEND.timer);
  passed++;
  console.log('  ok  ' + name);
}

// ---------- tests ----------

test('repeated taps on one set collapse to a single queued write', () => {
  G.queueSave(set(14, 10, 20, 8));
  G.queueSave(set(14, 11, 20, 8));
  G.queueSave(set(14, 12, 25, 9));

  assert.strictEqual(G.pendCount(), 1);
  const it = G.PEND.items['s|14'];
  assert.strictEqual(it.reps, 12);
  assert.strictEqual(it.weight, 25);
  assert.strictEqual(it.date, '2026-08-09');
});

test('different rows and notes queue separately', () => {
  G.queueSave(set(14, 10, 20, 8));
  G.queueSave(set(15, 10, 20, 8));
  G.queueNote('Barbell Bench Press', 'elbow twinge');

  assert.strictEqual(G.pendCount(), 3);
  assert.strictEqual(G.PEND.items['n|Push|2026-08-09|Barbell Bench Press'].text,
    'elbow twinge');
});

test('a queued write survives into storage', () => {
  G.queueSave(set(14, 12, 25, 9));

  // The write is debounced, so holding a ± button costs one serialisation
  // rather than one per press. Nothing is in storage yet.
  assert.strictEqual(store.has('wl.pending.v1'), false, 'should not write per tap');

  G.pendPersistNow();
  const saved = JSON.parse(store.get('wl.pending.v1'));
  assert.strictEqual(saved['s|14'].reps, 12);
});

test('emptying the queue clears storage immediately, not on a timer', () => {
  G.queueSave(set(14, 12, 25, 9));
  G.pendPersistNow();
  assert.ok(store.has('wl.pending.v1'));

  G.flush();
  outbox[0].ok([{ ok: true, set: { row: 14, reps: 12, weight: 25, rpe: 9 } }]);

  // A stale stored copy would replay work already confirmed.
  assert.strictEqual(store.has('wl.pending.v1'), false);
});

test('incrementing never puts the session into a busy state', () => {
  // Busy dims the form and disables the controls. It belongs to loading a day
  // and to structural writes — not to tapping a number, which must stay
  // instant however fast it is tapped.
  G.S.busy = false;
  for (let i = 0; i < 20; i++) G.queueSave(set(14, 8 + i, 20, 8));

  assert.strictEqual(G.S.busy, false, 'a tap must not raise busy');
  assert.strictEqual(bodyClasses().busy, undefined, 'nor dim the session');
});

test('a burst of taps collapses to one write and defers the send', () => {
  for (let i = 0; i < 15; i++) G.queueSave(set(14, 8 + i, 20, 8));

  assert.strictEqual(G.pendCount(), 1, '15 taps, one queued write');
  assert.strictEqual(outbox.length, 0, 'nothing sent while still tapping');

  G.flush();
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].batch[0].reps, 22, 'the last value wins');
});

test('a confirmed write leaves the queue and clears storage', () => {
  G.queueSave(set(14, 12, 25, 9));
  G.flush();

  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].batch[0].row, 14);

  outbox[0].ok([{ ok: true, set: { row: 14, reps: 12, weight: 25, rpe: 9 } }]);

  assert.strictEqual(G.pendCount(), 0);
  assert.strictEqual(store.has('wl.pending.v1'), false);
});

test('a dropped connection keeps the write and backs off', () => {
  G.queueSave(set(14, 12, 25, 9));
  G.flush();
  outbox[0].bad({ message: 'network' });

  assert.strictEqual(G.pendCount(), 1, 'the tap must not be lost');
  assert.strictEqual(G.PEND.sending, false, 'must be free to retry');
  assert.ok(G.PEND.backoff > 1000, 'should back off before retrying');

  // ...and the retry sends the same write again.
  outbox = [];
  G.flush();
  assert.strictEqual(outbox.length, 1);
  assert.strictEqual(outbox[0].batch[0].reps, 12);
});

test('a rejected write is dropped rather than retried forever', () => {
  G.queueSave(set(14, 12, 25, 9));
  G.flush();
  outbox[0].ok([{ ok: false, error: 'Row 14 now holds something else' }]);

  assert.strictEqual(G.pendCount(), 0, 'replaying cannot fix a moved row');
});

test('a partial result only clears what the sheet confirmed', () => {
  G.queueSave(set(14, 12, 25, 9));
  G.queueSave(set(15, 10, 20, 8));
  G.flush();

  const keys = outbox[0].batch.map(b => 's|' + b.row);
  outbox[0].ok([{ ok: true, set: { row: 14, reps: 12, weight: 25, rpe: 9 } }, null]);

  assert.strictEqual(G.pendCount(), 1);
  assert.ok(G.PEND.items[keys[1]], 'the unanswered write stays queued');
});

test('offline defers instead of sending', () => {
  sandbox.navigator.onLine = false;
  G.queueSave(set(14, 12, 25, 9));
  G.flush();

  assert.strictEqual(outbox.length, 0);
  assert.strictEqual(G.pendCount(), 1);
  assert.strictEqual(G.PEND.note, 'offline');
  sandbox.navigator.onLine = true;
});

test('queued values win over what the sheet still says', () => {
  G.queueSave(set(14, 12, 25, 9));
  G.queueNote('Barbell Bench Press', 'seat at 4');

  const fromServer = [{
    row: 14, exercise: 'Barbell Bench Press', set: 1,
    reps: 8, weight: 20, rpe: 8, note: ''
  }];
  G.overlayPending(fromServer);

  assert.strictEqual(fromServer[0].reps, 12);
  assert.strictEqual(fromServer[0].weight, 25);
  assert.strictEqual(fromServer[0].note, 'seat at 4');
});

test('a queued write is not applied to a row that now holds another set', () => {
  G.queueSave(set(14, 12, 25, 9));

  const other = [{
    row: 14, exercise: 'Lateral Raise', set: 1,
    reps: 15, weight: 10, rpe: 7, note: ''
  }];
  G.overlayPending(other);

  assert.strictEqual(other[0].reps, 15, 'must not clobber a different exercise');
});

test('structural edits are blocked while writes are outstanding', () => {
  G.queueSave(set(14, 12, 25, 9));
  assert.strictEqual(G.blockedByQueue(), true);

  reset();
  assert.strictEqual(G.blockedByQueue(), false);
});

// ---------- the personal-best mark ----------

const marked = rows => rows.reduce((n, r) => n + (r.classes.pr ? 1 : 0), 0);

test('only the set that takes the record is marked', () => {
  G.S.records = {
    Bench: { heaviest: { reps: 8, weight: 100, date: '2026-08-01' },
             est1rm: 127, reps: null }
  };
  // A generated session steps up together, so every set clears the old best.
  const sets = [
    { exercise: 'Bench', reps: 8, weight: 105 },
    { exercise: 'Bench', reps: 8, weight: 105 },
    { exercise: 'Bench', reps: 10, weight: 105 }     // the actual record
  ];
  const rows = sets.map(() => G.document.createElement('div'));

  assert.strictEqual(G.markPr('Bench', sets, rows), true);
  assert.strictEqual(marked(rows), 1, 'lighting up every row is the bug');
  assert.ok(rows[2].classes.pr, 'more reps at equal weight takes it');
});

test('a tie keeps the earlier set so the mark does not wander', () => {
  G.S.records = {
    Bench: { heaviest: { reps: 8, weight: 100, date: '2026-08-01' }, est1rm: 127, reps: null }
  };
  const sets = [
    { exercise: 'Bench', reps: 8, weight: 105 },
    { exercise: 'Bench', reps: 8, weight: 105 }
  ];
  const rows = sets.map(() => G.document.createElement('div'));

  G.markPr('Bench', sets, rows);
  assert.ok(rows[0].classes.pr);
  assert.ok(!rows[1].classes.pr);
});

test('nothing is marked when nothing beats the record', () => {
  G.S.records = {
    Bench: { heaviest: { reps: 8, weight: 140, date: '2026-08-01' }, est1rm: 180, reps: null }
  };
  const sets = [{ exercise: 'Bench', reps: 8, weight: 105 }];
  const rows = sets.map(() => G.document.createElement('div'));

  assert.strictEqual(G.markPr('Bench', sets, rows), false);
  assert.strictEqual(marked(rows), 0);
});

test('an exercise with no record yet is never marked', () => {
  G.S.records = {};
  const sets = [{ exercise: 'Brand New', reps: 8, weight: 105 }];
  const rows = sets.map(() => G.document.createElement('div'));

  assert.strictEqual(G.markPr('Brand New', sets, rows), false,
    'no baseline means no claim to a best');
});

// ---------- render smoke tests ----------
//
// These call the real render helpers against the stub and assert only that
// they do not throw. Cheap, and they catch the failure mode that unit tests
// miss entirely: a helper used before the var holding it is assigned.

G.S.records = {
  Bench: { heaviest: { reps: 8, weight: 100, date: '2026-08-01' }, est1rm: 127, reps: null },
  Plank: { heaviest: { reps: 45, weight: 0, date: '2026-08-01' }, est1rm: null,
           reps: { reps: 45, weight: 0, date: '2026-08-01' } }
};
G.S.videos = { Bench: 'https://example.com/v' };
G.S.images = { Bench: 'https://example.com/i.png' };
G.S.noWeight = { Plank: true };
G.S.timed = { Plank: true };
G.S.lastNotes = {};

const sample = (name, over) => Object.assign({
  row: 14, exercise: name, set: 1, reps: 8, weight: 100, rpe: 8, note: '',
  last: { reps: 8, weight: 95, rpe: 7 }
}, over || {});

test('a card renders for a loaded exercise', () => {
  const el = G.card('Bench', [sample('Bench'), sample('Bench', { set: 2, row: 15 })]);
  assert.ok(el, 'card returned nothing');
});

test('a card renders for an unweighted timed exercise', () => {
  const el = G.card('Plank', [sample('Plank', { reps: 45, weight: 0 })]);
  assert.ok(el);
});

test('a card renders for an exercise with no records at all', () => {
  const el = G.card('Brand New Thing', [sample('Brand New Thing')]);
  assert.ok(el);
});

test('the add-exercise panel builds without throwing', () => {
  // Regression: the Reps/Seconds toggle was appended before the var holding
  // it was assigned, so this threw a TypeError on open.
  const panel = G.addExercisePanel();
  assert.ok(panel);
});

test('the start chooser builds for each combination of sources', () => {
  assert.ok(G.starter({ priorDate: '2026-08-02', templateCount: 5, blank: false }));
  assert.ok(G.starter({ priorDate: null, templateCount: 5, blank: false }));
  assert.ok(G.starter({ priorDate: null, templateCount: 0, blank: true }));
});

// ---------- optimistic add ----------
//
// The card is on screen before the sheet has the rows, so its sets have no
// row number to be addressed by. Anything typed in that window has to survive
// the response that replaces them.

test('a set with no row yet is held rather than queued', () => {
  const s = { row: 0, exercise: 'Farmer Carry', set: 1, reps: 40, weight: 50, rpe: -1 };
  G.queueSave(s);

  assert.strictEqual(G.pendCount(), 0, 'nothing can be addressed by row 0');
  assert.strictEqual(s.dirty, true, 'but the edit is remembered');
});

test('values typed during an add land on the rows the server assigns', () => {
  const held = [
    { row: 0, exercise: 'Farmer Carry', set: 1, reps: 40, weight: 50, rpe: -1 },
    { row: 0, exercise: 'Farmer Carry', set: 2, reps: 40, weight: 50, rpe: -1 }
  ];
  G.S.adding = { name: 'Farmer Carry', sets: held, card: null };

  held[0].reps = 55;                 // typed while the add was in flight
  G.queueSave(held[0]);

  G.absorbAdd({ sets: [
    { row: 30, exercise: 'Farmer Carry', set: 1, reps: 40, weight: 50, rpe: -1 },
    { row: 31, exercise: 'Farmer Carry', set: 2, reps: 40, weight: 50, rpe: -1 }
  ]});

  assert.strictEqual(G.S.adding, null, 'the add is no longer in flight');
  assert.strictEqual(G.pendCount(), 1, 'only the set that was touched is written');
  assert.strictEqual(G.PEND.items['s|30'].reps, 55);
});

test('a note typed during an add is carried onto the new rows', () => {
  const held = [{ row: 0, exercise: 'Farmer Carry', set: 1, reps: 40,
                  weight: 50, rpe: -1, note: 'heavy handles' }];
  G.S.adding = { name: 'Farmer Carry', sets: held, card: null };

  const res = { sets: [{ row: 30, exercise: 'Farmer Carry', set: 1, reps: 40,
                         weight: 50, rpe: -1, note: '' }] };
  G.absorbAdd(res);

  assert.strictEqual(res.sets[0].note, 'heavy handles', 'survives the re-render');
  assert.strictEqual(G.PEND.items['n|Push|2026-08-09|Farmer Carry'].text,
    'heavy handles', 'and is queued once there are rows to write to');
});

test('an add in flight blocks the operations that move rows', () => {
  G.S.adding = { name: 'Farmer Carry', sets: [], card: null };
  assert.strictEqual(G.blockedByQueue(), true);
  G.S.adding = null;
  assert.strictEqual(G.blockedByQueue(), false);
});

// ---------- weight units ----------
//
// The sheet is always pounds. Kilograms are a display choice, so the numbers
// have to survive the round trip and stepping has to stay on clean 2.5s.

test('kilograms convert back to the pounds the sheet stores', () => {
  G.S.unit = 'kg';
  const lb = G.toPounds(60);
  assert.ok(Math.abs(lb - 132.3) < 0.05, `60 kg should be ~132.3 lb, got ${lb}`);
  assert.strictEqual(G.toDisplay(lb), 60, 'and read back as the same 60');

  G.S.unit = 'lb';
  assert.strictEqual(G.toPounds(45), 45, 'pounds pass straight through');
  assert.strictEqual(G.toDisplay(45), 45);
});

test('a weight reads in whichever unit is picked', () => {
  G.S.unit = 'lb';
  assert.strictEqual(G.weightText(100), '100 lb');
  G.S.unit = 'kg';
  assert.strictEqual(G.weightText(132.3), '60 kg');
  G.S.unit = 'lb';
});

test('switching unit never touches the sheet or the queue', () => {
  G.S.lastRes = { exists: true, sets: [], records: {}, lastNotes: {}, lastDates: {} };
  G.setUnit('kg');
  assert.strictEqual(G.pendCount(), 0, 'a display change is not an edit');
  assert.strictEqual(outbox.length, 0, 'and not a server call');
  G.setUnit('lb');
});

test('a card renders in kilograms', () => {
  G.S.unit = 'kg';
  const el = G.card('Bench', [sample('Bench')]);
  assert.ok(el);
  G.S.unit = 'lb';
});

console.log('\n' + passed + ' passed');
