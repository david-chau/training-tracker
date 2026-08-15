// One-off archive: moves every session on or before a cutoff date into its
// own spreadsheet in Drive, and out of the log.
//
//     node scripts/archive.js 2026-02-14
//
// Goes through the app's own bridge, so it is exactly what the menu item and
// the weekly job do — runArchive writes the archive, reads it back, compares
// row counts, and only then deletes anything.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');

(async () => {
  const cutoff = process.argv[2];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cutoff || '')) {
    throw new Error('usage: node scripts/archive.js YYYY-MM-DD');
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.setDefaultTimeout(400000);
  const app = await open(page, targets().adminUrl);

  console.log('archiving everything up to and including ' + cutoff + '…');
  const t = Date.now();
  const done = await app.evaluate(cutoff => new Promise((ok, bad) =>
    google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))
      .runArchive(KEY, cutoff)), cutoff);

  console.log('took ' + Math.round((Date.now() - t) / 1000) + 's');
  console.log(done ? {
    moved: done.doomed.length, sessions: done.sessions,
    from: done.from, to: done.to, kept: done.keep.length, name: done.name
  } : 'nothing on or before ' + cutoff);
  await browser.close();
})();
