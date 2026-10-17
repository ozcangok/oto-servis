import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { initDatabase, getDb, users, sessions } from '../src/db/index.js';
import { setupInitialAdmin, createUser, loginUser } from '../src/services/authService.js';
import { buildApp } from '../src/app.js';

/**
 * Bölüm 4.1 / 4.2 / 4.5 — Giriş (login), oturum (session) ve genel web güvenliği.
 *
 * Bu dosya, kullanıcının "TEST-GUVENLIK-VE-DERIN.md" planının çekirdek güvenlik
 * maddelerini, KENDİ İZOLE (bellek içi) test veritabanı üzerinde çalıştırır.
 * Gerçek veriye dokunmaz.
 */

const P = 'Test!12345';
const GENERIC = 'kullanıcı adı/e-posta veya parola hatalı';

let app: any;
let ownerUser: any;
let staffUser: any;
let staff2User: any;
let pasifUser: any;
let rolsuzUser: any;
let ownerToken: string;
let staffToken: string;
let staff2Token: string;

async function boot() {
  initDatabase({ inMemory: true });
  app = await buildApp({ enableRateLimit: false });

  ownerUser = await setupInitialAdmin({
    username: 'owner_test',
    password: P,
    full_name: 'Sahip Test'
  });
  staffUser = await createUser(ownerUser as any, {
    username: 'staff_test',
    password: P,
    full_name: 'Eleman Test',
    role: 'staff'
  });
  staff2User = await createUser(ownerUser as any, {
    username: 'staff2_test',
    password: P,
    full_name: 'Eleman İki',
    role: 'staff'
  });
  pasifUser = await createUser(ownerUser as any, {
    username: 'pasif_test',
    password: P,
    full_name: 'Pasif Kullanıcı',
    role: 'staff'
  });
  getDb().update(users).set({ is_active: false }).where(eq(users.id, pasifUser.id)).run();

  // Bilerek bozuk kullanıcı: tanımsız rol (SQLite'ta CHECK kısıtı yok).
  const now = new Date().toISOString();
  const hash = await bcrypt.hash(P, 10);
  rolsuzUser = getDb()
    .insert(users)
    .values({
      username: 'rolsuz_test',
      password_hash: hash,
      full_name: 'Rolsuz Kullanıcı',
      role: 'gecerli_degil' as any,
      is_active: true,
      failed_login_attempts: 0,
      created_at: now,
      updated_at: now
    })
    .returning()
    .get();

  ownerToken = (await loginUser('owner_test', P)).token;
  staffToken = (await loginUser('staff_test', P)).token;
  staff2Token = (await loginUser('staff2_test', P)).token;
}

function post(url: string, payload: any, token?: string) {
  return app.inject({
    method: 'POST',
    url,
    headers: token ? { authorization: `Bearer ${token}` } : {},
    payload
  });
}

function get(url: string, token?: string, headers: Record<string, string> = {}) {
  return app.inject({
    method: 'GET',
    url,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }
  });
}

describe('Bölüm 4.1 — Giriş (login) güvenliği', () => {
  beforeEach(boot);

  it('doğru bilgiyle owner ve staff giriş yapar; yanıt şifre/hash içermez', async () => {
    const r1 = await post('/api/auth/login', { username: 'owner_test', password: P });
    expect(r1.statusCode).toBe(200);
    const b1 = JSON.parse(r1.body);
    expect(b1.success).toBe(true);
    expect(b1.user.role).toBe('owner');
    expect(JSON.stringify(b1)).not.toContain('password_hash');
    expect(r1.body).not.toContain(P);
    expect(r1.headers['set-cookie']).toBeDefined();

    const r2 = await post('/api/auth/login', { username: 'staff_test', password: P });
    expect(r2.statusCode).toBe(200);
    expect(JSON.parse(r2.body).user.role).toBe('staff');
  });

  it('oturum çerezi HttpOnly + SameSite=Lax olarak gönderilir', async () => {
    const r = await post('/api/auth/login', { username: 'owner_test', password: P });
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
  });

  it('yanlış parola ve olmayan kullanıcı AYNI genel mesajı döner (kullanıcı adı numaralandırma yok)', async () => {
    const wrongPass = await post('/api/auth/login', { username: 'owner_test', password: 'YanlisParola1' });
    const noUser = await post('/api/auth/login', { username: 'boyle_biri_yok', password: 'YanlisParola1' });

    expect(wrongPass.statusCode).toBe(401);
    expect(noUser.statusCode).toBe(401);

    const m1 = JSON.parse(wrongPass.body).error as string;
    const m2 = JSON.parse(noUser.body).error as string;
    // Bilgi sızıntısı olmamalı: her iki yanıt birbirinin aynı olmalı.
    expect(m1.toLowerCase()).toBe(m2.toLowerCase());
    // Kullanıcı adı numaralandırmayı kolaylaştıran "kalan hak" ipucu olmamalı.
    expect(m1.toLowerCase()).not.toContain('kalan hak');
  });

  it('boş / sadece boşluk / çok uzun giriş alanları reddedilir', async () => {
    expect((await post('/api/auth/login', { username: '', password: '' })).statusCode).toBe(400);
    expect((await post('/api/auth/login', { username: '   ', password: '   ' })).statusCode).not.toBe(200);
    const long = 'a'.repeat(5000);
    const r = await post('/api/auth/login', { username: long, password: long });
    expect(r.statusCode).not.toBe(200);
    expect(r.body).not.toContain('stack');
  });

  it('giriş alanlarında SQL/komut enjeksiyonu giriş yapamaz ve sunucuyu çökertmez', async () => {
    const payloads = ["' OR 1=1 --", "admin'--", `" OR ""="`, "'; DROP TABLE users; --", "1' UNION SELECT 1,2,3 --"];
    for (const p of payloads) {
      const r = await post('/api/auth/login', { username: p, password: p });
      expect(r.statusCode).not.toBe(200);
      expect(r.statusCode).toBeLessThan(500);
    }
    // Tablo yerinde mi?
    const stillWorks = await post('/api/auth/login', { username: 'owner_test', password: P });
    expect(stillWorks.statusCode).toBe(200);
  });

  it('5 hatalı denemeden sonra hesap kilitlenir; doğru parola bile kabul edilmez', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await post('/api/auth/login', { username: 'staff2_test', password: 'YanlisParola1' });
      expect(r.statusCode).toBe(401);
    }
    const locked = await post('/api/auth/login', { username: 'staff2_test', password: P });
    expect(locked.statusCode).toBe(401);
    const msg = JSON.parse(locked.body).error.toLowerCase();
    expect(msg).toContain('kilitli');
  });

  it('devre dışı bırakılmış kullanıcı giriş yapamaz', async () => {
    const r = await post('/api/auth/login', { username: 'pasif_test', password: P });
    expect(r.statusCode).toBe(401);
  });

  it('parolalar düz metin saklanmaz (bcrypt hash) ve farklı kullanıcılarda tuz farklıdır', async () => {
    const rows = getDb().select().from(users).all();
    for (const u of rows) {
      expect(u.password_hash).not.toBe(P);
      expect(u.password_hash).toMatch(/^\$2[aby]\$/); // bcrypt
      expect(u.password_hash.length).toBeGreaterThan(50);
    }
    const h1 = rows.find((u) => u.username === 'owner_test')!.password_hash;
    const h2 = rows.find((u) => u.username === 'staff_test')!.password_hash;
    expect(h1).not.toBe(h2);
  });

  it('kullanıcı listesi API yanıtı password/hash sızdırmaz', async () => {
    const r = await get('/api/auth/users', ownerToken);
    expect(r.statusCode).toBe(200);
    expect(r.body).not.toContain('password_hash');
    expect(r.body).not.toContain('$2a$');
    expect(r.body).not.toContain('$2b$');
  });

  it('rolesi bozuk kullanıcı GÜVENLİ davranır: owner yetkisi almaz, çökme yok', async () => {
    const login = await post('/api/auth/login', { username: 'rolsuz_test', password: P });
    expect(login.statusCode).toBe(200); // kimlik doğru
    const token = JSON.parse(login.body).token as string;

    // Owner'a özel uç nokta: bozuk rol owner SAYILMAMALI.
    const kasa = await get('/api/cash-desk/summary', token);
    expect(kasa.statusCode).toBe(403);
    const userList = await get('/api/auth/users', token);
    expect(userList.statusCode).toBe(403);
    const settingsWrite = await app.inject({
      method: 'PUT',
      url: '/api/settings',
      headers: { authorization: `Bearer ${token}` },
      payload: { dukkan_adi: 'Ele Geçirildi' }
    });
    expect(settingsWrite.statusCode).toBe(403);
    expect(rolsuzUser.role).toBe('gecerli_degil');
  });
});

describe('Bölüm 4.2 — Oturum (session) güvenliği', () => {
  beforeEach(boot);

  it('çıkış sonrası token SUNUCUDA geçersiz olur (eski token ile API çağrısı reddedilir)', async () => {
    const before = await get('/api/auth/me', ownerToken);
    expect(before.statusCode).toBe(200);

    const out = await post('/api/auth/logout', {}, ownerToken);
    expect(out.statusCode).toBe(200);

    const after = await get('/api/auth/me', ownerToken);
    expect(after.statusCode).toBe(401);

    // Sunucu tarafı oturum kaydı silinmiş olmalı.
    const row = getDb().select().from(sessions).where(eq(sessions.id, ownerToken)).get();
    expect(row).toBeUndefined();
  });

  it('bozulmuş / değiştirilmiş token reddedilir', async () => {
    const variants = [
      ownerToken.slice(0, -1) + (ownerToken.endsWith('a') ? 'b' : 'a'),
      ownerToken.toUpperCase(),
      'x'.repeat(64),
      'eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJyb2xlIjoib3duZXIifQ.', // alg:none JWT denemesi
      ownerToken + 'X'
    ];
    for (const v of variants) {
      const r = await get('/api/auth/me', v);
      expect(r.statusCode).toBe(401);
    }
  });

  it('token süresi dolduysa reddedilir ve kayıt temizlenir', async () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    getDb().update(sessions).set({ expires_at: past }).where(eq(sessions.id, ownerToken)).run();

    const r = await get('/api/auth/me', ownerToken);
    expect(r.statusCode).toBe(401);
    const row = getDb().select().from(sessions).where(eq(sessions.id, ownerToken)).get();
    expect(row).toBeUndefined();
  });

  it('rol yükseltme: token sahibi istemci tarafından rol/başlık veremez', async () => {
    // Staff token + "ben owner'ım" iddiaları: rol güvenilir kaynaktan (oturum) okunur.
    const attempts = [
      get('/api/auth/users', staffToken, { 'x-role': 'owner' }),
      get('/api/auth/users?role=owner', staffToken),
      get('/api/cash-desk/summary', staffToken, { 'x-role': 'owner', 'x-user-id': '1' }),
      get('/api/settings/audit-logs', staffToken, { 'x-user-role': 'owner' })
    ];
    const results = await Promise.all(attempts);
    for (const r of results) {
      expect([401, 403]).toContain(r.statusCode);
    }
  });

  it('silinen kullanıcının açık tokenı anında geçersiz olur', async () => {
    const tmp = await createUser(ownerUser as any, {
      username: 'silinecek_test',
      password: P,
      full_name: 'Silinecek Kullanıcı',
      role: 'staff'
    });
    const tmpToken = (await loginUser('silinecek_test', P)).token;
    expect((await get('/api/auth/me', tmpToken)).statusCode).toBe(200);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/auth/users/${tmp.id}`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(del.statusCode).toBe(200);
    expect((await get('/api/auth/me', tmpToken)).statusCode).toBe(401);
  });

  it('devre dışı bırakılan kullanıcının açık tokenı geçersiz olur', async () => {
    getDb().update(users).set({ is_active: false }).where(eq(users.id, staff2User.id)).run();
    const r = await get('/api/auth/me', staff2Token);
    expect(r.statusCode).toBe(401);
  });

  it('aynı kullanıcı iki farklı oturumda bağımsız çalışır; birinin çıkışı diğerini bozmaz', async () => {
    const second = (await loginUser('owner_test', P)).token;
    expect(second).not.toBe(ownerToken);
    await post('/api/auth/logout', {}, second);
    expect((await get('/api/auth/me', second)).statusCode).toBe(401);
    expect((await get('/api/auth/me', ownerToken)).statusCode).toBe(200);
  });

  it("owner bir kullanıcının parolasını sıfırlarsa o kullanıcının tüm açık oturumları geçersiz olur", async () => {
    const reset = await post(
      `/api/auth/users/${staffUser.id}/reset-password`,
      { new_password: 'YeniParola123' },
      ownerToken
    );
    expect(reset.statusCode).toBe(200);
    expect((await get('/api/auth/me', staffToken)).statusCode).toBe(401);
  });
});

describe('Bölüm 4.5 — Genel web güvenliği (yerel kapsam)', () => {
  beforeEach(boot);

  it('sunucu tarafı hata yanıtları yığın izi / dosya yolu / SQL sızdırmaz', async () => {
    const probes = [
      get('/api/parts/abc'),
      get('/api/parts?limit=notanumber'),
      get('/api/vehicles/search'),
      get('/api/vehicles/by-plate/%00'),
      get('/api/customers/99999'),
      app.inject({ method: 'POST', url: '/api/customers', headers: { authorization: `Bearer ${ownerToken}` }, payload: 'bozuk-json' as any }),
      get('/api/work-orders?durum=%27%20OR%201=1--')
    ];
    for (const p of probes) {
      const r = await p;
      const body = String(r.body);
      expect(body).not.toMatch(/at\s+\w+\s+\(.*:\d+:\d+\)/); // stack frame
      expect(body).not.toContain('/Users/');
      expect(body.toLowerCase()).not.toContain('sqlite');
      expect(body.toLowerCase()).not.toContain('select ');
      expect(body).not.toMatch(/node_modules/);
      expect(r.statusCode).toBeLessThan(500);
    }
  });

  it('XSS: metin alanlarına yazılan etiketler ham olarak saklanır ve JSON olarak kaçırılır', async () => {
    const payload = `<img src=x onerror="alert(1)"><script>alert(2)</script>`;
    const c = await post('/api/customers', { ad_soyad: payload, telefon: '05551234567' }, ownerToken);
    expect(c.statusCode).toBe(200);
    const created = JSON.parse(c.body).customer;

    const list = await get('/api/customers?q=onerror', ownerToken);
    expect(list.statusCode).toBe(200);
    const items = JSON.parse(list.body).items;
    const found = items.find((i: any) => i.id === created.id);
    expect(found).toBeDefined();
    // Veri HAM METİN olarak saklanır ve döner; çalıştırılmaz. React/JSX metni
    // otomatik kaçırdığı için bu değer arayüzde yazı olarak görünür (E2E ile
    // ayrıca doğrulanır). Sunucu tarafı bunu etiket olarak yorumlamaz.
    expect(found.ad_soyad).toBe(payload);
    // Yeni alan ekleyen bir enjeksiyon denemesi kayıt şemasını bozmamalı.
    const injected = await post('/api/customers', { ad_soyad: 'Enjeksiyon Testi', telefon: '05551234567', "$where": "1==1" }, ownerToken);
    expect(injected.statusCode).toBe(200);
    expect(JSON.stringify(JSON.parse(injected.body).customer)).not.toContain('$where');
  });

  it('SQL enjeksiyonu: arama/filtre alanlarında çökme veya sızıntı yok', async () => {
    const injects = ["%' OR '1'='1", "'; DROP TABLE customers; --", '1 UNION SELECT 1,2,3,4,5,6,7,8,9', '" OR 1=1 --'];
    for (const q of injects) {
      const r = await get(`/api/customers?q=${encodeURIComponent(q)}`, ownerToken);
      expect(r.statusCode).toBe(200);
      expect(r.body).not.toContain('DROP');
      expect(r.body.toLowerCase()).not.toContain('syntax error');
    }
    // Tablo hâlâ çalışıyor
    expect((await get('/api/customers', ownerToken)).statusCode).toBe(200);
  });

  it('CORS: kimlik bilgisiyle birlikte isteğe göre yansıtılan origin (risk raporlanır)', async () => {
    const r = await app.inject({
      method: 'GET',
      url: '/api/health',
      headers: { origin: 'http://kotu-site.example' }
    });
    // Bilgi amaçlı: kötü kaynak yansıtılıyor mu?
    const allowOrigin = String(r.headers['access-control-allow-origin'] || '');
    const allowCreds = String(r.headers['access-control-allow-credentials'] || '');
    // eslint-disable-next-line no-console
    console.log('[CORS]', { allowOrigin, allowCreds });
    expect(true).toBe(true);
  });

  it('girdi doğrulaması sunucudadır: eksik/yanlış tür/çok büyük gövde reddedilir', async () => {
    // Eksik zorunlu alan
    expect((await post('/api/customers', { ad_soyad: 'X' }, ownerToken)).statusCode).toBeGreaterThanOrEqual(400);
    // Yanlış tür
    expect((await post('/api/customers', { ad_soyad: 123, telefon: 456 }, ownerToken)).statusCode).toBeGreaterThanOrEqual(400);
    // Çok büyük gövde (1 MB metin) → 4xx/5xx olsa da çökmemeli
    const big = 'a'.repeat(1_000_000);
    const r = await post('/api/customers', { ad_soyad: big, telefon: '05551234567' }, ownerToken);
    expect(r.statusCode).toBeLessThan(500);
  });

  it('mass assignment: fazladan alanlar (role/is_sample/ownerId) yok sayılır', async () => {
    const r = await post(
      '/api/auth/users',
      { username: 'enjekte_test', password: 'Parola12345', full_name: 'Enjekte', role: 'staff', is_active: true, id: 999, ownerId: 1 },
      ownerToken
    );
    expect(r.statusCode).toBe(200);
    const u = JSON.parse(r.body).user;
    expect(u.id).not.toBe(999);
    expect(u.role).toBe('staff');

    // Müşteri oluştururken is_sample/islem enjeksiyonu
    const c = await post('/api/customers', { ad_soyad: 'Test', telefon: '05551234567', is_sample: true, deleted_at: '2020-01-01' }, ownerToken);
    expect(c.statusCode).toBe(200);
    expect(JSON.parse(c.body).customer.is_sample).toBe(false);
  });

  it('HTTP güvenlik başlıkları kontrolü (bilgi amaçlı raporlanır)', async () => {
    const r = await get('/api/health');
    const headers = {
      xcto: r.headers['x-content-type-options'],
      xfo: r.headers['x-frame-options'],
      csp: r.headers['content-security-policy'],
      referrer: r.headers['referrer-policy']
    };
    // eslint-disable-next-line no-console
    console.log('[HEADERS]', headers);
    expect(r.statusCode).toBe(200);
  });

  it('negatif stok koruması: personel gövdedeki bayrakla (override) aşamaz', async () => {
    // 1) Parça stok hareketi yolu (parts.ts: override_negative)
    const partRes = await post(
      '/api/parts',
      { ad: 'Koruma Testi', kod: 'KRM-STK-1', birim: 'Adet', kritik_stok: 0, alis_kurus: 1000, satis_kurus: 2000, aktif: true },
      ownerToken
    );
    expect(partRes.statusCode).toBe(200);
    const part = JSON.parse(partRes.body).part;
    expect((await post(`/api/parts/${part.id}/stock-movement`, { miktar: 1, tur: 'giris' }, ownerToken)).statusCode).toBe(200);

    const staffBypass = await post(
      `/api/parts/${part.id}/stock-movement`,
      { miktar: -5, tur: 'duzeltme', override_negative: true },
      staffToken
    );
    expect(staffBypass.statusCode).toBe(400);
    expect(String(JSON.parse(staffBypass.body).error)).toMatch(/stok/i);

    const unchanged = await get(`/api/parts/${part.id}`, ownerToken);
    expect(JSON.parse(unchanged.body).part.stok_miktari).toBe(1);

    // Sahip aynı işlemi yapabilmeli (koruma yalnızca personeli bağlar)
    const ownerOk = await post(`/api/parts/${part.id}/stock-movement`, { miktar: -5, tur: 'duzeltme' }, ownerToken);
    expect(ownerOk.statusCode).toBe(200);

    // 2) İş emri güncelleme yolu (workOrders.ts: override_negative_stock)
    const part2Res = await post(
      '/api/parts',
      { ad: 'Koruma Testi 2', kod: 'KRM-STK-2', birim: 'Adet', kritik_stok: 0, alis_kurus: 1000, satis_kurus: 2000, aktif: true },
      ownerToken
    );
    const part2 = JSON.parse(part2Res.body).part;
    await post(`/api/parts/${part2.id}/stock-movement`, { miktar: 3, tur: 'giris' }, ownerToken);

    const custRes = await post('/api/customers', { ad_soyad: 'Stok Müşteri', telefon: '05559998877' }, ownerToken);
    const cust = JSON.parse(custRes.body).customer;
    const vehRes = await post(
      '/api/vehicles',
      { plaka: '34 STK 100', marka: 'Test', model: 'T', musteri_id: cust.id, musteri_ad_soyad: cust.ad_soyad, musteri_telefon: cust.telefon },
      ownerToken
    );
    const veh = JSON.parse(vehRes.body).vehicle;

    const woRes = await post(
      '/api/work-orders',
      {
        arac_id: veh.id,
        durum: 'kabul',
        sikayet: 'stok koruma testi',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        kalemler: [{ tur: 'parca', parca_id: part2.id, ad: 'Koruma Testi 2', adet: 1, birim: 'Adet', birim_fiyat_kurus: 2000 }]
      },
      ownerToken
    );
    expect(woRes.statusCode).toBe(200);
    const woBody = JSON.parse(woRes.body);
    let orderId = (woBody.workOrder || woBody.is_emri || woBody.order)?.id;
    if (!orderId) {
      const list = JSON.parse((await get('/api/work-orders?limit=1', ownerToken)).body);
      orderId = (list.items || list.work_orders || list.is_emirleri)?.[0]?.id;
    }
    expect(orderId).toBeTruthy();

    const putBody = {
      arac_id: veh.id,
      durum: 'onarimda',
      sikayet: 'stok koruma testi',
      kdv_orani: 20,
      kdv_dahil_mi: false,
      override_negative_stock: true,
      kalemler: [{ tur: 'parca', parca_id: part2.id, ad: 'Koruma Testi 2', adet: 50, birim: 'Adet', birim_fiyat_kurus: 2000 }]
    };
    const staffPut = await app.inject({
      method: 'PUT',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${staffToken}` },
      payload: putBody
    });
    expect(staffPut.statusCode).toBe(400);
    expect(String(JSON.parse(staffPut.body).error)).toMatch(/stok/i);

    // Yan etki bırakmamalı: stok değişmedi mi?
    const p2 = await get(`/api/parts/${part2.id}`, ownerToken);
    expect(JSON.parse(p2.body).part.stok_miktari).toBe(2);

    // Sahip aynı isteği yapabilmeli
    const ownerPut = await app.inject({
      method: 'PUT',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: putBody
    });
    expect(ownerPut.statusCode).toBe(200);
  });

  it('denetim izi: silme ve parola sıfırlama kim/ne zaman bilgisiyle kaydedilir', async () => {
    await post('/api/auth/users', { username: 'iz_test', password: 'Parola12345', full_name: 'İz Test', role: 'staff' }, ownerToken);
    const listUsers = await get('/api/auth/users', ownerToken);
    const target = JSON.parse(listUsers.body).users.find((u: any) => u.username === 'iz_test');
    await post(`/api/auth/users/${target.id}/reset-password`, { new_password: 'BaskaParola123' }, ownerToken);
    await app.inject({ method: 'DELETE', url: `/api/auth/users/${target.id}`, headers: { authorization: `Bearer ${ownerToken}` } });

    const logs = await get('/api/settings/audit-logs', ownerToken);
    expect(logs.statusCode).toBe(200);
    const body = logs.body;
    expect(body).toContain('user_create');
    expect(body).toContain('user_password_reset');
    expect(body).toContain('user_delete');
    expect(body).toContain('owner_test');
  });

  it('kanonik olmayan / kodlanmış yollar yetki denetimini atlatmaz (fastify bozuk-URL zafiyet sınıfı)', async () => {
    // Kaynak: GHSA-p68q-wchp-6fh7 (fastify: bozuk URL ile kapsüllenmiş not-found
    // handler'a ulaşıp kimlik atlama) ve @fastify/static yol dolaşma uyarıları.
    // KURAL: bu yolların HİÇBİRİ 2xx JSON API yanıtı ÜRETMEMELİ; ya HTML kabuk
    // (veri yok) ya da 4xx dönmelidir.
    const yollar = [
      '//api/cash-desk/summary',
      '/./api/cash-desk/summary',
      '/API/cash-desk/summary',
      '/api//cash-desk/summary',
      '/api/./cash-desk/summary',
      '/api/cash-desk/./summary',
      '/api/cash-desk/summary/',
      '/api/cash-desk/summary%20',
      '/api/%63ash-desk/summary',
      '/api/cash-desk%2fsummary',
      '/api/cash-desk/summary;x=1',
      '/api/x/../cash-desk/summary',
      '/api/settings/audit-logs',
      '//api/settings/audit-logs',
      '/api/auth/users',
      '//api/auth/users',
      '/../package.json',
      '/%2e%2e/package.json',
      '/assets/%2e%2e/%2e%2e/package.json',
      '/uploads/../../data/oto-servis.sqlite'
    ];

    for (const url of yollar) {
      const res = await app.inject({ method: 'GET', url });
      const jsonMi = String(res.headers['content-type'] || '').includes('application/json');
      if (jsonMi && res.statusCode < 400) {
        throw new Error(`Yetki atlatma şüphesi: ${url} -> ${res.statusCode} (JSON API yanıtı)`);
      }
      // Duyarlı veri gövdesi sızmamalı (dosya içeriği / kasa verisi).
      expect(res.body, `${url} duyarlı veri sızdırdı`).not.toContain('"toplam_kurus"');
      expect(res.body, `${url} dosya sızdırdı`).not.toContain('"dependencies"');
    }
  });
});
