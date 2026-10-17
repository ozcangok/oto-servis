import { defineConfig, devices } from '@playwright/test';

/**
 * Uçtan uca (E2E) test yapılandırması.
 *
 * - Sistemde kurulu Google Chrome kullanılır (ayrıca tarayıcı indirmeye gerek yok).
 * - Zaten çalışan geliştirme sunucuları (API 3001 + istemci 5173) yeniden kullanılır;
 *   çalışmıyorlarsa otomatik başlatılır.
 */
const CLIENT_URL = process.env.E2E_BASE_URL || 'http://127.0.0.1:5173';
const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:3001';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    ...devices['Desktop Chrome'],
    channel: 'chrome',
    baseURL: CLIENT_URL,
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure'
  },
  webServer: [
    {
      command: 'npm run dev --workspace=@oto-servis/server',
      url: `${API_URL}/api/health`,
      reuseExistingServer: true,
      timeout: 120_000
    },
    {
      command: 'npm run dev --workspace=@oto-servis/client',
      url: CLIENT_URL,
      reuseExistingServer: true,
      timeout: 120_000
    }
  ]
});
