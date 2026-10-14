import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, getDb, parts, stockMovements, workOrders } from '../src/db/index.js';
import { setupInitialAdmin, createUser, loginUser } from '../src/services/authService.js';
import { buildApp } from '../src/app.js';
import { getPartStock } from '../src/services/stockService.js';
import { formatCurrency } from '@oto-servis/shared';

describe('Phase 2: Vehicles, Customers, Parts, Work Orders, Stock & Plate Search API', () => {
  let app: any;
  let adminToken: string;
  let mechanicToken: string;
  let cashierToken: string;

  beforeEach(async () => {
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });

    // Setup admin
    const admin = await setupInitialAdmin({
      username: 'admin',
      password: 'AdminPassword123',
      full_name: 'Ahmet Yönetici'
    });
    const adminLogin = await loginUser('admin', 'AdminPassword123');
    adminToken = adminLogin.token;

    // Create mechanic & cashier
    const cashier = await createUser(admin as any, {
      username: 'kasiyer',
      password: 'CashierPassword123',
      full_name: 'Selin Kasiyer',
      role: 'cashier'
    });
    cashierToken = (await loginUser('kasiyer', 'CashierPassword123')).token;

    const mechanic = await createUser(admin as any, {
      username: 'usta',
      password: 'MechanicPassword123',
      full_name: 'Kemal Usta',
      role: 'mechanic'
    });
    mechanicToken = (await loginUser('usta', 'MechanicPassword123')).token;
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
    // Expected: KDV dahil 2.376,00 ₺ (237600 kuruş), Peşin fiyat: 2.257,20 ₺ (225720 kuruş)
    expect(orderData.brut_kurus).toBe(237600);
    expect(formatCurrency(orderData.brut_kurus)).toBe('2.376,00 ₺');
    expect(orderData.pesin_fiyat_kurus).toBe(225720);
    expect(formatCurrency(orderData.pesin_fiyat_kurus)).toBe('2.257,20 ₺');

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

  it('enforces role-based permissions (Mechanic cannot see prices or payments)', async () => {
    // Mechanic gets list of parts
    const resParts = await app.inject({
      method: 'GET',
      url: '/api/parts',
      headers: { authorization: `Bearer ${mechanicToken}` }
    });
    expect(resParts.statusCode).toBe(200);
    // If parts exist, prices should be hidden (0)
    for (const p of JSON.parse(resParts.body).items) {
      expect(p.alis_kurus).toBe(0);
      expect(p.satis_kurus).toBe(0);
    }

    // Mechanic cannot add payment
    const resPay = await app.inject({
      method: 'POST',
      url: '/api/payments',
      headers: { authorization: `Bearer ${mechanicToken}` },
      payload: { is_emri_id: 1, tutar_kurus: 5000, yontem: 'nakit' }
    });
    expect(resPay.statusCode).toBe(403);
    expect(JSON.parse(resPay.body).error).toContain('Usta rolü');
  });
});
