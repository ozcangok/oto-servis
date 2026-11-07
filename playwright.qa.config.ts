import { defineConfig, devices } from '@playwright/test';

/**
 * QA E2E test configuration — connects to the already-running QA stack
 * (API: http://127.0.0.1:3001, Client: http://127.0.0.1:5173).
 * Does NOT start any servers (webServer is omitted).
 */
const CLIENT_URL = 'http://127.0.0.1:5173';

export default defineConfig({
  testDir: './e2e-qa',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results-qa',
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: CLIENT_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  }
});
