// Seeds the demo log with a few weeks of plausible history.
//
//     node e2e/seed-demo.js            # rebuild every session below
//     node e2e/seed-demo.js --dry      # print the plan, touch nothing
//
// Apps Script exposes no HTTP write API — google.script.run is not reachable
// from outside the page — so this drives the admin UI, exactly as a person
// would. Slow, but it goes through the same validation as real entry.
//
// Idempotent: each session is deleted and rebuilt, so running it twice leaves
// the same data rather than doubling it.

const { chromium } = require('@playwright/test');
const {
  targets, appFrame, ready, gotoDate, awaitLoad, awaitQueue
} = require('./app');

// Weights climb week to week, which is what makes the records and the
// "was 95" lines under each field show something worth looking at.
const PLAN = [
  { date: '2026-07-20', day: 'Push', exercises: [
    ['Barbell Bench Press', 4, 8, 95],
    ['Incline Dumbbell Press', 3, 10, 30],
    ['Seated Dumbbell Shoulder Press', 3, 10, 20],
    ['Lateral Raise', 3, 15, 10],
    ['Triceps Rope Pushdown', 3, 12, 25]
  ]},
  { date: '2026-07-27', day: 'Push', exercises: [
    ['Barbell Bench Press', 4, 8, 100],
    ['Incline Dumbbell Press', 3, 10, 32.5],
    ['Seated Dumbbell Shoulder Press', 3, 10, 20],
    ['Lateral Raise', 3, 15, 12.5],
    ['Triceps Rope Pushdown', 3, 12, 27.5]
  ]},
  { date: '2026-08-03', day: 'Push', rpe: [8, 8, 9, 9.5], note:
      'Bench felt heavy on the last two. Elbows tucked better this week.',
    exercises: [
      ['Barbell Bench Press', 4, 8, 105],
      ['Incline Dumbbell Press', 3, 10, 35],
      ['Seated Dumbbell Shoulder Press', 3, 12, 20],
      ['Lateral Raise', 3, 15, 12.5],
      ['Triceps Rope Pushdown', 3, 12, 30]
    ]},

  { date: '2026-07-22', day: 'Pull', exercises: [
    ['Barbell Row', 4, 8, 85],
    ['Lat Pulldown', 3, 10, 70],
    ['Seated Cable Row', 3, 10, 65],
    ['Face Pull', 3, 15, 25],
    ['Dumbbell Bicep Curl', 3, 12, 20]
  ]},
  { date: '2026-07-29', day: 'Pull', exercises: [
    ['Barbell Row', 4, 8, 90],
    ['Lat Pulldown', 3, 10, 75],
    ['Seated Cable Row', 3, 12, 65],
    ['Face Pull', 3, 15, 27.5],
    ['Pull-Up', 3, 8, 0]                 // unweighted: no weight field
  ]},

  { date: '2026-07-24', day: 'Legs', exercises: [
    ['Back Squat', 4, 6, 135],
    ['Romanian Deadlift', 3, 8, 95],
    ['Leg Press', 3, 12, 180],
    ['Lying Leg Curl', 3, 12, 50],
    ['Standing Calf Raise', 4, 15, 90]
  ]},
  { date: '2026-07-31', day: 'Legs', exercises: [
    ['Back Squat', 4, 6, 145],
    ['Romanian Deadlift', 3, 8, 105],
    ['Leg Press', 3, 12, 200],
    ['Lying Leg Curl', 3, 12, 55],
    ['Standing Calf Raise', 4, 15, 95]
  ]},

  // Shows the blank day, an exercise measured in seconds, one with no load,
  // and one that is both timed and loaded.
  { date: '2026-08-05', day: 'Custom', note: 'Short accessory day.', exercises: [
    ['Plank', 3, 45, 0],
    ['Push-Up', 3, 20, 0],
    ['Farmer Carry', 3, 40, 50]
  ]}
];

const DRY = process.argv.includes('--dry');

// A load has landed once the session renders: cards, the start chooser, or a
// message. Waiting on the spinner instead races with it never appearing.
async function rendered(app) {
  await app.locator('.ex, .choice, .msg, .addex').first()
    .waitFor({ state: 'visible', timeout: 45_000 });
}

async function addExercise(app, [name, sets, amount, weight]) {
  const panel = app.locator('.panel');

  await app.locator('.addex').click();
  await panel.waitFor({ state: 'visible' });

  const nameBox = panel.locator('input').first();
  await nameBox.fill(name);
  await nameBox.dispatchEvent('input');
  await nameBox.dispatchEvent('change');

  const minis = panel.locator('.mini input');
  await minis.nth(0).fill(String(sets));
  await minis.nth(1).fill(String(amount));

  // Hidden for exercises that carry no load; filling it would throw.
  const weightBox = panel.locator('.mini > div').nth(2);
  if (await weightBox.isVisible()) await minis.nth(2).fill(String(weight));

  // The toggle rewrites labels and the grid as the name is typed, so let the
  // panel stop moving before clicking a button inside it.
  await app.page().waitForTimeout(250);
  await panel.locator('.go').click();

  // The add re-renders the whole session, which replaces this panel. That is
  // the only reliable signal it finished — waiting on the spinner races with
  // the spinner not having appeared yet.
  try {
    // Generous: every add rewrites the Records tab server-side, so these get
    // slower as the log grows.
    await panel.waitFor({ state: 'detached', timeout: 120_000 });
  } catch (e) {
    // The panel stays open when the server rejects the add, and the reason is
    // in the status bar — surface it rather than reporting a bare timeout.
    const why = await app.locator('#barmsg').textContent().catch(() => '');
    // Same data already present is not a problem worth stopping for; the
    // seeder is meant to be safe to re-run.
    if (/already in this session/.test(why || '')) {
      await panel.locator('.cancel').click().catch(() => {});
      return;
    }
    // Still in flight rather than refused: give the response one more chance
    // before treating a slow round trip as a failure.
    if (/^Adding /.test((why || '').trim())) {
      await panel.waitFor({ state: 'detached', timeout: 120_000 });
      await app.locator('.ex', { hasText: name }).first()
        .waitFor({ state: 'visible', timeout: 60_000 });
      await app.page().waitForTimeout(600);
      return;
    }
    throw new Error(`adding "${name}" failed: ${why || 'no message'}`);
  }
  await app.locator('.ex', { hasText: name }).first()
    .waitFor({ state: 'visible', timeout: 60_000 });
  // Apps Script does not enjoy a tight loop of writes.
  await app.page().waitForTimeout(600);
}

async function buildSession(app, session) {
  process.stdout.write(`  ${session.date} ${session.day} … `);

  await awaitQueue(app);
  await app.locator('.day', { hasText: new RegExp(`^${session.day}$`) }).click();
  await gotoDate(app, session.date);
  await rendered(app);

  // Delete first so a re-run replaces rather than duplicates.
  if (await app.locator('.ex').count()) {
    await app.locator('#wipe').click();
    await awaitLoad(app);
    await app.locator('.ex').first()
      .waitFor({ state: 'detached', timeout: 45_000 });
  }

  // Either the chooser or an existing session is on screen. Wait for one of
  // them before asking which — count() does not wait, so asking too early
  // reads "no chooser" when the truth is "not yet".
  await app.locator('.choice, .addex').first()
    .waitFor({ state: 'visible', timeout: 45_000 });

  if (await app.locator('.choice').count()) {
    await app.locator('.choice', { hasText: 'Empty' }).click();
    await awaitLoad(app);
    await app.locator('.addex').waitFor({ state: 'visible', timeout: 45_000 });
  }

  for (const ex of session.exercises) await addExercise(app, ex);

  // RPE on the newest session only — enough to show the field in use without
  // making every historical set look laboriously hand-entered.
  if (session.rpe) {
    const rows = app.locator('.ex').first().locator('.set');
    for (let i = 0; i < session.rpe.length && i < await rows.count(); i++) {
      const rpe = rows.nth(i).locator('.step input').last();
      await rpe.fill(String(session.rpe[i]));
      await rpe.dispatchEvent('change');
    }
  }

  if (session.note) {
    const box = app.locator('.note').first();
    await box.fill(session.note);
    await box.dispatchEvent('blur');
  }

  // Structural changes are refused while writes are outstanding, so the next
  // session cannot start until this one has fully landed.
  await awaitQueue(app);
  console.log(`${session.exercises.length} exercises`);
}

async function seed({ quiet = false } = {}) {
  const T = targets();
  if (!T.adminUrl) throw new Error('no adminUrl — see e2e/targets.example.json');

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  page.setDefaultTimeout(45_000);

  // Dialogs are auto-dismissed by default, which would hide the app refusing
  // an action ("some changes have not saved yet") behind a silent no-op.
  page.on('dialog', async d => {
    if (!quiet) console.log(`    [dialog] ${d.type()}: ${d.message().split('\n')[0]}`);
    await d.accept();
  });

  try {
    await page.goto(T.adminUrl, { waitUntil: 'domcontentloaded' });
    const app = await appFrame(page);
    await ready(app);
    for (const session of PLAN) await buildSession(app, session);
  } finally {
    await browser.close();
  }
}

// Is the demo log populated? Cheap: the viewer only lists day types that have
// sessions, so an empty list means there is nothing to look at.
async function isSeeded() {
  const T = targets();
  if (!T.viewerUrl) return true;          // nothing to check against

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45_000);
    await page.goto(T.viewerUrl, { waitUntil: 'domcontentloaded' });
    const app = await appFrame(page);
    await ready(app);
    return (await app.locator('.day').count()) > 0;
  } finally {
    await browser.close();
  }
}

module.exports = { PLAN, seed, isSeeded };

if (require.main === module) {
  (async () => {
    const sets = PLAN.reduce((n, s) => n + s.exercises.reduce((m, e) => m + e[1], 0), 0);
    console.log(`${PLAN.length} sessions, ${sets} sets`);
    if (DRY) {
      PLAN.forEach(s => console.log(`  ${s.date} ${s.day}: ` +
        s.exercises.map(e => `${e[0]} ${e[1]}x${e[2]}@${e[3]}`).join(', ')));
      return;
    }
    await seed();
    console.log('done');
  })();
}
