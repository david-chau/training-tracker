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
const START = process.env.START || '2026-02-16';   // a Monday
const UNTIL = process.env.UNTIL || '2026-07-17';   // before the showcase weeks

// Where each lift starts and how it climbs, chosen so the last history
// session lands on the weight the showcase weeks open with — a log that reads
// as someone mid-training rather than someone's first month.
//
// Double progression: hold the weight and add reps, then take the weight up
// and drop back to the base. The app's own rule approximates this a week at a
// time, but it was never meant to run unattended for twenty-two of them —
// doing that produced 51-rep lateral raises off a starting weight of zero.
//
// `every` is how many sessions a weight block lasts.
const LIFTS = {
  'Barbell Bench Press':            { from: 70,   step: 5,   every: 4, reps: 8 },
  'Incline Dumbbell Press':         { from: 17.5, step: 2.5, every: 4, reps: 10 },
  'Seated Dumbbell Shoulder Press': { from: 12.5, step: 2.5, every: 6, reps: 10 },
  'Lateral Raise':                  { from: 5,    step: 2.5, every: 8, reps: 15 },
  'Triceps Rope Pushdown':          { from: 17.5, step: 2.5, every: 6, reps: 12 },
  'Cable Chest Fly':                { from: 25,   step: 5,   every: 6, reps: 12 },
  'Barbell Row':                    { from: 60,   step: 5,   every: 4, reps: 8 },
  'Lat Pulldown':                   { from: 45,   step: 5,   every: 4, reps: 10 },
  'Seated Cable Row':               { from: 40,   step: 5,   every: 4, reps: 10 },
  'Face Pull':                      { from: 20,   step: 2.5, every: 8, reps: 15 },
  'Dumbbell Bicep Curl':            { from: 12.5, step: 2.5, every: 6, reps: 12 },
  'Hammer Curl':                    { from: 12.5, step: 2.5, every: 6, reps: 12 },
  'Back Squat':                     { from: 110,  step: 5,   every: 4, reps: 6 },
  'Romanian Deadlift':              { from: 70,   step: 5,   every: 4, reps: 8 },
  'Leg Press':                      { from: 155,  step: 5,   every: 4, reps: 12 },
  'Bulgarian Split Squat':          { from: 25,   step: 5,   every: 6, reps: 10 },
  'Lying Leg Curl':                 { from: 25,   step: 5,   every: 4, reps: 12 },
  'Standing Calf Raise':            { from: 65,   step: 5,   every: 4, reps: 15 }
};

// The nth session of a day type, for one lift.
function planned(name, nth) {
  const lift = LIFTS[name];
  if (!lift) return null;
  const block = Math.floor(nth / lift.every);
  const into = nth % lift.every;
  return {
    weight: lift.from + block * lift.step,
    reps: lift.reps + 2 * Math.min(into, 2),   // climb, then reset on the bump
    rpe: Math.min(9.5, 7 + into * 0.5)         // and it feels harder each week
  };
}

function plan() {
  const out = [];
  const d = new Date(START + 'T12:00:00Z');
  const end = new Date(UNTIL + 'T12:00:00Z');
  let week = 0;
  const nth = { Push: 0, Pull: 0, Legs: 0 };
  while (d <= end) {
    // Mon/Wed/Fri, with the occasional lighter week — a flat three every week
    // makes the sessions line a straight line, which is not what training is.
    const light = week % 7 === 5;
    const holiday = week % 13 === 11;
    const offsets = holiday ? [] : light ? [0, 3] : [0, 2, 4];
    offsets.forEach(function (off, i) {
      const day = new Date(d.getTime() + off * 86400000);
      if (day > end) return;
      const type = DAYS[(week * 3 + i) % DAYS.length];
      out.push({ date: day.toISOString().slice(0, 10), day: type,
                 nth: nth[type]++ });
    });
    d.setDate(d.getDate() + 7);
    week++;
  }
  return out;
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

    const items = (res.sets || []).map((set) => {
      const want = planned(set.exercise, s.nth);
      return {
        row: set.row, day: s.day, date: s.date, exercise: set.exercise,
        set: set.set,
        reps: want ? want.reps : set.reps,
        weight: want ? want.weight : set.weight,
        rpe: want ? want.rpe : 8
      };
    });
    if (!items.length) { failed++; continue; }

    const out = await app.evaluate(items => new Promise((ok, bad) =>
      google.script.run.withSuccessHandler(ok).withFailureHandler(e => bad(e.message))
        .saveBatch(KEY, items)), items);

    written += out.filter(o => o.ok).length;
    failed += out.filter(o => !o.ok).length;
    if (++n % 10 === 0 || s === sessions[sessions.length - 1]) {
      console.log(s.date + '  ' + s.day + '  rows ' + written +
                  (failed ? '  failed ' + failed : ''));
    }
  }
  console.log('done: ' + written + ' rows written, ' + failed + ' failed');
  await browser.close();
})();
