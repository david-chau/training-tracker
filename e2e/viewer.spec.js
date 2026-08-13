// Read-only checks against the viewer link. These never write anything, so
// they are safe to run against a live log.

const { test, expect } = require('@playwright/test');
const {
  targets, open, openSession, settled, navReady, SCRATCH_DAY
} = require('./app');

const T = targets();

test.describe('viewer link', () => {
  test.skip(!T.viewerUrl, 'no viewerUrl — see e2e/targets.example.json');

  test('loads and says it is read only', async ({ page }) => {
    const app = await open(page, T.viewerUrl);

    await expect(app.locator('.ro')).toContainText('Read only');
    await expect(app.locator('h1')).not.toBeEmpty();
    // Uppercased by CSS, so the DOM text is still sentence case.
    await expect(app.locator('.kicker')).toHaveText('Training log');
  });

  test('offers no way to change anything', async ({ page }) => {
    const app = await open(page, T.viewerUrl);

    // Read-only is enforced server-side; this is about not offering controls
    // that would fail. The steppers, the counter, Delete this session and
    // Add exercise are all admin-only.
    await expect(app.locator('.step')).toHaveCount(0);
    await expect(app.locator('.cnt')).toHaveCount(0);
    await expect(app.locator('.addex')).toHaveCount(0);
    await expect(app.locator('.rename')).toHaveCount(0);
    await expect(app.locator('#tools')).toBeHidden();
  });

  test('every day type it offers leads to a real session', async ({ page }) => {
    const first = await open(page, T.viewerUrl);

    const names = await first.locator('.day').allTextContents();
    if (!names.length) {
      await expect(first.locator('#body')).toContainText('Nothing has been logged');
      return;
    }

    // The rule is "day types that have sessions", not "day types from the
    // Templates tab" — Custom qualifies once something is logged against it.
    // The property worth holding is that no button is a dead end.
    //
    // Each day gets a fresh load: hunting for a session moves the date and
    // costs round trips, and carrying that state into the next day made this
    // flaky rather than wrong.
    let checked = 0;
    for (let i = 0; i < names.length; i++) {
      // The admin specs add and delete sessions under this day type, so its
      // contents are in flux while the suite runs. The property being guarded
      // — a Templates-only day type must not be offered read-only — is
      // covered by the others.
      if (names[i] === SCRATCH_DAY) continue;

      const app = await open(page, T.viewerUrl);
      expect(await openSession(app, i), `${names[i]} led nowhere`).toBe(true);
      checked++;
    }
    expect(checked, 'nothing was actually checked').toBeGreaterThan(0);
  });

  test('a logged day shows sets, and every reading has a unit label', async ({ page }) => {
    const app = await open(page, T.viewerUrl);
    test.skip(!await openSession(app), 'the demo log has no sessions');

    const cards = app.locator('.ex');
    await expect(cards.first()).toBeVisible();

    // Values render as plain boxes rather than steppers.
    await expect(cards.first().locator('.val').first()).toBeVisible();

    const labels = await cards.first().locator('.fld label').allTextContents();
    expect(labels.length).toBeGreaterThan(0);
    // Reps or Seconds depending on the exercise — never both, never neither.
    expect(labels.some(l => /^(Reps|Seconds)$/.test(l))).toBe(true);
    expect(labels).toContain('RPE');
  });

  test('the heading does not link to the spreadsheet', async ({ page }) => {
    const app = await open(page, T.viewerUrl);

    // A viewer has no access to the sheet, so the link would only ever land
    // them on a request-access page.
    await expect(app.locator('h1 a')).toHaveCount(0);
  });

  test('session navigation steps back to an earlier session', async ({ page }) => {
    const app = await open(page, T.viewerUrl);
    test.skip(!await openSession(app), 'the demo log has no sessions');

    const back = app.locator('#prevsess');
    test.skip(!await navReady(app, back), 'only one session for this day type');

    const before = await app.locator('#date').inputValue();
    await back.click();
    await settled(app);

    const after = await app.locator('#date').inputValue();
    expect(after < before).toBe(true);                        // back in time
    await expect(app.locator('.ex').first()).toBeVisible();   // onto a session
  });
});
