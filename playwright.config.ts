import { defineConfig, devices } from '@playwright/test';

/**
 * Uçtan uca (E2E) test yapılandırması — İZOLE TEST YIĞINI.
 *
 * Testler, canlı geliştirme veritabanını ASLA kirletmez: Playwright kendi
 * API sunucusunu (ayrı port + kendi geçici veritabanı) ve kendi arayüz
 * örneğini başlatır. Her çalıştırmada temiz bir veritabanı oluşturulur, bu
 * sayede varsayılan tohum (seed) verisiyle birebir aynı, deterministik bir
 * başlangıç noktası elde edilir.
 *
 * Tarayıcı olarak sistemde kurulu Google Chrome kullanılır (indirme gerekmez).
 */
const CLIENT_PORT = Number(process.env.E2E_CLIENT_PORT || 5174);
const API_PORT = Number(process.env.E2E_API_PORT || 3101);
const CLIENT_URL = `http://127.0.0.1:${CLIENT_PORT}`;
const API_URL = `http://127.0.0.1:${API_PORT}`;
const E2E_DATA_DIR = 'packages/server/.e2e-data';

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'test-results',
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
      // Temiz, izole test veritabanıyla API sunucusu
      command: `rm -rf ${E2E_DATA_DIR} && npm run --workspace=@oto-servis/server e2e:server`,
      url: `${API_URL}/api/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        PORT: String(API_PORT),
        HOST: '127.0.0.1',
        DATA_DIR: '.e2e-data',
        NODE_ENV: 'test',
        // E2E testleri bilinen demo hesapları (admin/kasiyer/usta) ve örnek
        // veriyi bekler. Örnek veri artık açılışta otomatik yüklenmediği için
        // yalnızca test yığınında açıkça etkinleştirilir.
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
