import { test, expect } from '@playwright/test';
import { OWNER, login } from './helpers.js';

/**
 * KATEGORİ 6 — FORM DOĞRULAMA, VERİ GİRİŞ SINIRLARI VE HARİCİ ENTEGRASYON
 *
 * Gider formuna eksi (-) tutar veya harf girilemez; hatalı girişte kayıt
 * oluşmaz ve kullanıcı uyarılır. WhatsApp bağlantısı doğru müşteri telefonu
 * ve doğru araç plakasıyla üretilmelidir.
 */
test.describe('6) Form doğrulama ve harici entegrasyon', () => {
  test('Gider formunda eksi/geçersiz tutar hata verir ve kayıt oluşturmaz', async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Giderler' }).click();
    await expect(page.locator('#gx-tutar')).toBeVisible();

    const aciklama = 'E2E geçersiz tutar';
    const input = page.locator('#gx-tutar');
    await page.locator('#gx-aciklama').fill(aciklama);

    // (a) Eksi tutar: sayı alanı geçersizdir; tarayıcı formu göndermez
    await input.fill('-5');
    expect(await input.evaluate((el: HTMLInputElement) => el.validity.valid)).toBe(false);
    await page.getByRole('button', { name: 'Gider Ekle' }).click();
    await page.waitForTimeout(400);
    // Satır sayımı asenkron yükleme nedeniyle oynak olabilir; asıl doğrulama:
    // bu gider hiçbir şekilde kaydedilmemiş olmalı.
    await expect(page.locator('.tbl tbody tr', { hasText: aciklama })).toHaveCount(0);

    // (b) Sıfır tutar: tarayıcı izin verir, uygulama kendi doğrulamasıyla reddeder
    await input.fill('0');
    await page.getByRole('button', { name: 'Gider Ekle' }).click();
    await expect(page.locator('#toast')).toContainText('Sıfırdan büyük bir tutar girin');
    await page.waitForTimeout(400);
    await expect(page.locator('.tbl tbody tr', { hasText: aciklama })).toHaveCount(0);
  });

  test('Gider formunda harf girilemez (sayı alanı)', async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Giderler' }).click();

    const input = page.locator('#gx-tutar');
    await input.click();
    await input.fill('');
    await input.type('abc');
    await expect(input).toHaveValue('');

    // Harf (boş değer) ile göndermeye çalışınca uyarı verir, kayıt olmaz
    const aciklama = 'E2E harf testi';
    await page.locator('#gx-aciklama').fill(aciklama);
    await page.getByRole('button', { name: 'Gider Ekle' }).click();
    await expect(page.locator('#toast')).toContainText('Sıfırdan büyük bir tutar girin');
    await page.waitForTimeout(500);
    await expect(page.locator('.tbl tbody tr', { hasText: aciklama })).toHaveCount(0);
  });

  test('WhatsApp bağlantısı doğru müşteri telefonu ve plakayla üretilir', async ({ page }) => {
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Hatırlatıcılar' }).click();

    // Seed verisindeki '06 B 1234' plakalı aracın muayene hatırlatması
    const card = page.locator('.rem', { hasText: '06 B 1234' }).first();
    await expect(card).toBeVisible();

    const link = card.getByRole('link', { name: 'WhatsApp ile gönder' });
    await expect(link).toBeVisible();

    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    // Ayşe Kaya: 0542 333 44 55 -> 905423334455
    expect(href!.startsWith('https://wa.me/905423334455?text=')).toBe(true);

    // Mesaj metni doğru aracı (plakayı) içermeli
    const text = decodeURIComponent(href!.split('text=')[1] || '');
    expect(text).toContain('06 B 1234');
  });
});
