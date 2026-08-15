// The two still screenshots the guides open with.
//
//     node e2e/shoot-stills.js
//
// The clips have a recorder and the report has one; these were captured by
// hand, which meant they could not be redone when the demo moved accounts.
// Both come from real sessions in the demo log, like everything else.

const path = require('path');
const { chromium } = require('@playwright/test');
const { targets, appFrame, ready, settled, gotoDate, awaitLoad } = require('./app');

const OUT = path.join(__dirname, '..', 'docs', 'img');

// Apps Script serves the page under a blue "created by a Google Apps Script
// user" strip. The clips crop it off; so do these, by the same amount.
const BANNER_PX = 88;
const SHOT = { width: 430, height: 1000 };

// A Push session: three of them in a row, so records, the "was 95" lines and
// a note all have something to show.
const DAY = 'Push';
const DATE = process.env.DATE || '2026-08-03';

async function open(browser, url) {
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 },
                                       deviceScaleFactor: 2 });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  const app = await appFrame(page);
  await ready(app);
  await settled(app);
  return { page, app };
}

async function toSession(app) {
  await gotoDate(app, DATE);
  // Day buttons toggle, and landing on a date with one session selects its
  // day already — clicking it again would clear the session off the screen.
  const day = app.locator('.day', { hasText: new RegExp('^' + DAY + '$') }).first();
  await day.waitFor({ state: 'visible', timeout: 60_000 });
  // awaitLoad takes no callback — it waits for the spinner to come and go.
  if (!await day.evaluate(el => el.classList.contains('on')).catch(() => false)) {
    await day.click();
    await awaitLoad(app);
  }
  await app.locator('.ex').first().waitFor({ state: 'visible', timeout: 60_000 });
  // Let the record stars and last-time lines paint before the shutter.
  await app.page().waitForTimeout(1200);
}

(async () => {
  const T = targets();
  const browser = await chromium.launch();

  for (const [url, name] of [[T.adminUrl, 'admin-session'],
                             [T.viewerUrl, 'viewer-session']]) {
    const { page, app } = await open(browser, url);
    await toSession(app);
    await page.screenshot({ path: path.join(OUT, name + '.png'),
                            clip: { x: 0, y: BANNER_PX, width: SHOT.width,
                                    height: SHOT.height - BANNER_PX } });
    console.log(name + '.png');
    await page.close();
  }
  await browser.close();
})();
