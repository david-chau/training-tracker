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
    setSetCount(key, day, date, exercise, count) {
      outbox.push(Object.assign({ call: 'setSetCount', exercise, count }, state));
    },
    getBootstrap() {}, listDates() {}, loadSession() {},
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

  const realLoad = G.load;
  let reloaded = false;
  G.load = () => { reloaded = true; };

  const done = G.busyGuard('Making a superset', 0.05);
  return new Promise(resolve => setTimeout(() => {
    assert.strictEqual(G.S.busy, false, 'the page was released');
    assert.strictEqual(G.S.working, null, 'the in-flight flag was cleared');
    assert.ok(reloaded, 'and it re-read the session rather than guessing');
    G.load = realLoad;
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
