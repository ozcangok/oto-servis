import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3001';

const OWNER = { username: 'sezer çınar', password: 'sezer34602026' };
const STAFF = { username: 'kullanıcı', password: 'servis 2026' };

let failures: string[] = [];
let passes: string[] = [];

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    passes.push(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failures.push(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
    console.error(`FAIL: ${name} ${detail}`);
  }
}

async function createRequestContext(): Promise<APIRequestContext> {
  return await test.request.context();
}

async function apiJson(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  token?: string,
  data?: any
) {
  const res = await request.fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(data !== undefined ? { 'Content-Type': 'application/json' } : {})
    },
    data: data !== undefined ? data : undefined
  });
  const body = await res.json().catch(() => null);
  return { status: res.status(), body };
}

async function apiLogin(request: APIRequestContext, creds: typeof OWNER) {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: creds });
  const body = await res.json();
  check(`API login ${creds.username}`, res.ok(), body.error || '');
  return { token: body.token as string, user: body.user };
}

async function skipSplash(page: Page) {
  await page.addInitScript(() => {
    try { window.sessionStorage.setItem('oto_splash_seen', '1'); } catch {}
  });
}

async function login(page: Page, creds: typeof OWNER) {
  await skipSplash(page);
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const user = page.locator('#auth-username');
  const pass = page.locator('#auth-password');
  await user.click(); await user.fill(creds.username);
  await pass.click(); await pass.fill(creds.password);
  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.topbar')).toBeVisible();
}

async function logout(page: Page) {
  await page.getByTitle('Çıkış Yap').click();
  await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 10_000 });
}

test.describe('PHASE 1 — Role-Based Access & Security', () => {
  test('1A — Staff: financial DOM stripped, lock screen wrong PIN then correct unlock', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, STAFF);

    check('Staff: no "Kasa" tab', (await page.getByRole('tab', { name: 'Kasa' }).count()) === 0);
    check('Staff: no "Giderler" tab', (await page.getByRole('tab', { name: 'Giderler' }).count()) === 0);
    check('Staff: no "Ayarlar" tab/button', (await page.getByRole('button', { name: 'Ayarlar' }).count()) === 0);
    check('Staff: no "Finans" group', (await page.locator('.menu-label').filter({ hasText: 'Finans' }).count()) === 0);
    check('Staff: no "Cari hesap" tab', (await page.getByRole('tab', { name: 'Cari hesap' }).count()) === 0);
    check('Staff: no ₺ currency on dashboard', (await page.locator('body').evaluate(() => document.body.textContent?.includes('₺'))) === false);

    await page.getByTestId('lock-now').click();
    const lock = page.getByTestId('idle-lock');
    await expect(lock).toBeVisible();
    await page.getByTestId('idle-password').fill('yanlis-parola');
    await page.getByTestId('idle-unlock').click();
    await expect(page.getByTestId('idle-error')).toContainText('Parola hatalı');
    check('Staff: wrong PIN rejected, lock remains', (await page.getByTestId('idle-lock').count()) === 1);

    await page.getByTestId('idle-password').fill(STAFF.password);
    await page.getByTestId('idle-unlock').click();
    await expect(page.getByTestId('idle-lock')).toHaveCount(0, { timeout: 10_000 });
    check('Staff: correct password unlocks lock screen', true);

    await logout(page);
    check('Staff: logout returns to login screen', true);
  });

  test('1B — Admin: full access, welcome banner says Çınar Otomotiv', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, OWNER);

    const brand = await page.locator('#brand').textContent();
    check('Admin: brand contains Çınar Otomotiv', brand?.includes('Çınar Otomotiv') ?? false, brand || '');
    const welcome = await page.locator('#welcome-title').textContent();
    check('Admin: welcome title "İyi Çalışmalar, Sezer Bey"', welcome === 'İyi Çalışmalar, Sezer Bey', welcome || '');
    check('Admin: Offline AI chip visible', (await page.locator('.welcome-ai-chip').textContent())?.includes('Offline AI') ?? false);
    check('Admin: Kasa tab visible', (await page.getByRole('tab', { name: 'Kasa' }).count()) === 1);
    check('Admin: Giderler tab visible', (await page.getByRole('tab', { name: 'Giderler' }).count()) === 1);
    check('Admin: Ayarlar button visible', (await page.getByRole('button', { name: 'Ayarlar' }).count()) === 1);
    check('Admin: Teklif & PDF Döküm trigger visible', (await page.getByTestId('document-center-trigger').count()) === 1);

    await logout(page);
  });
});
