import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase } from '../src/db/index.js';
import { setupInitialAdmin, loginUser } from '../src/services/authService.js';
import { buildApp } from '../src/app.js';

/**
 * Denetim izi (audit log) etiketlerinin hedef tabloyla TUTARLI olduğunu doğrular.
 *
 * Bu testin amacı, geçmişte yaşanan şu hatayı bir daha oluşturmamaktır:
 *   - Yeni müşteri eklenirken  islem = 'customer_anonymize'  (yanlış: KVKK anonimleştirmesiyle karışır)
 *   - Müşteri güncellenirken  islem = 'settings_update'      (yanlış: ayar değişikliği olarak görünür)
 *   - Araç eklenirken         islem = 'work_order_create'    (yanlış: iş emri olarak görünür)
 *   - Araç güncellenirken     islem = 'settings_update'      (yanlış)
 *   - Araç silinirken         islem = 'work_order_delete'    (yanlış)
 *
 * Aynı doğrulama KVKK denetiminde "müşteri ekleme ile anonimleştirme karışır" riskini ortadan kaldırır.
 */
describe('Audit log: işlem etiketleri hedef tabloyla tutarlı olmalı', () => {
  let app: any;
  let ownerToken: string;

  beforeEach(async () => {
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });

    const admin = await setupInitialAdmin({
      username: 'admin',
      password: 'AdminPassword123',
      full_name: 'Ahmet Yönetici'
    });
    ownerToken = (await loginUser('admin', 'AdminPassword123')).token;
    expect(admin).toBeTruthy();
  });

  async function auditLogs(): Promise<any[]> {
    const res = await app.inject({
      method: 'GET',
      url: '/api/settings/audit-logs?limit=100',
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body).logs;
  }

  it('müşteri ekleme/güncelleme ve araç ekleme/güncelleme/silme doğru islem ile kaydedilir', async () => {
    // 1) Müşteri ekle
    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { ad_soyad: 'Audit Test Müşteri', telefon: '05551112233' }
    });
    expect(resCust.statusCode).toBe(200);
    const custId = JSON.parse(resCust.body).customer.id;

    // 2) Müşteri güncelle
    const resCustPut = await app.inject({
      method: 'PUT',
      url: `/api/customers/${custId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { ad_soyad: 'Audit Test Müşteri Güncel', telefon: '05551112233' }
    });
    expect(resCustPut.statusCode).toBe(200);

    // 3) Araç ekle
    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { musteri_id: custId, plaka: '34 AUD 01', marka: 'Renault', model: 'Megane', yil: 2021 }
    });
    expect(resVeh.statusCode).toBe(200);
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    // 4) Araç güncelle
    const resVehPut = await app.inject({
      method: 'PUT',
      url: `/api/vehicles/${vehId}`,
      headers: { authorization: `Bearer ${ownerToken}` },
      payload: { plaka: '34 AUD 02', marka: 'Renault', model: 'Clio' }
    });
    expect(resVehPut.statusCode).toBe(200);

    // 5) Araç sil
    const resVehDel = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehId}`,
      headers: { authorization: `Bearer ${ownerToken}` }
    });
    expect(resVehDel.statusCode).toBe(200);

    const logs = await auditLogs();
    const islemler = logs.map((l) => l.islem);

    // Doğru etiketler kaydedilmiş olmalı
    expect(islemler).toContain('customer_create');
    expect(islemler).toContain('customer_update');
    expect(islemler).toContain('vehicle_create');
    expect(islemler).toContain('vehicle_update');
    expect(islemler).toContain('vehicle_delete');

    // Müşteri işlemleri doğru etiketle eşleşmeli (detay üzerinden birebir kontrol)
    const musteriEkle = logs.find((l) => l.hedef_tablo === 'customers' && /Yeni müşteri eklendi/.test(l.detay || ''));
    const musteriGuncelle = logs.find((l) => l.hedef_tablo === 'customers' && /Müşteri güncellendi/.test(l.detay || ''));
    expect(musteriEkle?.islem).toBe('customer_create');
    expect(musteriGuncelle?.islem).toBe('customer_update');

    const aracEkle = logs.find((l) => l.hedef_tablo === 'vehicles' && /Yeni araç kaydedildi/.test(l.detay || ''));
    const aracGuncelle = logs.find((l) => l.hedef_tablo === 'vehicles' && /Araç güncellendi/.test(l.detay || ''));
    const aracSil = logs.find((l) => l.hedef_tablo === 'vehicles' && /Araç silindi/.test(l.detay || ''));
    expect(aracEkle?.islem).toBe('vehicle_create');
    expect(aracGuncelle?.islem).toBe('vehicle_update');
    expect(aracSil?.islem).toBe('vehicle_delete');

    // Yanlış/kopya etiketler HİÇ kullanılmamalı
    const musteriIslemleri = logs
      .filter((l) => l.hedef_tablo === 'customers')
      .map((l) => l.islem);
    expect(musteriIslemleri).not.toContain('customer_anonymize');
    expect(musteriIslemleri).not.toContain('settings_update');

    const aracIslemleri = logs
      .filter((l) => l.hedef_tablo === 'vehicles')
      .map((l) => l.islem);
    expect(aracIslemleri).not.toContain('settings_update');
    expect(aracIslemleri).not.toContain('work_order_create');
    expect(aracIslemleri).not.toContain('work_order_delete');
  });
});
