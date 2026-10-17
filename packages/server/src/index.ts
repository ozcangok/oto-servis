import { buildApp } from './app.js';
import { initDatabase, closeDatabase } from './db/index.js';
import path from 'path';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

// NAZİK KAPANIŞ: masaüstü (Electron) uygulaması kapanırken sunucuyu SIGTERM ile
// durdurur. WAL'in ana dosyaya işlenmesi için bağlantı düzgünce kapatılır;
// böylece zorunlu yedek tek dosyayla eksiksiz alınır.
const shutdown = () => {
  try {
    closeDatabase();
  } catch (err) {
    console.error('[SHUTDOWN ERROR]', err);
  }
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

async function main() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'oto-servis.sqlite');

  console.log(`[DATABASE] SQLite başlatılıyor: ${dbPath}`);
  initDatabase({ dbPath });

  // Örnek/demo veri artık açılışta OTOMATİK yüklenmez. Taze bir veritabanında hiç
  // kullanıcı olmadığı için uygulama doğrudan "İlk Kurulum & Yönetici Şifresi"
  // ekranına düşer (bkz. GET /api/auth/setup-status) ve dükkan sahibi kendi
  // hesabını/şifresini oluşturur. Örnek veri yalnızca açıkça istenirse yüklenir:
  //   - E2E testleri : OTO_SEED_SAMPLE=1 (playwright webServer env)
  //   - Elle         : npm run --workspace=@oto-servis/server db:seed
  //   - Panelden     : POST /api/admin/seed (yalnızca dükkan sahibi)
  if (process.env.OTO_SEED_SAMPLE === '1') {
    const { seedDatabase } = await import('./db/seed.js');
    try {
      await seedDatabase();
    } catch (err) {
      console.error('[SEED ERROR]', err);
    }
  }

  // Test ortamında (E2E) hız sınırı kapatılır; canlı/geliştirme ortamında açık kalır.
  const app = await buildApp({ enableRateLimit: process.env.NODE_ENV !== 'test' });

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`[SERVER] Oto Servis API sunucusu çalışıyor: http://${HOST}:${PORT}`);
    console.log(`[API DOCS] Swagger dokümanı: http://${HOST}:${PORT}/api/docs`);
  } catch (err) {
    console.error('[SERVER ERROR]', err);
    process.exit(1);
  }
}

main();
