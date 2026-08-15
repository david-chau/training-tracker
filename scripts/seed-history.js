// Fills the demo log with history, so the report has something to be a report
// about — the monthly rollup needs more than half a year of it.
//
// Goes through the app's own bridge rather than the Sheets API: loadSession
// with create builds each session the way the app would (from the previous
// one of that day type, progressed), and saveBatch writes what was "done".
// Oldest first, so each week is built on the one before it.
const { chromium } = require('@playwright/test');
const { targets, open } = require('../e2e/app.js');

const DAYS = ['Push', 'Pull', 'Legs'];
const START = process.env.START || '2025-11-03';   // a Monday
const UNTIL = process.env.UNTIL || '2026-07-17';   // before the log's own data

function plan() {
  const out = [];
  const d = new Date(START + 'T12:00:00Z');
  const end = new Date(UNTIL + 'T12:00:00Z');
  let week = 0;
  while (d <= end) {
    // Mon/Wed/Fri, with the occasional lighter week — a flat three every week
    // makes the sessions line a straight line, which is not what training is.
    const light = week % 7 === 5;
    const holiday = week % 13 === 11;
    const offsets = holiday ? [] : light ? [0, 3] : [0, 2, 4];
    offsets.forEach(function (off, i) {
      const day = new Date(d.getTime() + off * 86400000);
      if (day > end) return;
      out.push({ date: day.toISOString().slice(0, 10),
                 day: DAYS[(week * 3 + i) % DAYS.length] });
    });
    d.setDate(d.getDate() + 7);
    week++;
  }
  return out;
}

// Mostly 7-8 (keep the weight, add reps), sometimes 9 (repeat), rarely 6 (a
// jump) or 10 (back off). Deterministic, so a re-run is the same log.
function rpeFor(n) {
  const r = [8, 7, 8, 9, 8, 6, 8, 7, 9, 8, 8, 10, 7, 8][n % 14];
  return r;
}

(async () => {
  const T = targets();
  if (!T.allowWrites) throw new Error('writes are disabled in e2e/targets.json');
  const sessions = plan();
  console.log(sessions.length + ' sessions from ' + sessions[0].date +
              ' to ' + sessions[sessions.length - 1].date);
  if (process.env.DRY) {
    const byWeek = {};
    sessions.forEach(s => { byWeek[s.date.slice(0, 7)] = (byWeek[s.date.slice(0, 7)] || 0) + 1; });
    console.log('per month:', JSON.stringify(byWeek));
    return;
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  const app = await open(page, T.adminUrl);

  let n = 0, written = 0, failed = 0;
  for (const s of sessions) {
    const res = await app.evaluate(([day, date]) => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))
        .loadSession(day, date, true, KEY, 'auto')), [s.day, s.date]);

    const items = (res.sets || []).map((set, i) => ({
      row: set.row, day: s.day, date: s.date, exercise: set.exercise,
      set: set.set, reps: set.reps, weight: set.weight, rpe: rpeFor(n + i)
    }));
    if (!items.length) { failed++; continue; }

    const out = await app.evaluate(items => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))
        .saveBatch(KEY, items)), items);

    written += out.filter(o => o.ok).length;
    failed += out.filter(o => !o.ok).length;
    n += items.length;
    if (++n % 10 === 0 || s === sessions[sessions.length - 1]) {
      console.log(s.date + '  ' + s.day + '  rows ' + written +
                  (failed ? '  failed ' + failed : ''));
    }
  }
  console.log('done: ' + written + ' rows written, ' + failed + ' failed');
  await browser.close();
})();
