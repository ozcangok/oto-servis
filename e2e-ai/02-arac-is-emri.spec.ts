import { test, expect } from './fixture.js';
import {
  MIDSCENE_READY,
  SKIP_REASON,
  OWNER,
  apiLogin,
  login,
  createCustomer,
  createVehicle,
  uniqPlate,
  uniqPhone
} from './helpers.js';

/**
 * AI 2 — Araç sorgu & iş emri.
 *
 * Veri hazırlığı API üzerinden deterministik yapılır; arayüz etkileşimi ve
 * doğrulama doğal dille (Midscene) tarif edilir.
 */

test.describe('AI 2) Araç sorgu & iş emri', () => {
  test('plaka aranınca araç kartı ve müşteri bilgisi doğru görünür', async ({
    page,
    request,
    agentForPage
  }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    const token = await apiLogin(request, OWNER);
    const cust = await createCustomer(request, token, {
      ad_soyad: 'AI Sorgu Müşteri',
      telefon: uniqPhone()
    });
    const plate = uniqPlate();
    await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });

    await login(page, OWNER);

    await agent.aiInput(plate, 'plaka arama kutusu');
    await agent.aiTap('"Sorgula" düğmesi');
    await agent.aiWaitFor('seçili aracın kartı görünür');

    await agent.aiAssert(
      `Araç kartında "${plate}" plakası ve "AI Sorgu Müşteri" müşteri adı okunur biçimde görünüyor`
    );
  });

  test('yeni iş emri formu gerekli alanlarla açılır', async ({ page, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, OWNER);

    await page.getByRole('button', { name: 'Yeni iş emri' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await agent.aiAssert(
      'İş emri formunda plaka, şikayet/talep açıklaması ve tarih alanları ile kaydet düğmesi görünüyor'
    );
  });
});
