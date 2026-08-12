// Shared helpers for the end-to-end tests.
//
// Targets come from e2e/targets.json (gitignored — the admin URL embeds the
// edit key) or from the environment, which is what CI would use.

const fs = require('fs');
const path = require('path');

function targets() {
  let file = {};
  const p = path.join(__dirname, 'targets.json');
  if (fs.existsSync(p)) file = JSON.parse(fs.readFileSync(p, 'utf8'));

  const t = {
    viewerUrl: process.env.TT_VIEWER_URL || file.viewerUrl || '',
    adminUrl: process.env.TT_ADMIN_URL || file.adminUrl || '',
    sheetUrl: process.env.TT_SHEET_URL || file.sheetUrl || '',
    allowWrites: process.env.TT_ALLOW_WRITES
      ? process.env.TT_ALLOW_WRITES === 'true'
      : file.allowWrites !== false
  };
  return t;
}

// Apps Script serves the page inside a sandbox iframe on a googleusercontent
// origin, so nothing in the app is reachable from the top-level document.
// Rather than hardcode #sandboxFrame — Google has renamed and re-nested it
// before — find whichever frame actually contains the app.
async function appFrame(page) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const frame of page.frames()) {
      try {
        if (await frame.locator('#barmsg').count()) return frame;
      } catch {
        // frame detached mid-navigation; try the next one
      }
    }
    await page.waitForTimeout(500);
  }
  throw new Error('the app frame never appeared — is the deployment live?');
}

async function open(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const app = await appFrame(page);
  await ready(app);
  // Bootstrap opens today's session when there is one, and that load starts
  // after the day buttons appear. Clicking into the app while it is in flight
  // means the response lands on top of whatever the test just did — which is
  // exactly what happened the first day the demo log had a session dated
  // today. Wait for the app to be idle before handing it over.
  await settled(app);
  return app;
}

// h1 is in the static markup, so its presence proves nothing. Bootstrap has
// landed once the day buttons exist — or once the app has said there are none,
// which is a legitimate end state for an empty log.
async function ready(app) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    if (await app.locator('.day').count()) return;
    const body = await app.locator('#body').textContent().catch(() => '');
    if (/Nothing has been logged|No day types yet/.test(body || '')) return;
    await app.page().waitForTimeout(400);
  }
  throw new Error('bootstrap never populated the day list');
}

// Pick a day type and land on a date that actually has a session. Clicking a
// day type lands on today, which usually has nothing logged — so step back
// until a card appears.
async function openSession(app, dayIndex = 0) {
  const days = app.locator('.day');
  if (!await days.count()) return false;

  await days.nth(dayIndex).click();
  await settled(app);

  // Start from beyond every session so stepping *back* can always reach the
  // newest one. Without this the search inherits whatever date the previous
  // day type left behind, and a session ahead of it is unreachable.
  await gotoDate(app, '2035-12-31');

  // Step back until a session appears. One step *should* be enough from beyond
  // every date, but a step can be a no-op while the date list is still in
  // flight, so this retries rather than concluding there is nothing there.
  for (let i = 0; i < 8; i++) {
    if (await app.locator('.ex').count()) return true;

    const back = app.locator('#prevsess');
    if (!await navReady(app, back)) return false;

    const before = await app.locator('#date').inputValue();
    await back.click();
    const moved = await app
      .waitForFunction(
        d => document.getElementById('date').value !== d,
        before,
        { timeout: 15_000 }
      )
      .then(() => true)
      .catch(() => false);

    if (!moved) { await app.page().waitForTimeout(1_500); continue; }
    await awaitLoad(app);
  }
  return await app.locator('.ex').count() > 0;
}

// True once the button is enabled, false if it is still disabled after the
// date list has had time to land.
async function navReady(app, button, grace = 12_000) {
  const deadline = Date.now() + grace;
  while (Date.now() < deadline) {
    if (!await button.isDisabled()) return true;
    await app.page().waitForTimeout(400);
  }
  return false;
}

// The session dims and shows a spinner while a day loads.
async function settled(app) {
  await app.locator('.spinner').waitFor({ state: 'detached', timeout: 45_000 })
    .catch(() => {});
  await app.locator('#body.busy').waitFor({ state: 'detached', timeout: 45_000 })
    .catch(() => {});
}

// Users paste Code.gs and Index.html by hand and then have to redeploy, so a
// live app can legitimately be older than this repo. Rather than fail, say so:
// a skip naming the missing feature is a useful signal, a red suite for a
// pending deploy is not.
async function deployedFeature(app, selector) {
  return (await app.locator(selector).count()) > 0;
}

// The admin specs need a day-type button that already exists, and day types
// only exist once something has been logged against them — so they reuse the
// blank day. Named here because the viewer specs have to know which day the
// suite is mutating underneath them.
const SCRATCH_DAY = 'Custom';

// A date far enough out that it cannot collide with anything logged for real.
function scratchDate() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  const two = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`;
}

async function gotoDate(app, iso) {
  await app.locator('#date').fill(iso);
  await app.locator('#date').dispatchEvent('change');
  await awaitLoad(app);
}

// The app refuses structural changes while writes are outstanding, which is
// correct behaviour and something a script has to respect rather than race.
// The amber bar is the signal.
async function awaitQueue(app, timeout = 60_000) {
  await app.locator('#bar.pending')
    .waitFor({ state: 'detached', timeout })
    .catch(() => {});
}

// Wait for the spinner to appear and then go. Waiting only for it to detach
// races with it not having appeared yet, which lets stale cards from the
// previous date look like the new session.
async function awaitLoad(app) {
  const spinner = app.locator('.spinner');
  await spinner.waitFor({ state: 'visible', timeout: 8_000 }).catch(() => {});
  await spinner.waitFor({ state: 'detached', timeout: 60_000 }).catch(() => {});
  await app.locator('#body.busy').waitFor({ state: 'detached', timeout: 60_000 })
    .catch(() => {});
}

// An added exercise renders before the sheet has it — the card is dashed
// until the rows exist, and the app refuses anything structural in between.
// Anything that adds and then acts has to wait this out or it will meet an
// alert instead of the control it clicked.
//
// On an older deployment the class never appears, so this returns at once.
async function awaitAdd(app, timeout = 120_000) {
  await app.locator('.ex.adding').first()
    .waitFor({ state: 'detached', timeout })
    .catch(() => {});
}

// The status bar is the app's own receipt: it reports values read back out of
// the spreadsheet, so waiting on it is waiting on a confirmed write.
async function waitForSaved(app) {
  await app.locator('#bar.saved, #barmsg:has-text("Saved")').first()
    .waitFor({ timeout: 45_000 });
}

module.exports = {
  targets, appFrame, open, ready, openSession, settled, navReady, awaitLoad,
  awaitQueue, awaitAdd, SCRATCH_DAY,
  deployedFeature,
  scratchDate, gotoDate, waitForSaved
};
