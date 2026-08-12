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
  targets, appFrame, ready, gotoDate, awaitLoad, awaitQueue, scratchDate,
  SCRATCH_DAY
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

async function openAdmin(page) {
  await page.goto(targets().adminUrl, { waitUntil: 'domcontentloaded' });
  const app = await appFrame(page);
  await ready(app);
  return app;
}

async function emptyScratch(app) {
  await awaitQueue(app);
  await app.locator('.day', { hasText: new RegExp(`^${SCRATCH_DAY}$`) }).click();
  await gotoDate(app, DATE);
  await app.locator('.ex, .choice, .addex, .msg').first().waitFor({ state: 'visible' });

  if (await app.locator('.ex').count()) {
    await app.locator('#wipe').click();
    await awaitLoad(app);
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
  await app.locator('.addex').click();
  await panel.waitFor({ state: 'visible' });

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
const CLIP_DAY = {
  logging: SCRATCH_DAY, rename: SCRATCH_DAY, unit: SCRATCH_DAY, start: 'Push'
};

// Each clip: set the scene off-camera as far as possible, then do the one
// thing the clip is about, slowly enough to follow.
const CLIPS = {
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
    await app.page().waitForTimeout(1800);
  },

  async start(app) {
    await awaitQueue(app);
    await app.locator('.day', { hasText: /^Push$/ }).click();
    await gotoDate(app, DATE);
    await app.locator('.ex, .choice, .msg').first().waitFor({ state: 'visible' });
    if (await app.locator('.ex').count()) {
      await app.locator('#wipe').click();
      await awaitLoad(app);
    }
    // The chooser is the subject here.
    await app.locator('.choice').first().waitFor({ state: 'visible' });
    mark();
    await app.page().waitForTimeout(2200);
    await app.locator('.choice', { hasText: 'From last time' }).click();
    await awaitLoad(app);
    await app.page().waitForTimeout(2200);
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
    const app = await openAdmin(page);
    await CLIPS[name](app);

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
    const after = await browser.newPage();
    after.setDefaultTimeout(60_000);
    after.on('dialog', d => d.accept());
    await after.goto(targets().adminUrl, { waitUntil: 'domcontentloaded' });
    const tidy = await appFrame(after);
    await ready(tidy);
    await tidy.locator('.day', { hasText: new RegExp(`^${CLIP_DAY[name]}$`) })
      .click();
    await gotoDate(tidy, DATE);
    await tidy.locator('.ex, .choice, .msg').first().waitFor({ state: 'visible' });
    await cleanup(tidy);
    await after.close();
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
