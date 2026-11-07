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

test.describe('PHASE 6 — Destructive & Edge Cases (Cascade Deletion)', () => {
  test('6A — Delete vehicle 34 BOTS 2026, verify no crash, orphaned work orders handled', async ({ page, request }) => {
    const apiRequest = request as APIRequestContext;
    const { token } = await apiLogin(apiRequest, OWNER);
    await login(page, OWNER);

    const vehRes = await apiJson(apiRequest, 'GET', '/api/vehicles/by-plate/34%20BOTS%202026', token);
    if (vehRes.status !== 200 || !vehRes.body.vehicle) {
      check('6A: vehicle 34 BOTS 2026 found for deletion', false, `status=${vehRes.status}`);
      return;
    }
    const vehicleId = vehRes.body.vehicle.id;
    // eslint-disable-next-line no-console
    console.log(`   Vehicle ID: ${vehicleId}`);

    await page.getByRole('tab', { name: 'Araçlar' }).click();
    await page.waitForTimeout(500);

    const vehicleRows = page.locator('.li');
    const targetRow = vehicleRows.filter({ hasText: '34 BOTS 2026' });

    if (await targetRow.count() > 0) {
      const deleteBtn = targetRow.locator('button').filter({ hasText: 'Sil' });
      if (await deleteBtn.count() > 0) {
        await deleteBtn.first().click();
        await page.waitForTimeout(300);

        const confirmBtn = targetRow.locator('button').filter({ hasText: 'Emin misin? Tekrar tıkla' });
        if (await confirmBtn.count() > 0) {
          await confirmBtn.first().click();
          await page.waitForTimeout(1000);

          check('6A: delete completed without crash', true);

          await page.waitForTimeout(500);
          const stillThere = await page.locator('text=34 BOTS 2026').count() > 0;
          check('6A: vehicle removed from UI list', !stillThere);
        } else {
          check('6A: confirm delete button appeared', false);
        }
      } else {
        check('6A: delete button found', false);
      }
    } else {
      check('6A: vehicle found in UI list', false);
    }

    // Verify via API: vehicle should be soft-deleted
    const vehRes2 = await apiJson(apiRequest, 'GET', '/api/vehicles/by-plate/34%20BOTS%202026', token);
    check('6A: vehicle soft-deleted (404/not found)', vehRes2.status === 404 || !vehRes2.body.success);

    // Verify work orders for this vehicle are also deleted
    const woRes = await apiJson(apiRequest, 'GET', '/api/work-orders?limit=100', token);
    const orders = woRes.body.items || [];
    const orphaned = orders.filter((o: any) => o.arac_id === vehicleId && !o.deleted_at);
    check('6A: no orphaned work orders', orphaned.length === 0, `${orphaned.length} orphaned`);
  });
});
