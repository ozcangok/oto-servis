import { test, expect } from '@playwright/test';
import { API_URL, OWNER, STAFF, login, logout, expectIsolatedLogin, expectAmountsGone } from './helpers.js';

/**
 * KATEGORİ 1 — OTURUM, GÖRSEL GİZLİLİK VE VERİ SIZINTISI
 *
 * Çıkışta DOM/state tamamen temizlenmeli; tarayıcı "Geri" tuşu veri
 * göstermemeli; giriş ekranı şeffaf olmayan (opak) izole bir ekran olmalı;
 * oturum süresi dolduğunda kullanıcı anında ve güvenli şekilde atılmalı.
 */
test.describe('1) Oturum, görsel gizlilik ve veri sızıntısı', () => {
  test('owner çıkışından sonra Kasa rakamları DOM\'dan tamamen kaybolur', async ({ page }) => {
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Kasa' }).click();
    await expect(page.locator('.kasa-sum')).toBeVisible();

    const amounts = await page.locator('.kasa-sum .stat b').allInnerTexts();
    expect(amounts.filter((a) => a.trim()).length).toBeGreaterThan(0);

    await logout(page);

    await expectIsolatedLogin(page);
    await expect(page.locator('.kasa-sum')).toHaveCount(0);
    await expectAmountsGone(page, amounts);
  });

  test('owner çıkışından sonra Giderler (maaş/kira/net kâr) kaybolur', async ({ page }) => {
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Giderler' }).click();
    await expect(page.locator('.gsum')).toBeVisible();

    const amounts = await page.locator('.gsum .stat b').allInnerTexts();
    expect(amounts.length).toBe(3);

    await logout(page);

    await expectIsolatedLogin(page);
    await expect(page.locator('.gsum')).toHaveCount(0);
    await expectAmountsGone(page, amounts);
  });

  test('staff çıkışında hiçbir rakam ve liste kalmaz', async ({ page }) => {
    await login(page, STAFF);

    await expect(page.getByRole('tab', { name: 'Kasa' })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Giderler' }).click();
    await expect(page.locator('.tbl')).toBeVisible();

    const amounts = await page.locator('.tbl td.num').allInnerTexts();

    await logout(page);

    await expectIsolatedLogin(page);
    await expect(page.locator('.tbl')).toHaveCount(0);
    await expectAmountsGone(page, amounts);
  });

  test('giriş ekranı tam opak ve izole (arkadaki sayfa görünmez)', async ({ page }) => {
    await login(page, OWNER);
    await logout(page);

    const loginScreen = page.getByTestId('login-screen');
    await expect(loginScreen).toBeVisible();

    const opaque = await loginScreen.evaluate((el) => {
      const color = getComputedStyle(el).backgroundColor;
      const m = color.match(/rgba?\(([^)]+)\)/);
      if (!m) return false;
      const parts = m[1].split(',').map((s) => s.trim());
      return parts.length < 4 || parseFloat(parts[3]) === 1;
    });
    expect(opaque).toBe(true);

    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.locator('.wm')).toHaveCount(0);
  });

  test('tarayıcı Geri (Back) tuşu çıkış sonrası Kasa verisini göstermez', async ({ page }) => {
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Kasa' }).click();
    await expect(page.locator('.kasa-sum')).toBeVisible();
    const amounts = await page.locator('.kasa-sum .stat b').allInnerTexts();

    await logout(page);
    await expectIsolatedLogin(page);

    // Geri tuşuna bas: önceki (Kasa) adresine dönülür ama oturum kapalı olduğu
    // için yalnızca izole giriş ekranı görünmeli.
    await page.goBack();

    await expectIsolatedLogin(page);
    await expect(page.locator('.kasa-sum')).toHaveCount(0);
    await expectAmountsGone(page, amounts);
  });

  test('farklı kullanıcıyla yeniden giriş önceki oturumun verisini göstermez', async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Kasa' }).click();
    await expect(page.locator('.kasa-sum')).toBeVisible();

    await logout(page);
    await login(page, STAFF);

    await expect(page.locator('.kasa-sum')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Kasa' })).toHaveCount(0);
  });

  test('oturum süresi dolunca otomatik ve güvenli çıkış yapılır', async ({ page, request }) => {
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Giderler' }).click();
    await expect(page.locator('.gsum')).toBeVisible();

    const token = await page.evaluate(() => localStorage.getItem('auth_token'));
    expect(token).toBeTruthy();

    // Oturumu sunucu tarafında geçersiz kıl (süre dolmasını simüle et)
    const res = await request.post(`${API_URL}/api/auth/logout`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    expect(res.ok()).toBeTruthy();

    // Arayüzde bir API çağrısı tetikle → 401 → otomatik güvenli çıkış
    await page.getByRole('button', { name: 'Yenile' }).click();

    await expectIsolatedLogin(page);
  });
});
