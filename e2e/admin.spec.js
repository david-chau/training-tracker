// Checks against the admin link.
//
// These WRITE to the real spreadsheet. Two things keep that safe: every test
// works on a date five years out, where nothing real is ever logged, and each
// one deletes the day it created. Set allowWrites false in targets.json (or
// TT_ALLOW_WRITES=false) to skip the lot.

const { test, expect } = require('@playwright/test');
const {
  targets, open, scratchDate, gotoDate, deployedFeature, awaitLoad, awaitIdle,
  awaitAdd, SCRATCH_DAY
} = require('./app');

const T = targets();
const DATE = scratchDate();

// Put an empty session on the scratch date and return once it is ready to add
// to. Both the chooser and the add control are server-rendered, so a click
// that lands mid-load quietly does nothing and the next step then waits out
// its timeout on a control that was never going to appear.
async function startEmpty(app) {
  await gotoDate(app, DATE);
  const addex = app.locator('.addex');
  for (let i = 0; i < 3; i++) {
    if (await addex.isVisible().catch(() => false)) return;
    const empty = app.locator('.choice', { hasText: 'Empty' });
    if (await empty.count()) {
      await empty.click();
      await awaitLoad(app);
    }
    await addex.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => {});
  }
  await addex.waitFor({ state: 'visible', timeout: 20_000 });
}

// Leave nothing behind, whether the test passed or not.
async function wipe(app) {
  // Structural changes are refused while a write is outstanding, so wait for
  // the app to be idle rather than racing its own guard.
  await awaitIdle(app);
  const del = app.locator('#wipe');
  // Hidden when there is no session — which is the normal state after a test
  // that removed everything it created.
  if (!await del.isVisible().catch(() => false)) return;
  app.page().once('dialog', d => d.accept());
  await del.click();
  await awaitLoad(app);
}

test.describe('admin link', () => {
  test.skip(!T.adminUrl, 'no adminUrl — see e2e/targets.example.json');

  test('offers the editing controls a viewer does not', async ({ page }) => {
    const app = await open(page, T.adminUrl);

    await expect(app.locator('.robanner')).toHaveCount(0);
    // Present for an admin; it only becomes visible once there is a session
    // to delete, so this is about the control existing at all.
    await expect(app.locator('#wipe')).toHaveCount(1);
    // Custom is entry-only, so it is offered here and not to a viewer.
    await expect(app.locator('.day', { hasText: SCRATCH_DAY })).toHaveCount(1);
  });

  test('the heading links to the spreadsheet, in a new tab', async ({ page }) => {
    const app = await open(page, T.adminUrl);

    const link = app.locator('h1 a');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.getAttribute('href')).toContain('docs.google.com');
  });

  test('the report draws itself, and is the thing that prints', async ({ page }) => {
    test.skip(!T.allowWrites, 'writes disabled');
    const app = await open(page, T.adminUrl);

    test.skip(!await deployedFeature(app, '#report'),
      'the live app has no report button yet — redeploy Index.html');

    await app.locator('#report').click();
    await expect(app.locator('#reportpanel')).toBeVisible();

    // Blank weeks means the whole log, so this scans every row: slow by
    // nature rather than by accident.
    await app.locator('#reportpanel .go', { hasText: 'Build' }).click();
    const modal = app.locator('.repmodal');
    await expect(modal).toBeVisible({ timeout: 120_000 });

    // The PDF is this page printed — there is no server-side rendering and no
    // export URL to follow, so what is on screen is the whole deliverable.
    await expect(modal.locator('#printreport')).toHaveText('Save as PDF');
    await expect(modal.locator('a[href*="format=pdf"]')).toHaveCount(0);

    test.skip(!await modal.locator('.legend').count(),
      'the live app predates the chart legend — redeploy Index.html');

    await expect(modal.locator('.daycard').first()).toBeVisible();
    await expect(modal.locator('.wkbar').first()).toBeVisible();
    await expect(modal).toContainText(/Height is volume/);
    await expect(modal).toContainText(/Lightest . heaviest set of the period/);

    // Escape is the way out, and it must leave the session behind it intact.
    await page.keyboard.press('Escape');
    await expect(modal).toHaveCount(0);
    await expect(app.locator('#report')).toBeVisible();
  });

  test.describe('on a scratch date', () => {
    test.skip(!T.allowWrites, 'writes disabled');

    test.afterEach(async ({ page }) => {
      const app = await open(page, T.adminUrl);
      await app.locator('.day', { hasText: SCRATCH_DAY }).click();
      await gotoDate(app, DATE);
      await wipe(app);
    });

    test('an empty Custom session accepts an added exercise', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: SCRATCH_DAY }).click();
      await gotoDate(app, DATE);

      // Custom defaults to Empty, so that is the highlighted choice.
      const empty = app.locator('.choice', { hasText: 'Empty' });
      await expect(empty).toBeVisible();
      await empty.click();
      await awaitLoad(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      await panel.locator('input').first().fill('Barbell Bench Press');
      await panel.locator('input').first().dispatchEvent('change');
      await panel.locator('.go').click();
      await awaitLoad(app);
      await app.locator('.panel').waitFor({ state: 'detached', timeout: 90_000 });
      await awaitAdd(app);

      const card = app.locator('.ex', { hasText: 'Barbell Bench Press' });
      await expect(card).toBeVisible();
      await expect(card.locator('.step')).toHaveCount(9);   // 3 sets x 3 fields
    });

    test('the add form switches between reps and seconds', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: SCRATCH_DAY }).click();
      await startEmpty(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      const name = panel.locator('input').first();

      test.skip(!await deployedFeature(app, '.unit'),
        'the live app has no Reps/Seconds toggle yet — redeploy Index.html');

      // A timed exercise pre-picks Seconds from the Exercises tab.
      await name.fill('Plank');
      await name.dispatchEvent('input');
      await expect(panel.locator('.unit button', { hasText: 'Seconds' }))
        .toHaveClass(/on/);
      await expect(panel.locator('.mini label').nth(1)).toHaveText('Seconds');

      // Overriding it wins.
      await panel.locator('.unit button', { hasText: 'Reps' }).click();
      await expect(panel.locator('.mini label').nth(1)).toHaveText('Reps');

      // A weightless exercise drops the weight field entirely.
      await expect(panel.locator('.mini > div').nth(2)).toBeHidden();
    });

    test('an exercise can be renamed from its card', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: SCRATCH_DAY }).click();
      await startEmpty(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      await panel.locator('input').first().fill('Lat Pulldown');
      await panel.locator('input').first().dispatchEvent('change');
      await panel.locator('.go').click();
      await awaitLoad(app);
      await app.locator('.panel').waitFor({ state: 'detached', timeout: 90_000 });
      await awaitAdd(app);

      test.skip(!await deployedFeature(app, '.rename'),
        'the live app has no rename control yet — redeploy Index.html');

      await app.locator('.ex', { hasText: 'Lat Pulldown' })
        .locator('.rename').click();

      const box = app.locator('.namebox input');
      await box.fill('Machine by the window');
      await app.locator('.namebox .go').click();
      await awaitLoad(app);

      await expect(app.locator('.ex', { hasText: 'Machine by the window' }))
        .toBeVisible();
      await expect(app.locator('.ex', { hasText: 'Lat Pulldown' })).toHaveCount(0);
    });

    test('a tapped value reaches the sheet and is read back', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: SCRATCH_DAY }).click();
      await startEmpty(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      await panel.locator('input').first().fill('Barbell Curl');
      await panel.locator('input').first().dispatchEvent('change');
      await panel.locator('.go').click();
      await awaitLoad(app);
      await app.locator('.panel').waitFor({ state: 'detached', timeout: 90_000 });
      await awaitAdd(app);

      const first = app.locator('.ex').first().locator('.set').first();
      const reps = first.locator('.step input').first();
      const before = Number(await reps.inputValue());

      // Three taps in quick succession must collapse into one write, and
      // must not dim the session — entry has to stay instant.
      const plus = first.locator('.step button').nth(1);
      await plus.click();
      await plus.click();
      await plus.click();
      await expect(app.locator('#body')).not.toHaveClass(/busy/);

      await expect(reps).toHaveValue(String(before + 3));

      // The status bar reports what the sheet gave back, not what was typed.
      await expect(app.locator('#barmsg')).toContainText('Saved row', {
        timeout: 45_000
      });
      await expect(app.locator('#barmsg')).toContainText(String(before + 3));
    });

    test('removing the last exercise empties the session', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: SCRATCH_DAY }).click();
      await startEmpty(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      await panel.locator('input').first().fill('Face Pull');
      await panel.locator('input').first().dispatchEvent('change');
      await panel.locator('.mini input').first().fill('1');   // one set
      await panel.locator('.go').click();
      await awaitLoad(app);
      await app.locator('.panel').waitFor({ state: 'detached', timeout: 90_000 });
      await awaitAdd(app);

      const card = app.locator('.ex', { hasText: 'Face Pull' });
      await expect(card).toBeVisible();

      // At one set the − button is the remove control, and says so. That
      // title is how we tell whether the live app can go below one set.
      const minus = card.locator('.cnt button').first();
      test.skip(!/^Remove /.test(await minus.getAttribute('title') || ''),
        'the live app still clamps set count at 1 — redeploy Index.html');

      // Below one set is how an exercise is taken out; it asks first.
      page.once('dialog', d => d.accept());
      await minus.click();
      await awaitLoad(app);

      await expect(app.locator('.ex', { hasText: 'Face Pull' })).toHaveCount(0);
    });

    test('two exercises pair into one superset card and unpair again',
      async ({ page }) => {
        const app = await open(page, T.adminUrl);

        await app.locator('.day', { hasText: SCRATCH_DAY }).click();
        await startEmpty(app);

        for (const name of ['Plank', 'Push-Up']) {
          await app.locator('.addex').click();
          const panel = app.locator('.panel');
          await panel.locator('input').first().fill(name);
          await panel.locator('input').first().dispatchEvent('change');
          await panel.locator('.go').click();
          await panel.waitFor({ state: 'detached', timeout: 90_000 });
          await awaitAdd(app);
        }

        test.skip(!await deployedFeature(app, '.rail'),
          'the live app has no superset pages yet — redeploy Index.html');

        // Two exercises, two pages. Adding leaves you on the one you added,
        // so pairing means going back to the first — its card carries the
        // button, and a card on another page is not clickable.
        await expect(app.locator('.railitem')).toHaveCount(2);
        await expect(app.locator('#pageat')).toHaveText('2 of 2');

        await app.locator('.railitem').first().click();
        await expect(app.locator('.ex').first()).toBeVisible();
        await awaitIdle(app);
        await app.locator('.pair').first().click();
        await awaitLoad(app);

        // One page now, and it renders round by round rather than as two
        // separate lists of sets.
        await expect(app.locator('.railitem')).toHaveCount(1);
        const card = app.locator('.ex.ss');
        await expect(card).toBeVisible();
        await expect(card.locator('.round').first()).toBeVisible();
        await expect(card.locator('.sswho', { hasText: 'Plank' })).toHaveCount(3);

        // Pairing shows the superset card straight away and writes behind it.
        // Unlinking before that write lands is refused — correctly — and the
        // refusal is a dialog, which a test auto-dismisses without seeing.
        await awaitIdle(app);
        await card.locator('.link', { hasText: 'Unlink' }).click();
        await awaitLoad(app);
        await awaitIdle(app);

        await expect(app.locator('.ex.ss')).toHaveCount(0);
        await expect(app.locator('.railitem')).toHaveCount(2);
      });

    test('the pager and the rail move between exercises', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: SCRATCH_DAY }).click();
      await startEmpty(app);

      for (const name of ['Plank', 'Push-Up']) {
        await app.locator('.addex').click();
        const panel = app.locator('.panel');
        await panel.locator('input').first().fill(name);
        await panel.locator('input').first().dispatchEvent('change');
        await panel.locator('.go').click();
        await panel.waitFor({ state: 'detached', timeout: 90_000 });
        await awaitAdd(app);
      }

      test.skip(!await deployedFeature(app, '.pager'),
        'the live app has no pager yet — redeploy Index.html');

      // Adding an exercise leaves you looking at it, which is the last page.
      const cards = app.locator('.ex');
      await expect(app.locator('#pageat')).toHaveText('2 of 2');
      await expect(cards.nth(1)).toBeVisible();
      await expect(cards.nth(0)).toBeHidden();
      await expect(app.locator('#pagefwd')).toBeDisabled();

      // One card on screen at a time, whichever way you move between them.
      await app.locator('#pageback').click();
      await expect(cards.nth(0)).toBeVisible();
      await expect(cards.nth(1)).toBeHidden();
      await expect(app.locator('#pageat')).toHaveText('1 of 2');
      await expect(app.locator('#pageback')).toBeDisabled();

      await app.locator('.railitem').nth(1).click();
      await expect(cards.nth(1)).toBeVisible();
      await expect(app.locator('#pageat')).toHaveText('2 of 2');
    });
  });
});
