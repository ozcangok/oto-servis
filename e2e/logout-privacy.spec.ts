import { test, expect, type Page } from '@playwright/test';

/**
 * Çıkış (logout) gizlilik testleri.
 *
 * Amaç: Kullanıcı çıkış yaptığında ekranda/DOM'da Kasa, Gider ve Müşteri
 * verilerine ait HİÇBİR rakamın kalmadığını otomatik olarak doğrulamak.
 */

const OWNER = { username: 'Sezer Çınar', password: 'sezer34602026' };
const STAFF = { username: 'kullanıcı', password: 'servis2026' };

async function login(page: Page, creds: { username: string; password: string }) {
  await page.goto('/');

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Kutular otomatik-doldurmayı engellemek için dokunulana kadar salt-okunur.
  const user = page.locator('#auth-username');
  const pass = page.locator('#auth-password');
  await user.click();
  await user.fill(creds.username);
  await pass.click();
  await pass.fill(creds.password);

  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
}

async function logout(page: Page) {
  await page.getByTitle('Çıkış Yap').click();
  await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 10_000 });
}

/** Çıkış sonrası ortak kontroller: uygulama kabuğu ve tüm para birimleri yok olmalı. */
async function expectNoDataLeft(page: Page) {
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.locator('.wrap')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toBeVisible();
  // Hiçbir tutar (₺) görünmemeli
  await expect(page.locator('body')).not.toContainText('₺');
}

/** Yakalanan tutarların çıkış sonrası görünmez olduğunu doğrular. */
async function expectAmountsGone(page: Page, amounts: string[]) {
  for (const raw of amounts) {
    const value = raw.trim();
    if (value) {
      await expect(page.getByText(value, { exact: false })).not.toBeVisible();
    }
  }
}

test.describe('Çıkış (logout) gizliliği — görsel veri sızıntısı yok', () => {
  test('owner çıkışından sonra Kasa rakamları DOM\'dan tamamen kaybolur', async ({ page }) => {
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Kasa' }).click();
    await expect(page.locator('.kasa-sum')).toBeVisible();

    const amounts = await page.locator('.kasa-sum .stat b').allInnerTexts();
    expect(amounts.filter((a) => a.trim()).length).toBeGreaterThan(0);

    await logout(page);

    await expectNoDataLeft(page);
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

    await expectNoDataLeft(page);
    await expect(page.locator('.gsum')).toHaveCount(0);
    await expectAmountsGone(page, amounts);
  });

  test('staff: Kasa yok, hassas kategori yok; çıkışta tüm rakamlar kaybolur', async ({ page }) => {
    await login(page, STAFF);

    // Kasa sekmesi personele görünmez
    await expect(page.getByRole('tab', { name: 'Kasa' })).toHaveCount(0);

    await page.getByRole('tab', { name: 'Giderler' }).click();

    // Gelir/Net kâr özeti personele görünmez
    await expect(page.locator('.gsum')).toHaveCount(0);

    // Kategori menüsünde hassas kategoriler yok
    const options = (await page.locator('#gx-kategori option').allInnerTexts()).map((o) => o.trim());
    expect(options).not.toContain('Personel');
    expect(options).not.toContain('Fatura & Kira');
    expect(options).toContain('Ekipman Bakım');
    expect(options).toContain('Sarf Malzeme');

    // Listede hassas kategori görünmemeli
    await expect(page.locator('.tbl tbody')).not.toContainText('Personel');
    await expect(page.locator('.tbl tbody')).not.toContainText('Fatura & Kira');

    const amounts = await page.locator('.tbl td.num').allInnerTexts();

    await logout(page);

    await expectNoDataLeft(page);
    await expect(page.locator('.tbl')).toHaveCount(0);
    await expectAmountsGone(page, amounts);
  });

  test('giriş ekranı tam opak (arkadaki sayfa asla görünmez)', async ({ page }) => {
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

    // Uygulama kabuğu ve filigran DOM'da olmamalı
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.locator('.wm')).toHaveCount(0);
  });

  test('farklı kullanıcıyla yeniden giriş önceki oturumun verisini göstermez', async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Kasa' }).click();
    await expect(page.locator('.kasa-sum')).toBeVisible();

    await logout(page);

    await login(page, STAFF);
    // Personel oturumunda owner'a ait Kasa verisi kesinlikle bulunmamalı
    await expect(page.locator('.kasa-sum')).toHaveCount(0);
    await expect(page.getByRole('tab', { name: 'Kasa' })).toHaveCount(0);
  });
});
