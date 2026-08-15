// The short crop of the report that the README and the home page use — the
// chart, the totals and the averages. The full-length version is 796x3830,
// which is a wall of picture at the top of a README.
//
//     node scripts/report-shot.js && node scripts/doc-crop.js
//
// Reads generated/report.html, which report-shot.js leaves behind, so the
// crop is always of the same render rather than a second trip to the sheet.
const fs = require('fs');
const { chromium } = require('@playwright/test');

const IN = __dirname + '/../generated/report.html';
const OUT = __dirname + '/../docs/img/report-top.png';

(async () => {
  if (!fs.existsSync(IN)) {
    throw new Error('run scripts/report-shot.js first — no generated/report.html');
  }
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 1000 },
                                       deviceScaleFactor: 2 });
  await page.goto('file://' + IN);
  await page.waitForTimeout(300);
  await page.screenshot({ path: OUT,
                          clip: { x: 16, y: 16, width: 398, height: 610 } });
  console.log('docs/img/report-top.png');
  await browser.close();
})();
