import { expect, type Page, type APIRequestContext } from '@playwright/test';

/**
 * E2E test yardımcıları.
 *
 * Testler İZOLE bir yığın üzerinde çalışır: Playwright kendi API sunucusunu
 * (kendi geçici veritabanı) ve arayüz örneğini başlatır. Bu yüzden seed
 * tarafından oluşturulan bilinen hesaplar kullanılır.
 */
export const API_URL = process.env.E2E_API_URL || 'http://127.0.0.1:3101';

// İzole test veritabanında seed ile oluşturulan hesaplar
export const OWNER = { username: 'admin', password: 'admin123' };
export const STAFF = { username: 'kasiyer', password: 'kasiyer123' };

export interface Creds {
  username: string;
  password: string;
}

// ---------------------------------------------------------------- UI helpers

/**
 * Açılış (splash) ekranını atlar.
 *
 * Splash yalnızca gerçek kullanıcı açılışında gösterilir; E2E testleri doğrudan
 * giriş ekranına ulaşmalıdır. `sessionStorage` bayrağı her gezinmede (init
 * script ile) sayfa kodundan ÖNCE yazılır.
 */
export async function skipSplash(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.sessionStorage.setItem('oto_splash_seen', '1');
    } catch {}
  });
}

export async function login(page: Page, creds: Creds): Promise<void> {
  await skipSplash(page);
  await page.goto('/');
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  // Kutular otomatik-doldurmayı engellemek için dokunulana kadar salt-okunur
  const user = page.locator('#auth-username');
  const pass = page.locator('#auth-password');
  await user.click();
  await user.fill(creds.username);
  await pass.click();
  await pass.fill(creds.password);

  await page.getByRole('button', { name: 'Giriş Yap' }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.topbar')).toBeVisible();
}

export async function logout(page: Page): Promise<void> {
  await page.getByTitle('Çıkış Yap').click();
  await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 10_000 });
}

/** Çıkış sonrası: uygulama kabuğu DOM'da olmamalı, hiçbir tutar (₺) görünmemeli. */
export async function expectIsolatedLogin(page: Page): Promise<void> {
  await expect(page.getByTestId('login-screen')).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('.topbar')).toHaveCount(0);
  await expect(page.locator('.wrap')).toHaveCount(0);
  await expect(page.locator('.wm')).toHaveCount(0);
  // Hiçbir para birimi/tutar görünmemeli
  await expect(page.locator('body')).not.toContainText('₺');
}

/** Yakalanan tutarların artık görünmez olduğunu doğrular. */
export async function expectAmountsGone(page: Page, amounts: string[]): Promise<void> {
  for (const raw of amounts) {
    const v = raw.trim();
    if (v) {
      await expect(page.getByText(v, { exact: false })).not.toBeVisible();
    }
  }
}

// --------------------------------------------------------------- API helpers

export async function apiLogin(request: APIRequestContext, creds: Creds = OWNER): Promise<string> {
  const res = await request.post(`${API_URL}/api/auth/login`, { data: creds });
  expect(res.ok(), 'API girişi başarısız').toBeTruthy();
  const body = await res.json();
  return body.token as string;
}

export async function apiJson(
  request: APIRequestContext,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  path: string,
  token?: string,
  data?: any
): Promise<{ status: number; body: any }> {
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

// -------------------------------------------------------------- Date helpers

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function dateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayOnly(): string {
  return dateOnly(new Date());
}

/** Yerel saat diliminde öğlen → TZ kaynaklı sınır hatalarını önler. */
export function isoAtNoon(y: number, m0: number, d: number): string {
  return new Date(y, m0, d, 12, 0, 0).toISOString();
}

// -------------------------------------------------------------- Uniq values

let seq = 0;

export function uniqPlate(): string {
  seq += 1;
  const r = Math.floor(Math.random() * 90 + 10);
  return `99 TST ${r}${String(seq).padStart(2, '0')}`;
}

export function uniqPhone(): string {
  seq += 1;
  const tail = String(Date.now()).slice(-6);
  return `0555${tail}${pad2(seq % 100)}`;
}

export function uniqKod(): string {
  seq += 1;
  return `E2E-${Date.now()}-${seq}`;
}

// ------------------------------------------------------------- Creators

export async function createCustomer(
  request: APIRequestContext,
  token: string,
  over: { ad_soyad?: string; telefon?: string } = {}
): Promise<any> {
  const { status, body } = await apiJson(request, 'POST', '/api/customers', token, {
    ad_soyad: over.ad_soyad || 'E2E Test Müşteri',
    telefon: over.telefon || uniqPhone()
  });
  expect(status, JSON.stringify(body)).toBe(200);
  return body.customer;
}

export async function createVehicle(
  request: APIRequestContext,
  token: string,
  over: { plaka: string; musteri_id?: number | null; musteri_ad_soyad?: string; muayene_tarihi?: string | null }
): Promise<any> {
  const { status, body } = await apiJson(request, 'POST', '/api/vehicles', token, {
    plaka: over.plaka,
    marka: 'E2E Test',
    model: 'Model',
    yil: 2020,
    musteri_id: over.musteri_id ?? null,
    musteri_ad_soyad: over.musteri_ad_soyad || 'E2E Test Müşteri',
    musteri_telefon: uniqPhone(),
    muayene_tarihi: over.muayene_tarihi ?? null
  });
  expect(status, JSON.stringify(body)).toBe(200);
  return body.vehicle;
}

export async function createWorkOrder(
  request: APIRequestContext,
  token: string,
  over: {
    arac_id: number;
    plaka: string;
    giris_tarihi?: string;
    durum?: string;
    kalemler: any[];
  }
): Promise<{ status: number; body: any }> {
  return apiJson(request, 'POST', '/api/work-orders', token, {
    arac_id: over.arac_id,
    plaka: over.plaka,
    giris_tarihi: over.giris_tarihi,
    durum: over.durum || 'kabul',
    sikayet: 'E2E test iş emri',
    kdv_orani: 20,
    kdv_dahil_mi: false,
    kalemler: over.kalemler
  });
}

export async function createExpense(
  request: APIRequestContext,
  token: string,
  over: { tarih: string; kategori: string; aciklama?: string; tutar_kurus: number }
): Promise<{ status: number; body: any }> {
  return apiJson(request, 'POST', '/api/expenses', token, {
    tarih: over.tarih,
    kategori: over.kategori,
    aciklama: over.aciklama || 'E2E test gideri',
    tutar_kurus: over.tutar_kurus
  });
}

export async function createPart(
  request: APIRequestContext,
  token: string,
  over: { ad?: string; kod?: string; stok?: number; satis_kurus?: number } = {}
): Promise<{ part: any; stockAfterInit: number }> {
  const { status, body } = await apiJson(request, 'POST', '/api/parts', token, {
    ad: over.ad || 'E2E Test Parçası',
    kod: over.kod || uniqKod(),
    birim: 'Adet',
    kritik_stok: 0,
    alis_kurus: 1000,
    satis_kurus: over.satis_kurus ?? 5000,
    aktif: true
  });
  expect(status, JSON.stringify(body)).toBe(200);
  const part = body.part;

  const stok = over.stok ?? 0;
  if (stok !== 0) {
    const mv = await apiJson(request, 'POST', `/api/parts/${part.id}/stock-movement`, token, {
      miktar: stok,
      tur: 'giris'
    });
    expect(mv.status, JSON.stringify(mv.body)).toBe(200);
  }
  return { part, stockAfterInit: stok };
}

export async function getPart(request: APIRequestContext, token: string, id: number): Promise<any> {
  const { body } = await apiJson(request, 'GET', `/api/parts/${id}`, token);
  return body.part;
}

// ---------------------------------------------- WhatsApp durum bildirimleri

export async function setWorkOrderStatus(
  request: APIRequestContext,
  token: string,
  id: number,
  durum: string
): Promise<{ status: number; body: any }> {
  return apiJson(request, 'PUT', `/api/work-orders/${id}/status`, token, { durum });
}

export async function getWhatsAppMessages(
  request: APIRequestContext,
  token: string
): Promise<any[]> {
  const { body } = await apiJson(request, 'GET', '/api/reminders/messages', token);
  return body.items as any[];
}

/** Belirli bir plaka için (en yeni) gönderim kayıtlarını süzer. */
export function messagesForPlate(items: any[], plaka: string): any[] {
  return items.filter((m) => m.plaka === plaka);
}
