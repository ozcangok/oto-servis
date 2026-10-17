import { test, expect } from '@playwright/test';
import {
  OWNER,
  login,
  apiLogin,
  apiJson,
  createPart,
  getPart,
  uniqKod
} from './helpers.js';

/**
 * KATEGORİ 9 — PARÇA ARŞİVİ: OPSİYONEL FİYAT & STOK GÜNCELLEME
 *
 * Kullanıcı yalnızca "Stok Adedi"ni güncelleyip fiyat alanlarını boş
 * bırakabilmelidir:
 *  - Fiyatlar opsiyoneldir; kaydetme "Required" hatası vermez.
 *  - Boş bırakılan fiyat, düzenlemede MEVCUT değeri korur (sadece stok değişir);
 *    yeni parçada 0 kabul edilir.
 *  - Stok adedi başarıyla güncellenir.
 */

test.describe('9) Parça arşivi — opsiyonel fiyat & stok güncelleme', () => {
  test('yalnızca stok güncellenir; boş bırakılan fiyatlar mevcut değerini korur (API)', async ({ request }) => {
    const token = await apiLogin(request, OWNER);

    const { part } = await createPart(request, token, { stok: 5 }); // alis 1000, satis 5000
    expect(part.alis_kurus).toBe(1000);
    expect(part.satis_kurus).toBe(5000);

    // Sadece stok adedi gönderilir; fiyat alanları GÖNDERİLMEZ.
    const put = await apiJson(request, 'PUT', `/api/parts/${part.id}`, token, {
      ad: part.ad,
      kod: part.kod,
      stok_miktari: 12
    });
    expect(put.status, JSON.stringify(put.body)).toBe(200);

    const after = await getPart(request, token, part.id);
    expect(after.stok_miktari).toBe(12); // stok güncellendi
    expect(after.alis_kurus).toBe(1000); // mevcut alış fiyatı korundu
    expect(after.satis_kurus).toBe(5000); // mevcut satış fiyatı korundu
  });

  test('yeni parça boş fiyatla eklenebilir; stok verilirse işlenir (API)', async ({ request }) => {
    const token = await apiLogin(request, OWNER);

    const res = await apiJson(request, 'POST', '/api/parts', token, {
      ad: 'E2E Boş Fiyatlı Parça',
      kod: uniqKod(),
      stok_miktari: 4
      // alis_kurus / satis_kurus YOK → Required OLMAMALI
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.part.alis_kurus).toBe(0);
    expect(res.body.part.satis_kurus).toBe(0);

    const after = await getPart(request, token, res.body.part.id);
    expect(after.stok_miktari).toBe(4); // başlangıç stoğu uygulandı
  });

  test('form boş fiyatla kaydedilince hata vermez ve stok başarıyla güncellenir (uçtan uca)', async ({
    page,
    request
  }) => {
    const token = await apiLogin(request, OWNER);

    const ad = `E2E Stok Parça ${Date.now().toString().slice(-6)}`;
    const { part } = await createPart(request, token, { ad, stok: 3 });
    expect(part.kod).toBeTruthy();

    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Parça arşivi' }).click();

    // Parçayı ara ve düzenle
    await page.locator('#pq').fill(part.kod);
    const row = page.locator('tr', { hasText: ad }).first();
    await expect(row).toBeVisible();
    await row.getByRole('button', { name: 'Düzenle' }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fiyat alanları BOŞ bırakılır; yalnızca stok adedi değiştirilir.
    await page.locator('#pf-buy').fill('');
    await page.locator('#pf-sell').fill('');
    await page.locator('#pf-qty').fill('7');

    await dialog.getByRole('button', { name: 'Kaydet' }).click();

    // Hata olmamalı ve modal kapanmalı
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(page.locator('.form-error')).toHaveCount(0);

    // Sunucu tarafı doğrulama: stok güncellendi, fiyatlar korundu
    const after = await getPart(request, token, part.id);
    expect(after.stok_miktari, 'stok güncellenmedi').toBe(7);
    expect(after.alis_kurus).toBe(1000);
    expect(after.satis_kurus).toBe(5000);

    // Arayüzde de yeni stok görünür
    await expect(page.locator('tr', { hasText: ad }).first()).toContainText('7');
  });
});
