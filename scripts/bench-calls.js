// Is the load time the data, or is it the bridge? archiveCutoff touches no
// spreadsheet at all, so it measures the floor: container plus round trip.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');
(async () => {
  const b = await chromium.launch();
  const page = await b.newPage();
  page.setDefaultTimeout(200000);
  const app = await open(page, targets().adminUrl);

  const time = async (fn, args) => {
    const t = Date.now();
    await app.evaluate(([fn, args]) => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)[fn]
        .apply(null, args)), [fn, args]);
    return Date.now() - t;
  };

  for (const [name, fn, args] of [
    ['no-op (pure function) ', 'archiveCutoff', [6, null]],
    ['listDates (one column)', 'listDates', ['Push']],
    ['getBootstrap          ', 'getBootstrap', [null]],
    ['loadSession           ', 'loadSession', ['Push', '2026-07-13', false, null, 'auto']]
  ]) {
    const runs = [];
    for (let i = 0; i < 3; i++) runs.push(await time(fn, args));
    console.log(name, Math.min(...runs) + 'ms best  (' + runs.join(', ') + ')');
  }
  await b.close();
})();
