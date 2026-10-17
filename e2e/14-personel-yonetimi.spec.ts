import { test, expect } from '@playwright/test';
import type { APIRequestContext, Page } from '@playwright/test';
import { OWNER, STAFF, API_URL, login, logout, apiLogin, apiJson } from './helpers.js';

/**
 * PERSONEL YÖNETİMİ (Ayarlar → yalnızca dükkan sahibi)
 *
 * Dükkan sahibi, çalışanları için giriş hesabı açar; parolasını sıfırlar ve
 * hesabı siler. Personel (staff) ne bu ekranı görür ne de kullanıcı yönetimi
 * uçlarına erişebilir. Açılan hesap gerçekten çalıştığı için, oluşturulan
 * kullanıcı kendi kimliğiyle giriş yapabilir.
 *
 * Kurulum (önkoşul kullanıcı) API üzerinden yapılır; her test yalnızca tek bir
 * arayüz davranışını doğrular.
 */

const uniqueSuffix = () => Date.now().toString(36).slice(-5);

async function createStaffViaApi(
  request: APIRequestContext,
  username: string,
  fullName: string,
  password: string
): Promise<number> {
  const token = await apiLogin(request, OWNER);
  const { status, body } = await apiJson(request, 'POST', '/api/auth/users', token, {
    username,
    password,
    full_name: fullName,
    role: 'staff'
  });
  expect(status).toBe(200);
  return body.user.id as number;
}

async function deleteUserViaApi(request: APIRequestContext, id: number): Promise<void> {
  const token = await apiLogin(request, OWNER);
  const { status } = await apiJson(request, 'DELETE', `/api/auth/users/${id}`, token);
  expect(status).toBe(200);
}

async function findUserId(request: APIRequestContext, username: string): Promise<number> {
  const token = await apiLogin(request, OWNER);
  const { status, body } = await apiJson(request, 'GET', '/api/auth/users', token);
  expect(status).toBe(200);
  const found = (body.users as any[]).find((u) => u.username === username);
  expect(found, `kullanıcı bulunamadı: ${username}`).toBeTruthy();
  return found.id as number;
}

async function loginStatus(request: APIRequestContext, username: string, password: string): Promise<number> {
  const { status } = await apiJson(request, 'POST', '/api/auth/login', undefined, { username, password });
  return status;
}

async function openSettings(page: Page): Promise<void> {
  await page.goto('/#/ayarlar');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Personel Yönetimi' })).toBeVisible();
}

async function closeSettings(page: Page): Promise<void> {
  await page.locator('.sheet-foot').getByRole('button', { name: 'Kapat' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

test.describe('14) Personel yönetimi', () => {
  test('sahip Ayarlar üzerinden personel hesabı açar; yeni personel giriş yapabilir', async ({
    page,
    request
  }) => {
    test.slow(); // dosyanın ilk testi: soğuk yığın başlangıcını da sırtlar
    const suffix = uniqueSuffix();
    const username = `eleman${suffix}`;
    const fullName = `Test Eleman ${suffix}`;
    const password = 'Parola12345';

    await login(page, OWNER);
    await openSettings(page);

    // Sahip kendi satırını görür ama silemez
    const ownerRow = page.getByTestId('kullanici-admin');
    await expect(ownerRow).toBeVisible();
    await expect(ownerRow.getByRole('button', { name: 'Sil' })).toBeDisabled();

    // Yeni personel hesabı oluştur
    await page.locator('#nu-name').fill(fullName);
    await page.locator('#nu-username').fill(username);
    await page.locator('#nu-password').fill(password);
    await page.locator('#nu-role').selectOption('staff');
    await page.getByTestId('personel-ekle').click();

    const row = page.getByTestId(`kullanici-${username}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('Dükkan Elemanı');

    // Form temizlenir
    await expect(page.locator('#nu-name')).toHaveValue('');
    await expect(page.locator('#nu-username')).toHaveValue('');
    await expect(page.locator('#nu-password')).toHaveValue('');

    // Açılan hesap gerçekten giriş yapabilir
    expect(await loginStatus(request, username, password)).toBe(200);
    await closeSettings(page);
    await logout(page);
    await login(page, { username, password });
    await expect(page.locator('.topbar')).toBeVisible();

    // Personel Ayarlar → Personel Yönetimi'ni açamaz
    await page.goto('/#/ayarlar');
    await expect(page.getByRole('heading', { name: 'Personel Yönetimi' })).toHaveCount(0);
    await logout(page);

    // temizlik
    await deleteUserViaApi(request, await findUserId(request, username));
    expect(await loginStatus(request, username, password)).toBe(401);
  });

  test('sahip parola sıfırlar; eski parola geçersiz, yenisi geçerli', async ({ page, request }) => {
    const suffix = uniqueSuffix();
    const username = `sifre${suffix}`;
    const oldPassword = 'Parola12345';
    const newPassword = 'YeniParola12345';
    await createStaffViaApi(request, username, `Şifre Eleman ${suffix}`, oldPassword);

    await login(page, OWNER);
    await openSettings(page);

    const row = page.getByTestId(`kullanici-${username}`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Parola sıfırla' }).click();
    await row.locator('input[type="password"]').fill(newPassword);
    await row.getByRole('button', { name: 'Kaydet' }).click();
    await expect(row.locator('input[type="password"]')).toHaveCount(0);

    expect(await loginStatus(request, username, oldPassword)).toBe(401);
    expect(await loginStatus(request, username, newPassword)).toBe(200);

    await deleteUserViaApi(request, await findUserId(request, username));
  });

  test('sahip hesabı siler (iki adımlı onay); silinen kullanıcı giriş yapamaz', async ({
    page,
    request
  }) => {
    const suffix = uniqueSuffix();
    const username = `sil${suffix}`;
    const password = 'Parola12345';
    await createStaffViaApi(request, username, `Sil Eleman ${suffix}`, password);

    await login(page, OWNER);
    await openSettings(page);

    const row = page.getByTestId(`kullanici-${username}`);
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Sil' }).click();
    await row.getByRole('button', { name: 'Emin misin? Tekrar tıkla' }).click();
    await expect(page.getByTestId(`kullanici-${username}`)).toHaveCount(0);

    expect(await loginStatus(request, username, password)).toBe(401);
  });

  test('personel kullanıcı yönetimi uçlarına erişemez', async ({ request }) => {
    const staffToken = await apiLogin(request, STAFF);
    const headers = { authorization: `Bearer ${staffToken}` };

    expect((await request.get(`${API_URL}/api/auth/users`, { headers })).status()).toBe(403);
    expect(
      (
        await request.post(`${API_URL}/api/auth/users`, {
          headers,
          data: { username: 'olmaz123', password: 'Parola12345', full_name: 'Olmaz', role: 'staff' }
        })
      ).status()
    ).toBe(403);
  });
});
