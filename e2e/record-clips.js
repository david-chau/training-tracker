// Records short clips of individual features for the documentation pages.
//
//     node e2e/record-clips.js            # all of them
//     node e2e/record-clips.js rename     # just one
//
// Playwright captures webm; ffmpeg turns each into a GIF. Screen recordings
// are the good case for GIF — flat colour, a static background, and only a
// small region changing — which is the opposite of the hand-held tablet
// footage that made the earlier GIF attempt unusable.
//
// Each clip works on a scratch date five years out and deletes the day
// afterwards, exactly like the admin tests.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('@playwright/test');
const {
  targets, appFrame, ready, settled, gotoDate, awaitLoad, awaitQueue, awaitAdd,
  scratchDate, SCRATCH_DAY
} = require('./app');

const OUT = path.join(__dirname, '..', 'docs', 'img');
const TMP = path.join(__dirname, '..', '.clips');
const DATE = scratchDate();

// Playwright records a whole context, but most of that is scaffolding —
// navigating to the scratch date, waiting on Apps Script, adding the exercise
// the clip is about. Each clip calls mark() when the scene is set, and the
// recording is trimmed to what happened after it.
let started = 0, action = 0;
const mark = () => { action = Date.now(); };

// Google's "created by a Google Apps Script user" banner sits above the app in
// the outer page and is pure noise in a documentation clip.
const BANNER_PX = 88;

// Narrow viewport: the app is tablet-first and a phone-width clip is both
// more honest and a smaller file.
const VIEWPORT = { width: 460, height: 860 };

async function fresh(browser) {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    recordVideo: { dir: TMP, size: VIEWPORT }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  page.setDefaultNavigationTimeout(90_000);
  page.on('dialog', d => d.accept());
  started = Date.now();
  action = 0;
  return { context, page };
}

async function openAdmin(page, url) {
  await page.goto(url || targets().adminUrl, { waitUntil: 'domcontentloaded' });
  const app = await appFrame(page);
  await ready(app);
  await settled(app);            // today's session may be auto-opening
  return app;
}

async function emptyScratch(app) {
  await awaitQueue(app);
  await app.locator('.day', { hasText: new RegExp(`^${SCRATCH_DAY}$`) }).click();
  await gotoDate(app, DATE);
  await app.locator('.ex, .choice, .addex, .msg').first().waitFor({ state: 'visible' });

  // Twice: a wipe that raced a load leaves the cards up, and building the
  // clip on top of yesterday's leftovers is how a clip ends up filming the
  // wrong session.
  for (let i = 0; i < 2 && await app.locator('.ex').count(); i++) {
    await app.locator('#wipe').click();
    await awaitLoad(app);
  }
  if (await app.locator('.ex').count()) {
    throw new Error('the scratch day would not clear before recording');
  }
  const empty = app.locator('.choice', { hasText: 'Empty' });
  if (await empty.count()) {
    await empty.click();
    await awaitLoad(app);
  }
  await app.locator('.addex').waitFor({ state: 'visible' });
}

async function addExercise(app, name, sets, amount, weight) {
  const panel = app.locator('.panel');

  // A click can land on an .addex that a re-render is about to replace, and
  // then nothing opens. Retry rather than waiting a minute for a panel that
  // was never going to appear.
  for (let i = 0; i < 3 && !await panel.count(); i++) {
    await app.locator('.addex').click();
    await panel.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {});
  }
  await panel.waitFor({ state: 'visible', timeout: 15_000 });

  const nameBox = panel.locator('input').first();
  await nameBox.fill(name);
  await nameBox.dispatchEvent('input');
  await nameBox.dispatchEvent('change');

  const minis = panel.locator('.mini input');
  await minis.nth(0).fill(String(sets));
  await minis.nth(1).fill(String(amount));
  const weightBox = panel.locator('.mini > div').nth(2);
  if (await weightBox.isVisible()) await minis.nth(2).fill(String(weight));

  await app.page().waitForTimeout(300);
  await panel.locator('.go').click();
  await panel.waitFor({ state: 'detached', timeout: 120_000 });
  await app.locator('.ex', { hasText: name }).first().waitFor({ state: 'visible' });
  await awaitAdd(app);
}

// Delete the scratch session a clip just built, and prove it went. This used
// to be inline and silent: it opened the app, clicked a day type, and wiped
// whatever it found. Bootstrap opens *today's* session on its own, so a click
// that lost that race wiped nothing and the run carried on, leaving scratch
// rows behind that then showed up as personal bests dated five years out.
async function tidyUp(browser, day) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const page = await browser.newPage();
    page.setDefaultTimeout(60_000);
    page.setDefaultNavigationTimeout(90_000);
    page.on('dialog', d => d.accept());
    try {
      await page.goto(targets().adminUrl, { waitUntil: 'domcontentloaded' });
      const app = await appFrame(page);
      await ready(app);
      await settled(app);                    // today's session may be opening
      await app.locator('.day', { hasText: new RegExp(`^${day}$`) }).click();
      await gotoDate(app, DATE);
      await app.locator('.ex, .choice, .msg').first().waitFor({ state: 'visible' });
      await cleanup(app);

      // The day is only clean when nothing is left on it.
      if (!await app.locator('.ex').count()) return;
      console.log(`  (${day} ${DATE} still had rows — retrying the tidy)`);
    } finally {
      await page.close();
    }
  }
  throw new Error(`could not clear ${day} on ${DATE} — clear it by hand`);
}

async function cleanup(app) {
  await awaitQueue(app);
  if (await app.locator('.ex').count()) {
    await app.locator('#wipe').click();
    await awaitLoad(app);
  }
}

// Which day type each clip works on, so the tidy-up afterwards wipes the day
// the clip actually used. A regex matching both and taking .first() picked the
// wrong one and left 19 rows on the scratch date, which then showed up as
// personal bests dated five years out.
//
// null means the clip only reads, so there is nothing to tidy.
const CLIP_DAY = {
  tour: 'Push', start: 'Push', logging: SCRATCH_DAY, pages: 'Push',
  superset: SCRATCH_DAY, unit: SCRATCH_DAY, kg: 'Push', rename: SCRATCH_DAY,
  records: 'Push', viewer: null
};

// A generated session on the scratch date: five exercises, real numbers, and
// the records and "was" lines that come with them.
async function fromLastTime(app, day) {
  await awaitQueue(app);
  await app.locator('.day', { hasText: new RegExp(`^${day}$`) }).click();
  await gotoDate(app, DATE);
  await app.locator('.ex, .choice, .msg').first().waitFor({ state: 'visible' });
  if (await app.locator('.ex').count()) {
    await app.locator('#wipe').click();
    await awaitLoad(app);
  }
  await app.locator('.choice').first().waitFor({ state: 'visible' });
}

// Each clip: set the scene off-camera as far as possible, then do the one
// thing the clip is about, slowly enough to follow.
const CLIPS = {
  // The one on the home page and in the README: start a session, log a set,
  // move to the next exercise. Everything else is a detail of this.
  async tour(app) {
    await fromLastTime(app, 'Push');

    mark();
    await app.page().waitForTimeout(1400);
    await app.locator('.choice', { hasText: 'From last time' }).click();
    await awaitLoad(app);
    await app.page().waitForTimeout(1600);

    const row = app.locator('.ex').first().locator('.set').first();
    for (const i of [0, 1]) {
      await row.locator('.step').nth(i).locator('button').nth(1).click();
      await app.page().waitForTimeout(500);
    }
    await app.locator('#barmsg').filter({ hasText: 'Saved row' })
      .waitFor({ timeout: 60_000 }).catch(() => {});
    await app.page().waitForTimeout(1200);

    await app.locator('#pagefwd').click();
    await app.page().waitForTimeout(2000);
  },

  async start(app) {
    await fromLastTime(app, 'Push');

    mark();
    await app.page().waitForTimeout(2200);
    await app.locator('.choice', { hasText: 'From last time' }).click();
    await awaitLoad(app);
    await app.page().waitForTimeout(2200);
  },

  async logging(app) {
    await emptyScratch(app);
    await addExercise(app, 'Barbell Bench Press', 3, 8, 100);

    const row = app.locator('.ex').first().locator('.set').first();
    const reps = row.locator('.step').first();
    const weight = row.locator('.step').nth(1);

    mark();
    await app.page().waitForTimeout(900);
    for (let i = 0; i < 2; i++) {
      await reps.locator('button').nth(1).click();
      await app.page().waitForTimeout(450);
    }
    for (let i = 0; i < 2; i++) {
      await weight.locator('button').nth(1).click();
      await app.page().waitForTimeout(450);
    }
    // Let the status bar report the values it read back out of the sheet.
    await app.locator('#barmsg').filter({ hasText: 'Saved row' })
      .waitFor({ timeout: 60_000 }).catch(() => {});
    await app.page().waitForTimeout(1800);
  },

  // One card at a time: the list at the top, the pager at the bottom.
  async pages(app) {
    await fromLastTime(app, 'Push');
    await app.locator('.choice', { hasText: 'From last time' }).click();
    await awaitLoad(app);
    await app.locator('.railitem').first().waitFor({ state: 'visible' });

    mark();
    await app.page().waitForTimeout(1500);
    await app.locator('#pagefwd').click();
    await app.page().waitForTimeout(1400);
    await app.locator('#pagefwd').click();
    await app.page().waitForTimeout(1400);
    await app.locator('.railitem').nth(4).click();
    await app.page().waitForTimeout(1600);
    await app.locator('.railitem').first().click();
    await app.page().waitForTimeout(1800);
  },

  async superset(app) {
    await emptyScratch(app);
    await addExercise(app, 'Dead Bug', 3, 12, 0);
    await addExercise(app, 'Battle Ropes', 3, 30, 0);
    await app.locator('.railitem').first().click();

    mark();
    await app.page().waitForTimeout(1600);
    await app.locator('.pair').first().click();
    await app.locator('.ex.ss').waitFor({ state: 'visible', timeout: 60_000 });
    await app.page().waitForTimeout(2600);
  },

  // Reps or seconds, chosen on the add form.
  async unit(app) {
    await emptyScratch(app);

    mark();
    await app.page().waitForTimeout(700);
    await app.locator('.addex').click();
    const panel = app.locator('.panel');
    await panel.waitFor({ state: 'visible' });

    const nameBox = panel.locator('input').first();
    await nameBox.type('Plank', { delay: 90 });
    await nameBox.dispatchEvent('input');
    await app.page().waitForTimeout(1500);          // toggle flips to Seconds

    await panel.locator('.unit button', { hasText: 'Reps' }).click();
    await app.page().waitForTimeout(1100);
    await panel.locator('.unit button', { hasText: 'Seconds' }).click();
    await app.page().waitForTimeout(1600);

    await panel.locator('.mini input').nth(1).fill('45');
    await app.page().waitForTimeout(700);
    await panel.locator('.go').click();
    await panel.waitFor({ state: 'detached', timeout: 120_000 });
    await awaitAdd(app);
    await app.page().waitForTimeout(1500);
  },

  // Pounds or kilograms, on a session with real weights in it.
  async kg(app) {
    await fromLastTime(app, 'Push');
    await app.locator('.choice', { hasText: 'From last time' }).click();
    await awaitLoad(app);
    await app.locator('.ex').first().waitFor({ state: 'visible' });

    mark();
    await app.page().waitForTimeout(1600);
    await app.locator('#unit button[data-unit="kg"]').click();
    await app.page().waitForTimeout(2400);
    await app.locator('#unit button[data-unit="lb"]').click();
    await app.page().waitForTimeout(1800);
  },

  async rename(app) {
    await emptyScratch(app);
    await addExercise(app, 'Lat Pulldown', 3, 10, 70);

    mark();
    await app.page().waitForTimeout(900);
    await app.locator('.ex').first().locator('.rename').click();
    await app.page().waitForTimeout(900);

    const box = app.locator('.namebox input');
    await box.fill('');
    await box.type('Machine by the window', { delay: 55 });
    await app.page().waitForTimeout(700);
    await app.locator('.namebox .go').click();
    await awaitLoad(app);
    await app.page().waitForTimeout(1800);
  },

  // The star arriving. A generated session usually already beats last week, so
  // the set is put back to the record itself off camera and taken past it on
  // camera — otherwise the mark is there before the clip starts.
  async records(app) {
    await fromLastTime(app, 'Push');
    await app.locator('.choice', { hasText: 'From last time' }).click();
    await awaitLoad(app);
    await app.locator('.ex').first().waitFor({ state: 'visible' });

    const card = app.locator('.ex').first();
    const best = await card.locator('.meta').first().textContent();
    const m = /Best\s+(\d+(?:\.\d+)?)\s*×\s*(\d+(?:\.\d+)?)/.exec(best || '');
    if (!m) throw new Error('no record on the first card: ' + best);

    const row = card.locator('.set').first();
    const reps = row.locator('.step input').first();
    const weight = row.locator('.step input').nth(1);
    await weight.fill(m[2]);
    await weight.dispatchEvent('change');
    await reps.fill(m[1]);
    await reps.dispatchEvent('change');
    await awaitQueue(app);

    mark();
    await app.page().waitForTimeout(1600);
    for (let i = 0; i < 2; i++) {
      await row.locator('.step').first().locator('button').nth(1).click();
      await app.page().waitForTimeout(700);
    }
    await app.page().waitForTimeout(2400);
  },

  // The read-only link. Writes nothing, so it works on the real log.
  async viewer(app) {
    await app.locator('.day').first().click();
    await settled(app);
    for (let i = 0; i < 6 && !await app.locator('.ex').count(); i++) {
      await app.locator('#prevsess').click();
      await awaitLoad(app);
    }
    await app.locator('.ex').first().waitFor({ state: 'visible', timeout: 60_000 });

    mark();
    await app.page().waitForTimeout(1800);
    await app.locator('#pagefwd').click();
    await app.page().waitForTimeout(1600);
    await app.locator('.railitem').nth(2).click();
    await app.page().waitForTimeout(2000);
  }
};

function toGif(webm, gif, skipSeconds) {
  const crop = `crop=${VIEWPORT.width}:${VIEWPORT.height - BANNER_PX}:0:${BANNER_PX}`;
  const chain = `${crop},fps=10,scale=440:-1:flags=lanczos`;
  const seek = skipSeconds > 0.5 ? ['-ss', skipSeconds.toFixed(2)] : [];
  const pal = webm + '.png';

  execFileSync('ffmpeg', ['-v', 'error', ...seek, '-i', webm, '-an',
    '-vf', `${chain},palettegen=stats_mode=diff:max_colors=64`, '-y', pal]);
  execFileSync('ffmpeg', ['-v', 'error', ...seek, '-i', webm, '-i', pal, '-an',
    '-lavfi', `[0:v]${chain}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
    '-loop', '0', '-y', gif]);
  fs.unlinkSync(pal);
}

async function record(names) {
  if (!targets().adminUrl) throw new Error('no adminUrl — see e2e/targets.example.json');

  fs.mkdirSync(TMP, { recursive: true });

  const browser = await chromium.launch();
  for (const name of names) {
    if (!CLIPS[name]) throw new Error(`no clip called "${name}"`);
    process.stdout.write(`  ${name} … `);

    const { context, page } = await fresh(browser);
    const app = await openAdmin(page, CLIP_DAY[name] === null ? targets().viewerUrl : null);
    try {
      await CLIPS[name](app);
    } catch (err) {
      // Leaving rows on the scratch date is worse than losing the clip: they
      // become records dated five years out in the demo log.
      await context.close();
      if (CLIP_DAY[name] !== null) await tidyUp(browser, CLIP_DAY[name]);
      throw err;
    }

    const skip = action ? (action - started) / 1000 : 0;
    const video = page.video();
    await context.close();                  // flushes the recording
    const webm = await video.path();

    const gif = path.join(OUT, `clip-${name}.gif`);
    toGif(webm, gif, skip);
    fs.unlinkSync(webm);
    console.log(`${(fs.statSync(gif).size / 1024).toFixed(0)} KB` +
                (skip ? `  (dropped ${skip.toFixed(1)}s of setup)` : ''));

    // Tidy the scratch day outside the recording, so a wipe is never in frame.
    if (CLIP_DAY[name] === null) continue;
    await tidyUp(browser, CLIP_DAY[name]);
  }
  await browser.close();
  fs.rmSync(TMP, { recursive: true, force: true });
}

module.exports = { CLIPS, record };

// Guarded: this drives a live spreadsheet, so requiring the file must not
// start a recording run.
if (require.main === module) {
  const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
  record(only.length ? only : Object.keys(CLIPS));
}
