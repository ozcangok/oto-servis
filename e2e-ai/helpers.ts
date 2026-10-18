import fs from 'node:fs';
import path from 'node:path';

/**
 * AI (Midscene) E2E test yardımcıları.
 *
 * Bu paket OPT-IN'dir: `npm run test:ai` ile ayrı bir Playwright yapılandırması
 * (playwright.ai.config.ts) üzerinden çalışır. Varsayılan `npm run test:e2e`
 * paketine ve commit öncesi doğrulama kapısına (pre-commit) DAHİL DEĞİLDİR —
 * çünkü Midscene görsel bir model (API anahtarı + ağ) gerektirir ve olasılıksal
 * olduğundan deterministik test kapısını bloklamamalıdır.
 */

/**
 * Midscene model anahtarını kök `.env` / `.env.local` dosyasından yükler.
 *
 * Yalnızca `MIDSCENE_*` anahtarları okunur; uygulamanın diğer ortam değişkenleri
 * (PORT, NODE_ENV, ...) kasıtlı olarak test sürecine taşınmaz. Test yığını kendi
 * port/servis değişkenlerini yapılandırma dosyasında açıkça verir.
 */
function loadMidsceneEnv(): void {
  for (const name of ['.env', '.env.local']) {
    const file = path.resolve(process.cwd(), name);
    let text: string;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*(?:export\s+)?(MIDSCENE_[A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!m) continue;
      const key = m[1];
      if (process.env[key] !== undefined) continue;
      let val = m[2].trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

loadMidsceneEnv();

/**
 * Model yapılandırıldı mı? Anahtar yoksa AI testleri `test.skip` ile temiz
 * biçimde atlanır (ajan hiç kurulmaz, ağ/model çağrısı yapılmaz).
 */
export const MIDSCENE_READY = Boolean(
  process.env.MIDSCENE_MODEL_API_KEY || process.env.OPENAI_API_KEY
);

export const SKIP_REASON =
  'AI testi atlandı: Midscene model anahtarı yok. Kök .env dosyasına ' +
  'MIDSCENE_MODEL_API_KEY (isteğe bağlı: MIDSCENE_MODEL_BASE_URL / _NAME / _FAMILY) ' +
  'ekleyin veya ortam değişkeni olarak dışa aktarın.';

// Deterministik yardımcılar aynen yeniden kullanılır (tekrar yazılmaz).
export {
  API_URL,
  OWNER,
  STAFF,
  login,
  logout,
  skipSplash,
  apiLogin,
  apiJson,
  createCustomer,
  createVehicle,
  createWorkOrder,
  createExpense,
  createPart,
  uniqPlate,
  uniqPhone,
  uniqKod,
  todayOnly,
  dateOnly,
  isoAtNoon,
  pad2
} from '../e2e/helpers.js';
