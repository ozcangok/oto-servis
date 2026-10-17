import { test, expect } from '@playwright/test';
import {
  OWNER,
  apiLogin,
  apiJson,
  createCustomer,
  createVehicle,
  createWorkOrder,
  uniqPlate,
  dateOnly,
  isoAtNoon
} from './helpers.js';

/**
 * KATEGORİ 4 — VERİ BÜTÜNLÜĞÜ VE KASKAD SİLME
 *
 * İş emri bulunan bir araç/müşteri silindiğinde:
 *  (1) ilgili tahsilat Kasa'dan düşer,
 *  (2) net kâr (işçilik geliri) tam olarak azalır.
 * Ayrıca aynı plakadan ikinci bir araç oluşturulamaz; sistem uyarı verip durur.
 */
test.describe('4) Veri bütünlüğü ve kaskad silme', () => {
  test('müşteri/araç silinince tahsilat kasadan düşer ve net kâr azalır', async ({ request }) => {
    const token = await apiLogin(request, OWNER);
    const now = new Date();
    const today = dateOnly(now);
    const payISO = isoAtNoon(now.getFullYear(), now.getMonth(), now.getDate());

    const baseCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;
    const baseExp = (await apiJson(request, 'GET', '/api/expenses?period=today', token)).body.summary;

    const plate = uniqPlate();
    const cust = await createCustomer(request, token, {});
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });

    const order = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka: plate,
      giris_tarihi: payISO,
      kalemler: [
        { tur: 'iscilik', ad: 'E2E kaskad işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 25000 }
      ]
    });
    expect(order.status, JSON.stringify(order.body)).toBe(200);
    const orderId = order.body.workOrder.id;

    const pay = await apiJson(request, 'POST', '/api/payments', token, {
      is_emri_id: orderId,
      tutar_kurus: 40000,
      yontem: 'nakit',
      tarih: payISO
    });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);

    const afterCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;
    const afterExp = (await apiJson(request, 'GET', '/api/expenses?period=today', token)).body.summary;

    expect(afterCash.byMethod.nakit).toBe(baseCash.byMethod.nakit + 40000);
    expect(afterCash.totalCollectedKurus).toBe(baseCash.totalCollectedKurus + 40000);
    expect(afterExp.laborIncomeKurus).toBe(baseExp.laborIncomeKurus + 25000);
    expect(afterExp.netProfitKurus).toBe(baseExp.netProfitKurus + 25000);

    // Müşteriyi sil → araç + iş emri kapanır, tahsilat Kasa'dan düşer
    const del = await apiJson(request, 'DELETE', `/api/customers/${cust.id}`, token);
    expect(del.status, JSON.stringify(del.body)).toBe(200);

    const afterDelCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;
    const afterDelExp = (await apiJson(request, 'GET', '/api/expenses?period=today', token)).body.summary;

    expect(afterDelCash.byMethod.nakit).toBe(baseCash.byMethod.nakit);
    expect(afterDelCash.totalCollectedKurus).toBe(baseCash.totalCollectedKurus);
    expect(afterDelExp.laborIncomeKurus).toBe(baseExp.laborIncomeKurus);
    expect(afterDelExp.netProfitKurus).toBe(baseExp.netProfitKurus);
  });

  test('aynı plakayla ikinci araç oluşturulmaz, sistem uyarı verip mevcut aracı döndürür', async ({ request }) => {
    const token = await apiLogin(request, OWNER);
    const plate = uniqPlate();

    const first = await createVehicle(request, token, { plaka: plate });

    const second = await apiJson(request, 'POST', '/api/vehicles', token, {
      plaka: plate,
      marka: 'E2E Test',
      model: 'Model',
      musteri_ad_soyad: 'E2E Test Müşteri'
    });

    expect(second.status).toBe(200);
    expect(second.body.vehicle.id).toBe(first.id);
    expect(typeof second.body.message).toBe('string');
    expect(second.body.message).toContain('zaten kayıtlı');

    // Sistemde bu plakadan yalnızca tek bir kayıt olmalı: plaka sorgusu da
    // aynı aracı döndürmeli.
    const byPlate = await apiJson(
      request,
      'GET',
      `/api/vehicles/by-plate/${encodeURIComponent(plate)}`,
      token
    );
    expect(byPlate.status).toBe(200);
    expect(byPlate.body.vehicle.id).toBe(first.id);
  });
});
