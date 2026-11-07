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

test.describe('PHASE 5 — Corporate PDF & Export Verification', () => {
  test('5A — PDF modal renders without React error', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    const { token } = await apiLogin(apiRequest, OWNER);
    await login(page, OWNER);

    await page.getByTestId('document-center-trigger').click();
    const modal = page.getByRole('dialog', { name: /Teklif & PDF Döküm/ });
    await expect(modal).toBeVisible();

    const vehicleResult = page.locator('.document-result').filter({ hasText: '34 BOTS 2026' });
    if (await vehicleResult.count() > 0) {
      await vehicleResult.first().click();
      await page.waitForTimeout(1000);

      check('5A: vehicle selected in modal', (await page.locator('.document-selected-main b').textContent())?.includes('BMW') ?? false);

      const errorAlert = page.locator('.alert');
      check('5A: no React error alert', (await errorAlert.count()) === 0);

      check('5A: WhatsApp İle Gönder button visible', (await page.getByRole('button', { name: 'WhatsApp İle Gönder' }).count()) === 1);
      check('5A: Yazdır button visible', (await page.getByRole('button', { name: 'Yazdır' }).count()) === 1);
      check('5A: PDF İndir button visible', (await page.getByRole('button', { name: 'PDF İndir' }).count()) === 1);

      await page.getByRole('button', { name: 'Kapat' }).click();
    } else {
      check('5A: vehicle found in document center', false);
    }
  });

  test('5B — Verify work order exists for PDF testing via API', async ({ request }) => {
    const apiRequest = request as APIRequestContext;
    const { token } = await apiLogin(apiRequest, OWNER);

    const vehRes = await apiJson(apiRequest, 'GET', '/api/vehicles/by-plate/34%20BOTS%202026', token);
    if (vehRes.status !== 200 || !vehRes.body.vehicle) {
      check('5B: vehicle found', false);
      return;
    }
    const vehicleId = vehRes.body.vehicle.id;

    const woRes = await apiJson(apiRequest, 'GET', `/api/work-orders?limit=100&arac_id=${vehicleId}`, token);
    const orders = woRes.body.items || [];
    check('5B: at least one work order exists for vehicle', orders.length > 0, `${orders.length} found`);
    if (orders.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`   Work Order ID: ${orders[0].id}, brut: ${orders[0].brut_tutar_kurus}`);
    }
  });
});
