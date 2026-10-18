import { defineConfig, devices } from '@playwright/test';

/**
 * AI (Midscene) E2E yapılandırması — OPT-IN.
 *
 * `npm run test:ai` ile çalışır ve varsayılan `npm run test:e2e` ile commit
 * öncesi doğrulama kapısından (pre-commit) AYRIDIR. Çünkü Midscene görsel bir
 * model (API anahtarı + ağ) gerektirir ve olasılıksal olduğundan deterministik
 * kapıyı bloklamamalıdır.
 *
 * İzole test yığını: kendi API sunucusu + kendi veritabanı + kendi arayüz
 * örneği. Portlar, çalışan `test:e2e` yığınıyla (5174/3101) ÇAKIŞMAYACAK şekilde
 * ayrılmıştır. Model anahtarı yoksa testler `test.skip` ile temiz biçimde atlanır.
 */
const CLIENT_PORT = Number(process.env.E2E_AI_CLIENT_PORT || 5274);
const API_PORT = Number(process.env.E2E_AI_API_PORT || 3201);
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const E2E_DATA_DIR = 'packages/server/.e2e-ai-data';

// e2e-ai/helpers.ts içindeki API_URL bu değişkenden okunur. Yapılandırma
// dosyası test dosyalarından ÖNCE yüklendiği için burada ayarlamak yeterlidir.
process.env.E2E_API_URL = API_URL;

export default defineConfig({
  testDir: './e2e-ai',
  // AI ajanları yavaştır (her adım model çağrısı); cömert zaman aşımı.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  // Model çağrıları ve tek veritabanı nedeniyle sıralı çalıştır.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [
    ['list'],
    // Midscene birleşik HTML raporu: midscene_run/report/... (bkz. .gitignore)
    ['@midscene/web/playwright-reporter', { type: 'merged' }]
  ],
  outputDir: 'test-results-ai',
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
      // Temiz, izole AI test veritabanıyla API sunucusu
      command: `rm -rf ${E2E_DATA_DIR} && npm run --workspace=@oto-servis/server e2e:server`,
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        DATA_DIR: '.e2e-ai-data',
        NODE_ENV: 'test',
        OTO_SEED_SAMPLE: '1'
      }
    },
    {
      // İzole API'ye proxy'leyen arayüz (Vite) örneği
      command: 'npm run --workspace=@oto-servis/client dev',
      url: CLIENT_URL,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        CLIENT_PORT: String(CLIENT_PORT),
        API_PROXY_TARGET: API_URL
      }
    }
  ]
});
