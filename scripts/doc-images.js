// The images the docs use. Data from the live sheet, markup and CSS from the
// working copy, so they cannot drift from the code they illustrate.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');
const { reportMarkup } = require('./report-render.js');
const fs = require('fs');
const OUT = __dirname + '/../docs/img/';
// Scratch, not a doc image: this used to be written into docs/img/ and
// committed alongside the pictures.
const TMP = __dirname + '/../generated/doc.html';

const WANT = [
  ['report-week', '', 28],     // a month back: weekly points
  ['report-year', '', 400]     // everything: rolled up by month
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const app = await open(page, targets().adminUrl);

  const src = fs.readFileSync(__dirname + '/../src/Index.html', 'utf8');
  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>') + 8);

  const shot = await browser.newPage({ viewport: { width: 430, height: 1000 },
                                       deviceScaleFactor: 2 });

  for (const [name, _, daysBack] of WANT) {
    const d = new Date();
    d.setDate(d.getDate() - daysBack);
    const from = d.toISOString().slice(0, 10);
    const data = await app.evaluate(from => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .reportSummary(KEY, from, '')), from);

    const doc = '<!doctype html><meta charset="utf-8">' + css +
      '<body style="background:var(--bg)"><div class="repsheet" ' +
      'style="max-width:400px;margin:0"><div class="rep">' +
      reportMarkup(data) + '</div></div>';
    fs.writeFileSync(TMP, doc);
    await shot.goto('file://' + TMP);
    await shot.waitForTimeout(300);

    // The chart alone: it is what differs between a week and a year.
    await shot.locator('.card').first().screenshot({ path: OUT + name + '.png' });
    console.log(name + ': ' + (data.weeks.length) + ' weeks of data');

    if (name === 'report-year') {
      // One whole report, for the section that describes the thing.
      await shot.locator('.repsheet').screenshot({ path: OUT + 'report.png' });
    }
  }
  await browser.close();
})();
