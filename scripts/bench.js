// What the log's size costs, measured rather than guessed.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');

async function time(fn) { const t = Date.now(); await fn(); return Date.now() - t; }

(async () => {
  const T = targets();
  const runs = Number(process.env.RUNS || 3);
  const browser = await chromium.launch();
  const boot = [], load = [], report = [];

  for (let i = 0; i < runs; i++) {
    // A fresh context each time: no HTTP cache, no warm page.
    const ctx = await browser.newContext({ viewport: { width: 430, height: 932 } });
    const page = await ctx.newPage();
    let app;
    boot.push(await time(async () => { app = await open(page, T.adminUrl); }));

    load.push(await time(() => app.evaluate(() => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .loadSession('Push', '2026-08-10', false, KEY, 'auto')))));

    report.push(await time(() => app.evaluate(() => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(bad)
        .reportSummary(KEY, '')))));
    await ctx.close();
  }

  const stat = (a) => Math.round(a.reduce((n, v) => n + v, 0) / a.length / 100) / 10 +
    's  (' + a.map(v => Math.round(v / 100) / 10).join(', ') + ')';
  console.log('rows in log: ' + (process.env.ROWS || '?'));
  console.log('  open to ready   ' + stat(boot));
  console.log('  load a session  ' + stat(load));
  console.log('  build report    ' + stat(report));
  await browser.close();
})();
