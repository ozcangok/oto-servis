import { test, expect } from '@playwright/test';
import {
  OWNER,
  STAFF,
  apiLogin,
  apiJson,
  createPart,
  getPart,
  createVehicle,
  createWorkOrder,
  uniqPlate
} from './helpers.js';

/**
 * KATEGORİ 5 — STOK KONTROLÜ
 *
 * İş emrinde parça kullanımı stoğu düşürmeli; yetersiz stokta işlem
 * reddedilmeli ve stok asla eksiye düşmemeli; iş emri silinince (iptal)
 * kullanılan parçalar otomatik olarak stoğa geri dönmeli.
 */
test.describe('5) Stok kontrolü', () => {
  test('iş emrinde parça kullanımı stoğu düşürür; iş emri silinince stok geri döner', async ({ request }) => {
    const token = await apiLogin(request, OWNER);
    const { part } = await createPart(request, token, { stok: 5 });

    expect((await getPart(request, token, part.id)).stok_miktari).toBe(5);

    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate });

    const order = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka: plate,
      kalemler: [
        { tur: 'parca', parca_id: part.id, ad: 'E2E parça', adet: 2, birim: 'Adet', birim_fiyat_kurus: 5000 }
      ]
    });
    expect(order.status, JSON.stringify(order.body)).toBe(200);

    // 5 - 2 = 3
    expect((await getPart(request, token, part.id)).stok_miktari).toBe(3);

    // İş emri silinince stok iade edilir
    const del = await apiJson(request, 'DELETE', `/api/work-orders/${order.body.workOrder.id}`, token);
    expect(del.status, JSON.stringify(del.body)).toBe(200);
    expect((await getPart(request, token, part.id)).stok_miktari).toBe(5);
  });

  test('yetersiz stokta (personel) iş emri reddedilir, stok eksiye düşmez', async ({ request }) => {
    const ownerToken = await apiLogin(request, OWNER);
    const staffToken = await apiLogin(request, STAFF);

    const { part } = await createPart(request, ownerToken, { stok: 1 });

    const plate = uniqPlate();
    const veh = await createVehicle(request, ownerToken, { plaka: plate });

    const order = await createWorkOrder(request, staffToken, {
      arac_id: veh.id,
      plaka: plate,
      kalemler: [
        { tur: 'parca', parca_id: part.id, ad: 'E2E parça', adet: 5, birim: 'Adet', birim_fiyat_kurus: 5000 }
      ]
    });

    expect(order.status).toBe(400);
    expect(String(order.body.error)).toMatch(/stok/i);

    const stock = (await getPart(request, ownerToken, part.id)).stok_miktari;
    expect(stock).toBe(1);
    expect(stock).toBeGreaterThanOrEqual(0);
  });

  test('personel override bayrağıyla bile negatif stoku aşamaz', async ({ request }) => {
    const ownerToken = await apiLogin(request, OWNER);
    const staffToken = await apiLogin(request, STAFF);

    const { part } = await createPart(request, ownerToken, { stok: 1 });

    const plate = uniqPlate();
    const veh = await createVehicle(request, ownerToken, { plaka: plate });

    const res = await apiJson(request, 'POST', '/api/work-orders', staffToken, {
      arac_id: veh.id,
      plaka: plate,
      durum: 'kabul',
      sikayet: 'E2E override denemesi',
      kdv_orani: 20,
      kdv_dahil_mi: false,
      override_negative_stock: true,
      kalemler: [
        { tur: 'parca', parca_id: part.id, ad: 'E2E parça', adet: 9, birim: 'Adet', birim_fiyat_kurus: 1000 }
      ]
    });

    expect(res.status).toBe(400);
    expect(String(res.body.error)).toMatch(/stok/i);
    expect((await getPart(request, ownerToken, part.id)).stok_miktari).toBe(1);
  });
});
