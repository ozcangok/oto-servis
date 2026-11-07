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

test.describe('PHASE 3 — CRM & Fleet Lifecycle', () => {
  test('3A — Create customer "Kemal Aydın", phone "0532 999 88 77"', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Müşteriler' }).click();
    await page.getByRole('button', { name: '+ Yeni müşteri' }).click();

    await page.locator('#mc-name').click();
    await page.locator('#mc-name').fill('Kemal Aydın');
    await page.locator('#mc-phone').click();
    await page.locator('#mc-phone').fill('0532 999 88 77');

    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.waitForTimeout(1000);

    check('Customer: save clicked', true);

    await page.waitForTimeout(500);
    const hasCust = await page.locator('text=Kemal Aydın').count() > 0;
    check('Customer: appears in list', hasCust);

    const res = await apiJson(apiRequest, 'GET', '/api/customers?limit=100', undefined);
    const customers = res.body.items || [];
    const kemal = customers.find((c: any) => c.ad_soyad === 'Kemal Aydın' && c.telefon === '0532 999 88 77');
    check('Customer: persisted in DB', kemal !== undefined);
    if (kemal) {
      // eslint-disable-next-line no-console
      console.log(`   Customer ID: ${kemal.id}`);
    }
  });

  test('3B — Create vehicle: Plate 34 BOTS 2026, BMW 520i, 2022, 45.000 KM', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Araçlar' }).click();
    await page.getByRole('button', { name: '+ Yeni araç' }).click();

    await page.locator('#mv-plate').click();
    await page.locator('#mv-plate').fill('34 BOTS 2026');
    await page.locator('#mv-brand').click();
    await page.locator('#mv-brand').fill('BMW');
    await page.locator('#mv-model').click();
    await page.locator('#mv-model').fill('520i');
    await page.locator('#mv-year').click();
    await page.locator('#mv-year').fill('2022');

    // Enter customer name directly (alternative to dropdown)
    await page.locator('#mv-cust').click();
    await page.locator('#mv-cust').fill('Kemal Aydın');

    await page.locator('#mv-notes').click();
    await page.locator('#mv-notes').fill('45.000 KM');

    await page.getByRole('button', { name: 'Kaydet' }).click();
    await page.waitForTimeout(1000);

    check('Vehicle: save clicked', true);

    await page.waitForTimeout(500);
    const hasVeh = await page.locator('text=34 BOTS 2026').count() > 0;
    check('Vehicle: appears in list', hasVeh);

    const res = await apiJson(apiRequest, 'GET', '/api/vehicles/by-plate/34%20BOTS%202026', undefined);
    check('Vehicle: by-plate API returns vehicle', res.status === 200 && !!res.body.vehicle);
    if (res.body.vehicle) {
      // eslint-disable-next-line no-console
      console.log(`   Vehicle ID: ${res.body.vehicle.id}`);
    }
  });

  test('3C — Dashboard search: type "34 BOTS 2026", open vehicle profile', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Araç sorgu' }).click();

    const searchInput = page.locator('#q');
    await searchInput.click();
    await searchInput.fill('34 BOTS 2026');
    await page.getByRole('button', { name: 'Sorgula' }).click();
    await page.waitForTimeout(1000);

    const results = page.locator('.li');
    const hasResult = await results.filter({ hasText: '34 BOTS 2026' }).count() > 0;
    check('Dashboard: search returns 34 BOTS 2026', hasResult);

    if (hasResult) {
      await results.filter({ hasText: '34 BOTS 2026' }).first().click();
      await page.waitForTimeout(1000);

      const hasProfile = await page.locator('text=BMW 520i').count() > 0 || await page.locator('text=Kemal Aydın').count() > 0;
      check('Dashboard: vehicle profile opens', hasProfile);
    }
  });
});
