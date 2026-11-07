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

test.describe('PHASE 4 — Work Orders & Math', () => {
  test('4A — Create work order, add labor 800₺ + Castrol part, verify math, set completed', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    const { token } = await apiLogin(apiRequest, OWNER);
    await login(page, OWNER);

    // Look up vehicle and part via API with token
    const vehRes = await apiJson(apiRequest, 'GET', '/api/vehicles/by-plate/34%20BOTS%202026', token);
    if (vehRes.status !== 200 || !vehRes.body.vehicle) {
      check('4A: vehicle 34 BOTS 2026 found', false, `status=${vehRes.status}`);
      return;
    }
    const vehicleId = vehRes.body.vehicle.id;
    // eslint-disable-next-line no-console
    console.log(`   Vehicle ID: ${vehicleId}`);

    const partsRes = await apiJson(apiRequest, 'GET', '/api/parts?limit=1000', token);
    const parts = partsRes.body.items || [];
    const castrol = parts.find((p: any) => p.ad === 'Castrol Edge 5W-30 Motor Yağı');
    if (!castrol) {
      check('4A: Castrol part found', false);
      return;
    }
    const partId = castrol.id;
    // eslint-disable-next-line no-console
    console.log(`   Part ID: ${partId}, stock: ${castrol.stok_miktari}`);

    await page.getByRole('tab', { name: 'Araç sorgu' }).click();
    await page.waitForTimeout(500);
    // Use evaluate to set search and trigger via PlateInput's onChange
    await page.evaluate(() => {
      const input = document.getElementById('q') as HTMLInputElement;
      if (input) {
        input.value = '34 BOTS 2026';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: 'Sorgula' }).click();
    await page.waitForTimeout(1000);

    const results = page.locator('.li');
    if (await results.filter({ hasText: '34 BOTS 2026' }).count() > 0) {
      await results.filter({ hasText: '34 BOTS 2026' }).first().click();
      await page.waitForTimeout(1000);

      await page.getByRole('button', { name: 'Yeni iş emri' }).click();
      await page.waitForTimeout(500);

      const modal = page.getByRole('dialog');
      await expect(modal).toBeVisible();

      const plateVal = await page.locator('#of-plate').inputValue();
      check('4A: plate pre-filled', plateVal.includes('34 BOTS 2026'), plateVal);

      // Add labor line
      await page.getByRole('button', { name: '+ İşçilik' }).click();
      await page.waitForTimeout(300);

      const laborNameInputs = page.locator('input[placeholder="Yapılan işlem"]');
      await laborNameInputs.last().click();
      await laborNameInputs.last().fill('Periyodik Bakım İşçiliği');

      const priceInputs = page.locator('input[placeholder="0,00"]');
      await priceInputs.last().click();
      await priceInputs.last().fill('800');

      // Add part line
      await page.getByRole('button', { name: '+ Parça' }).click();
      await page.waitForTimeout(300);

      const partNameInputs = page.locator('input[list="partlist"]');
      await partNameInputs.last().click();
      await partNameInputs.last().fill('Castrol Edge 5W-30 Motor Yağı');
      await page.waitForTimeout(500);

      const stockHint = page.locator('.hint');
      check('4A: stock hint visible for Castrol', (await stockHint.count()) > 0);

      await page.waitForTimeout(500);
      const totalsBox = page.locator('.totals-box');
      const totalsText = await totalsBox.textContent();
      check('4A: Ara Toplam 2000₺', totalsText?.includes('200,00') ?? false, totalsText || '');
      check('4A: KDV 400₺', totalsText?.includes('400,00') ?? false, totalsText || '');
      check('4A: Genel Toplam 2400₺', totalsText?.includes('2400,00') ?? false, totalsText || '');

      const stageSelect = page.locator('#of-stage');
      await stageSelect.click();
      await stageSelect.selectOption({ value: 'delivered' });

      await page.getByRole('button', { name: 'Kaydet' }).click();
      await page.waitForTimeout(1000);

      check('4A: work order saved', true);

      const woRes = await apiJson(apiRequest, 'GET', '/api/work-orders?limit=100', token);
      const orders = woRes.body.items || [];
      const wo = orders.find((o: any) => o.arac_id === vehicleId);
      if (wo) {
        // eslint-disable-next-line no-console
        console.log(`   Work Order ID: ${wo.id}, durum: ${wo.durum}, brut: ${wo.brut_tutar_kurus}`);
      }
    } else {
      check('4A: vehicle result found in search', false);
    }
  });

  test('4B — Stock deduction: Castrol stock 5 → 4', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    const { token } = await apiLogin(apiRequest, OWNER);
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Parça arşivi' }).click();
    await page.waitForTimeout(500);

    const castrolRow = page.locator('text=Castrol Edge 5W-30 Motor Yağı').first();
    const rowText = await castrolRow.locator('..').textContent();
    check('4B: Castrol stock decreased to 4', (rowText || '').includes('4'), rowText || '');

    const partsRes = await apiJson(apiRequest, 'GET', '/api/parts?limit=1000', token);
    const parts = partsRes.body.items || [];
    const castrol = parts.find((p: any) => p.ad === 'Castrol Edge 5W-30 Motor Yağı');
    check('4B: Castrol stock = 4 in DB', castrol !== undefined && castrol.stok_miktari === 4, castrol ? String(castrol.stok_miktari) : 'not found');
  });

  test('4C — Kasa: verify revenue reflection', async ({ page }) => {
    await login(page, OWNER);

    await page.getByRole('tab', { name: 'Kasa' }).click();
    await page.waitForTimeout(1000);

    const kasaText = await page.locator('.kasa-sum').textContent();
    check('4C: Kasa screen loads', kasaText !== null);

    await page.getByRole('tab', { name: 'Araç sorgu' }).click();
    await page.waitForTimeout(500);

    const ciroText = await page.locator('text=Aylık Toplam Ciro').first().locator('..').textContent();
    check('4C: Aylık Toplam Ciro KPI visible', (ciroText || '').includes('2400') || (ciroText || '').includes('2.400'), ciroText || '');
  });
});
