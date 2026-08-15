// What the chart looks like as history piles up.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const { reportMarkup } = require('./report-render.js');
const OUT = __dirname + '/../generated/';

function weeksOf(n) {
  const out = [];
  const d = new Date('2025-09-01');
  for (let i = 0; i < n; i++) {
    d.setDate(d.getDate() + 7);
    out.push({ week: d.toISOString().slice(0, 10),
               sessions: 1 + (i * 7 % 4),
               sets: 30 + (i % 9) * 4,
               volume: 18000 + Math.round(Math.sin(i / 4) * 9000) + i * 120,
               change: 1 });
  }
  return out;
}

(async () => {
  const src = fs.readFileSync(OUT + '../src/Index.html', 'utf8');
  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>') + 8);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 430, height: 900 },
                                       deviceScaleFactor: 3 });
  for (const n of [12, 26, 50, 104]) {
    const doc = '<!doctype html><meta charset="utf-8">' + css +
      '<body><div class="repmodal"><div class="repsheet"><div class="rep">' +
      reportMarkup({ name: 'Log', from: '2025-09-08', to: '2026-08-11',
        period: '2025-09-08', sessions: n * 2, sets: n * 30,
        volume: n * 20000, weeks: weeksOf(n), lifetime: null, exercises: [] }) +
      '</div></div></div>';
    fs.writeFileSync(OUT + 'weeks.html', doc);
    await page.goto('file://' + OUT + 'weeks.html');
    await page.locator('.card').first().screenshot({
      path: process.env.SCRATCH + '/wk' + n + '.png' });
    const counts = await page.evaluate(() => ({
      points: document.querySelectorAll('.pt').length,
      labels: document.querySelectorAll('.pv').length,
      dates: document.querySelectorAll('.xl').length,
      gapPx: (() => {
        const p = [...document.querySelectorAll('.pt:not(.freq)')];
        if (p.length < 2) return 0;
        return Math.round(p[1].getBoundingClientRect().left -
                          p[0].getBoundingClientRect().left);
      })()
    }));
    console.log(n + ' weeks:', JSON.stringify(counts));
  }
  await browser.close();
})();
