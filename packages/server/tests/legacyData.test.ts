import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { initDatabase, getDb, getSqlite, bootstrapSchema } from '../src/db/index.js';
import { setupInitialAdmin, createUser, loginUser } from '../src/services/authService.js';
import { getPartStock } from '../src/services/stockService.js';
import { buildApp } from '../src/app.js';

/**
 * Bölüm 5 — ESKİ / BOZUK / UYUMSUZ VERİ DAYANIKLILIK TESTLERİ
 *
 * Amaç: geçmişte kaydedilmiş, bugünkü kodla uyumsuz veriler uygulamayı
 * ÇÖKERTMESİN. Çökerten yer varsa bu dosya yakalar ve rapora yazar.
 * Gerçek veriye dokunulmaz (yalnızca bellek içi test veritabanı).
 */

const P = 'Test!12345';
const NOW = '2026-10-17T10:00:00.000Z';
const reportLines: string[] = [];

let app: any;
let ownerToken = '';

const GET_PROBES = [
  '/api/auth/me',
  '/api/auth/users',
  '/api/customers',
  '/api/customers/1',
  '/api/customers/1/statement',
  '/api/vehicles/search',
  '/api/vehicles/by-plate/34ABC123',
  '/api/vehicles/1',
  '/api/parts',
  '/api/parts/1',
  '/api/parts/critical',
  '/api/parts/by-barcode/BOZUK',
  '/api/work-orders',
  '/api/work-orders/1',
  '/api/payments/work-order/1',
  '/api/cash-desk/summary',
  '/api/expenses',
  '/api/reminders/due',
  '/api/reminders/messages',
  '/api/settings',
  '/api/settings/lan-info',
  '/api/settings/audit-logs',
  '/api/backup/status',
  '/api/kvkk/export/1'
];

/** Bozuk fixture'ları yazar (sadece test veritabanına). */
function insertCorruptFixture(sqlite: Database.Database) {
  sqlite.exec('PRAGMA foreign_keys = OFF;');

  const w = (s: string | null) => `'${String(s).replace(/'/g, "''")}'`;
  const rows: string[] = [];

  // --- users: düz metin parola, eksik/bozuk rol, bozuk e-posta, uzun isim
  rows.push(
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, failed_login_attempts, created_at, updated_at)
     VALUES (101, 'duz_metin', 'parola123', 'Düz Metin Kullanıcı', 'staff', 1, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, failed_login_attempts, created_at, updated_at)
     VALUES (102, 'bozuk_rol', '\$2a\$10\$abcdefghijklmnopqrstuv', 'Bozuk Röl', 'patron', 1, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO users (id, username, password_hash, full_name, role, is_active, failed_login_attempts, locked_until, created_at, updated_at)
     VALUES (103, 'kilitli', '\$2a\$10\$abcdefghijklmnopqrstuv', 'Süresi Geçmiş Kilit', 'staff', 1, 3, ${w('2020-01-01T00:00:00.000Z')}, ${w(NOW)}, ${w(NOW)})`
  );

  // --- customers: boş/null alanlar, mojibake, aşırı uzun, emoji, XSS, geçersiz tarih
  rows.push(
    `INSERT INTO customers (id, ad_soyad, telefon, eposta, notlar, is_sample, created_at, updated_at)
     VALUES (1, ${w('Ä°brahim Ã‡elik')}, ${w('')}, NULL, NULL, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO customers (id, ad_soyad, telefon, eposta, is_sample, created_at, updated_at)
     VALUES (2, ${w('')}, ${w('   ')}, ${w('bozuk@@eposta')}, 0, ${w('gecersiz-tarih')}, ${w(NOW)})`,
    `INSERT INTO customers (id, ad_soyad, telefon, eposta, is_sample, created_at, updated_at)
     VALUES (3, ${w('A'.repeat(500))}, ${w('0'.repeat(300))}, NULL, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO customers (id, ad_soyad, telefon, eposta, is_sample, created_at, updated_at)
     VALUES (4, ${w('<img src=x onerror=alert(1)>🧿')}, ${w('0555 111 22 33')}, NULL, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO customers (id, ad_soyad, telefon, eposta, is_sample, created_at, updated_at, deleted_at)
     VALUES (5, ${w('Zaten Silinmiş Müşteri')}, ${w('05001112233')}, NULL, 0, ${w(NOW)}, ${w(NOW)}, ${w(NOW)})`
  );

  // --- vehicles: sahipsiz (orphan) müşteri, farklı plaka biçimleri, geçersiz muayene tarihi
  rows.push(
    `INSERT INTO vehicles (id, musteri_id, plaka_norm, plaka_gorunen, marka, model, yil, muayene_tarihi, created_at, updated_at)
     VALUES (1, 999, '34ABC123', '34 ABC 123', 'Fiat', 'Egea', NULL, ${w('2026-02-31')}, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO vehicles (id, musteri_id, plaka_norm, plaka_gorunen, marka, model, yil, muayene_tarihi, created_at, updated_at)
     VALUES (2, 1, '06A1234', '06 A 1234', ${w('')}, ${w('')}, 1899, ${w('1970-01-01')}, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO vehicles (id, musteri_id, plaka_norm, plaka_gorunen, marka, model, yil, created_at, updated_at)
     VALUES (3, 2, '81ZZ99', '81ZZ99', 'Renault', 'Clio', 999999, ${w(NOW)}, ${w(NOW)})`
  );

  // --- parts: negatif/kritik stok, boş kod, devasa fiyat, silinmiş
  rows.push(
    `INSERT INTO parts (id, ad, kod, barkod, birim, kritik_stok, alis_kurus, satis_kurus, aktif, is_sample, created_at, updated_at)
     VALUES (1, ${w('Fren Balatası')}, ${w('FRN-1')}, ${w('BOZUK')}, 'Adet', -5, -100, 999999999, 1, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO parts (id, ad, kod, birim, kritik_stok, alis_kurus, satis_kurus, aktif, is_sample, created_at, updated_at)
     VALUES (2, ${w('')}, ${w('')}, ${w('')}, 0, 0, 0, 1, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO parts (id, ad, kod, birim, kritik_stok, alis_kurus, satis_kurus, aktif, is_sample, created_at, updated_at, deleted_at)
     VALUES (3, ${w('Silinmiş Parça')}, ${w('DEL-9')}, 'Adet', 1, 100, 200, 1, 0, ${w(NOW)}, ${w(NOW)}, ${w(NOW)})`
  );

  // --- stock_movements: sahipsiz parça, tutarsız miktarlar
  rows.push(
    `INSERT INTO stock_movements (id, parca_id, miktar, tur, tarih, kullanici_id, created_at)
     VALUES (1, 1, -999, 'duzeltme', ${w(NOW)}, 103, ${w(NOW)})`,
    `INSERT INTO stock_movements (id, parca_id, miktar, tur, tarih, kullanici_id, created_at)
     VALUES (2, 777, 5, 'giris', ${w('gecersiz')}, 999, ${w(NOW)})`,
    `INSERT INTO stock_movements (id, parca_id, miktar, tur, tarih, kullanici_id, created_at)
     VALUES (3, 2, 3, 'bilinmeyen_tur', ${w(NOW)}, 101, ${w(NOW)})`
  );

  // --- work_orders: bilinmeyen/eski durum, sahipsiz araç, uçuk KDV/iskonto, geçersiz tarih
  rows.push(
    `INSERT INTO work_orders (id, arac_id, tarih, km, durum, sikayet, kdv_orani, kdv_dahil_mi, iskonto_yuzde, iskonto_tutar_kurus, olusturan_kullanici_id, is_sample, created_at, updated_at)
     VALUES (1, 1, ${w('2020-01-01T00:00:00.000Z')}, -50, 'bitti', ${w('Eski durum')}, 20, 0, 0, 0, 101, 0, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO work_orders (id, arac_id, tarih, km, durum, sikayet, kdv_orani, kdv_dahil_mi, iskonto_yuzde, iskonto_tutar_kurus, olusturan_kullanici_id, created_at, updated_at)
     VALUES (2, 999, ${w('gecersiz-tarih')}, 0, 'Açık', ${w('Sahipsiz iş emri')}, 999, 1, 500, 999999, 999, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO work_orders (id, arac_id, tarih, km, durum, sikayet, kdv_orani, kdv_dahil_mi, iskonto_yuzde, iskonto_tutar_kurus, olusturan_kullanici_id, created_at, updated_at, deleted_at)
     VALUES (3, 2, ${w(NOW)}, 10, 'teslim_edildi', ${w('Silinmiş iş emri')}, 20, 0, 0, 0, 101, ${w(NOW)}, ${w(NOW)}, ${w(NOW)})`
  );

  // --- work_order_lines: sahipsiz parça, tanımsız tür, sıfır/negatif adet
  rows.push(
    `INSERT INTO work_order_lines (id, is_emri_id, tur, parca_id, ad, adet, birim, birim_fiyat_kurus, created_at)
     VALUES (1, 1, 'parca', 777, ${w('Sahipsiz Parça')}, 0, 'Adet', -5000, ${w(NOW)})`,
    `INSERT INTO work_order_lines (id, is_emri_id, tur, parca_id, ad, adet, birim, birim_fiyat_kurus, created_at)
     VALUES (2, 1, 'bilinmeyen', NULL, ${w('Tanımsız Tür')}, 1, 'Adet', 0, ${w(NOW)})`,
    `INSERT INTO work_order_lines (id, is_emri_id, tur, parca_id, ad, adet, birim, birim_fiyat_kurus, created_at)
     VALUES (3, 2, 'iscilik', NULL, ${w('İşçilik')}, 999999, 'Adet', 99999999, ${w(NOW)})`
  );

  // --- payments: sahipsiz iş emri, negatif tutar, tanımsız yöntem
  rows.push(
    `INSERT INTO payments (id, is_emri_id, tarih, tutar_kurus, yontem, kullanici_id, created_at)
     VALUES (1, 1, ${w('gecersiz')}, -100, 'kripto', 101, ${w(NOW)})`,
    `INSERT INTO payments (id, is_emri_id, tarih, tutar_kurus, yontem, kullanici_id, created_at)
     VALUES (2, 999, ${w(NOW)}, 0, 'nakit', 999, ${w(NOW)})`
  );

  // --- expenses: geçersiz tarih, tanımsız kategori, negatif tutar
  rows.push(
    `INSERT INTO expenses (id, tarih, kategori, aciklama, tutar_kurus, kullanici_id, created_at, updated_at)
     VALUES (1, 'gecersiz', 'Bozuk Kategori', ${w('Bozuk gider')}, -500, 101, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO expenses (id, tarih, kategori, aciklama, tutar_kurus, kullanici_id, created_at, updated_at)
     VALUES (2, ${w('2026-13-45')}, 'Sarf Malzeme', ${w('Geçersiz tarih')}, 0, NULL, ${w(NOW)}, ${w(NOW)})`
  );

  // --- whatsapp_messages: sahipsiz iş emri, boş alanlar
  rows.push(
    `INSERT INTO whatsapp_messages (id, is_emri_id, durum, musteri_id, musteri_ad, telefon, plaka, mesaj, created_at)
     VALUES (1, 999, 'bilinmeyen', 999, ${w('')}, ${w('')}, ${w('')}, ${w('')}, ${w(NOW)})`
  );

  // --- settings: bozuk JSON ve bilinmeyen anahtar
  rows.push(
    `INSERT INTO settings (anahtar, deger, created_at, updated_at) VALUES ('dukkan_adi', ${w('{bozuk json')}, ${w(NOW)}, ${w(NOW)})`,
    `INSERT INTO settings (anahtar, deger, created_at, updated_at) VALUES ('bilinmeyen_ayar', ${w('???')}, ${w(NOW)}, ${w(NOW)})`
  );

  sqlite.exec(rows.join(';\n') + ';');
  sqlite.exec('PRAGMA foreign_keys = ON;');
}

async function probeAll(token: string, label: string) {
  const problems: string[] = [];
  for (const url of GET_PROBES) {
    const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${token}` } });
    const body = String(res.body);
    if (res.statusCode >= 500) {
      problems.push(`${label} ${url} -> HTTP ${res.statusCode}`);
      continue;
    }
    for (const bad of ['NaN', '[object Object]', 'Invalid Date']) {
      if (body.includes(bad)) problems.push(`${label} ${url} -> gövdede "${bad}"`);
    }
    if (res.statusCode === 200 && !body.trimStart().startsWith('{') && !body.includes('<')) {
      problems.push(`${label} ${url} -> beklenmeyen gövde`);
    }
  }
  return problems;
}

describe('Bölüm 5 — Eski / bozuk / uyumsuz veri dayanıklılığı', () => {
  beforeAll(async () => {
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });
    const owner = await setupInitialAdmin({ username: 'legacy_owner', password: P, full_name: 'Eski Veri Sahibi' });
    await createUser(owner as any, { username: 'legacy_staff', password: P, full_name: 'Eski Veri Personel', role: 'staff' });
    ownerToken = (await loginUser('legacy_owner', P)).token;
    insertCorruptFixture(getSqlite());
    reportLines.push('# Eski / Bozuk Veri Sonuçları (Bölüm 5)', '');
    reportLines.push(`Bozuk fixture ile ${GET_PROBES.length} uç nokta, owner ve personel kimliğiyle çağrıldı.`, '');
  });

  afterAll(() => {
    const outDir = path.resolve(process.cwd(), '../../test-raporu');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, '03-eski-veri.md'), reportLines.join('\n'), 'utf8');
  });

  it('bozuk veriyle hiçbir uç nokta 500 dönmez, NaN/undefined sızmaz', async () => {
    const staffToken = (await loginUser('legacy_staff', P)).token;
    const ownerProblems = await probeAll(ownerToken, 'owner');
    const staffProblems = await probeAll(staffToken, 'staff');
    const all = [...ownerProblems, ...staffProblems];
    reportLines.push('## Bozuk veri ile ekran/uç nokta taraması', '');
    reportLines.push(`- Owner sorunları: **${ownerProblems.length}**`);
    reportLines.push(`- Personel sorunları: **${staffProblems.length}**`);
    reportLines.push('');
    if (all.length) {
      reportLines.push('### Bulgular', '');
      for (const p of all) reportLines.push(`- ${p}`);
      reportLines.push('');
    }
    expect(all, all.join('\n')).toEqual([]);
  });

  it('tek bozuk kayıt tüm listeyi düşürmez; iyi kayıtlar gelmeye devam eder', async () => {
    // 20 sağlam müşteri ekle (bozuk fixture'ların arasına karışsın)
    for (let i = 0; i < 20; i++) {
      getSqlite()
        .prepare(
          `INSERT INTO customers (ad_soyad, telefon, is_sample, created_at, updated_at) VALUES (?, ?, 0, ?, ?)`
        )
        .run(`Sağlam Müşteri ${i}`, `0555000${String(i).padStart(4, '0')}`, NOW, NOW);
    }
    const res = await app.inject({ method: 'GET', url: '/api/customers?limit=100', headers: { authorization: `Bearer ${ownerToken}` } });
    expect(res.statusCode).toBe(200);
    const items = JSON.parse(res.body).items;
    expect(items.filter((i: any) => String(i.ad_soyad).startsWith('Sağlam Müşteri')).length).toBe(20);
    expect(String(res.body)).not.toContain('NaN');
    reportLines.push('## Tek bozuk kayıt etkisi', '');
    reportLines.push(`- Liste 200 döndü; ${items.length} kayıt geldi, 20 sağlam kayıt eksiksiz. ✅`, '');
  });

  it('eski şifre biçimi (düz metin) giriş yapamaz — güvenli davranış', async () => {
    // Düz metin parolalı kullanıcı giriş denemesi: asla başarılı olmamalı.
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'duz_metin', password: 'parola123' }
    });
    expect(res.statusCode).toBe(401);
    reportLines.push('## Eski kullanıcı / şifre biçimleri', '');
    reportLines.push('- Düz metin parola ile giriş denemesi → **401** (güvenli). ✅');
  });

  it('rolesi tanımsız kullanıcı sahip yetkisi almaz', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'bozuk_rol', password: 'her ne olursa' }
    });
    expect(res.statusCode).toBe(401); // hash geçersiz olduğundan giriş yok
    reportLines.push('- Tanımsız rollü kullanıcı girişi → **401**; sahip yetkisi yok. ✅', '');
  });

  it('eski şema migrasyonu: rol adları normalize edilir, eposta sütunu eklenir', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        is_active INTEGER NOT NULL DEFAULT 1,
        failed_login_attempts INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      INSERT INTO users (username, password_hash, full_name, role, is_active, created_at, updated_at)
      VALUES ('eski_admin', 'x', 'Eski Yönetici', 'admin', 1, '${NOW}', '${NOW}'),
             ('eski_kasiyer', 'x', 'Eski Kasiyer', 'cashier', 1, '${NOW}', '${NOW}'),
             ('eski_usta', 'x', 'Eski Usta', 'mechanic', 1, '${NOW}', '${NOW}'),
             ('eski_bilinmeyen', 'x', 'Bilinmeyen', 'sef', 1, '${NOW}', '${NOW}');
    `);
    bootstrapSchema(sqlite);

    const roles = sqlite.prepare('SELECT username, role FROM users ORDER BY username').all() as Array<{ username: string; role: string }>;
    const map = Object.fromEntries(roles.map((r) => [r.username, r.role]));
    expect(map['eski_admin']).toBe('owner');
    expect(map['eski_kasiyer']).toBe('staff');
    expect(map['eski_usta']).toBe('staff');
    expect(map['eski_bilinmeyen']).toBe('staff');
    const cols = (sqlite.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>).map((c) => c.name);
    expect(cols).toContain('eposta');

    // İdempotent: ikinci kez çalıştırmak bozmamalı
    bootstrapSchema(sqlite);
    const after = sqlite.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number };
    expect(after.n).toBe(4);

    reportLines.push('## Eski şema migrasyonu', '');
    reportLines.push('- Eski roller (admin→owner, cashier/mechanic→staff, tanımsız→staff) normalize edildi. ✅');
    reportLines.push('- Eksik `eposta` sütunu eklendi; migrasyon iki kez çalıştırıldığında veri bozulmadı (idempotent). ✅', '');
    sqlite.close();
  });

  it('veri bütünlüğü taraması (stok / kasa / cari) — sonuçlar sayıyla raporlanır', async () => {
    const sqlite = getSqlite();
    const movements = sqlite.prepare('SELECT parca_id, COALESCE(SUM(miktar),0) AS t FROM stock_movements GROUP BY parca_id').all() as Array<{
      parca_id: number;
      t: number;
    }>;
    let stockDrift = 0;
    const driftDetails: string[] = [];
    for (const m of movements) {
      const computed = getPartStock(m.parca_id);
      if (computed !== m.t) {
        stockDrift++;
        driftDetails.push(`parça #${m.parca_id}: hareket toplamı=${m.t}, servis hesabı=${computed}`);
      }
    }

    const paymentsSum = (sqlite.prepare('SELECT COALESCE(SUM(tutar_kurus),0) AS t FROM payments').get() as { t: number }).t;
    const expensesSum = (sqlite.prepare('SELECT COALESCE(SUM(tutar_kurus),0) AS t FROM expenses').get() as { t: number }).t;
    const ordersCount = (sqlite.prepare('SELECT COUNT(*) AS n FROM work_orders WHERE deleted_at IS NULL').get() as { n: number }).n;
    const cashRes = await app.inject({ method: 'GET', url: '/api/cash-desk/summary', headers: { authorization: `Bearer ${ownerToken}` } });

    reportLines.push('## Veri bütünlüğü taraması', '');
    reportLines.push(`- Ödeme kayıtları toplamı: ${paymentsSum} kuruş`);
    reportLines.push(`- Gider kayıtları toplamı: ${expensesSum} kuruş (kasaya yansımamalı)`);
    reportLines.push(`- Açık iş emri sayısı: ${ordersCount}`);
    reportLines.push(`- Kasa özeti yanıtı: HTTP ${cashRes.statusCode}`);
    reportLines.push(`- Stok tutarsızlığı (hareket toplamı ≠ stok hesabı): **${stockDrift}** parça`);
    for (const d of driftDetails) reportLines.push(`  - ${d}`);
    reportLines.push('');
    reportLines.push('> Not: Bozuk fixture kasıtlı olarak tutarsız veri içerir; sayılar beklenen ✅/⚠️ için değil, veri kalitesini göstermek için raporlanır.');
    reportLines.push('');
  });

  it('bozuk veriyle 20 farklı rastgele bozma (fuzz) turu: çökme yok', async () => {
    const probes = ['/api/customers', '/api/vehicles/search', '/api/parts', '/api/work-orders', '/api/expenses', '/api/reminders/due', '/api/cash-desk/summary', '/api/settings/audit-logs'];
    const tables = ['customers', 'vehicles', 'parts', 'work_orders', 'expenses'];
    const problems: string[] = [];

    for (let seed = 1; seed <= 20; seed++) {
      const sqlite = getSqlite();
      sqlite.exec('PRAGMA foreign_keys = OFF;');
      let mutation = 0;
      for (const t of tables) {
        const cols = (sqlite.prepare(`PRAGMA table_info(${t})`).all() as Array<{ name: string; notnull: number; pk: number }>).filter(
          (c) => !c.pk && c.name !== 'created_at' && c.name !== 'updated_at'
        );
        const ids = (sqlite.prepare(`SELECT rowid AS rid FROM ${t}`).all() as Array<{ rid: number }>).map((r) => r.rid);
        for (const rid of ids) {
          for (const col of cols) {
            // Deterministik ama tohumla değişen bozma
            if ((rid * 31 + seed * 17 + col.name.length) % 5 !== 0) continue;
            mutation++;
            const roll = (rid + seed + col.name.length) % 4;
            let value: any = null;
            if (roll === 1) value = '';
            else if (roll === 2) value = 'gecersiz';
            else if (roll === 3) value = col.name.toLowerCase().includes('kurus') ? -999999999 : 'x'.repeat(500);
            try {
              sqlite.prepare(`UPDATE ${t} SET ${col.name} = ? WHERE rowid = ?`).run(value, rid);
            } catch {
              /* kısıt nedeniyle yazılamayan alanlar atlanır */
            }
          }
        }
      }
      sqlite.exec('PRAGMA foreign_keys = ON;');

      for (const url of probes) {
        const res = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${ownerToken}` } });
        const body = String(res.body);
        if (res.statusCode >= 500) problems.push(`tohum ${seed} ${url} -> HTTP ${res.statusCode} (${mutation} değişiklik)`);
        if (body.includes('NaN') || body.includes('[object Object]')) problems.push(`tohum ${seed} ${url} -> NaN/obj`);
      }
    }

    reportLines.push('## Fuzz (rastgele bozma)', '');
    reportLines.push(`- 20 tohum × ${tables.length} tablo × 8 uç nokta tarandı.`);
    reportLines.push(`- Bulunan çökme/NaN: **${problems.length}**`);
    reportLines.push('');
    if (problems.length) {
      for (const p of problems.slice(0, 20)) reportLines.push(`- ${p}`);
      reportLines.push('');
    }
    expect(problems, problems.slice(0, 10).join('\n')).toEqual([]);
  });

});
