import { test, expect } from '@playwright/test';
import { OWNER, STAFF, login, apiLogin, apiJson } from './helpers.js';

/**
 * Kurumsal kimlik ve hesap güvenliği.
 *
 * - Marka/karşılama metni resmi kurumsal kimlikten gelir.
 * - Hesap Güvenliği bölümü yalnızca patron (owner/admin) tarafından görülür.
 * - Personel finans, ayarlar ve yönetici hesabı bilgilerini DOM'da görmez.
 * - Sunucu, yönetici hesabı değişikliğinde mevcut parola doğrulaması ister;
 *   personel hesabı bu endpoint'i çağıramaz.
 */
test.describe('Kurumsal kimlik ve hesap güvenliği', () => {
  test('patron kurumsal markayı, Sezer Bey karşılamasını ve Hesap Güvenliği bölümünü görür', async ({ page }) => {
    await login(page, OWNER);

    await expect(page.locator('#brand')).toContainText('Çınar Otomotiv');
    await expect(page.locator('#welcome-title')).toHaveText('İyi Çalışmalar, Sezer Bey');

    await page.getByRole('button', { name: 'Ayarlar' }).click();
    await expect(page.getByRole('heading', { name: 'Hesap Güvenliği' })).toBeVisible();
    await expect(page.locator('#st-new-username')).toHaveValue('sezer çınar');
    await expect(page.getByLabel('Mevcut parola')).toBeVisible();
    await expect(page.getByLabel('Yeni parola', { exact: true })).toBeVisible();
  });

  test('personel finans, ayarlar ve yönetici hesabı bölümlerini DOM içinde görmez', async ({ page }) => {
    await login(page, STAFF);

    await expect(page.locator('#brand')).toContainText('Çınar Otomotiv');
    await expect(page.locator('#welcome-title')).not.toContainText('Sezer Bey');
    await expect(page.getByRole('button', { name: 'Ayarlar' })).toHaveCount(0);
    await expect(page.getByText('Finans', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Hesap Güvenliği')).toHaveCount(0);

    await page.goto('/#/ayarlar');
    await page.reload();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByText('Hesap Güvenliği')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('#/sorgu');
  });

  test('sunucu mevcut parola doğrulaması ve patron yetkisi olmadan hesap değişikliğine izin vermez', async ({ request }) => {
    // Aynı APIRequestContext cookie'yi paylaştığı için önce patron isteğini
    // yap, ardından personel oturumuna geç; aksi halde personel cookie'si
    // Bearer token'ın önüne geçebilir.
    const ownerToken = await apiLogin(request, OWNER);

    const wrongPassword = await apiJson(request, 'PUT', '/api/auth/credentials', ownerToken, {
      current_password: 'yanlis-parola',
      username: 'sezer çınar'
    });
    expect(wrongPassword.status, JSON.stringify(wrongPassword.body)).toBe(400);
    expect(String(wrongPassword.body?.error || '')).toContain('Mevcut parola hatalı');

    const staffToken = await apiLogin(request, STAFF);
    const staffAttempt = await apiJson(request, 'PUT', '/api/auth/credentials', staffToken, {
      current_password: STAFF.password,
      username: 'yetki yukseltme'
    });
    expect(staffAttempt.status, JSON.stringify(staffAttempt.body)).toBe(403);
  });

  test('Ayarlar kaydı sidebar ve yeniden açılan forma anında yansır', async ({ page, request }) => {
    await login(page, OWNER);

    await page.getByRole('button', { name: 'Ayarlar' }).click();
    await expect(page.locator('#st-name')).toBeVisible();

    const uniqueName = `E2E GLOBAL OTO ${Date.now()}`;
    await page.locator('#st-name').fill(uniqueName);
    await page.locator('#st-addr').fill('E2E Mah. Test Sk. No: 1');
    await page.locator('#st-phone').fill('0555 000 11 22');
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();

    // Kayıt sonrası sidebar aynı anda güncellenmeli; sayfa yenilenmez.
    await expect(page.locator('#brand')).toHaveText(uniqueName);

    await page.getByRole('button', { name: 'Ayarlar' }).click();
    await expect(page.locator('#st-name')).toHaveValue(uniqueName);

    // Sonraki testleri kirletmemek için kurumsal varsayılanları geri yükle.
    const token = await apiLogin(request, OWNER);
    const restored = await apiJson(request, 'PUT', '/api/settings', token, {
      shop_name: 'Çınar Otomotiv - Özel Servis & Bakım Hizmetleri',
      shop_address: 'Esenşehir, Muradiye Sk. No:42 D:B, 34776 Ümraniye/İstanbul',
      shop_phone: '0530 766 52 60'
    });
    expect(restored.status, JSON.stringify(restored.body)).toBe(200);
  });
});
