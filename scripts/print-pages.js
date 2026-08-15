// How many pages does the printed report take as a log grows? Same render and
// same print CSS as shot.js, with invented exercises instead of live data.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const { execSync } = require('child_process');
const OUT = __dirname + '/../generated/';
const { reportMarkup } = require('./report-render.js');

const DAYS = ['Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Upper'];
function data(perDay, dayCount) {
  const exercises = [];
  for (let d = 0; d < dayCount; d++) {
    for (let i = 0; i < perDay; i++) {
      exercises.push({
        name: DAYS[d] + ' Exercise Number ' + (i + 1), day: DAYS[d],
        sessions: 3, sets: 9, volume: 2400,
        low: '8 × 95', high: '8 × 105', last: '8 × 105', change: 10.5,
        allLow: '8 × 65', allHigh: '8 × 105', best: i % 5 === 0
      });
    }
  }
  return {
    name: 'Training — David', from: '2026-01-05', to: '2026-08-11',
    period: '2026-01-05', sessions: 60, sets: 900, volume: 540000,
    weeks: Array.from({ length: 8 }, (_, i) => ({
      week: '2026-06-0' + (i + 1), sessions: (i % 3) + 1, sets: 40,
      volume: 20000 + i * 1000, change: 5 })),
    lifetime: { sessions: 120, sets: 1800, volume: 1080000, weeks: 30,
                from: '2025-01-06', to: '2026-08-11' },
    exercises
  };
}

(async () => {
  const src = fs.readFileSync(__dirname + '/../src/Index.html', 'utf8');
  const css = src.slice(src.indexOf('<style>'), src.indexOf('</style>') + 8);
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const S = process.env.SCRATCH;
  for (const [perDay, dayCount] of [[8, 3], [12, 4], [20, 5], [34, 6]]) {
    const d = data(perDay, dayCount);
    const doc = '<!doctype html><meta charset="utf-8">' + css +
      '<body><div class="repmodal"><div class="repsheet"><div class="rep">' +
      reportMarkup(d) + '</div></div></div>';
    const f = OUT + 'spill.html';
    fs.writeFileSync(f, doc);
    await page.goto('file://' + f);
    await page.emulateMedia({ media: 'print' });
    await page.pdf({ path: OUT + 'spill.pdf', format: 'letter',
                     printBackground: false });
    // gs refuses to open a file from PostScript under -dSAFER, so count the
    // rendered pages instead.
    execSync('rm -f ' + S + '/sp-*.png; gs -q -dNOPAUSE -dBATCH -sDEVICE=png16m ' +
             '-r70 -sOutputFile=' + S + '/sp-%d.png ' + OUT + 'spill.pdf');
    const pages = execSync('ls ' + S + '/sp-*.png | wc -l').toString().trim();
    if (d.exercises.length > 150) {
      execSync('cp ' + S + '/sp-1.png ' + S + '/big-1.png; cp ' + S +
               '/sp-2.png ' + S + '/big-2.png');
    }
    console.log(d.exercises.length + ' exercises over ' + dayCount +
                ' day types: ' + pages + ' pages');
  }
  await browser.close();
})();
