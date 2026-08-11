// @ts-check
const { defineConfig, devices } = require('@playwright/test');

// These run against a real deployed web app over the network, not a local
// server — there is nothing to build or serve. So: generous timeouts, retries
// for Google's occasional slow cold start, and one worker, because the admin
// tests write to a single shared spreadsheet.
module.exports = defineConfig({
  testDir: './e2e',
  timeout: 180_000,   // live app, many round trips per test
  expect: { timeout: 20_000 },
  retries: process.env.CI ? 2 : 1,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    ...devices['iPad (gen 7) landscape'],   // the app is tablet-first
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
