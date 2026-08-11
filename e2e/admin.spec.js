// Checks against the admin link.
//
// These WRITE to the real spreadsheet. Two things keep that safe: every test
// works on a date five years out, where nothing real is ever logged, and each
// one deletes the day it created. Set allowWrites false in targets.json (or
// TT_ALLOW_WRITES=false) to skip the lot.

const { test, expect } = require('@playwright/test');
const {
  targets, open, scratchDate, gotoDate, deployedFeature, awaitLoad, awaitQueue
} = require('./app');

const T = targets();
const DATE = scratchDate();

// Leave nothing behind, whether the test passed or not.
async function wipe(app) {
  // Structural changes are refused while writes are outstanding, so drain
  // first rather than racing the app's own guard.
  await awaitQueue(app);
  const del = app.locator('#wipe');
  if (!await del.count()) return;
  app.page().once('dialog', d => d.accept());
  await del.click();
  await awaitLoad(app);
}

test.describe('admin link', () => {
  test.skip(!T.adminUrl, 'no adminUrl — see e2e/targets.example.json');

  test('offers the editing controls a viewer does not', async ({ page }) => {
    const app = await open(page, T.adminUrl);

    await expect(app.locator('.ro')).toHaveCount(0);
    await expect(app.locator('#tools')).toBeVisible();
    // Custom is entry-only, so it is offered here and not to a viewer.
    await expect(app.locator('.day', { hasText: 'Custom' })).toHaveCount(1);
  });

  test('the heading links to the spreadsheet, in a new tab', async ({ page }) => {
    const app = await open(page, T.adminUrl);

    const link = app.locator('h1 a');
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('target', '_blank');
    expect(await link.getAttribute('href')).toContain('docs.google.com');
  });

  test.describe('on a scratch date', () => {
    test.skip(!T.allowWrites, 'writes disabled');

    test.afterEach(async ({ page }) => {
      const app = await open(page, T.adminUrl);
      await app.locator('.day', { hasText: 'Custom' }).click();
      await gotoDate(app, DATE);
      await wipe(app);
    });

    test('an empty Custom session accepts an added exercise', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: 'Custom' }).click();
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

      const card = app.locator('.ex', { hasText: 'Barbell Bench Press' });
      await expect(card).toBeVisible();
      await expect(card.locator('.step')).toHaveCount(9);   // 3 sets x 3 fields
    });

    test('the add form switches between reps and seconds', async ({ page }) => {
      const app = await open(page, T.adminUrl);

      await app.locator('.day', { hasText: 'Custom' }).click();
      await gotoDate(app, DATE);
      await app.locator('.choice', { hasText: 'Empty' }).click();
      await awaitLoad(app);

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

      await app.locator('.day', { hasText: 'Custom' }).click();
      await gotoDate(app, DATE);
      await app.locator('.choice', { hasText: 'Empty' }).click();
      await awaitLoad(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      await panel.locator('input').first().fill('Lat Pulldown');
      await panel.locator('input').first().dispatchEvent('change');
      await panel.locator('.go').click();
      await awaitLoad(app);
      await app.locator('.panel').waitFor({ state: 'detached', timeout: 90_000 });

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

      await app.locator('.day', { hasText: 'Custom' }).click();
      await gotoDate(app, DATE);
      await app.locator('.choice', { hasText: 'Empty' }).click();
      await awaitLoad(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      await panel.locator('input').first().fill('Barbell Curl');
      await panel.locator('input').first().dispatchEvent('change');
      await panel.locator('.go').click();
      await awaitLoad(app);
      await app.locator('.panel').waitFor({ state: 'detached', timeout: 90_000 });

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

      await app.locator('.day', { hasText: 'Custom' }).click();
      await gotoDate(app, DATE);
      await app.locator('.choice', { hasText: 'Empty' }).click();
      await awaitLoad(app);

      await app.locator('.addex').click();
      const panel = app.locator('.panel');
      await panel.locator('input').first().fill('Face Pull');
      await panel.locator('input').first().dispatchEvent('change');
      await panel.locator('.mini input').first().fill('1');   // one set
      await panel.locator('.go').click();
      await awaitLoad(app);
      await app.locator('.panel').waitFor({ state: 'detached', timeout: 90_000 });

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
  });
});
