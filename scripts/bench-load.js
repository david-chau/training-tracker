// Where the load time goes: the page itself, the bootstrap call, the session.
const { chromium } = require('@playwright/test');
const { targets, appFrame, ready } = require('../e2e/app.js');
(async () => {
  const T = targets();
  const b = await chromium.launch();
  const page = await b.newPage();
  page.setDefaultTimeout(180000);

  let t = Date.now();
  await page.goto(T.adminUrl, { waitUntil: 'domcontentloaded' });
  const html = Date.now() - t;
  const app = await appFrame(page);
  const frame = Date.now() - t;
  await ready(app);
  const dayButtons = Date.now() - t;

  const call = async (fn, args) => {
    const t0 = Date.now();
    await app.evaluate(([fn, args]) => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)[fn]
        .apply(null, args)), [fn, args]);
    return Date.now() - t0;
  };

  console.log('page html          ', html + 'ms');
  console.log('app frame present  ', frame + 'ms');
  console.log('day buttons (boot) ', dayButtons + 'ms');
  console.log('getBootstrap again ', await call('getBootstrap', [null]) + 'ms');
  console.log('loadSession        ', await call('loadSession',
    ['Push', '2026-07-13', false, null, 'auto']) + 'ms');
  console.log('listDates          ', await call('listDates', ['Push']) + 'ms');
  await b.close();
})();
