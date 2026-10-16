import { buildApp } from './app.js';
import { initDatabase } from './db/index.js';
import { initPlatformDb, migrateLegacySessions } from './db/platform.js';
import path from 'path';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const dbPath = path.join(dataDir, 'oto-servis.sqlite');

  console.log(`[DATABASE] SQLite başlatılıyor: ${dbPath}`);
  const { sqlite } = initDatabase({ dbPath });

  try {
    initPlatformDb();
    const moved = migrateLegacySessions(sqlite);
    if (moved > 0) {
      console.log(`[AUTH] ${moved} mevcut oturum platform veritabanına taşındı.`);
    }
  } catch (err) {
    console.error('[PLATFORM DB ERROR]', err);
  }

  const { seedDatabase } = await import('./db/seed.js');
  try {
    await seedDatabase();
  } catch (err) {
    console.error('[SEED ERROR]', err);
  }

  const app = await buildApp();

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
