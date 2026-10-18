import { test, expect } from './fixture.js';
import {
  MIDSCENE_READY,
  SKIP_REASON,
  OWNER,
  apiLogin,
  login,
  createCustomer,
  createVehicle,
  createWorkOrder,
  uniqPlate,
  isoAtNoon
} from './helpers.js';

/**
 * AI 3 — Randevu & takvim.
 *
 * Kural: randevu (gelecek tarihli iş emri) "Serviste olan araçlar" listesinde
 * görünmez; tarihi gelince (bugün/geçmiş) otomatik belirir ve takvim
 * ajandasından tek tıkla "İşleme al" ile iş emrine dönüşür.
 */

test.describe('AI 3) Randevu & takvim', () => {
  test('bugünün randevusu listede görünür, gelecek randevu görünmez', async ({
    page,
    request,
    agentForPage
  }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    const token = await apiLogin(request, OWNER);
    const now = new Date();
    const y = now.getFullYear();
    const m0 = now.getMonth();
    const d = now.getDate();

    // Bugünün randevusu
    const cToday = await createCustomer(request, token, { ad_soyad: 'AI Bugün Randevu' });
    const todayPlate = uniqPlate();
    const vToday = await createVehicle(request, token, { plaka: todayPlate, musteri_id: cToday.id });
    const wToday = await createWorkOrder(request, token, {
      arac_id: vToday.id,
      plaka: todayPlate,
      giris_tarihi: isoAtNoon(y, m0, d),
      durum: 'kabul',
      kalemler: [{ tur: 'iscilik', ad: 'AI bugün işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 5000 }]
    });
    expect(wToday.status, JSON.stringify(wToday.body)).toBe(200);

    // Gelecek (3 gün sonra) randevusu — henüz servise gelmedi
    const f = new Date(y, m0, d + 3);
    const cFuture = await createCustomer(request, token, { ad_soyad: 'AI Gelecek Randevu' });
    const futurePlate = uniqPlate();
    const vFuture = await createVehicle(request, token, { plaka: futurePlate, musteri_id: cFuture.id });
    const wFuture = await createWorkOrder(request, token, {
      arac_id: vFuture.id,
      plaka: futurePlate,
      giris_tarihi: isoAtNoon(f.getFullYear(), f.getMonth(), f.getDate()),
      durum: 'kabul',
      kalemler: [{ tur: 'iscilik', ad: 'AI gelecek işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 5000 }]
    });
    expect(wFuture.status, JSON.stringify(wFuture.body)).toBe(200);

    await login(page, OWNER);

    await agent.aiAssert(`"Serviste olan araçlar" listesinde "${todayPlate}" plakası görünüyor`);
    await agent.aiAssert(
      `"Serviste olan araçlar" listesinde "${futurePlate}" plakası GÖRÜNMÜYOR (gelecek tarihli randevu)`
    );
  });

  test('randevuyu tek tıkla "İşleme al" ile iş emrine dönüştürür', async ({
    page,
    request,
    agentForPage
  }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    const token = await apiLogin(request, OWNER);
    const now = new Date();
    const y = now.getFullYear();
    const m0 = now.getMonth();
    const d = now.getDate();

    const cust = await createCustomer(request, token, { ad_soyad: 'AI İşleme Al Müşteri' });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });
    const wo = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka: plate,
      giris_tarihi: isoAtNoon(y, m0, d),
      durum: 'kabul',
      kalemler: [{ tur: 'iscilik', ad: 'AI işleme al işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 5000 }]
    });
    expect(wo.status, JSON.stringify(wo.body)).toBe(200);

    await login(page, OWNER);

    // Takvim ajandasındaki bugünkü randevuyu bul → tek tık "İşleme al"
    await page
      .locator('.agenda-item', { hasText: plate })
      .first()
      .getByRole('button', { name: 'İşleme al' })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await agent.aiAssert(
      'İş emri formu açıldı ve plaka alanı seçilen araçla dolu görünüyor'
    );
  });
});
