// Renders the report the way the app would, without waiting on a deploy.
//
// Data comes from the live sheet; the markup and stylesheet come from the
// working copy — reportView is loaded out of src/Index.html the same way the
// unit tests load it. So a change to either can be looked at before anyone
// pastes anything into Apps Script.
//
// Printing needs the standalone page too: the app runs in Apps Script's
// fixed-height sandbox iframe, and page.pdf() prints the TOP document, which
// clips the frame instead of paginating it. `window.print()` from inside the
// frame prints the frame, which is what this reproduces.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');
const fs = require('fs');
const OUT = __dirname + '/../generated/';

const { reportMarkup } = require('./report-render.js');

(async () => {
  const T = targets();
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const app = await open(page, T.adminUrl);

  // The report as data, straight off the bridge — no clicking required.
  const data = await app.evaluate(from => new Promise((ok, bad) =>
    google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
      .reportSummary(KEY, from)), process.env.FROM || '');
  // The live server predates the all-time totals, so stand in for them the
  // way reportData does — a no-op once Code.gs is deployed.
  if (process.env.FROM && !data.lifetime) {
    const ever = await app.evaluate(() => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .reportSummary(KEY, '')));
    data.lifetime = { sessions: ever.sessions, sets: ever.sets,
                      volume: ever.volume, weeks: ever.weeks.length,
                      from: ever.from, to: ever.to };
    console.log('stood in for lifetime totals');
  }
  console.log('data:', data.sessions + ' sessions,', data.weeks.length + ' weeks,',
              data.exercises.length + ' exercises');

  const src = fs.readFileSync(__dirname + '/../src/Index.html', 'utf8');
  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>') + 8);
  const doc = '<!doctype html><meta charset="utf-8">' + css +
    '<body><div class="repmodal"><div class="repsheet">' +
    '<div class="rep">' + reportMarkup(data) + '</div></div></div>';
  const tag = process.env.FROM ? '-period' : '';
  fs.writeFileSync(OUT + 'report' + tag + '.html', doc);

  const p2 = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await p2.goto('file://' + OUT + 'report' + tag + '.html');
  await p2.screenshot({ path: OUT + 'report-app' + tag + '.png', fullPage: true });

  await p2.emulateMedia({ media: 'print' });
  // No printBackground: a real Chrome print drops backgrounds unless the CSS
  // asks for them, which is what print-color-adjust:exact is doing.
  await p2.pdf({ path: OUT + 'report-print' + tag + '.pdf', format: 'letter',
                 printBackground: false });
  console.log('wrote report-app.png and report-print.pdf');
  await browser.close();
})();
