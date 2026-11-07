import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { CORPORATE } from '@oto-servis/shared';
import { getDb, sessions, settings, users } from '../db/index.js';

/**
 * Kurumsal hesaplar.
 *
 * Parolalar yalnızca ilk kurulum/seed ve eski demo hesaplarının güvenli
 * migrasyonu için burada tutulur. Mevcut hedef hesabın parolası ASLA
 * otomatik olarak değiştirilmez; yönetici parolasını yalnızca Ayarlar >
 * Hesap Güvenliği bölümünden, mevcut parolasını doğrulayarak değiştirebilir.
 */
export const CORPORATE_ADMIN = {
  username: 'sezer çınar',
  password: 'sezer34602026',
  full_name: 'Sezer Çınar',
  role: 'owner' as const,
  legacyUsername: 'admin',
  legacyPassword: 'admin123'
};

export const CORPORATE_STAFF = {
  username: 'kullanıcı',
  password: 'servis 2026',
  full_name: 'Servis Personeli',
  role: 'staff' as const,
  legacyUsername: 'kasiyer',
  legacyPassword: 'kasiyer123'
};

const PROFILE_MIGRATION_KEY = 'corporate_profile_v2';
const OLD_SHOP_NAMES = new Set([
  'Örnek Oto Servis & Bakım',
  'GÜVEN OTO',
  'Çınar Otomativ',
  // Bu sürümden önceki kısa kurumsal ad. İlk açılışta resmi ticari unvana
  // yükseltilir; kullanıcı sonradan kendi adını yazarsa bir daha değiştirilmez.
  'Çınar Otomotiv'
]);
const OLD_SHOP_ADDRESSES = new Set([
  'Oto Sanayi Sitesi B Blok No: 12',
  'Sanayi Sitesi, Otomotiv Blokları No: 12, Ümraniye / İstanbul',
  ''
]);
const OLD_SHOP_PHONES = new Set(['0532 000 00 00', '+90 (532) 000 00 00', '']);
const OLD_ADMIN_NAMES = new Set(['Ahmet Usta', 'Ahmet Usta (Yönetici)', 'Yönetici', 'Admin']);
const OLD_STAFF_NAMES = new Set(['Dükkan Elemanı', 'Dükkan Elemanı (Personel)', 'Kasiyer', 'Selin Kasiyer', 'Personel']);

function rawSettings(): Record<string, any> {
  const db = getDb();
  const rows = db.select().from(settings).all();
  const map: Record<string, any> = {};
  for (const row of rows) {
    try {
      map[row.anahtar] = JSON.parse(row.deger);
    } catch {
      map[row.anahtar] = row.deger;
    }
  }
  return map;
}

function writeSetting(key: string, value: any) {
  const db = getDb();
  const now = new Date().toISOString();
  const valStr = JSON.stringify(value);
  const existing = db.select().from(settings).where(eq(settings.anahtar, key)).get();
  if (existing) {
    db.update(settings).set({ deger: valStr, updated_at: now }).where(eq(settings.anahtar, key)).run();
  } else {
    db.insert(settings).values({ anahtar: key, deger: valStr, created_at: now, updated_at: now }).run();
  }
}

async function ensureAccount(spec: typeof CORPORATE_ADMIN | typeof CORPORATE_STAFF): Promise<number | null> {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db.select().from(users).where(eq(users.username, spec.username)).get();
  if (existing) {
    // Mevcut hesabın rolü/aktifliği kullanıcı tarafından yönetilir; açılışta
    // zorla yükseltme, yeniden etkinleştirme veya yetki değişikliği yapılmaz.
    // Yalnızca boş veya bilinen eski/jenerik görünen kurumsal adı tamamla.
    const oldNames = spec.role === 'owner' ? OLD_ADMIN_NAMES : OLD_STAFF_NAMES;
    if (spec.full_name && (!existing.full_name || oldNames.has(existing.full_name))) {
      db.update(users)
        .set({ full_name: spec.full_name, updated_at: now })
        .where(eq(users.id, existing.id))
        .run();
    }
    return existing.id;
  }

  // Eski demo hesabı varsa ve parolası hâlâ bilinen demo parolasıysa,
  // kullanıcıyı silmeden aynı ID üzerinde kurumsal hesaba taşı.
  const legacy = db.select().from(users).where(eq(users.username, spec.legacyUsername)).get();
  if (legacy) {
    const isLegacyPassword = await bcrypt.compare(spec.legacyPassword, legacy.password_hash);
    if (isLegacyPassword) {
      const passwordHash = await bcrypt.hash(spec.password, 10);
      db.update(users)
        .set({
          username: spec.username,
          password_hash: passwordHash,
          full_name: spec.full_name,
          role: spec.role,
          is_active: true,
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: now
        })
        .where(eq(users.id, legacy.id))
        .run();
      return legacy.id;
    }

    console.warn(
      `[CORPORATE] Eski "${spec.legacyUsername}" hesabı korunuyor (parolası değiştirilmiş). ` +
      `Yeni "${spec.username}" hesabı otomatik oluşturulmuyor.`
    );
  }

  // Kullanıcı silinmişse veya özel bir ilk kurulum yapılmışsa arka planda
  // yeni bir yönetici/personel hesabı AÇILMAZ. Bu, gizli bir arka kapı ve
  // istenmeyen yetki devri riskini önler.
  return null;
}

/**
 * Personel hesabında yalnızca bilinen demo/yakın varyant parolaları kurumsal
 * parolaya hizalar. Rastgele seçilmiş bir personel parolasına dokunmaz.
 */
async function alignCorporateStaffPassword(): Promise<void> {
  const db = getDb();
  const staff = db.select().from(users).where(eq(users.username, CORPORATE_STAFF.username)).get();
  if (!staff) return;

  if (await bcrypt.compare(CORPORATE_STAFF.password, staff.password_hash)) return;

  const knownLegacy = [CORPORATE_STAFF.legacyPassword, 'servis2026'];
  for (const candidate of knownLegacy) {
    if (await bcrypt.compare(candidate, staff.password_hash)) {
      const passwordHash = await bcrypt.hash(CORPORATE_STAFF.password, 10);
      db.update(users)
        .set({
          password_hash: passwordHash,
          failed_login_attempts: 0,
          locked_until: null,
          updated_at: new Date().toISOString()
        })
        .where(eq(users.id, staff.id))
        .run();
      // Eski parolayla açık kalmış personel oturumlarını düşür.
      db.delete(sessions).where(eq(sessions.user_id, staff.id)).run();
      console.log('[CORPORATE] Personel parolası tanımlı kurumsal parolaya hizalandı.');
      return;
    }
  }
}

/**
 * Sunucu açılışında bir kez çalışır; idempotenttir.
 *
 * - Hiç kullanıcı yoksa ilk kurulum ekranını bozmamak için hesaplara dokunmaz.
 * - Eski demo hesaplarını (admin/kasiyer) aynı ID üzerinde kurumsal hesaplara taşır.
 * - Silinmiş veya özel olarak oluşturulmuş hesapların yerine arka planda yeni
 *   hesap açmaz.
 * - Resmi kurumsal ayar varsayılanlarını yalnızca boş/eski varsayılan değerlerde tamamlar.
 */
export async function ensureCorporateBootstrap(): Promise<void> {
  const db = getDb();
  const anyUser = db.select({ id: users.id }).from(users).limit(1).get();
  if (!anyUser) return;

  await ensureAccount(CORPORATE_ADMIN);
  await ensureAccount(CORPORATE_STAFF);
  await alignCorporateStaffPassword();

  const current = rawSettings();
  const profileMigrated = current[PROFILE_MIGRATION_KEY] === true;

  const corporateDefaults: Record<string, any> = {
    shop_name: CORPORATE.legalName,
    shop_phone: CORPORATE.phone,
    shop_address: CORPORATE.address,
    shop_email: CORPORATE.email,
    shop_owner: CORPORATE.owner,
    working_hours: CORPORATE.workingHours,
    shop_tax_office: CORPORATE.taxOffice,
    shop_tax_number: CORPORATE.taxNumber,
    theme: 'dark'
  };

  for (const [key, value] of Object.entries(corporateDefaults)) {
    const existing = current[key];
    const isLegacy =
      (key === 'shop_name' && OLD_SHOP_NAMES.has(String(existing))) ||
      (key === 'shop_address' && OLD_SHOP_ADDRESSES.has(String(existing))) ||
      (key === 'shop_phone' && OLD_SHOP_PHONES.has(String(existing))) ||
      (key === 'theme' && String(existing) === 'light');

    // Bir kez çalışan profil migrasyonu eski kurumsal değerleri düzeltir.
    // Sonraki açılışlarda kullanıcının kaydettiği özel değerler korunur.
    const shouldWrite =
      existing === undefined ||
      existing === null ||
      existing === '' ||
      (!profileMigrated && isLegacy);

    if (shouldWrite) writeSetting(key, value);
  }

  // Eski kurulumlarda KDV/peşin iskontosu 0 bırakılmış olabilir. Resmi
  // belgelerde %20 KDV varsayılanı istenir; yalnızca ilk migrasyonda 0
  // değerini düzelt. Kullanıcı sonradan 0 seçerse bu tercih korunur.
  if (!profileMigrated) {
    if (current.default_kdv_rate === 0 || current.default_kdv_rate === undefined) {
      writeSetting('default_kdv_rate', 20);
    }
    if (current.default_cash_discount_rate === 0 || current.default_cash_discount_rate === undefined) {
      writeSetting('default_cash_discount_rate', 5);
    }
    writeSetting(PROFILE_MIGRATION_KEY, true);
  }

  console.log('[CORPORATE] Kurumsal kimlik, hesaplar ve ayar varsayılanları hazır.');
}
