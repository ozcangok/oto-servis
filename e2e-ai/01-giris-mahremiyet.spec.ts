import { test } from './fixture.js';
import { MIDSCENE_READY, SKIP_REASON, OWNER, STAFF, login } from './helpers.js';

/**
 * AI 1 — Giriş & rol mahremiyeti (görsel doğrulama).
 *
 * Determinist giriş yardımcısıyla oturum açılır; ardından Midscene'in görsel
 * muhakemesiyle "ekranda ne görünüyor / ne görünmüyor" doğrulanır.
 */

test.describe('AI 1) Giriş & rol mahremiyeti', () => {
  test('owner girişinde pano, sekmeler ve tutarlar okunur', async ({ page, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, OWNER);

    await agent.aiAssert(
      'Üst menüde "Kasa" ve "Giderler" sekmeleri görünüyor ve ekranda Türk Lirası (₺) tutarları okunabilir biçimde yazılı'
    );
  });

  test('staff girişinde ticari mahremiyet: Kasa yok, para tutarı yok', async ({ page, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, STAFF);

    await agent.aiAssert('Üst menüde "Kasa" sekmesi YOK');
    await agent.aiAssert(
      'Ekranda hiçbir para tutarı yok: ₺ işareti, "Net Kâr", "Toplam Servis Geliri" gibi ticari rakamlar görünmüyor'
    );
  });

  test('owner Kasa ekranında özet kartları görünür', async ({ page, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, OWNER);
    await page.goto('/#/kasa');

    await agent.aiAssert('Kasa ekranında nakit, kart ve işçilik gibi özet (toplam) kartları görünüyor');
  });
});
