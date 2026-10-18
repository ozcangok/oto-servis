import { test } from './fixture.js';
import {
  MIDSCENE_READY,
  SKIP_REASON,
  OWNER,
  STAFF,
  apiLogin,
  login,
  createExpense,
  todayOnly
} from './helpers.js';

/**
 * AI 5 — Kasa & giderler.
 *
 * Ticari mahremiyet kuralları görsel olarak doğrulanır:
 *  - owner hem kasa özetini hem gider kâr özetini ve tüm kategorileri görür,
 *  - staff ne kasa özetini ne kâr özetini ne de gizli (Personel / Fatura & Kira)
 *    kategorileri görür.
 */

test.describe('AI 5) Kasa & giderler', () => {
  test('owner Kasa: işçilik ve gelir özetleri görünür', async ({ page, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, OWNER);
    await page.goto('/#/kasa');

    await agent.aiAssert(
      'Kasa ekranında nakit, kart ve işçilik gibi özet toplamlar okunur biçimde görünüyor'
    );
  });

  test('owner Giderler: kâr özeti ve tüm kategoriler görünür', async ({ page, request, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);

    const token = await apiLogin(request, OWNER);
    const t = todayOnly();
    await createExpense(request, token, { tarih: t, kategori: 'Personel', aciklama: 'AI maaş', tutar_kurus: 123456 });
    await createExpense(request, token, { tarih: t, kategori: 'Sarf Malzeme', aciklama: 'AI sarf', tutar_kurus: 11111 });

    const agent = await agentForPage(page);
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Giderler' }).click();

    await agent.aiAssert(
      'Giderler ekranında "Net Kâr", "Toplam Servis Geliri" ve "Toplam Dükkan Gideri" özetleri görünüyor'
    );
  });

  test('staff Giderler: kâr özeti ve hassas kategoriler görünmez', async ({ page, request, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);

    const ownerToken = await apiLogin(request, OWNER);
    const t = todayOnly();
    await createExpense(request, ownerToken, { tarih: t, kategori: 'Personel', aciklama: 'AI gizli maaş', tutar_kurus: 222222 });
    await createExpense(request, ownerToken, { tarih: t, kategori: 'Sarf Malzeme', aciklama: 'AI sarf görünür', tutar_kurus: 11111 });

    const agent = await agentForPage(page);
    await login(page, STAFF);
    await page.getByRole('tab', { name: 'Giderler' }).click();

    await agent.aiAssert('Giderler ekranında kâr özeti (Net Kâr / Toplam Servis Geliri) YOK');
    await agent.aiAssert(
      'Gider listesinde "Personel" kategorisinde kayıt YOK; yalnızca gündelik kategoriler (ör. Sarf Malzeme) görünüyor'
    );
  });
});
