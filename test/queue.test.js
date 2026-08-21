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
    // Real elements have one, and the rail keeps what each item stands for
    // in it — a stub without it throws on assignment rather than on read.
    dataset: {},
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
    insertAdjacentElement(pos, el) { this.children.push(el); return el; },
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
    setSetCount(key, day, date, exercise, count) {
      outbox.push(Object.assign({ call: 'setSetCount', exercise, count }, state));
    },
    loadSession(day, date) {
      outbox.push(Object.assign({ call: 'loadSession', day, date }, state));
    },
    getBootstrap() {}, listDates() {},
    addExercise() {}, deleteSession() {}
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
  clearTimeout(G.ORDER.timer);
  clearTimeout(G.ORDER.guard);
  G.ORDER.want = null;
  G.ORDER.sending = false;
  G.ORDER.guard = null;
  store.clear();
  outbox = [];
}

const set = (row, reps, weight, rpe) => ({
  row, exercise: 'Barbell Bench Press', set: 1, reps, weight, rpe
});

let passed = 0;
// A couple of checks are about something firing on a timer, so a test may
// return a promise. Those are collected and awaited before the tally.
const pending = [];
function test(name, fn) {
  reset();
  const out = fn();
  if (out && typeof out.then === 'function') {
    pending.push(out.then(() => {
      clearTimeout(G.PEND.timer);
      passed++;
      console.log('  ok  ' + name);
    }));
    return;
  }
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

test('quick exercise reorders queue one final server order', () => {
  const sent = [];
  const realRun = sandbox.google.script.run;
  sandbox.google.script.run = {
    withSuccessHandler() { return this; },
    withFailureHandler() { return this; },
    reorderSession(key, day, date, names) { sent.push({ key, day, date, names }); }
  };

  // A rail as the DOM holds it after a few arrow moves.
  const box = { children: [
    { dataset: { names: 'Leg Press' } },
    { dataset: { names: 'Back Squat' } },
    { dataset: { names: 'Dead Bug\u0000Battle Ropes' } }   // a superset
  ] };
  S_order(['Back Squat', 'Leg Press', 'Dead Bug', 'Battle Ropes']);
  G.commitOrder(box);
  assert.strictEqual(sent.length, 0, 'drop is queued so another can follow');
  assert.strictEqual(G.ORDER.want.join('|'),
    'Leg Press|Back Squat|Dead Bug|Battle Ropes');
  assert.strictEqual(sandbox.document.getElementById('barmsg').textContent,
    'Order queued…', 'status bar shows the deferred save');

  box.children = [box.children[2], box.children[0], box.children[1]];
  G.commitOrder(box);
  assert.strictEqual(G.ORDER.want.join('|'),
    'Dead Bug|Battle Ropes|Leg Press|Back Squat', 'latest quick drop wins');

  clearTimeout(G.ORDER.timer);
  G.sendOrder();

  assert.strictEqual(sent.length, 1, 'one call');
  assert.strictEqual(sandbox.document.getElementById('barmsg').textContent,
    'Saving order…', 'status bar shows the server write');
  // Joined, because arrays built inside the vm carry that realm's prototype
  // and deepStrictEqual counts that as a difference.
  assert.strictEqual(sent[0].names.join('|'),
    'Dead Bug|Battle Ropes|Leg Press|Back Squat',
    'a superset travels as its members, in order');
  assert.strictEqual(sent[0].key, 'testkey', 'with the edit key');

  clearTimeout(G.ORDER.guard);
  G.ORDER.want = null;
  G.ORDER.sending = false;
  G.S.working = null;

  // Dropping something back where it came from is not queued.
  sent.length = 0;
  S_order(['Dead Bug', 'Battle Ropes', 'Leg Press', 'Back Squat']);
  G.commitOrder(box);
  assert.strictEqual(sent.length, 0, 'an unchanged order is left alone');
  assert.strictEqual(G.ORDER.want, null);

  sandbox.google.script.run = realRun;
  G.S.working = null;
});

function S_order(list) { G.S.order = list; }

test('a session note queues, dedupes and survives a reload', () => {
  // One note for the whole session, keyed by day and date — not by exercise,
  // and not by row, because it does not live in the Log at all.
  G.queueDayNote('Knee felt off. Do RDL first next week.');
  G.queueDayNote('Knee felt off. Do RDL first next week, lighter.');

  assert.strictEqual(G.pendCount(), 1, 'the second edit replaces the first');
  const item = G.PEND.items['d|Push|2026-08-09'];
  assert.ok(item, 'keyed by day and date');
  assert.strictEqual(item.kind, 'day', 'and marked so the server can tell');
  assert.match(item.text, /lighter/, 'holding the latest text');

  G.pendPersistNow();
  assert.match(store.get('wl.pending.v1'), /lighter/, 'stored like any write');
});

test('a session note and an exercise note do not collide', () => {
  G.queueDayNote('Whole session was heavy.');
  G.queueNote('Barbell Bench Press', 'Elbows tucked.');
  assert.strictEqual(G.pendCount(), 2, 'two notes, two entries');
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

test('the add panel offers a bodyweight choice, prefilled or not', () => {
  // Regression: there was no way to say a new exercise carries no weight, so
  // the form asked for the weight of a dead bug.
  const plain = G.addExercisePanel();
  assert.ok(plain);

  // A refused add comes back with both toggles as they were.
  const again = G.addExercisePanel({
    name: 'Dead Bug', sets: 3, reps: 12, weight: 0,
    timed: false, bodyweight: true
  });
  assert.ok(again);
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

// ---------- pages and supersets ----------

// Arrays built inside the vm carry that realm's prototype, which
// deepStrictEqual reads as a difference. Copy them out before comparing.
const plain = a => Array.from(a);

const grouped = (name, group, count) => {
  const out = [];
  for (let i = 1; i <= (count || 2); i++) {
    out.push(sample(name, { set: i, row: 100 + i, exercise: name, group }));
  }
  return out;
};

test('exercises in one superset share a page, in sheet order', () => {
  const groups = {
    Bench: grouped('Bench', ''),
    'Dead Bug': grouped('Dead Bug', 'A'),
    'Battle Ropes': grouped('Battle Ropes', 'A'),
    Plank: grouped('Plank', '')
  };
  const pages = G.paginate(['Bench', 'Dead Bug', 'Battle Ropes', 'Plank'], groups);

  assert.strictEqual(pages.length, 3, 'four exercises, three pages');
  assert.deepStrictEqual(plain(pages[1].names), ['Dead Bug', 'Battle Ropes']);
  assert.strictEqual(pages[1].group, 'A');
  assert.strictEqual(pages[2].names[0], 'Plank', 'order is not shuffled');
});

test('reordering pages keeps a superset together', () => {
  const squat = { group: '', names: ['Bulgarian Split Squat'] };
  const pair = { group: 'A', names: ['Dead Bug', 'Battle Ropes'] };
  const curl = { group: '', names: ['Seated Leg Curl'] };
  const ordered = G.pagesInOrder(
    [pair, squat, curl],
    ['Bulgarian Split Squat', 'Dead Bug', 'Battle Ropes', 'Seated Leg Curl']
  );

  assert.strictEqual(ordered[0], squat);
  assert.strictEqual(ordered[1], pair);
  assert.strictEqual(ordered[2], curl);
});

test('a superset takes the position of its first member', () => {
  // Pairing something added later must not move the pair to the end.
  const groups = {
    Bench: grouped('Bench', 'B'),
    Plank: grouped('Plank', ''),
    'Face Pull': grouped('Face Pull', 'B')
  };
  const pages = G.paginate(['Bench', 'Plank', 'Face Pull'], groups);

  assert.strictEqual(pages.length, 2);
  assert.deepStrictEqual(plain(pages[0].names), ['Bench', 'Face Pull']);
  assert.deepStrictEqual(plain(pages[1].names), ['Plank']);
});

test('a label held by one exercise is not a superset', () => {
  const groups = { Bench: grouped('Bench', 'A') };
  const pages = G.paginate(['Bench'], groups);
  assert.strictEqual(pages[0].group, '', 'one exercise cannot superset itself');
});

test('a superset card renders both halves round by round', () => {
  const groups = {
    'Dead Bug': grouped('Dead Bug', 'A', 3),
    'Battle Ropes': grouped('Battle Ropes', 'A', 2)   // shorter half
  };
  const el = G.supersetCard({ group: 'A', names: ['Dead Bug', 'Battle Ropes'] }, groups);
  assert.ok(el);
});

test('a failure without a message still says something', () => {
  // google.script.run does not guarantee an Error with .message. Reading it
  // blindly throws inside the failure handler, which loses the reason and
  // leaves the page dimmed mid-operation.
  assert.strictEqual(G.why(undefined), 'no reason given');
  assert.strictEqual(G.why({}), 'no reason given');
  assert.strictEqual(G.why({ message: 'row 12 now holds something else' }),
    'row 12 now holds something else');
});

test('a failure is shown even while the queue is busy', () => {
  G.queueSave(set(14, 12, 25, 9));
  G.flash('Failed: nope', false, true);
  assert.strictEqual(sandbox.document.getElementById('barmsg').textContent,
    'Failed: nope', 'an error the reader must act on cannot be swallowed');

  G.flash('Saved', true);
  assert.strictEqual(sandbox.document.getElementById('barmsg').textContent,
    'Failed: nope', 'but a routine message still defers to the queue');
});

test('a structural write that never answers releases the page', () => {
  // Apps Script can hang rather than fail. A dimmed page with no reload
  // button is what "it just froze" looks like.
  G.busy(true, 'Making a superset…');
  G.S.working = 'Making a superset';
  assert.strictEqual(G.S.busy, true);

  // Deliberately not stubbing load(): a spy left in place of it leaks into
  // every synchronous test that follows, because the restore can only happen
  // once this timer fires.
  G.S.day = 'Push';
  outbox.length = 0;

  const done = G.busyGuard('Making a superset', 0.05);
  return new Promise(resolve => setTimeout(() => {
    assert.strictEqual(G.S.working, null, 'the in-flight flag was cleared');
    assert.ok(outbox.some(o => o.call === 'loadSession'),
      'and it re-read the session rather than guessing');
    done();
    resolve();
  }, 120));
});

test('the rail marks the page you are on', () => {
  const items = [sandbox.document.createElement(), sandbox.document.createElement()];
  const box = sandbox.document.getElementById('rail');
  box.querySelectorAll = () => items;

  G.S.page = 1;
  G.paintRail();
  assert.ok(items[1].classes.on, 'the current exercise is lit');
  assert.ok(!items[0].classes.on, 'and only that one');
});

test('move-up renumbers the rail and preserves exercise clicks', () => {
  const pages = [{ group: '', names: ['Bench'] }, { group: '', names: ['Row'] }];
  const box = G.rail(pages);
  const moved = box.children[1];
  box.insertBefore = (child, before) => {
    box.children.splice(box.children.indexOf(child), 1);
    box.children.splice(before ? box.children.indexOf(before) : box.children.length, 0, child);
    return child;
  };
  box.querySelectorAll = () => box.children;
  box.children.forEach(item => {
    item.querySelector = sel => {
      if (sel === '.railno') return item.children[0].children[0];
      if (sel === '.moveup') return item.children[1].children[0];
      if (sel === '.movedown') return item.children[1].children[1];
      return null;
    };
  });

  G.S.pages = [];
  G.S.working = null;
  G.moveRail(moved, box, -1);
  assert.strictEqual(box.children[0].dataset.names, 'Row', 'up moves exactly one place');

  const oldShow = G.showPage;
  let shown = null;
  G.showPage = n => { shown = n; };
  moved.children[0].onclick();
  G.showPage = oldShow;
  assert.strictEqual(shown, 0, 'tap follows the visual order, not the old index');

  assert.strictEqual(box.children[0].children[0].children[0].textContent, 1);
  assert.strictEqual(box.children[1].children[0].children[0].textContent, 2);
  assert.strictEqual(box.children[0].querySelector('.moveup').disabled, true,
    'top row cannot move farther up');
  clearTimeout(G.ORDER.timer);
  G.ORDER.want = null;
  G.S.working = null;
});

test('a rendered session marks the current page without being tapped', () => {
  const real = G.paintRail;
  let painted = 0;
  G.paintRail = () => { painted++; };

  G.render({
    exists: true, records: {}, lastNotes: {}, lastDates: {}, priorDate: null,
    sets: [sample('Bench'), sample('Plank', { row: 20, exercise: 'Plank' })]
  });

  G.paintRail = real;
  assert.ok(painted > 0, 'a fresh load left every exercise looking current');
});

test('a render lands on the exercise that was just added', () => {
  // One card at a time means an added exercise is on a page nobody is
  // looking at. Adding something and being shown something else is wrong,
  // and it hung the recorder waiting for a card that was never visible.
  G.S.page = 0;
  G.S.focus = 'Farmer Carry';

  G.render({
    exists: true, records: {}, lastNotes: {}, lastDates: {}, priorDate: null,
    sets: [
      sample('Bench'),
      sample('Plank', { row: 20, exercise: 'Plank' }),
      sample('Farmer Carry', { row: 30, exercise: 'Farmer Carry' })
    ]
  });

  assert.strictEqual(G.S.page, 2, 'the new exercise is the one on screen');
  assert.strictEqual(G.S.focus, null, 'and the next render is left alone');
});

test('renaming hides the header of the exercise being renamed', () => {
  // A superset card has one header per exercise. Finding the first .exhead
  // renamed the second exercise while hiding the first one's header.
  const card = sandbox.document.createElement();
  const mine = sandbox.document.createElement();
  mine.className = 'exhead';
  const other = sandbox.document.createElement();
  other.className = 'exhead';
  card.appendChild(other);
  card.appendChild(mine);

  G.renamePanel(card, 'Battle Ropes', mine);

  assert.strictEqual(mine.style.display, 'none', 'the right header goes');
  assert.notStrictEqual(other.style.display, 'none', 'the other one stays');
});

test('the rail and the pager build for a session', () => {
  const pages = [{ group: '', names: ['Bench'] },
                 { group: 'A', names: ['Dead Bug', 'Battle Ropes'] }];
  G.S.pages = pages;
  G.S.page = 0;
  assert.ok(G.rail(pages));
  assert.ok(G.pager(pages));
});

// ---------- set counts ----------
//
// Each tap used to be its own round trip with the page dimmed for it, so
// three sets to none was three waits.

function session(exercise, sets) {
  const out = [];
  for (let i = 1; i <= sets; i++) {
    out.push(sample(exercise, { set: i, row: 100 + i, exercise }));
  }
  return { exists: true, records: {}, lastNotes: {}, lastDates: {},
           priorDate: null, sets: out };
}

test('taking three sets to none is one call, not three', () => {
  G.S.lastRes = session('Bench', 3);
  G.S.resize = null;
  G.S.working = null;
  sandbox.confirm = () => true;

  G.resize('Bench', 2, sandbox.document.createElement());
  G.resize('Bench', 1, sandbox.document.createElement());
  G.resize('Bench', 0, sandbox.document.createElement());

  assert.strictEqual(outbox.length, 0, 'nothing sent while still tapping');
  assert.strictEqual(G.S.resize.want, 0, 'the last tap is what gets written');

  G.sendResize();
  assert.strictEqual(outbox.length, 1, 'one write for three taps');
  assert.strictEqual(outbox[0].count, 0);
  sandbox.confirm = () => false;
});

test('the sets go from the screen before the sheet answers', () => {
  G.S.lastRes = session('Bench', 3);
  G.S.resize = null;
  G.S.working = null;

  G.resize('Bench', 1, sandbox.document.createElement());

  const left = G.S.lastRes.sets.filter(s => s.exercise === 'Bench');
  assert.strictEqual(left.length, 1, 'two rows dropped immediately');
  assert.strictEqual(G.S.working, 'Updating sets', 'and it says so');
  clearTimeout(G.S.resize.timer);
});

test('an added set has no row until the server gives it one', () => {
  G.S.lastRes = session('Bench', 2);
  G.S.resize = null;
  G.S.working = null;

  G.resize('Bench', 3, sandbox.document.createElement());

  const mine = G.S.lastRes.sets.filter(s => s.exercise === 'Bench');
  assert.strictEqual(mine.length, 3);
  assert.strictEqual(mine[2].row, 0, 'nothing to address it by yet');
  assert.strictEqual(mine[2].reps, mine[1].reps, 'it copies the last set');
  clearTimeout(G.S.resize.timer);
});

test('a resize in flight does not block the next tap on the same exercise', () => {
  G.S.lastRes = session('Bench', 3);
  G.S.resize = null;
  G.S.working = null;

  G.resize('Bench', 2, sandbox.document.createElement());
  assert.ok(G.S.working, 'something is outstanding');

  // Same exercise: allowed. Anything else structural: refused.
  G.resize('Bench', 1, sandbox.document.createElement());
  assert.strictEqual(G.S.resize.want, 1, 'the second tap counted');
  assert.strictEqual(G.blockedByQueue(), true, 'but a different change waits');
  clearTimeout(G.S.resize.timer);
  G.S.working = null;
  G.S.resize = null;
});

test('an emptied date field falls back to today, not to nothing', () => {
  // iOS's date picker has a Reset that clears the field. An empty date asked
  // the server for "the Custom session on ", which renders as a session that
  // can never exist.
  G.S.today = '2026-08-12';
  G.S.date = '2026-08-09';

  const box = sandbox.document.getElementById('date');
  box.value = '';
  G.document.getElementById('date').onchange.call(box);

  assert.strictEqual(G.S.date, '2026-08-12', 'today, not blank');
  assert.strictEqual(box.value, '2026-08-12', 'and the field says so');
});

// ---------- the day row ----------

test('a day type is marked when that date already has a session', () => {
  const buttons = ['Push', 'Pull', 'Legs'].map(name => {
    const b = sandbox.document.createElement();
    b.setAttribute = (k, v) => { b._attrs = Object.assign(b._attrs || {}, { [k]: v }); };
    b.getAttribute = k => (b._attrs || {})[k];
    b.setAttribute('data-day', name);
    return b;
  });
  sandbox.document.querySelectorAll = () => buttons;

  G.S.sessions = { '2026-08-11': ['Legs'] };
  G.S.date = '2026-08-11';
  G.S.day = 'Push';
  G.markDay();

  assert.ok(buttons[2].classes.has, 'Legs has a session that day');
  assert.ok(!buttons[0].classes.has, 'Push does not');
  assert.ok(buttons[0].classes.on, 'and Push is the one being shown');

  sandbox.document.querySelectorAll = () => [];
});

test('tapping the day you are on drops back to the day list', () => {
  G.S.day = 'Legs';
  G.S.lastRes = { exists: true, sets: [] };
  G.S.adding = null;
  G.S.working = null;

  G.pickDay(null);

  assert.strictEqual(G.S.day, null, 'nothing is selected');
  assert.strictEqual(G.S.lastRes, null, 'and no session is held on to');
  assert.match(sandbox.document.getElementById('body').innerHTML, /Pick a day/);
});

test('the session map follows what is created and deleted', () => {
  G.S.sessions = {};
  G.noteSession('2026-08-11', 'Legs', true);
  assert.deepStrictEqual(plain(G.S.sessions['2026-08-11']), ['Legs']);

  G.noteSession('2026-08-11', 'Legs', true);
  assert.strictEqual(G.S.sessions['2026-08-11'].length, 1, 'no duplicates');

  G.noteSession('2026-08-11', 'Legs', false);
  assert.deepStrictEqual(plain(G.S.sessions['2026-08-11']), []);
});

test('session navigation works with no day type picked', () => {
  G.S.sessions = {
    '2026-07-31': ['Legs'], '2026-08-03': ['Push'], '2026-08-05': ['Custom']
  };
  G.S.day = null;
  G.S.date = '2026-08-04';
  G.S.adding = null;
  G.S.working = null;

  // "Previous session" is the newest date older than the one shown, whatever
  // day type it happens to be — the last thing you did, without guessing.
  G.hop(1);
  assert.strictEqual(G.S.date, '2026-08-03');
  assert.strictEqual(G.S.day, 'Push', 'and it selects the day it landed on');

  G.S.day = null;
  G.S.date = '2026-08-04';
  G.hop(-1);
  assert.strictEqual(G.S.date, '2026-08-05');
  assert.strictEqual(G.S.day, 'Custom');
});

test('the session buttons enable without a day type', () => {
  G.S.sessions = { '2026-07-31': ['Legs'], '2026-08-05': ['Custom'] };
  G.S.day = null;

  G.S.date = '2026-08-04';
  G.markSessNav();
  assert.strictEqual(sandbox.document.getElementById('prevsess').disabled, false);
  assert.strictEqual(sandbox.document.getElementById('nextsess').disabled, false);

  G.S.date = '2026-07-01';                 // before everything
  G.markSessNav();
  assert.strictEqual(sandbox.document.getElementById('prevsess').disabled, true,
    'nothing older to go back to');
  assert.strictEqual(sandbox.document.getElementById('nextsess').disabled, false);
});

test('changing date re-marks the day row even with nothing picked', () => {
  // load() returns early without a day type, so the dots and the session
  // buttons described the date before the change.
  const buttons = ['Legs', 'Custom'].map(name => {
    const b = sandbox.document.createElement();
    b.setAttribute = (k, v) => { b._attrs = Object.assign(b._attrs || {}, { [k]: v }); };
    b.getAttribute = k => (b._attrs || {})[k];
    b.setAttribute('data-day', name);
    return b;
  });
  sandbox.document.querySelectorAll = () => buttons;

  G.S.sessions = { '2026-08-05': ['Custom'], '2026-08-11': ['Legs'] };
  G.S.day = null;
  G.S.date = '2026-08-11';
  G.markDay();
  assert.ok(buttons[0].classes.has, 'Legs on the 11th');

  const box = sandbox.document.getElementById('date');
  box.value = '2026-08-05';
  G.document.getElementById('date').onchange.call(box);

  assert.ok(!buttons[0].classes.has, 'not Legs on the 5th');
  assert.ok(buttons[1].classes.has, 'Custom on the 5th');
  sandbox.document.querySelectorAll = () => [];
});

// ---------- two loads at once ----------

test('a stale load cannot paint over a newer one', () => {
  // Clicking a day type starts one load and changing the date starts another.
  // Apps Script does not answer in the order it was asked, and the older
  // response was landing last — rendering a day with no session over the one
  // that had just been opened.
  G.S.day = 'Legs';
  G.S.adding = null;
  G.S.working = null;

  G.S.date = '2026-08-13';
  G.load(false);                          // a date with nothing on it
  G.S.date = '2026-08-11';
  G.load(false);                          // the session we want

  const loads = outbox.filter(o => o.call === 'loadSession');
  assert.strictEqual(loads.length, 2, 'both loads went out');

  const session = {
    exists: true, records: {}, lastNotes: {}, lastDates: {}, priorDate: null,
    sets: [sample('Bench')]
  };

  loads[1].ok(session);                   // the newer answer arrives first
  assert.strictEqual(G.S.lastRes, session, 'the session is on screen');

  loads[0].ok({ exists: false, sets: [] });   // the older one turns up late
  assert.strictEqual(G.S.lastRes, session, 'and stays there');
});

// ---------- what the status bar claims ----------

test('the bar does not name a date nothing on screen compares to', () => {
  // A changed programme has an earlier session of that day type and not one
  // exercise in common with it. "Comparing against 2026-07-31" then pointed
  // at a date the page said nothing about.
  const order = ['Bulgarian Split Squat', 'Dead Bug'];
  assert.strictEqual(
    G.comparisonText({ priorDate: '2026-07-31', lastDates: {} }, order),
    'First time for these exercises');
});

test('the bar names the date when everything came from it', () => {
  const order = ['Bench', 'Plank'];
  const dates = { Bench: '2026-08-03', Plank: '2026-08-03' };
  assert.strictEqual(
    G.comparisonText({ priorDate: '2026-08-03', lastDates: dates }, order),
    'Comparing against 2026-08-03');
});

test('the bar says so when the comparisons are from different days', () => {
  const order = ['Bench', 'Plank', 'Row'];
  const dates = { Bench: '2026-08-03', Plank: '2026-08-05', Row: '2026-08-05' };
  assert.match(
    G.comparisonText({ priorDate: '2026-08-05', lastDates: dates }, order),
    /each exercise with its last time/);

  // One of them is new: worth saying, because a blank "was" is otherwise
  // indistinguishable from a bug.
  assert.match(
    G.comparisonText({ priorDate: '2026-08-05', lastDates: { Bench: '2026-08-03' } },
                     order),
    /some are new/);
});

// ---------- the report panel ----------

test('the report draws as cards, with an icon per day type', () => {
  const el = G.reportView({
    name: 'Training — David', from: '2026-07-20', to: '2026-08-11', period: '2026-07-20',
    sessions: 7, sets: 106, volume: 66948,
    weeks: [{ week: '2026-07-20', sessions: 1, sets: 49, volume: 33705, change: null },
            { week: '2026-07-27', sessions: 3, sets: 49, volume: 35915, change: 6.6 }],
    exercises: [
      { name: 'Barbell Bench Press', day: 'Push', sessions: 3, sets: 12,
        volume: 9600, low: '8 × 95', high: '8 × 105', last: '8 × 105',
        change: 10.5, allLow: '8 × 65', allHigh: '8 × 105', best: true },
      { name: 'Pull-Up', day: 'Pull', sessions: 1, sets: 3, volume: 0,
        low: '8', high: '8', last: '8', change: null, best: false }
    ]
  });

  const html = el.innerHTML;
  assert.match(html, /<svg/, 'day types carry an icon');
  assert.match(html, /chip up/, 'a rise is a green chip');
  assert.match(html, /★ Barbell Bench Press/, 'a best ever is starred');
  assert.match(html, /66,948/, 'volume is grouped in thousands');
  assert.match(html, /class="pt now tail mark"/, 'the newest week is picked out');
  // Both ends sit on the chart's edge, where a centred label overhangs it.
  assert.match(html, /class="pt lead mark"/, 'and the oldest is anchored too');
  assert.match(html, /<polyline class="ln"/, 'the weeks are joined into a line');
  assert.match(html, /class="pv">34k</, 'every point says what it is worth');
  assert.match(html, /<polyline class="ln2"/, 'sessions are a second line');
  assert.match(html, /class="pt freq/, 'with their own marked points');
  assert.match(html, /class="legend"/, 'with a line saying what is plotted');
  // Per cent, so the chart survives being shrunk for print. Absolute values
  // overflowed the box and landed on the card's heading.
  assert.match(html, /bottom:[\d.]+%/, 'points are placed relatively');
  assert.doesNotMatch(html, /px"/, 'nothing in the chart is sized in pixels');
  assert.match(html, /class="daygrid"/, 'day cards share a wrapper to lay out');
  // Period and lifetime are different questions. Showing one number invites
  // reading a good month as a personal best.
  assert.match(html, /8 × 95 – 8 × 105/, 'the period is a range, not a journey');
  assert.match(html, /class="all">8 × 65 – 8 × 105/, 'with all-time beneath it');
  // The report shares a stylesheet with the app, and has twice now taken a
  // name the app already styles: `.bar` is the fixed status bar, so chart bars
  // went position:fixed and vanished from print; `.sess` is the previous/next
  // session button, so session markers grew its border and background.
  // Read out of the app's own markup rather than kept by hand: the hand-kept
  // version missed `.bar`, then `.sess`, then `.start` — each time the report
  // silently inherited a button's or a status bar's styling.
  // Every class the app puts on an element, from anywhere except the report's
  // own renderer: static markup, `className =`, `classList.add`, and markup
  // built inside the script — which is where `.start` lives, and why reading
  // the file's markup alone missed it and a chart point came out looking like
  // the black Start session button.
  const file = fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8');
  // The report's renderers sit together, from tile() to the end of
  // reportView(); everything else in the file is the app.
  const at = file.indexOf('function tile(');
  const ends = file.indexOf('function showReportView(');
  assert.ok(at > 0 && ends > at, 'found the report renderers');
  const appCode = file.slice(0, at) + file.slice(ends);
  const owned = new Set();
  for (const m of appCode.matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).forEach(c => c && owned.add(c));
  }
  for (const m of appCode.matchAll(/\.className\s*=\s*'([^']+)'/g)) {
    m[1].split(/\s+/).forEach(c => c && owned.add(c));
  }
  for (const m of appCode.matchAll(/classList\.(?:add|toggle)\('([^']+)'/g)) {
    owned.add(m[1]);
  }
  assert.ok(owned.size > 50, 'found the app classes to compare against');
  const used = new Set();
  for (const m of html.matchAll(/class="([^"]+)"/g)) {
    m[1].split(/\s+/).forEach(c => used.add(c));
  }
  const clash = [...owned].filter(c => used.has(c));
  assert.deepStrictEqual(clash, [],
    'the report is wearing a class the app already styles');

  // This sees classes the app puts on elements, not rules that exist without
  // one. `.start` was styled and applied nowhere, so nothing could have found
  // it by reading the code — a chart point took its black button styling and
  // the only way to notice was to look at the picture. It has been deleted.
  assert.ok(!/^\s*\.start[ ,{.:]/m.test(
    fs.readFileSync(path.join(__dirname, '..', 'src', 'Index.html'), 'utf8')),
    'dead style rules are traps for the next class name');
});

test('a sheet name cannot inject markup into the report', () => {
  // The one place in the app that builds HTML from spreadsheet values.
  const el = G.reportView({
    name: '<img src=x onerror=alert(1)>', from: '2026-01-01', to: '2026-01-02',
    period: '', sessions: 1, sets: 1, volume: 1, weeks: [],
    exercises: [{ name: '<script>alert(2)</script>', day: 'Push</b><i>x',
                  sessions: 1, sets: 1, volume: 1, low: '1', high: '1',
                  last: '1', change: null, best: false }]
  });

  assert.ok(!/<img|<script/i.test(el.innerHTML), 'tags are escaped, not run');
  assert.match(el.innerHTML, /&lt;img|&lt;script/, 'and shown as text');
});

test('one of something is not "1 sessions"', () => {
  assert.strictEqual(G.plural(1, 'session'), '1 session');
  assert.strictEqual(G.plural(0, 'session'), '0 sessions');
  assert.strictEqual(G.plural(9, 'set'), '9 sets');

  // A day of bodyweight and timed work has no volume, and "0 lb" reads as a
  // fault rather than as a category.
  const el = G.reportView({
    name: 'Log', from: '2026-08-05', to: '2026-08-05', period: '',
    sessions: 1, sets: 9, volume: 0, weeks: [],
    exercises: [{ name: 'Plank', day: 'Custom', sessions: 1, sets: 3, volume: 0,
                  low: '45s', high: '45s', last: '45s', change: null, best: false }]
  });
  assert.match(el.innerHTML, /1 session ·/, 'singular in the day header');
  assert.ok(!/0 lb/.test(el.innerHTML), 'no zero volume');
});

test('a day type with more exercises than fit says how many are missing', () => {
  const many = [];
  for (let i = 1; i <= 30; i++) {
    many.push({ name: 'Exercise ' + i, day: 'Push', sessions: 3, sets: 9,
                volume: 900, low: '8 × 95', high: '8 × 105', last: '8 × 105',
                change: 5, best: false });
  }
  const el = G.reportView({
    name: 'Log', from: '2026-01-01', to: '2026-08-11', period: '',
    sessions: 60, sets: 900, volume: 540000, weeks: [], lifetime: null,
    exercises: many
  });
  const html = el.innerHTML;
  // A card taller than the page cannot be placed at all: break-inside:avoid
  // sends it to the next page and leaves this one blank below the summary.
  assert.strictEqual((html.match(/class="exrow/g) || []).length, 13,
    '12 exercises and the line that accounts for the rest');
  assert.match(html, /\+ 18 more, trained less often/, 'and it says how many');
  assert.match(html, /Exercise 12/, 'the twelfth is in');
  assert.ok(!/Exercise 13</.test(html), 'the thirteenth is not');
});

test('a long period labels some of its weeks, and draws all of them', () => {
  const weeks = [];
  for (let i = 0; i < 20; i++) {
    weeks.push({ week: '2026-0' + (1 + i % 9) + '-01', sessions: 3, sets: 40,
                 volume: 20000 + i * 100, change: 1 });
  }
  const el = G.reportView({
    name: 'Log', from: '2026-01-01', to: '2026-08-11', period: '2026-01-01',
    sessions: 70, sets: 1000, volume: 600000, weeks: weeks, lifetime: null,
    exercises: []
  });
  const html = el.innerHTML;
  const points = (html.match(/class="pt(?! freq)[^"]*"/g) || []).length;
  const labels = (html.match(/class="xl/g) || []).length;
  assert.strictEqual(points, 20, 'every week is a point on the line');
  assert.ok(labels < 10, 'but 20 date labels would land on each other');
  // The last week is what a report is read for, and the peak is the other
  // point anyone looks for.
  assert.match(html, /class="xl now"/, 'the last week keeps its label');
  assert.match(html, /class="pv">22k</, 'and the peak keeps its value');
  // At 20 points the markers touch each other and bury the line.
  assert.match(html, /class="chart dense"/, 'so only labelled weeks keep one');
});

test('past half a year the line is drawn by month, not by week', () => {
  // 30 weekly points is texture, and only a seventh of them can be labelled.
  const weeks = [];
  const d = new Date('2026-01-05');
  for (let i = 0; i < 30; i++) {
    weeks.push({ week: d.toISOString().slice(0, 10), sessions: 2, sets: 30,
                 volume: 1000, change: 1 });
    d.setDate(d.getDate() + 7);
  }
  const el = G.reportView({
    name: 'Log', from: '2026-01-05', to: '2026-07-27', period: '2026-01-05',
    sessions: 60, sets: 900, volume: 30000, weeks: weeks, lifetime: null,
    exercises: []
  });
  const html = el.innerHTML;
  const points = (html.match(/class="pt(?! freq)[^"]*"/g) || []).length;
  assert.match(html, /<h3>Month by month<\/h3>/, 'and the card says so');
  assert.ok(points >= 7 && points <= 9, '30 weeks is 7-8 months, got ' + points);
  assert.match(html, /class="xl[^"]*"[^>]*>Jul</, 'the axis is named months');
  // Nothing is dropped in the rounding: 30 weeks × 1000 lb, 30 × 2 sessions.
  const total = [...html.matchAll(/(\d[\d,]*) lb over (\d+) session/g)]
    .reduce((n, m) => [n[0] + Number(m[1].replace(/,/g, '')),
                       n[1] + Number(m[2])], [0, 0]);
  assert.deepStrictEqual(total, [30000, 60], 'every week is still counted');
});

test('rolling the chart up to months does not turn weeks into months', () => {
  // 40 weeks of 30 sets is 30 sets a week. Dividing by the ten points the
  // chart happens to draw would call it 120, which is a different sport.
  const weeks = [];
  const d = new Date('2025-11-03');
  for (let i = 0; i < 40; i++) {
    weeks.push({ week: d.toISOString().slice(0, 10), sessions: 3, sets: 30,
                 volume: 10000, change: 1 });
    d.setDate(d.getDate() + 7);
  }
  const el = G.reportView({
    name: 'Log', from: '2025-11-03', to: '2026-08-11', period: '',
    sessions: 120, sets: 1200, volume: 400000, weeks: weeks, lifetime: null,
    exercises: []
  });
  const html = el.innerHTML;
  assert.match(html, /<h3>Month by month<\/h3>/, 'the chart is by month');
  assert.match(html, /<b>30\.0<\/b><span>sets \/ week/, 'the average is by week');
  assert.match(html, /<b>10,000<\/b><span>lb \/ week/, 'and so is the volume');

  // The lines and the markers have to be plotting the same thing. Once they
  // were not: the polylines kept every weekly value while the markers moved
  // to monthly ones, so the chart drew 40 points' worth of line under 10
  // points' worth of dots and looked like static.
  const markers = (html.match(/class="pt(?! freq)[^"]*"/g) || []).length;
  const line = html.match(/class="ln" points="([^"]+)"/);
  assert.ok(line, 'there is a volume line');
  assert.strictEqual(line[1].trim().split(/\s+/).length, markers,
    'the line has a point per marker');

  const sessionLine = html.match(/class="ln2" points="([^"]+)"/);
  assert.strictEqual(sessionLine[1].trim().split(/\s+/).length, markers,
    'and so does the sessions line');
  // Everything inside the box: a scale taken from the wrong array put the
  // session markers above the chart entirely.
  [...html.matchAll(/bottom:([\d.]+)%/g)].forEach(m => {
    const at = Number(m[1]);
    assert.ok(at >= 0 && at <= 100, 'a point sits at ' + at + '% of the chart');
  });
});

test('a year of weeks does not crowd its last label off the axis', () => {
  const weeks = [];
  const d = new Date('2025-09-01');
  for (let i = 0; i < 50; i++) {
    weeks.push({ week: d.toISOString().slice(0, 10), sessions: 2, sets: 30,
                 volume: 20000 + i, change: 1 });
    d.setDate(d.getDate() + 7);
  }
  const el = G.reportView({
    name: 'Log', from: '2025-09-01', to: '2026-08-11', period: '2025-09-01',
    sessions: 100, sets: 1500, volume: 1000000, weeks: weeks, lifetime: null,
    exercises: []
  });
  const at = [...el.innerHTML.matchAll(/class="xl[^"]*" style="left:([\d.]+)%/g)]
    .map(m => Number(m[1]));
  assert.ok(at.length >= 5, 'the axis is still labelled');
  const gaps = at.slice(1).map((v, i) => v - at[i]);
  // 88% of the width over 50 weeks is 1.8% per week: two labels a week apart
  // print on top of each other, which is what the last pair used to do.
  assert.ok(Math.min.apply(null, gaps) > 8,
    'no two date labels land on top of each other');
});

test('a period is shown against everything ever logged', () => {
  const el = G.reportView({
    name: 'Log', from: '2026-08-01', to: '2026-08-11', period: '2026-08-01',
    sessions: 4, sets: 57, volume: 32713, weeks: [],
    lifetime: { sessions: 9, sets: 138, volume: 81453, weeks: 4,
                from: '2026-07-20', to: '2026-08-11' },
    exercises: []
  });
  const html = el.innerHTML;
  assert.match(html, /All time · 9 sessions · 138 sets · 81,453 lb · since 2026-07-20/,
    'the totals card says what the period is a slice of');
  // 138 sets over 9 sessions, not over the 4 in the period.
  assert.match(html, /All time · 15\.3 sets \/ session/, 'and the averages too');
});

test('no period asked for means no all-time line to compare against', () => {
  const el = G.reportView({
    name: 'Log', from: '2026-07-20', to: '2026-08-11', period: '',
    sessions: 9, sets: 138, volume: 81453, weeks: [], lifetime: null,
    exercises: []
  });
  assert.ok(!/All time/.test(el.innerHTML), 'it would be the same numbers twice');
});

test('an all-time range identical to the period is not printed twice', () => {
  const el = G.reportView({
    name: 'Log', from: '2026-08-01', to: '2026-08-11', period: '',
    sessions: 1, sets: 3, volume: 300, weeks: [],
    exercises: [{ name: 'Lateral Raise', day: 'Push', sessions: 1, sets: 3,
                  volume: 300, low: '15 × 10', high: '15 × 10', last: '15 × 10',
                  change: null, allLow: '15 × 10', allHigh: '15 × 10',
                  best: false }]
  });
  assert.ok(!/class="all"/.test(el.innerHTML), 'nothing to add, so nothing shown');
});

test('the report opens as a modal that escape closes', () => {
  const realGet = sandbox.document.getElementById;
  sandbox.document.getElementById = id => (id === 'reportpanel' ? null : realGet(id));
  const body = realGet('body');
  const listeners = [];
  sandbox.document.addEventListener = (type, fn) => listeners.push([type, fn]);
  sandbox.document.removeEventListener = () => {};
  sandbox.document.body = { appendChild: el => { body.children.push(el); return el; } };

  const panel = sandbox.document.createElement();
  G.showReportView(panel, {
    name: 'Log', from: '2026-08-01', to: '2026-08-11', period: '',
    sessions: 1, sets: 1, volume: 1, weeks: [], exercises: []
  });

  const modal = body.children.slice(-1)[0];
  assert.strictEqual(modal.className, 'repmodal', 'it is a modal, not inline');

  const key = listeners.find(l => l[0] === 'keydown');
  assert.ok(key, 'escape is listened for');
  let removed = false;
  modal.remove = () => { removed = true; };
  key[1]({ key: 'Escape', preventDefault() {} });
  assert.ok(removed, 'and escape closes it');

  sandbox.document.getElementById = realGet;
});

test('the report panel asks the server, with the key and a start date', () => {
  const realRun = sandbox.google.script.run;
  sandbox.google.script.run = {
    withSuccessHandler(f) { this.ok = f; return this; },
    withFailureHandler() { return this; },
    reportSummary(key, from, to) {
      outbox.push({ call: 'reportSummary', key, from, to });
    }
  };
  // The stub invents an element for any id, so the panel's own toggle would
  // see itself as already open.
  const realGet = sandbox.document.getElementById;
  sandbox.document.getElementById = id => (id === 'reportpanel' ? null : realGet(id));

  G.reportPanel();

  const panel = realGet('tools').children.slice(-1)[0];
  const find = (n, text) => (n.textContent === text ? n : (n.children || [])
    .reduce((hit, c) => hit || find(c, text), null));
  const build = find(panel, 'Build');
  assert.ok(build, 'the panel offers a Build button');

  // The panel is not in the document while it is being built, so anything
  // fetched with getElementById is null and the first click throws. The
  // controls have to be real children the panel already holds. (The stub
  // invents an element for any id, so only this structural check catches it.)
  const ids = [];
  (function walk(n) {
    if (n.id) ids.push(n.id);
    (n.children || []).forEach(walk);
  })(panel);
  ['repnum', 'repunit', 'repfrom', 'repto'].forEach(id => {
    assert.ok(ids.indexOf(id) >= 0, id + ' is inside the panel, not looked up');
  });

  build.onclick();
  const sent = outbox.filter(o => o.call === 'reportSummary');
  assert.strictEqual(sent.length, 1, 'one call');
  assert.strictEqual(sent[0].key, 'testkey', 'with the edit key');
  assert.strictEqual(sent[0].from, '', 'blank weeks means the whole log');
  assert.strictEqual(sent[0].to, '', 'and no end to it either');

  sandbox.document.getElementById = realGet;
  sandbox.google.script.run = realRun;
});

test('a period can be counted back in days, weeks, months or years', () => {
  const days = (from) => Math.round(
    (Date.now() - new Date(from + 'T12:00:00Z').getTime()) / 86400000);

  // Three months is not thirteen weeks, and a year is not 52 of them.
  assert.ok(Math.abs(days(G.reportPeriod('10', 'days', '', '').from) - 10) <= 1,
    'ten days');
  assert.ok(Math.abs(days(G.reportPeriod('4', 'weeks', '', '').from) - 28) <= 1,
    'four weeks');
  assert.ok(Math.abs(days(G.reportPeriod('3', 'months', '', '').from) - 91) <= 3,
    'three months');
  assert.ok(Math.abs(days(G.reportPeriod('1', 'years', '', '').from) - 365) <= 1,
    'a year');

  // deepStrictEqual would compare prototypes, and these objects are built
  // inside the vm — same trap the records tests document.
  const span = (a, b, c, d) => {
    const r = G.reportPeriod(a, b, c, d);
    return r.from + '|' + r.to;
  };
  assert.strictEqual(span('', 'weeks', '', ''), '|', 'blank is everything');
  assert.strictEqual(span('0', 'weeks', '', ''), '|', 'and so is zero');
});

test('two dates beat the count, whichever way round they are typed', () => {
  const span = (a, b, c, d) => {
    const r = G.reportPeriod(a, b, c, d);
    return r.from + '|' + r.to;
  };
  assert.strictEqual(span('4', 'weeks', '2026-01-01', '2026-03-01'),
    '2026-01-01|2026-03-01', 'the dates win over the count');
  assert.strictEqual(span('', 'weeks', '2026-03-01', '2026-01-01'),
    '2026-01-01|2026-03-01', 'backwards is a slip, not a nil period');
  assert.strictEqual(span('', 'weeks', '', '2026-03-01'),
    '|2026-03-01', 'an end on its own is allowed');
});

test('only the delete waits for a session; the report does not', () => {
  const wipe = sandbox.document.getElementById('wipe');
  G.showTools(false);
  assert.strictEqual(wipe.style.display, 'none', 'nothing to delete');

  G.showTools(true);
  assert.notStrictEqual(wipe.style.display, 'none');

  // The row itself is never hidden for an admin — the report lives there and
  // reads the whole log, session or no session.
  assert.notStrictEqual(sandbox.document.getElementById('tools').style.display, 'none');
});

// ---------- read-only ----------

test('a superset card offers a viewer nothing to type into', () => {
  // Regression: the superset card ignored read-only entirely, so a viewer got
  // a working note box and no set counts. The write was refused server-side,
  // which meant typing looked like it worked and then did not.
  const wasEdit = vm.runInContext('CAN_EDIT', sandbox);
  vm.runInContext('CAN_EDIT = false;', sandbox);

  const groups = {
    'Dead Bug': grouped('Dead Bug', 'A', 2),
    'Battle Ropes': grouped('Battle Ropes', 'A', 2)
  };
  groups['Dead Bug'].forEach(s => { s.note = 'slow tempo'; });

  const el = G.supersetCard({ group: 'A', names: ['Dead Bug', 'Battle Ropes'] },
                            groups);
  // Walk the children by hand: the stub's firstChild getter makes nodes on
  // demand, so JSON.stringify never terminates.
  const dump = n => [n.className, n.textContent]
    .concat((n.children || []).map(dump)).join(' ');
  const flat = dump(el);
  assert.ok(!/notesave|Save note/.test(flat), 'no note editor for a viewer');
  assert.ok(/slow tempo/.test(flat), 'the note is still readable');
  assert.ok(/2 sets/.test(flat), 'and the set count is stated');

  vm.runInContext(`CAN_EDIT = ${wasEdit};`, sandbox);
});

test('the unit label reads the same as the picker', () => {
  G.S.unit = 'kg';
  assert.strictEqual(G.unitLabel(), 'kg');
  assert.strictEqual(G.weightText(132.3), '60 kg');
  G.S.unit = 'lb';
  assert.strictEqual(G.unitLabel(), 'lb');
  assert.strictEqual(G.weightText(100), '100 lb');
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

Promise.all(pending).then(() => console.log('\n' + passed + ' passed'));
