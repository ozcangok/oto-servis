import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, getDb, parts, stockMovements, workOrders } from '../src/db/index.js';
import { setupInitialAdmin, createUser, loginUser } from '../src/services/authService.js';
import { buildApp } from '../src/app.js';
import { getPartStock } from '../src/services/stockService.js';
import { formatCurrency } from '@oto-servis/shared';

describe('Phase 2: Vehicles, Customers, Parts, Work Orders, Stock & Plate Search API', () => {
  let app: any;
  let adminToken: string;
  let staffToken: string;
  let cashierToken: string;

  beforeEach(async () => {
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });

    // Setup owner (Dükkan Sahibi)
    const admin = await setupInitialAdmin({
      username: 'admin',
      password: 'AdminPassword123',
      full_name: 'Ahmet Yönetici'
    });
    const adminLogin = await loginUser('admin', 'AdminPassword123');
    adminToken = adminLogin.token;

    // Staff (Dükkan Elemanı) hesapları
    await createUser(admin as any, {
      username: 'kasiyer',
      password: 'CashierPassword123',
      full_name: 'Selin Eleman',
      role: 'staff'
    });
    cashierToken = (await loginUser('kasiyer', 'CashierPassword123')).token;

    await createUser(admin as any, {
      username: 'usta',
      password: 'MechanicPassword123',
      full_name: 'Kemal Usta',
      role: 'staff'
    });
    staffToken = (await loginUser('usta', 'MechanicPassword123')).token;
  });

  it('creates and searches customer with soft deletion', async () => {
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        ad_soyad: 'Mehmet Yılmaz',
        telefon: '05321112233',
        eposta: 'mehmet@example.com'
      }
    });
    expect(resCreate.statusCode).toBe(200);
    const cust = JSON.parse(resCreate.body).customer;
    expect(cust.id).toBeDefined();

    // Search by partial phone
    const resSearch = await app.inject({
      method: 'GET',
      url: '/api/customers?q=11122',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resSearch.statusCode).toBe(200);
    const searchData = JSON.parse(resSearch.body);
    expect(searchData.items.length).toBe(1);
    expect(searchData.items[0].ad_soyad).toBe('Mehmet Yılmaz');

    // Soft delete
    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/customers/${cust.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resDel.statusCode).toBe(200);

    // Search should not return deleted customer
    const resAfterDel = await app.inject({
      method: 'GET',
      url: '/api/customers?q=Mehmet',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(JSON.parse(resAfterDel.body).items.length).toBe(0);
  });

  it('creates vehicle with plate normalization and performs exact & partial plate search', async () => {
    // 1. Create customer
    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Ali Veli', telefon: '05442223344' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    // 2. Create vehicle with unnormalized plate input: " 34 abc 123 "
    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        musteri_id: custId,
        plaka: ' 34 abc 123 ',
        marka: 'Renault',
        model: 'Megane',
        yil: 2020
      }
    });
    expect(resVeh.statusCode).toBe(200);
    const veh = JSON.parse(resVeh.body).vehicle;
    expect(veh.plaka_norm).toBe('34ABC123');
    expect(veh.plaka_gorunen).toBe('34 ABC 123');

    // 3. Exact plate lookup: "34abc123"
    const resExact = await app.inject({
      method: 'GET',
      url: '/api/vehicles/by-plate/34abc123',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resExact.statusCode).toBe(200);
    const exactData = JSON.parse(resExact.body);
    expect(exactData.vehicle.plaka_norm).toBe('34ABC123');
    expect(exactData.vehicle.musteri.ad_soyad).toBe('Ali Veli');

    // 4. Partial search
    const resPartial = await app.inject({
      method: 'GET',
      url: '/api/vehicles/search?q=ABC',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resPartial.statusCode).toBe(200);
    expect(JSON.parse(resPartial.body).items.length).toBe(1);
  });

  it('manages parts catalog, barcode lookup and critical stock warning', async () => {
    // 1. Create part
    const resPart = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        ad: 'Yağ Filtresi',
        kod: 'FLT-01',
        barkod: '869000111222',
        kritik_stok: 5,
        alis_kurus: 10000,
        satis_kurus: 20000
      }
    });
    expect(resPart.statusCode).toBe(200);
    const partId = JSON.parse(resPart.body).part.id;

    // Initial stock is 0 (which is <= critical 5)
    expect(getPartStock(partId)).toBe(0);

    // 2. Add stock entry (+10)
    const resStockIn = await app.inject({
      method: 'POST',
      url: `/api/parts/${partId}/stock-movement`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        miktar: 10,
        tur: 'giris',
        notlar: 'Depo alımı'
      }
    });
    expect(resStockIn.statusCode).toBe(200);
    expect(getPartStock(partId)).toBe(10);

    // 3. Barcode scan lookup
    const resBarcode = await app.inject({
      method: 'GET',
      url: '/api/parts/by-barcode/869000111222',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resBarcode.statusCode).toBe(200);
    const scanned = JSON.parse(resBarcode.body).part;
    expect(scanned.ad).toBe('Yağ Filtresi');
    expect(scanned.stok_miktari).toBe(10);
    expect(scanned.is_critical).toBe(false);
  });

  it('executes full work order flow with exact verification calculation, stock deduction, peşin kapat & reversal', async () => {
    // 1. Create customer and vehicle
    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Kemal Test', telefon: '05001112233' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 XYZ 99', marka: 'Ford', model: 'Focus' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    // 2. Create part: 850 ₺ sell price, add 10 in stock
    const resPart = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        ad: 'Özel Parça',
        kod: 'PRC-01',
        barkod: '8699999999',
        kritik_stok: 2,
        alis_kurus: 40000,
        satis_kurus: 85000
      }
    });
    const partId = JSON.parse(resPart.body).part.id;

    await app.inject({
      method: 'POST',
      url: `/api/parts/${partId}/stock-movement`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { miktar: 10, tur: 'giris' }
    });
    expect(getPartStock(partId)).toBe(10);

    // 3. Create work order:
    // Prompt's test case: 2 × 850 ₺ part + 500 ₺ labor, %10 discount, %20 VAT
    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        km: 50000,
        sikayet: 'Periyodik bakım',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        iskonto_yuzde: 10,
        pesin_iskonto_yuzde: 5,
        kalemler: [
          { tur: 'parca', parca_id: partId, ad: 'Özel Parça', adet: 2, birim: 'Adet', birim_fiyat_kurus: 85000 },
          { tur: 'iscilik', ad: 'Bakım İşçiliği', adet: 1, birim: 'Saat', birim_fiyat_kurus: 50000 }
        ]
      }
    });
    expect(resOrder.statusCode).toBe(200);
    const orderId = JSON.parse(resOrder.body).workOrder.id;

    // Stock must have automatically decreased by 2: 10 - 2 = 8
    expect(getPartStock(partId)).toBe(8);

    // 4. Verify calculation totals
    const resGetOrder = await app.inject({
      method: 'GET',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const orderData = JSON.parse(resGetOrder.body).workOrder;
    // Expected: KDV dahil 2.376,00 ₺ (237600 kuruş), Peşin fiyat (ara toplamdan %5): 1.881,00 ₺ (188100 kuruş)
    expect(orderData.brut_kurus).toBe(237600);
    expect(formatCurrency(orderData.brut_kurus)).toBe('2.376,00 ₺');
    expect(orderData.pesin_fiyat_kurus).toBe(188100);
    expect(formatCurrency(orderData.pesin_fiyat_kurus)).toBe('1.881,00 ₺');

    // 5. Update work order: change part quantity to 3
    const resUpdate = await app.inject({
      method: 'PUT',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        km: 50000,
        sikayet: 'Periyodik bakım',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        iskonto_yuzde: 10,
        kalemler: [
          { tur: 'parca', parca_id: partId, ad: 'Özel Parça', adet: 3, birim: 'Adet', birim_fiyat_kurus: 85000 },
          { tur: 'iscilik', ad: 'Bakım İşçiliği', adet: 1, birim: 'Saat', birim_fiyat_kurus: 50000 }
        ]
      }
    });
    expect(resUpdate.statusCode).toBe(200);
    // Stock delta applied: was 8, 1 more used -> now 7
    expect(getPartStock(partId)).toBe(7);

    // 6. Peşin Kapat action
    const resClose = await app.inject({
      method: 'POST',
      url: `/api/work-orders/${orderId}/pesin-kapat`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { yontem: 'nakit' }
    });
    expect(resClose.statusCode).toBe(200);

    const resClosedCheck = await app.inject({
      method: 'GET',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const closedOrder = JSON.parse(resClosedCheck.body).workOrder;
    expect(closedOrder.durum).toBe('teslim_edildi');
    expect(closedOrder.pesin_kalan_kurus).toBe(0);
    expect(closedOrder.kapanis_tarihi).toBeDefined();

    // 7. Soft delete work order -> stock must be fully reversed back to 10
    const resDelete = await app.inject({
      method: 'DELETE',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resDelete.statusCode).toBe(200);
    expect(getPartStock(partId)).toBe(10);
  });

  it('creates vehicle + customer inline via musteri_ad_soyad (work order client flow)', async () => {
    // Regression: the work order screen sends musteri_ad_soyad/musteri_telefon
    // (previously sent as musteri_ad and failed with
    // "Lütfen müşteri adı ve soyadı giriniz veya kayıtlı bir müşteri seçiniz.")
    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        plaka: '34 ABC 999',
        marka: 'Fiat',
        model: 'Egea',
        musteri_ad_soyad: 'Inline Müşteri',
        musteri_telefon: '05323334455'
      }
    });
    expect(resVeh.statusCode).toBe(200);
    const body = JSON.parse(resVeh.body);
    expect(body.success).toBe(true);
    expect(body.vehicle.id).toBeDefined();
    expect(body.vehicle.musteri).toBeDefined();
    expect(body.vehicle.musteri.ad_soyad).toBe('Inline Müşteri');
    expect(body.vehicle.musteri.telefon).toBe('05323334455');

    // Same phone reuses the registered customer instead of duplicating
    const resVeh2 = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        plaka: '34 DEF 999',
        marka: 'Ford',
        model: 'Focus',
        musteri_ad_soyad: 'Inline Müşteri',
        musteri_telefon: '05323334455'
      }
    });
    expect(resVeh2.statusCode).toBe(200);
    expect(JSON.parse(resVeh2.body).vehicle.musteri.id).toBe(body.vehicle.musteri.id);

    // Rejects missing customer name with the actionable message
    const resNoName = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { plaka: '34 GHI 999', marka: 'Fiat', model: 'Egea' }
    });
    expect(resNoName.statusCode).toBe(400);
    expect(JSON.parse(resNoName.body).error).toContain('kayıtlı bir müşteri');
  });

  it('updates linked customer name/phone via PUT /vehicles/:id (vehicle edit modal flow)', async () => {
    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Eski İsim', telefon: '05001112233' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '06 XYZ 01', marka: 'Renault', model: 'Clio' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    // Edit modal sends plaka + customer fields
    const resPut = await app.inject({
      method: 'PUT',
      url: `/api/vehicles/${vehId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        plaka: '06 XYZ 01',
        marka: 'Renault',
        model: 'Clio',
        musteri_ad_soyad: 'Yeni İsim',
        musteri_telefon: '05009998877'
      }
    });
    expect(resPut.statusCode).toBe(200);

    const resGet = await app.inject({
      method: 'GET',
      url: `/api/customers/${custId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const updated = JSON.parse(resGet.body).customer;
    expect(updated.ad_soyad).toBe('Yeni İsim');
    expect(updated.telefon).toBe('05009998877');
  });

  it('creates work order for an inline-registered vehicle (new work order flow)', async () => {
    // User scenario: register vehicle (auto-creates customer), then open work order.
    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        plaka: '35 GHJ 01',
        marka: 'Toyota',
        model: 'Corolla',
        musteri_ad_soyad: 'Senaryo Sürücüsü',
        musteri_telefon: '05361112233'
      }
    });
    expect(resVeh.statusCode).toBe(200);
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        km: 120000,
        sikayet: 'Fren balatası değişimi',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        kalemler: [
          { tur: 'iscilik', ad: 'Balata değişim işçiliği', adet: 1, birim: 'Adet', birim_fiyat_kurus: 50000 }
        ]
      }
    });
    expect(resOrder.statusCode).toBe(200);
    expect(JSON.parse(resOrder.body).workOrder.id).toBeDefined();

    // Unknown vehicle id is rejected with an actionable message
    const resMissing = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: 999999,
        km: 0,
        sikayet: 'Test',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        kalemler: [
          { tur: 'iscilik', ad: 'Test işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 1000 }
        ]
      }
    });
    expect(resMissing.statusCode).toBe(404);
    expect(JSON.parse(resMissing.body).error).toContain('Araç bulunamadı');
  });

  it('accepts legacy musteri_ad field and partial PUT without plaka (stale client compat)', async () => {
    // Old cached bundles send musteri_ad instead of musteri_ad_soyad
    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        plaka: '34 OLD 01',
        marka: 'Fiat',
        model: 'Egea',
        musteri_ad: 'Eski İstemci Müşterisi',
        musteri_telefon: '05390001122'
      }
    });
    expect(resVeh.statusCode).toBe(200);
    const body = JSON.parse(resVeh.body);
    expect(body.success).toBe(true);
    expect(body.vehicle.musteri.ad_soyad).toBe('Eski İstemci Müşterisi');
    const vehId = body.vehicle.id;

    // Old edit modal sends no plaka and legacy customer fields
    const resPut = await app.inject({
      method: 'PUT',
      url: `/api/vehicles/${vehId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        marka: 'Fiat',
        model: 'Egea Cross',
        musteri_ad: 'Eski İstemci Güncel',
        musteri_telefon: '05390003344'
      }
    });
    expect(resPut.statusCode).toBe(200);
    const updated = JSON.parse(resPut.body).vehicle;
    expect(updated.model).toBe('Egea Cross');
    expect(updated.plaka_norm).toBe('34OLD01');

    const resCust = await app.inject({
      method: 'GET',
      url: `/api/customers/${body.vehicle.musteri.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const cust = JSON.parse(resCust.body).customer;
    expect(cust.ad_soyad).toBe('Eski İstemci Güncel');
    expect(cust.telefon).toBe('05390003344');
  });

  it('restores soft-deleted plate instead of UNIQUE crash (re-register flow)', async () => {
    const payload = {
      plaka: '34 RST 01',
      marka: 'Fiat',
      model: 'Egea',
      musteri_ad_soyad: 'Geri Getir Test',
      musteri_telefon: '05391110011'
    };
    const resCreate = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload
    });
    expect(resCreate.statusCode).toBe(200);
    const vehId = JSON.parse(resCreate.body).vehicle.id;

    // Soft delete
    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resDel.statusCode).toBe(200);

    // Re-register same plate: must restore, not crash with UNIQUE constraint
    const resRe = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload
    });
    expect(resRe.statusCode).toBe(200);
    const reBody = JSON.parse(resRe.body);
    expect(reBody.success).toBe(true);
    expect(reBody.vehicle.id).toBe(vehId);
    expect(reBody.vehicle.deleted_at).toBeNull();
    expect(reBody.message).toContain('geri getirildi');
  });

  it('exposes client-compatible aliases (plaka, tutar fields, history, customer)', async () => {
    // Setup: customer + vehicle + work order with payment
    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Alias Test', telefon: '05392223344' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 ALI 01', marka: 'Tofaş', model: 'Şahin' }
    });
    const veh = JSON.parse(resVeh.body).vehicle;
    expect(veh.plaka).toBe('34 ALI 01');

    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: veh.id,
        km: 1000,
        sikayet: 'Alias kontrol',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        kalemler: [
          { tur: 'iscilik', ad: 'Kontrol', adet: 1, birim: 'Adet', birim_fiyat_kurus: 100000 }
        ]
      }
    });
    const orderId = JSON.parse(resOrder.body).workOrder.id;

    // 1. by-plate: top-level customer + history with tutar aliases
    const resByPlate = await app.inject({
      method: 'GET',
      url: '/api/vehicles/by-plate/34ALI01',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resByPlate.statusCode).toBe(200);
    const detail = JSON.parse(resByPlate.body);
    expect(detail.vehicle.plaka).toBe('34 ALI 01');
    expect(detail.customer.ad_soyad).toBe('Alias Test');
    expect(detail.history.length).toBe(1);
    const h = detail.history[0];
    expect(h.plaka).toBe('34 ALI 01');
    expect(h.giris_tarihi).toBeDefined();
    expect(h.brut_tutar_kurus).toBe(120000);
    expect(h.kalan_tutar_kurus).toBe(120000);
    expect(h.odenen_tutar_kurus).toBe(0);

    // 2. work-orders list: flattened + tutar aliases
    const resList = await app.inject({
      method: 'GET',
      url: '/api/work-orders?limit=50',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const item = JSON.parse(resList.body).items.find((o: any) => o.id === orderId);
    expect(item.plaka).toBe('34 ALI 01');
    expect(item.musteri_ad).toBe('Alias Test');
    expect(item.arac_marka).toBe('Tofaş');
    expect(item.giris_tarihi).toBeDefined();
    expect(item.brut_tutar_kurus).toBe(120000);
    expect(item.iscilik_toplam_kurus).toBe(100000);

    // 3. vehicles search: plaka alias present
    const resSearch = await app.inject({
      method: 'GET',
      url: '/api/vehicles/search?q=ALI',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const found = JSON.parse(resSearch.body).items[0];
    expect(found.plaka).toBe('34 ALI 01');

    // 4. cash-desk summary: snake_case + transaction aliases (after a payment)
    // NOTE: local date (not UTC slice) to avoid midnight flakes
    const nowLocal = new Date();
    const localDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;
    await app.inject({
      method: 'POST',
      url: `/api/work-orders/${orderId}/payments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tutar_kurus: 20000, odeme_yontemi: 'Nakit', odeme_tarihi: localDate }
    });
    const resCash = await app.inject({
      method: 'GET',
      url: '/api/cash-desk/summary',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const summary = JSON.parse(resCash.body).summary;
    expect(summary.nakit_kurus).toBe(20000);
    expect(summary.by_method.nakit).toBe(20000);
    expect(summary.payments.length).toBeGreaterThan(0);
    const tx = summary.payments.find((t: any) => t.tutar_kurus === 20000);
    expect(tx.musteri_ad).toBe('Alias Test');
    expect(tx.odeme_yontemi).toBe('Nakit');
  });

  it('honors kilometre/giris_tarihi aliases and settings-based pesin rate', async () => {
    const { updateSettings } = await import('../src/services/settingsService.js');

    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Km Test', telefon: '05393334455' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 KM 01', marka: 'Fiat', model: 'Egea' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    // Client-style body with kilometre + giris_tarihi aliases
    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        kilometre: 148500,
        giris_tarihi: '2026-01-15',
        sikayet: 'Km alias kontrol',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        kalemler: [
          { tur: 'iscilik', ad: 'Kontrol', adet: 1, birim: 'Adet', birim_fiyat_kurus: 100000 }
        ]
      }
    });
    expect(resOrder.statusCode).toBe(200);
    const orderId = JSON.parse(resOrder.body).workOrder.id;

    const resGet = await app.inject({
      method: 'GET',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const detail = JSON.parse(resGet.body).workOrder;
    expect(detail.km).toBe(148500);
    expect(detail.giris_tarihi).toBe('2026-01-15');

    // Default settings (no row): pesin rate falls back to 5% (ara toplam 100000 üzerinden)
    expect(detail.pesin_fiyat_kurus).toBe(95000);

    // Zero the default cash discount like the shop owner did
    await updateSettings({ default_cash_discount_rate: 0 } as any);
    const resGet2 = await app.inject({
      method: 'GET',
      url: `/api/work-orders/${orderId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const detail2 = JSON.parse(resGet2.body).workOrder;
    expect(detail2.pesin_fiyat_kurus).toBe(detail2.net_tutar_kurus);
  });

  it('cascades vehicle delete to open work orders with stock reversal', async () => {
    const { updateSettings } = await import('../src/services/settingsService.js');
    await updateSettings({ default_cash_discount_rate: 0 } as any);
    const { getPartStock } = await import('../src/services/stockService.js');

    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Zincir Test', telefon: '05395556677' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 ZNC 01', marka: 'Fiat', model: 'Egea' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    // Part with stock
    const resPart = await app.inject({
      method: 'POST',
      url: '/api/parts',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad: 'Zincir Parça', kod: 'ZNC-01', kritik_stok: 1, alis_kurus: 1000, satis_kurus: 2000 }
    });
    const partId = JSON.parse(resPart.body).part.id;
    await app.inject({
      method: 'POST',
      url: `/api/parts/${partId}/stock-movement`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { miktar: 5, tur: 'giris' }
    });

    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        sikayet: 'Zincir silme',
        kdv_orani: 0,
        kdv_dahil_mi: false,
        kalemler: [
          { tur: 'parca', parca_id: partId, ad: 'Zincir Parça', adet: 2, birim: 'Adet', birim_fiyat_kurus: 2000 }
        ]
      }
    });
    const orderId = JSON.parse(resOrder.body).workOrder.id;
    expect(getPartStock(partId)).toBe(3);

    // Delete vehicle -> order must close and stock must return
    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resDel.statusCode).toBe(200);
    expect(getPartStock(partId)).toBe(5);

    // Dashboard list must not contain the orphan order
    const resList = await app.inject({
      method: 'GET',
      url: '/api/work-orders?limit=50',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    const ids = JSON.parse(resList.body).items.map((o: any) => o.id);
    expect(ids).not.toContain(orderId);

    // Delete customer with no remaining vehicles still works
    const resDelCust = await app.inject({
      method: 'DELETE',
      url: `/api/customers/${custId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resDelCust.statusCode).toBe(200);
  });

  it('updates work order status via PUT /work-orders/:id/status', async () => {
    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Durum Test', telefon: '05394445566' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 DST 01', marka: 'Fiat', model: 'Egea' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        sikayet: 'Durum değişimi',
        kdv_orani: 0,
        kdv_dahil_mi: false,
        kalemler: [
          { tur: 'iscilik', ad: 'Kontrol', adet: 1, birim: 'Adet', birim_fiyat_kurus: 10000 }
        ]
      }
    });
    const orderId = JSON.parse(resOrder.body).workOrder.id;

    // Stage dropdown flow (canonical value)
    const resStatus = await app.inject({
      method: 'PUT',
      url: `/api/work-orders/${orderId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { durum: 'teslime_hazir' }
    });
    expect(resStatus.statusCode).toBe(200);
    expect(JSON.parse(resStatus.body).workOrder.durum).toBe('teslime_hazir');

    // Legacy Turkish spelling is normalized, not rejected
    const resLegacy = await app.inject({
      method: 'PUT',
      url: `/api/work-orders/${orderId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { durum: 'onarımda' }
    });
    expect(resLegacy.statusCode).toBe(200);
    expect(JSON.parse(resLegacy.body).workOrder.durum).toBe('onarimda');

    // Invalid status rejected with Turkish message
    const resBad = await app.inject({
      method: 'PUT',
      url: `/api/work-orders/${orderId}/status`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { durum: 'uzayda' }
    });
    expect(resBad.statusCode).toBe(400);
  });

  it('enforces role-based permissions (staff kasa göremez, sahibi görür)', async () => {
    // Personel (staff) parça listesini görebilir (fiyatlar artık gizlenmez)
    const resParts = await app.inject({
      method: 'GET',
      url: '/api/parts',
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(resParts.statusCode).toBe(200);

    // Personel kasa özetine erişemez
    const resCashStaff = await app.inject({
      method: 'GET',
      url: '/api/cash-desk/summary',
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(resCashStaff.statusCode).toBe(403);
    expect(JSON.parse(resCashStaff.body).error).toContain('dükkan sahibi');

    // Dükkan sahibi kasa özetine erişebilir
    const resCashOwner = await app.inject({
      method: 'GET',
      url: '/api/cash-desk/summary',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resCashOwner.statusCode).toBe(200);
  });

  it('silinen aracin tahsilati kasa raporundan duser', async () => {
    const nowLocal = new Date();
    const localDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Kasa Arac Silme', telefon: '05551112233' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 KASA 01', marka: 'Honda', model: 'Civic' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        km: 500,
        sikayet: 'Kasa arac silme',
        kalemler: [{ tur: 'iscilik', ad: 'Bakım', adet: 1, birim: 'Adet', birim_fiyat_kurus: 50000 }]
      }
    });
    const orderId = JSON.parse(resOrder.body).workOrder.id;

    await app.inject({
      method: 'POST',
      url: `/api/work-orders/${orderId}/payments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tutar_kurus: 30000, odeme_yontemi: 'Nakit', odeme_tarihi: localDate }
    });

    const before = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/cash-desk/summary',
          headers: { authorization: `Bearer ${adminToken}` }
        })
      ).body
    ).summary;
    expect(before.payments.some((p: any) => p.is_emri_id === orderId)).toBe(true);
    expect(before.totalCollectedKurus).toBeGreaterThanOrEqual(30000);

    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/vehicles/${vehId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resDel.statusCode).toBe(200);

    const after = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/cash-desk/summary',
          headers: { authorization: `Bearer ${adminToken}` }
        })
      ).body
    ).summary;
    expect(after.payments.some((p: any) => p.is_emri_id === orderId)).toBe(false);
    expect(after.totalCollectedKurus).toBe(0);
  });

  it('silinen musterinin tahsilati kasa raporundan duser', async () => {
    const nowLocal = new Date();
    const localDate = `${nowLocal.getFullYear()}-${String(nowLocal.getMonth() + 1).padStart(2, '0')}-${String(nowLocal.getDate()).padStart(2, '0')}`;

    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Kasa Musteri Silme', telefon: '05552223344' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 KASA 02', marka: 'Toyota', model: 'Corolla' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    const resOrder = await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        km: 700,
        sikayet: 'Kasa müşteri silme',
        kalemler: [{ tur: 'iscilik', ad: 'Onarım', adet: 1, birim: 'Adet', birim_fiyat_kurus: 80000 }]
      }
    });
    const orderId = JSON.parse(resOrder.body).workOrder.id;

    await app.inject({
      method: 'POST',
      url: `/api/work-orders/${orderId}/payments`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tutar_kurus: 40000, odeme_yontemi: 'Nakit', odeme_tarihi: localDate }
    });

    const resDel = await app.inject({
      method: 'DELETE',
      url: `/api/customers/${custId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(resDel.statusCode).toBe(200);

    const after = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/cash-desk/summary',
          headers: { authorization: `Bearer ${adminToken}` }
        })
      ).body
    ).summary;
    expect(after.payments.some((p: any) => p.is_emri_id === orderId)).toBe(false);
    expect(after.totalCollectedKurus).toBe(0);
    expect(after.grandTotalLaborKurus).toBe(0);
  });

  it('giderler modulu yalnizca sahibe acik ve CRUD calisir', async () => {
    // Personel giderleri göremez / ekleyemez
    const staffGet = await app.inject({
      method: 'GET',
      url: '/api/expenses?period=month',
      headers: { authorization: `Bearer ${staffToken}` }
    });
    expect(staffGet.statusCode).toBe(403);

    const staffPost = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${staffToken}` },
      payload: { tarih: '2026-01-05', kategori: 'Sarf Malzeme', aciklama: 'Eldiven', tutar_kurus: 7000 }
    });
    expect(staffPost.statusCode).toBe(403);

    // Sahip gider ekler
    const ownerPost = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tarih: '2026-01-05', kategori: 'Sarf Malzeme', aciklama: 'Atölye eldiveni', tutar_kurus: 7000 }
    });
    expect(ownerPost.statusCode).toBe(200);
    const created = JSON.parse(ownerPost.body).expense;
    expect(created.id).toBeDefined();
    expect(created.kategori).toBe('Sarf Malzeme');
    expect(created.tutar_kurus).toBe(7000);

    // Geçersiz kategori / tutar reddedilir
    const badCat = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tarih: '2026-01-05', kategori: 'Uydurma Kategori', aciklama: 'X', tutar_kurus: 100 }
    });
    expect(badCat.statusCode).toBe(400);

    const badAmount = await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tarih: '2026-01-05', kategori: 'Diğer', aciklama: 'Negatif tutar', tutar_kurus: -5 }
    });
    expect(badAmount.statusCode).toBe(400);

    // Liste ve toplam (tüm zamanlar)
    const list = await app.inject({
      method: 'GET',
      url: '/api/expenses?period=all',
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(list.statusCode).toBe(200);
    const listBody = JSON.parse(list.body);
    expect(listBody.summary.expenseTotalKurus).toBe(7000);
    expect(listBody.summary.expenseCount).toBe(1);
    expect(listBody.items[0].kullanici.full_name).toBe('Ahmet Yönetici');

    // Güncelle
    const put = await app.inject({
      method: 'PUT',
      url: `/api/expenses/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { tarih: '2026-01-06', kategori: 'Diğer', aciklama: 'Güncellendi', tutar_kurus: 12500 }
    });
    expect(put.statusCode).toBe(200);
    expect(JSON.parse(put.body).expense.tutar_kurus).toBe(12500);

    // Sil
    const del = await app.inject({
      method: 'DELETE',
      url: `/api/expenses/${created.id}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(del.statusCode).toBe(200);

    const after = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/expenses?period=all',
          headers: { authorization: `Bearer ${adminToken}` }
        })
      ).body
    );
    expect(after.summary.expenseTotalKurus).toBe(0);
    expect(after.items.length).toBe(0);
  });

  it('gider ozeti iscilik gelirini kullanir ve kasa toplamlarini degistirmez', async () => {
    // İşçilikli iş emri (500,00 TL işçilik)
    const resCust = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { ad_soyad: 'Gider Test', telefon: '05559998877' }
    });
    const custId = JSON.parse(resCust.body).customer.id;

    const resVeh = await app.inject({
      method: 'POST',
      url: '/api/vehicles',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { musteri_id: custId, plaka: '34 GDR 01', marka: 'Fiat', model: 'Egea' }
    });
    const vehId = JSON.parse(resVeh.body).vehicle.id;

    await app.inject({
      method: 'POST',
      url: '/api/work-orders',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        arac_id: vehId,
        km: 1000,
        sikayet: 'İşçilik testi',
        kdv_orani: 20,
        kdv_dahil_mi: false,
        kalemler: [{ tur: 'iscilik', ad: 'İşçilik', adet: 1, birim: 'Saat', birim_fiyat_kurus: 50000 }]
      }
    });

    // Kasa (rapor) — gider eklemeden önce
    const cashBefore = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/cash-desk/summary',
          headers: { authorization: `Bearer ${adminToken}` }
        })
      ).body
    ).summary;

    // Gider ekle
    await app.inject({
      method: 'POST',
      url: '/api/expenses',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        tarih: new Date().toISOString().slice(0, 10),
        kategori: 'Personel',
        aciklama: 'Personel avansı',
        tutar_kurus: 20000
      }
    });

    const overview = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/expenses?period=all',
          headers: { authorization: `Bearer ${adminToken}` }
        })
      ).body
    );
    expect(overview.summary.laborIncomeKurus).toBe(50000);
    expect(overview.summary.expenseTotalKurus).toBe(20000);
    expect(overview.summary.netProfitKurus).toBe(30000);

    // Kasa toplamları giderden etkilenmemeli (kasa sabit kalır)
    const cashAfter = JSON.parse(
      (
        await app.inject({
          method: 'GET',
          url: '/api/cash-desk/summary',
          headers: { authorization: `Bearer ${adminToken}` }
        })
      ).body
    ).summary;
    expect(cashAfter.grandTotalLaborKurus).toBe(50000);
    expect(cashAfter.grandTotalLaborKurus).toBe(cashBefore.grandTotalLaborKurus);
    expect(cashAfter.totalCollectedKurus).toBe(cashBefore.totalCollectedKurus);
  });
});
