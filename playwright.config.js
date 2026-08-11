// @ts-check
const { defineConfig } = require('@playwright/test');

// These run against a real deployed web app over the network, not a local
// server — there is nothing to build or serve. So: generous timeouts, retries
// for Google's occasional slow cold start, and one worker, because the admin
// tests write to a single shared spreadsheet.
module.exports = defineConfig({
  testDir: './e2e',
  // Verifies the demo log has data and rebuilds it if not.
  globalSetup: require.resolve('./e2e/global-setup.js'),
  // The seeder and the checker are drivers, not specs.
  testIgnore: ['**/seed-demo.js', '**/global-setup.js', '**/app.js'],
  timeout: 180_000,   // live app, many round trips per test
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    // Chromium with a tablet-sized, touch-enabled viewport rather than a
    // WebKit device preset. devices['iPad …'] implies defaultBrowserType
    // 'webkit', which CI does not install — it installs chromium only — so the
    // preset would have failed there for a reason that looks like a timeout.
    browserName: 'chromium',
    viewport: { width: 1024, height: 1180 },
    hasTouch: true,
    isMobile: false,          // chromium's isMobile forbids some interactions
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
