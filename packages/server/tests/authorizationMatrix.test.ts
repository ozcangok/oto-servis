import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/db/index.js';
import { setupInitialAdmin, createUser, loginUser } from '../src/services/authService.js';
import { buildApp } from '../src/app.js';

/**
 * Bölüm 4.4 — SUNUCU TARAFI YETKİ MATRİSİ (EN KRİTİK BÖLÜM)
 *
 * TÜM uç noktalar üç kimlikle çağrılır: anonim (token yok), personel (staff),
 * sahip (owner). Beklenen: anonim → 401; sahip-kısıtlı uç → personel 403,
 * sahip başarılı; açık uç → personel ve sahip başarılı.
 *
 * Yetki modeli projede yazılı olmadığı için plandaki "varsayılan en-az-yetki
 * matrisi" referans alınmıştır; tasarım kararı gerektiren sapmalar raporda
 * "Tasarım kararı bekliyor" olarak işaretlenir (Bölüm 1.3: "bana bırak").
 *
 * Çıktı: test-raporu/yetki-matrisi-sonuc.md
 */

process.env.BACKUP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'oto-matris-backup-'));

type Method = 'GET' | 'POST' | 'PUT' | 'DELETE';
type Access = 'public' | 'auth' | 'owner-only';

interface Row {
  m: Method;
  path: string;
  access: Access;
  why: string;
  payload?: any;
  ownerSkip?: string;
  ownerPayload?: any;
}

let app: any;
let ownerToken = '';
let staffToken = '';
let staff2Token = '';
const ids: Record<string, number> = {};
const results: Array<{ row: Row; anon: number; staff: number; owner: number; ok: boolean; note: string }> = [];
const deleteResults: Array<{
  name: string;
  anon: number;
  staff: number;
  owner: number;
  staffAllowedByDesign: boolean;
  note: string;
}> = [];

async function call(m: Method, url: string, token: string | null, payload?: any) {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await app.inject({
    method: m,
    url,
    headers,
    ...(payload === undefined ? {} : { payload })
  });
  return { status: res.statusCode, body: res.body };
}

async function ownerCall(m: Method, url: string, payload?: any) {
  return call(m, url, ownerToken, payload);
}

function jsonOf(r: { body: string }) {
  try {
    return JSON.parse(r.body);
  } catch {
    return null;
  }
}

async function seed() {
  const owner = await setupInitialAdmin({ username: 'mat_owner', password: 'Matris!12345', full_name: 'Matris Sahip' });
  await createUser(owner as any, { username: 'mat_staff', password: 'Matris!12345', full_name: 'Matris Personel', role: 'staff' });
  await createUser(owner as any, { username: 'mat_staff2', password: 'Matris!12345', full_name: 'Matris Personel 2', role: 'staff' });
  ownerToken = (await loginUser('mat_owner', 'Matris!12345')).token;
  staffToken = (await loginUser('mat_staff', 'Matris!12345')).token;
  staff2Token = (await loginUser('mat_staff2', 'Matris!12345')).token;

  const cust = jsonOf(await ownerCall('POST', '/api/customers', { ad_soyad: 'Matris Müşteri', telefon: '05551110000' }))?.customer;
  ids.customer = cust.id;

  const veh = jsonOf(
    await ownerCall('POST', '/api/vehicles', {
      plaka: '34 MAT 001',
      marka: 'Matris',
      model: 'M1',
      yil: 2020,
      musteri_id: cust.id,
      musteri_ad_soyad: cust.ad_soyad,
      musteri_telefon: cust.telefon
    })
  )?.vehicle;
  ids.vehicle = veh.id;

  const part = jsonOf(
    await ownerCall('POST', '/api/parts', {
      ad: 'Matris Parça',
      kod: 'MAT-1',
      barkod: 'MATBAR1',
      birim: 'Adet',
      kritik_stok: 1,
      alis_kurus: 1000,
      satis_kurus: 2500,
      aktif: true
    })
  )?.part;
  ids.part = part.id;
  await ownerCall('POST', `/api/parts/${ids.part}/stock-movement`, { miktar: 10, tur: 'giris' });

  const wo = jsonOf(
    await ownerCall('POST', '/api/work-orders', {
      arac_id: veh.id,
      durum: 'kabul',
      sikayet: 'Matris iş emri',
      kdv_orani: 20,
      kdv_dahil_mi: false,
      kalemler: [{ tur: 'parca', parca_id: ids.part, ad: 'Matris Parça', adet: 1, birim: 'Adet', birim_fiyat_kurus: 2500 }]
    })
  );
  ids.workOrder = (wo?.workOrder || wo?.is_emri)?.id;

  const pay = jsonOf(await ownerCall('POST', '/api/payments', { is_emri_id: ids.workOrder, tutar_kurus: 1000, yontem: 'nakit' }))?.payment;
  ids.payment = pay.id;

  const exp = jsonOf(await ownerCall('POST', '/api/expenses', { tarih: '2026-10-17', kategori: 'Fatura & Kira', aciklama: 'Matris kira', tutar_kurus: 5000 }))?.expense;
  ids.expense = exp.id;

  const staffExp = jsonOf(
    await call('POST', '/api/expenses', staffToken, { tarih: '2026-10-17', kategori: 'Sarf Malzeme', aciklama: 'Matris sarf', tutar_kurus: 100 })
  )?.expense;
  ids.staffExpense = staffExp.id;

  const otherExp = jsonOf(
    await call('POST', '/api/expenses', staff2Token, { tarih: '2026-10-17', kategori: 'Sarf Malzeme', aciklama: 'Diğer personel', tutar_kurus: 200 })
  )?.expense;
  ids.otherStaffExpense = otherExp.id;

  // WhatsApp kaydı üret (durum değişimi) ve mesaj ID'sini al
  await ownerCall('PUT', `/api/work-orders/${ids.workOrder}/status`, { durum: 'onarimda' });
  const msgs = jsonOf(await ownerCall('GET', '/api/reminders/messages'))?.items || [];
  ids.message = msgs[0]?.id || 999999;
}

function inventory(): Row[] {
  const c = ids.customer;
  const v = ids.vehicle;
  const p = ids.part;
  const w = ids.workOrder;
  const e = ids.expense;
  return [
    // --- herkese açık
    { m: 'GET', path: '/api/health', access: 'public', why: 'Sağlık kontrolü (public)' },
    { m: 'GET', path: '/api/auth/setup-status', access: 'public', why: 'İlk kurulum durumu (public)' },
    { m: 'POST', path: '/api/auth/login', access: 'public', why: 'Giriş (public)', payload: { username: 'mat_owner', password: 'Matris!12345' } },
    { m: 'POST', path: '/api/auth/setup', access: 'public', why: 'Kurulum (kurulum bittiyse 400)', payload: { username: 'yeni_kurulum', password: 'Parola12345', full_name: 'Yeni Kurulum' } },

    // --- kimlik doğrulama
    { m: 'GET', path: '/api/auth/me', access: 'auth', why: 'Aktif kullanıcı' },

    // --- kullanıcı yönetimi (varsayılan matris: sahip)
    { m: 'GET', path: '/api/auth/users', access: 'owner-only', why: 'Kullanıcı yönetimi' },
    { m: 'POST', path: '/api/auth/users', access: 'owner-only', why: 'Kullanıcı ekleme', payload: { username: `matris_ekle_${Date.now()}`, password: 'Parola12345', full_name: 'Matris Ekle', role: 'staff' } },

    // --- müşteriler (varsayılan matris: görüntüle/ekle/düzenle ✅)
    { m: 'GET', path: '/api/customers', access: 'auth', why: 'Müşteri listesi' },
    { m: 'GET', path: `/api/customers/${c}`, access: 'auth', why: 'Müşteri detay' },
    { m: 'GET', path: `/api/customers/${c}/statement`, access: 'auth', why: 'Cari ekstresi' },
    { m: 'POST', path: '/api/customers', access: 'auth', why: 'Müşteri ekleme', payload: { ad_soyad: 'Matris Yeni Müşteri', telefon: '05552220000' } },
    { m: 'PUT', path: `/api/customers/${c}`, access: 'auth', why: 'Müşteri düzenleme', payload: { ad_soyad: 'Matris Müşteri Güncel', telefon: '05551110000' } },

    // --- araçlar
    { m: 'GET', path: '/api/vehicles/search', access: 'auth', why: 'Araç arama' },
    { m: 'GET', path: '/api/vehicles/by-plate/34MAT001', access: 'auth', why: 'Plaka ile araç' },
    { m: 'GET', path: `/api/vehicles/${v}`, access: 'auth', why: 'Araç detay' },
    {
      m: 'POST',
      path: '/api/vehicles',
      access: 'auth',
      why: 'Araç ekleme',
      payload: { plaka: '34 MAT 002', marka: 'Matris', model: 'M2', musteri_id: c, musteri_ad_soyad: 'Matris Müşteri', musteri_telefon: '05551110000' }
    },
    {
      m: 'PUT',
      path: `/api/vehicles/${v}`,
      access: 'auth',
      why: 'Araç düzenleme',
      payload: { plaka: '34 MAT 001', marka: 'Matris', model: 'M1', musteri_id: c, musteri_ad_soyad: 'Matris Müşteri', musteri_telefon: '05551110000' }
    },

    // --- parça arşivi
    { m: 'GET', path: '/api/parts', access: 'auth', why: 'Parça listesi' },
    { m: 'GET', path: '/api/parts/by-barcode/MATBAR1', access: 'auth', why: 'Barkod ile parça' },
    { m: 'GET', path: '/api/parts/critical', access: 'auth', why: 'Kritik stok listesi' },
    { m: 'GET', path: `/api/parts/${p}`, access: 'auth', why: 'Parça detay' },
    {
      m: 'POST',
      path: '/api/parts',
      access: 'auth',
      why: 'Parça ekleme',
      payload: { ad: 'Matris Yeni Parça', kod: `MAT-${Date.now()}`, birim: 'Adet', kritik_stok: 0, alis_kurus: 500, satis_kurus: 1000, aktif: true }
    },
    {
      m: 'PUT',
      path: `/api/parts/${p}`,
      access: 'auth',
      why: 'Parça düzenleme (fiyat dahil)',
      payload: { ad: 'Matris Parça', kod: 'MAT-1', birim: 'Adet', kritik_stok: 1, alis_kurus: 1000, satis_kurus: 2500, aktif: true }
    },
    { m: 'POST', path: `/api/parts/${p}/stock-movement`, access: 'auth', why: 'Stok hareketi', payload: { miktar: 2, tur: 'giris' } },
    { m: 'POST', path: `/api/parts/${p}/stock-in`, access: 'auth', why: 'Depo girişi / alış fiyatı', payload: { miktar: 1, yeni_alis_fiyati_kurus: 1100 } },

    // --- iş emirleri
    { m: 'GET', path: '/api/work-orders', access: 'auth', why: 'İş emri listesi' },
    { m: 'GET', path: `/api/work-orders/${w}`, access: 'auth', why: 'İş emri detay' },
    {
      m: 'POST',
      path: '/api/work-orders',
      access: 'auth',
      why: 'İş emri oluşturma',
      payload: { arac_id: v, durum: 'kabul', sikayet: 'Matris yeni iş emri', kdv_orani: 20, kdv_dahil_mi: false, kalemler: [] }
    },
    {
      m: 'PUT',
      path: `/api/work-orders/${w}`,
      access: 'auth',
      why: 'İş emri düzenleme',
      payload: { arac_id: v, durum: 'kabul', sikayet: 'Matris iş emri', kdv_orani: 20, kdv_dahil_mi: false, kalemler: [{ tur: 'parca', parca_id: p, ad: 'Matris Parça', adet: 1, birim: 'Adet', birim_fiyat_kurus: 2500 }] }
    },
    { m: 'PUT', path: `/api/work-orders/${w}/status`, access: 'auth', why: 'Durum güncelleme', payload: { durum: 'onarimda' } },
    { m: 'POST', path: `/api/work-orders/${w}/payments`, access: 'auth', why: 'İş emrine ödeme', payload: { is_emri_id: w, tutar_kurus: 500, yontem: 'nakit' } },
    { m: 'POST', path: `/api/work-orders/${w}/reopen`, access: 'auth', why: 'İş emri yeniden açma', payload: { durum: 'onarimda' } },

    // --- ödemeler
    { m: 'POST', path: '/api/payments', access: 'auth', why: 'Ödeme ekleme', payload: { is_emri_id: w, tutar_kurus: 250, yontem: 'nakit' } },
    { m: 'GET', path: `/api/payments/work-order/${w}`, access: 'auth', why: 'İş emri ödemeleri' },

    // --- kasa (varsayılan matris: yalnızca sahip)
    { m: 'GET', path: '/api/cash-desk/summary', access: 'owner-only', why: 'Kasa raporu (mali)' },
    { m: 'GET', path: '/api/cash-desk/export-csv', access: 'owner-only', why: 'Kasa CSV (mali)' },

    // --- giderler
    { m: 'GET', path: '/api/expenses', access: 'auth', why: 'Gider listesi (özet sahibe)' },
    {
      m: 'POST',
      path: '/api/expenses',
      access: 'auth',
      why: 'Gider ekleme (staff: yalnız gündelik kategori)',
      payload: { tarih: '2026-10-17', kategori: 'Sarf Malzeme', aciklama: 'Matris sarf', tutar_kurus: 150 }
    },

    // --- hatırlatıcılar
    { m: 'GET', path: '/api/reminders/due', access: 'auth', why: 'Vadesi gelen hatırlatıcılar' },
    { m: 'GET', path: '/api/reminders/messages', access: 'auth', why: 'WhatsApp mesaj kayıtları' },
    { m: 'POST', path: `/api/reminders/messages/${ids.message}/sent`, access: 'auth', why: 'Mesaj gönderildi işaretle', payload: {} },

    // --- ayarlar
    { m: 'GET', path: '/api/settings', access: 'auth', why: 'Ayarları görüntüle' },
    { m: 'GET', path: '/api/settings/lan-info', access: 'auth', why: 'LAN bilgisi' },
    { m: 'PUT', path: '/api/settings', access: 'owner-only', why: 'Ayarları değiştir', payload: { dukkan_adi: 'Matris Dükkan' } },
    { m: 'GET', path: '/api/settings/audit-logs', access: 'owner-only', why: 'Denetim izleri' },

    // --- yedekleme (varsayılan matris: yalnızca sahip)
    { m: 'GET', path: '/api/backup/status', access: 'owner-only', why: 'Yedek durumu' },
    { m: 'POST', path: '/api/backup/now', access: 'owner-only', why: 'Hemen yedek al', payload: {} },
    {
      m: 'POST',
      path: '/api/backup/restore',
      access: 'owner-only',
      why: 'Yedekten geri yükle',
      payload: { filename: 'yok.zip' },
      ownerSkip: 'canlı veritabanını değiştirir (test yığınında çalıştırılmaz)'
    },

    // --- KVKK (varsayılan matris: yalnızca sahip)
    { m: 'GET', path: `/api/kvkk/export/${c}`, access: 'owner-only', why: 'KVKK veri dışa aktarma' },
    {
      m: 'POST',
      path: `/api/kvkk/anonymize/${c}`,
      access: 'owner-only',
      why: 'KVKK anonimleştirme',
      ownerSkip: 'müşteri verisini geri döndürülemez biçimde anonimleştirir'
    },

    // --- örnek veri yönetimi (en sonda; yıkıcı)
    { m: 'POST', path: '/api/admin/purge-samples', access: 'owner-only', why: 'Örnek verileri sil', payload: {} },
    { m: 'POST', path: '/api/admin/seed', access: 'owner-only', why: 'Örnek veri yükle (demo hesaplar dahil)', payload: {} }
  ];
}

describe('Bölüm 4.4 — Sunucu tarafı yetki matrisi', () => {
  beforeAll(async () => {
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });
    await seed();
  });

  afterAll(() => writeReport());

  it('anonim / personel / sahip: tüm uç noktalar', async () => {
    for (const row of inventory()) {
      const anon = await call(row.m, row.path, null, row.payload);
      const staff = await call(row.m, row.path, staffToken, row.payload);
      let ownerStatus: number;
      if (row.ownerSkip) {
        ownerStatus = -1;
      } else {
        ownerStatus = (await call(row.m, row.path, ownerToken, row.ownerPayload ?? row.payload)).status;
      }

      let ok = true;
      const notes: string[] = [];
      const deniedAnon = [401, 403].includes(anon.status);
      const noAnonData = !String(anon.body).includes('"success":true');

      if (row.access === 'public') {
        // Genel erişim: anon 401/403 olmamalı
        if (deniedAnon) {
          ok = false;
          notes.push('anon 401/403 (public olmalı)');
        }
      } else {
        if (!deniedAnon) {
          ok = false;
          notes.push(`anon ${anon.status} (401/403 beklenir)`);
        } else if (anon.status === 403) {
          // Kimlik doğrulama eksikken 401 yerine 403 dönmesi bilgi sızıntısı
          // değildir (veri dönmez) ama tutarsızlıktır — düşük önem, raporlanır.
          notes.push('anon 403 (401 yerine — düşük önem tutarsızlık)');
        }
        if (!noAnonData) {
          ok = false;
          notes.push('anon veri aldı!');
        }
      }

      // Reddedilen çağrılar veri döndürmemeli
      const staffDenied = [401, 403].includes(staff.status);
      const ownerDenied = [401, 403].includes(ownerStatus);

      if (row.access === 'owner-only') {
        if (staff.status !== 403) {
          ok = false;
          notes.push(`staff ${staff.status} (403 beklenir)`);
        }
        if (staffDenied && String(staff.body).includes('"success":true')) {
          ok = false;
          notes.push('staff reddedildi ama veri döndü!');
        }
        if (!row.ownerSkip && ownerDenied) {
          ok = false;
          notes.push(`owner ${ownerStatus} (yetkili olmalı)`);
        }
      } else if (row.access === 'auth') {
        if (staffDenied) {
          ok = false;
          notes.push(`staff ${staff.status} (izinli olmalı)`);
        }
        if (!row.ownerSkip && ownerDenied) {
          ok = false;
          notes.push(`owner ${ownerStatus} (izinli olmalı)`);
        }
      }

      if (ownerStatus === -1) notes.push(`owner: ${row.ownerSkip}`);
      results.push({ row, anon: anon.status, staff: staff.status, owner: ownerStatus, ok, note: notes.join('; ') });
    }

    const bad = results.filter((r) => !r.ok);
    expect(bad, `Beklenmeyen yetki davranışı:\n${bad.map((b) => `${b.row.m} ${b.row.path} [${b.row.access}] -> ${b.note}`).join('\n')}`).toEqual([]);
  });

  it('DELETE uçları: her kimlik için taze kayıt (yıkıcı)', async () => {
    async function freshCustomer(suffix: string) {
      const c = jsonOf(
        await ownerCall('POST', '/api/customers', { ad_soyad: `Silme Testi ${suffix}`, telefon: `0555${Date.now() % 10000000}` })
      )?.customer;
      return c.id;
    }
    async function freshVehicle(suffix: string) {
      const cid = await freshCustomer(suffix);
      const v = jsonOf(
        await ownerCall('POST', '/api/vehicles', {
          plaka: `34 DEL ${String(Math.floor(Math.random() * 900) + 100)}`,
          marka: 'Silme',
          model: 'T',
          musteri_id: cid,
          musteri_ad_soyad: 'Silme Testi',
          musteri_telefon: '05551112233'
        })
      )?.vehicle;
      return v.id;
    }

    const cases: Array<{
      name: string;
      resource: () => Promise<number>;
      path: (id: number) => string;
      fresh?: () => Promise<number>;
    }> = [
      {
        name: 'DELETE /api/customers/:id',
        resource: () => freshCustomer('müşteri'),
        path: (id) => `/api/customers/${id}`
      },
      {
        name: 'DELETE /api/vehicles/:id',
        resource: () => freshVehicle('araç'),
        path: (id) => `/api/vehicles/${id}`
      },
      {
        name: 'DELETE /api/parts/:id',
        resource: async () =>
          jsonOf(
            await ownerCall('POST', '/api/parts', {
              ad: 'Silme Parçası',
              kod: `DEL-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              birim: 'Adet',
              kritik_stok: 0,
              alis_kurus: 100,
              satis_kurus: 200,
              aktif: true
            })
          )?.part.id,
        path: (id) => `/api/parts/${id}`
      },
      {
        name: 'DELETE /api/work-orders/:id',
        resource: async () => {
          const vid = await freshVehicle('iş emri');
          const w = jsonOf(
            await ownerCall('POST', '/api/work-orders', {
              arac_id: vid,
              durum: 'kabul',
              sikayet: 'Silme testi iş emri',
              kdv_orani: 20,
              kdv_dahil_mi: false,
              kalemler: []
            })
          );
          return (w?.workOrder || w?.is_emri)?.id;
        },
        path: (id) => `/api/work-orders/${id}`
      },
      {
        name: 'DELETE /api/payments/:id',
        resource: async () => {
          return jsonOf(await ownerCall('POST', '/api/payments', { is_emri_id: ids.workOrder, tutar_kurus: 100, yontem: 'nakit' }))
            ?.payment.id;
        },
        path: (id) => `/api/payments/${id}`
      },
      {
        name: 'DELETE /api/expenses/:id',
        resource: async () =>
          jsonOf(
            await ownerCall('POST', '/api/expenses', { tarih: '2026-10-17', kategori: 'Fatura & Kira', aciklama: 'Silme gideri', tutar_kurus: 100 })
          )?.expense.id,
        path: (id) => `/api/expenses/${id}`
      },
      {
        name: 'DELETE /api/auth/users/:id',
        resource: async () =>
          jsonOf(
            await ownerCall('POST', '/api/auth/users', {
              username: `sil_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              password: 'Parola12345',
              full_name: 'Silinecek Kişi',
              role: 'staff'
            })
          )?.user.id,
        path: (id) => `/api/auth/users/${id}`
      }
    ];

    for (const c of cases) {
      const probeId = await c.resource();
      const anon = await call('DELETE', c.path(probeId), null);
      expect([401, 403], `${c.name} anon`).toContain(anon.status);
      expect(String(anon.body)).not.toContain('"success":true');

      const staffId = await c.resource();
      const staff = await call('DELETE', c.path(staffId), staffToken);

      const ownerId = await c.resource();
      const owner = await call('DELETE', c.path(ownerId), ownerToken);

      const allowedByDesign = staff.status === 200;
      deleteResults.push({
        name: c.name,
        anon: anon.status,
        staff: staff.status,
        owner: owner.status,
        staffAllowedByDesign: allowedByDesign,
        note:
          staff.status === 403
            ? 'personel reddedildi (varsayılan matrise uygun)'
            : 'personel silebildi — varsayılan matrise göre yalnızca sahip silmeli (Tasarım kararı bekliyor)'
      });
      expect(owner.status, `${c.name} owner`).toBe(200);
    }
  });

  it('gider sahipliği: personel yalnızca KENDİ gündelik giderini düzenler/siler', async () => {
    const own = await call('PUT', `/api/expenses/${ids.staffExpense}`, staffToken, {
      tarih: '2026-10-17',
      kategori: 'Sarf Malzeme',
      aciklama: 'Kendi giderim güncel',
      tutar_kurus: 120
    });
    expect(own.status).toBe(200);

    const other = await call('PUT', `/api/expenses/${ids.otherStaffExpense}`, staffToken, {
      tarih: '2026-10-17',
      kategori: 'Sarf Malzeme',
      aciklama: 'Başkasının gideri',
      tutar_kurus: 999
    });
    expect(other.status).toBe(403);

    const owners = await call('PUT', `/api/expenses/${ids.expense}`, staffToken, {
      tarih: '2026-10-17',
      kategori: 'Sarf Malzeme',
      aciklama: 'Sahibin gideri',
      tutar_kurus: 999
    });
    expect(owners.status).toBe(403);

    const delOther = await call('DELETE', `/api/expenses/${ids.otherStaffExpense}`, staffToken);
    expect(delOther.status).toBe(403);

    // Kendi giderini hassas kategoriye taşıyamaz
    const moveSensitive = await call('PUT', `/api/expenses/${ids.staffExpense}`, staffToken, {
      tarih: '2026-10-17',
      kategori: 'Personel',
      aciklama: 'Hassasa taşıma denemesi',
      tutar_kurus: 120
    });
    expect(moveSensitive.status).toBe(403);

    // Kendi giderini silebilir
    const delOwn = await call('DELETE', `/api/expenses/${ids.staffExpense}`, staffToken);
    expect(delOwn.status).toBe(200);

    // Hassas kategori ekleme: personel 403, sahip 200
    const staffSensitive = await call('POST', '/api/expenses', staffToken, {
      tarih: '2026-10-17',
      kategori: 'Personel',
      aciklama: 'Maaş',
      tutar_kurus: 1000
    });
    expect(staffSensitive.status).toBe(403);
    const ownerSensitive = await ownerCall('POST', '/api/expenses', {
      tarih: '2026-10-17',
      kategori: 'Personel',
      aciklama: 'Maaş',
      tutar_kurus: 1000
    });
    expect(ownerSensitive.status).toBe(200);
  });

  it('403 yan etki bırakmaz: personel ayarı değiştiremez, ayar bozulmaz', async () => {
    const before = jsonOf(await ownerCall('GET', '/api/settings'))?.settings;
    const attempt = await call('PUT', '/api/settings', staffToken, { dukkan_adi: 'ELE GECIRILDI' });
    expect(attempt.status).toBe(403);
    const after = jsonOf(await ownerCall('GET', '/api/settings'))?.settings;
    expect(after.dukkan_adi).toBe(before.dukkan_adi);
    expect(JSON.stringify(after)).not.toContain('ELE GECIRILDI');
  });

  it('HTTP yöntem / yol hileleri yetkiyi atlatamaz', async () => {
    const tricks: Array<[string, string, string | null]> = [
      ['HEAD', '/api/cash-desk/summary', staffToken],
      ['HEAD', '/api/cash-desk/summary', null],
      ['GET', '/api/./cash-desk/summary', staffToken],
      ['GET', '/API/cash-desk/summary', staffToken],
      ['GET', '/api/cash-desk/summary/', staffToken],
      ['GET', '/api/cash-desk//summary', staffToken],
      ['GET', '/api/cash-desk/summary?role=owner', staffToken]
    ];
    for (const [m, url, token] of tricks) {
      const r = await app.inject({ method: m as any, url, headers: token ? { authorization: `Bearer ${token}` } : {} });
      // Korumalı kasa verisi hiçbir hile ile dönmemeli. (Not: `/API/...` gibi
      // küçük/büyük harf farklı yollar `/api` ile başlamadığı için SPA
      // fallback'i 200 + index.html döner; bu bir yetki atlatma DEĞİLDİR,
      // çünkü gövdede kasa verisi yoktur.)
      expect(String(r.body), `${m} ${url} -> ${r.statusCode}`).not.toContain('"summary"');
      if (r.statusCode === 200) {
        // `/API/...` küçük/büyük harf farkı `/api` ile başlamadığından SPA
        // fallback'i index.html döner (yetki atlatma değil).
        expect(String(r.body)).toMatch(/<!doctype html|<div id="root"/i);
      } else {
        expect([401, 403, 404], `${m} ${url} -> ${r.statusCode}`).toContain(r.statusCode);
      }
    }
  });
});

function writeReport() {
  const lines: string[] = [];
  lines.push('# Yetki Matrisi Sonucu (Bölüm 4.4)');
  lines.push('');
  lines.push('Sunucu tarafı, üç kimlikle çağrıldı: **Anonim** (token yok), **Personel** (staff), **Sahip** (owner).');
  lines.push('');
  lines.push('`Beklenti` sütunu plandaki **varsayılan en-az-yetki matrisinden** türetilmiştir (projede yazılı yetki kuralı yok).');
  lines.push('Sahip çağrısı atlanan yıkıcı uçlar `—` ile işaretlidir.');
  lines.push('');
  lines.push('| Uç nokta | Anonim | Personel | Sahip | Beklenen | Sonuç | Not |');
  lines.push('|---|---|---|---|---|---|---|');
  for (const r of results) {
    const exp =
      r.row.access === 'public' ? 'herkes' : r.row.access === 'owner-only' ? 'yalnız sahip' : 'personel + sahip';
    lines.push(
      `| \`${r.row.m} ${r.row.path}\` | ${r.anon} | ${r.staff} | ${r.owner === -1 ? '—' : r.owner} | ${exp} | ${r.ok ? '✅' : '❌'} | ${r.note || r.row.why} |`
    );
  }
  lines.push('');
  lines.push(`Toplam uç nokta: **${results.length}** · Uygun: **${results.filter((r) => r.ok).length}** · Sapma: **${results.filter((r) => !r.ok).length}**`);
  lines.push('');

  if (deleteResults.length) {
    lines.push('## Silme (DELETE) uçları — her kimlik için taze kayıt');
    lines.push('');
    lines.push('| Uç nokta | Anonim | Personel | Sahip | Sonuç | Not |');
    lines.push('|---|---|---|---|---|---|');
    for (const d of deleteResults) {
      lines.push(
        `| \`${d.name}\` | ${d.anon} | ${d.staff} | ${d.owner} | ${d.staffAllowedByDesign ? '⚠️' : '✅'} | ${d.note} |`
      );
    }
    lines.push('');
    lines.push(
      `Personelin silebildiği uç sayısı: **${deleteResults.filter((d) => d.staffAllowedByDesign).length} / ${deleteResults.length}** (varsayılan matrise göre 0 olmalı)`
    );
    lines.push('');
  }

  const outDir = path.resolve(process.cwd(), '../../test-raporu');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'yetki-matrisi-sonuc.md'), lines.join('\n'), 'utf8');
}
