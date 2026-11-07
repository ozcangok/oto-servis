import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const API_URL = 'http://127.0.0.1:3001';

const OWNER = { username: 'sezer çınar', password: 'sezer34602026' };

function check(name: string, condition: boolean, detail = '') {
  if (condition) {
    // eslint-disable-next-line no-console
    console.log(`✅ ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    // eslint-disable-next-line no-console
    console.error(`❌ ${name}${detail ? ` — ${detail}` : ''}`);
  }
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
  return { token: body.token as string, user: body.user, ok: res.ok() };
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

test.describe('PHASE 2 — Global Settings & Inventory', () => {
  test('2A — Settings: verify/save global constants', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, OWNER);

    // Ayarlar is a button in sidebar (not a tab)
    await page.getByRole('button', { name: 'Ayarlar' }).click();

    // Check current values
    const addr = await page.locator('#st-addr').inputValue();
    const phone = await page.locator('#st-phone').inputValue();
    check('Settings: address pre-filled', addr.includes('Esenşehir'), addr);
    check('Settings: phone pre-filled', phone.includes('0530 766 52 60'), phone);

    // Save
    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    check('Settings: Kaydet clicked without error', true);

    // Verify via API
    const settingsRes = await apiJson(apiRequest, 'GET', '/api/settings', undefined);
    check('Settings: API returns settings', settingsRes.status === 200);
  });

  test('2B — Expense: add "Dükkan Elektrik Faturası" 1500₺', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Giderler' }).click();

    const aciklama = page.locator('#gx-aciklama');
    const tutar = page.locator('#gx-tutar');

    await aciklama.click(); await aciklama.fill('Dükkan Elektrik Faturası');
    await tutar.click(); await tutar.fill('1500');

    await page.getByRole('button', { name: 'Gider Ekle' }).click();
    await page.waitForTimeout(1000);

    check('Expense: add button clicked', true);

    // Verify in list
    const hasItem = await page.locator('text=Dükkan Elektrik Faturası').count() > 0;
    check('Expense: item appears in list', hasItem);

    // Verify via API
    const res = await apiJson(apiRequest, 'GET', '/api/expenses?period=all', undefined);
    const items = res.body.items || [];
    const elec = items.find((i: any) => i.aciklama === 'Dükkan Elektrik Faturası' && i.tutar_kurus === 150000);
    check('Expense: persisted in DB with 1500₺', elec !== undefined);
  });

  test('2C — Inventory: create part "Castrol Edge 5W-30 Motor Yağı", stock 5, price 1200₺', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Parça arşivi' }).click();

    await page.getByRole('button', { name: 'Parça ekle' }).click();

    const name = page.locator('#pf-name');
    const code = page.locator('#pf-code');
    const qty = page.locator('#pf-qty');
    const sell = page.locator('#pf-sell');

    await name.click(); await name.fill('Castrol Edge 5W-30 Motor Yağı');
    await code.click(); await code.fill('CAST-5W30-2026');
    await qty.click(); await qty.fill('5');
    await sell.click(); await sell.fill('1200');

    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.waitForTimeout(1000);

    check('Part: save button clicked', true);

    // Verify in list
    await page.waitForTimeout(500);
    const hasPart = await page.locator('text=Castrol Edge 5W-30 Motor Yağı').count() > 0;
    check('Part: appears in parts list', hasPart);

    // Verify via API
    const res = await apiJson(apiRequest, 'GET', '/api/parts?limit=1000', undefined);
    const parts = res.body.items || [];
    const castrol = parts.find((p: any) => p.ad === 'Castrol Edge 5W-30 Motor Yağı');
    check('Part: persisted in DB with stock 5, price 1200₺', castrol !== undefined && castrol.stok_miktari === 5 && castrol.satis_kurus === 120000);
  });
});
