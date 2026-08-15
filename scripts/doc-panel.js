// The report's period controls, from the deployed app.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 },
                                       deviceScaleFactor: 2 });
  const app = await open(page, targets().adminUrl);
  await app.locator('#report').click();
  await app.locator('#repnum').fill('6');
  await app.locator('#repunit').selectOption('months');
  await page.waitForTimeout(300);
  await app.locator('#reportpanel').screenshot({
    path: __dirname + '/../docs/img/report-panel.png' });
  console.log('captured');
  await browser.close();
})();
