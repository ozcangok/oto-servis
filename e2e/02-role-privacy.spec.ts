import { test, expect } from '@playwright/test';
import { OWNER, STAFF, login, apiLogin, createExpense, todayOnly } from './helpers.js';

/**
 * KATEGORİ 2 — ROL, YETKİ VE TİCARİ MAHREMİYET
 *
 * Personel (staff) `/kasa` ve `/ayarlar` adreslerine doğrudan giremez;
 * Giderler sayfasında kâr/ciro özeti DOM'da bulunmaz; maaş/kira harcamaları
 * listeden tamamen filtrelenir; kategori kısıtlaması hem arayüzde hem sunucuda
 * uygulanır. Owner ise her şeyi görür.
 */
test.describe('2) Rol, yetki ve ticari mahremiyet', () => {
  test('staff: Kasa sekmesi hiç görünmez', async ({ page }) => {
    await login(page, STAFF);
    await expect(page.getByRole('tab', { name: 'Kasa' })).toHaveCount(0);
  });

  test('staff /kasa adresini (yol tabanlı) doğrudan açamaz', async ({ page }) => {
    await login(page, STAFF);
    await page.goto('/kasa');
    await page.reload();

    await expect(page.locator('.kasa-sum')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Kasa' })).toHaveCount(0);
  });

  test('staff /#/kasa adresini (hash) doğrudan açamaz, ana sayfaya yönlendirilir', async ({ page }) => {
    await login(page, STAFF);
    await page.goto('/#/kasa');
    await page.reload();

    await expect(page.locator('.kasa-sum')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Kasa' })).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('#/sorgu');
  });

  test('staff /#/ayarlar adresini açamaz', async ({ page }) => {
    await login(page, STAFF);
    await page.goto('/#/ayarlar');
    await page.reload();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('#/sorgu');
  });

  test('owner /#/kasa ve /#/ayarlar adreslerine girebilir', async ({ page }) => {
    await login(page, OWNER);

    await page.goto('/#/kasa');
    await expect(page.locator('.kasa-sum')).toBeVisible();

    await page.goto('/#/ayarlar');
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('staff Giderler sekmesini görmez, doğrudan erişemez; hassas kayıtlar DOM\'da yok', async ({ page, request }) => {
    // Owner, hassas + gündelik giderler eklesin
    const ownerToken = await apiLogin(request, OWNER);
    const t = todayOnly();
    await createExpense(request, ownerToken, { tarih: t, kategori: 'Personel', aciklama: 'E2E maaş', tutar_kurus: 123456 });
    await createExpense(request, ownerToken, { tarih: t, kategori: 'Fatura & Kira', aciklama: 'E2E kira', tutar_kurus: 654321 });
    await createExpense(request, ownerToken, { tarih: t, kategori: 'Sarf Malzeme', aciklama: 'E2E sarf', tutar_kurus: 11111 });

    await login(page, STAFF);

    // Personel Giderler sekmesini görmez.
    await expect(page.getByRole('tab', { name: 'Giderler' })).toHaveCount(0);

    // Doğrudan adresle erişim ana sayfaya yönlendirilir; gider tablosu/özeti DOM'a basılmaz.
    await page.goto('/#/giderler');
    await expect(page).toHaveURL(/#\/sorgu/);
    await expect(page.locator('.tbl')).toHaveCount(0);
    await expect(page.locator('.gsum')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Net Kâr');
    await expect(page.locator('body')).not.toContainText('Toplam Servis Geliri');
    await expect(page.locator('body')).not.toContainText('Toplam Dükkan Gideri');
    await expect(page.locator('body')).not.toContainText('E2E maaş');
    await expect(page.locator('body')).not.toContainText('E2E kira');
    await expect(page.locator('body')).not.toContainText('E2E sarf');

    // Kategori menüsü hiç DOM'a basılmaz.
    await expect(page.locator('#gx-kategori')).toHaveCount(0);
  });

  test('owner Giderler: kâr özeti ve tüm kategoriler görünür', async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Giderler' }).click();

    const gsum = page.locator('.gsum');
    await expect(gsum).toBeVisible();
    await expect(gsum).toContainText('Toplam Servis Geliri');
    await expect(gsum).toContainText('Toplam Dükkan Gideri');
    await expect(gsum).toContainText('Net Kâr');

    const options = (await page.locator('#gx-kategori option').allInnerTexts()).map((o) => o.trim());
    expect(options).toContain('Personel');
    expect(options).toContain('Fatura & Kira');
    expect(options).toContain('Ekipman Bakım');
    expect(options).toContain('Sarf Malzeme');
  });

  test('staff hassas kategori ekleyemez (sunucu 403, gündelik 200)', async ({ request }) => {
    const staffToken = await apiLogin(request, STAFF);
    const t = todayOnly();

    const personel = await createExpense(request, staffToken, { tarih: t, kategori: 'Personel', tutar_kurus: 100 });
    expect(personel.status).toBe(403);

    const kira = await createExpense(request, staffToken, { tarih: t, kategori: 'Fatura & Kira', tutar_kurus: 100 });
    expect(kira.status).toBe(403);

    const ekipman = await createExpense(request, staffToken, { tarih: t, kategori: 'Ekipman Bakım', tutar_kurus: 100 });
    expect(ekipman.status).toBe(200);
  });
});
