// Screenshot of the deployed app's own modal, as opposed to shot.js, which
// renders the working copy. This one proves what is actually live.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');
(async () => {
  const T = targets();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const app = await open(page, T.adminUrl);
  await app.locator('#report').click();
  if (process.env.FROM) await app.locator('#repfrom').fill(process.env.FROM);
  if (process.env.TO) await app.locator('#repto').fill(process.env.TO);
  if (process.env.N) {
    await app.locator('#repnum').fill(process.env.N);
    await app.locator('#repunit').selectOption(process.env.UNIT || 'weeks');
  }
  await app.locator('#reportpanel .go', { hasText: 'Build' }).click();
  await app.locator('.repmodal').waitFor({ timeout: 120_000 });
  await page.waitForTimeout(1500);
  console.log(await app.evaluate(() => ({
    heading: (document.querySelector('.rep h3') || {}).textContent,
    span: (document.querySelector('.rep .sub') || {}).textContent,
    points: document.querySelectorAll('.pt:not(.freq)').length,
    axis: [...document.querySelectorAll('.xl')].map(l => l.textContent),
    allRows: [...document.querySelectorAll('.allrow')].map(r => r.textContent)
  })));
  await page.screenshot({ path: __dirname + '/' + (process.env.OUT || 'live-range') +
    '.png', fullPage: true });
  // The report on its own, as it prints — no phone chrome around it.
  await app.locator('.repsheet').screenshot({ path: __dirname + '/' +
    (process.env.OUT || 'live-range') + '-sheet.png' });
  await browser.close();
})();
