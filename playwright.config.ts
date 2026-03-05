import { defineConfig } from '@playwright/test';

/**
 * Playwright E2E configuration for the Schaaq Scanner Electron app.
 *
 * The tests launch the built Electron app (dist-electron/main.js) directly.
 * Run `npm run build:full` before executing tests so that the compiled
 * server, UI, and Electron main process are all present.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'tests/e2e/results',

  timeout: 60_000,
  expect: { timeout: 15_000 },

  // No web server — the Electron app starts its own Express server internally
  fullyParallel: false,
  workers: 1, // Electron tests must run serially (one app instance)

  retries: 0,

  use: {
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },

  reporter: [
    ['list'],
    ['html', { outputFolder: 'tests/e2e/html-report', open: 'never' }],
  ],
});
