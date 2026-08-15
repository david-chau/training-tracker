const { chromium } = require('@playwright/test');
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 430, height: 1000 },
                              deviceScaleFactor: 2 });
  await p.goto('file://' + OUT + 'report.html');
  await p.waitForTimeout(300);
  // The chart, the totals and the averages: enough to say what a report is
  // without pasting a whole page of exercise rows into a README.
  await p.screenshot({ path: __dirname + '/../docs/img/report-top.png',
                       clip: { x: 16, y: 16, width: 398, height: 610 } });
  await b.close();
})();
