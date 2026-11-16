import { defineConfig, devices } from '@playwright/test';

/**
 * Browser tests for the flows that matter.
 *
 * They run against a real server with the demonstration data seeded, because
 * the point is to exercise the actual database path end to end — not a mock.
 *
 *   npm run demo:seed
 *   npx playwright install chromium   # first run only
 *   npm run test:e2e
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : [['list'], ['html', { open: 'never' }]],

  timeout: 60_000,
  expect: { timeout: 15_000 },

  use: {
    baseURL: process.env.BINMAP_E2E_URL ?? 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'uz-UZ',
  },

  projects: [
    // Signs in once per role and saves the session, so the suite does not
    // trip the sign-in rate limit on repeated runs.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'desktop',
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'] },
    },
  ],

  // Reuse a server that is already up; start one otherwise.
  webServer: process.env.BINMAP_E2E_URL
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 180_000,
      },
});
