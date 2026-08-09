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
    classList: { toggle() {}, remove() {}, add() {} },
    appendChild(c) { (this.children = this.children || []).push(c); return c; },
    insertAdjacentHTML() {}, addEventListener() {}, setAttribute() {},
    replaceWith() {}, focus() {}, select() {}, blur() {}, remove() {}
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

function reset() {
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
  const saved = JSON.parse(store.get('wl.pending.v1'));
  assert.strictEqual(saved['s|14'].reps, 12);
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

console.log('\n' + passed + ' passed');
