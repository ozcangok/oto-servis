import { test, expect } from '@playwright/test';
import {
  OWNER,
  login,
  apiLogin,
  uniqPlate,
  createCustomer,
  createVehicle,
  createWorkOrder,
  isoAtNoon,
  pad2
} from './helpers.js';

/**
 * KATEGORİ 10 — ARAÇ SORGU PANOSU & TAKVİM (UI yenileme)
 *
 * Doğrulananlar:
 *  - Pano tek düzen: başlık + plaka sorgu kartı + 5 özet (KPI) kartı +
 *    servis tablosu + takvim kartı.
 *  - Kaldırılan paneller ("Son iş emirleri", "Azalan parçalar") artık yok.
 *  - Takvim Pazartesi ile başlar (1 Ekim 2026 → Perşembe sütunu).
 *  - Bir güne kayıtlı iş emri ajandada görünür; "Bu güne araç ekle" yeni iş
 *    emri formunu SEÇİLİ tarihle önceden doldurur.
 */

const TR_MONTHS_LONG = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
];

function monthLabel(d: Date): string {
  return `${TR_MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
}

test.describe('10) Araç sorgu panosu & takvim', () => {
  test('pano tek düzen: başlık, 5 özet kartı, servis tablosu ve takvim', async ({ page }) => {
    await login(page, OWNER);

    // Üst başlık
    await expect(page.getByRole('heading', { name: 'Araç sorgu' })).toBeVisible();

    // Plaka sorgu kartı + Sorgula düğmesi
    await expect(page.locator('.search-card')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sorgula' })).toBeVisible();
    await expect(page.getByText('Son sorgular')).toBeVisible();

    // Tam olarak 5 özet (KPI) kartı ve tek "Azalan parça" özeti
    await expect(page.locator('.kpi')).toHaveCount(5);
    await expect(page.locator('.kpi-label', { hasText: 'Azalan parça' })).toHaveCount(1);

    // Kaldırılan paneller artık yok
    await expect(page.getByText('Azalan parçalar', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Son iş emirleri', { exact: true })).toHaveCount(0);

    // Servis tablosu + takvim kartları
    await expect(page.getByRole('heading', { name: 'Serviste olan araçlar' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Takvim' })).toBeVisible();
    await expect(page.locator('.cal-month')).toHaveText(monthLabel(new Date()));

    // Takvim haftası Pazartesi ile başlar
    await expect(page.locator('.cal-dow span')).toHaveText([
      'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'
    ]);
  });

  test('takvim: 1 Ekim 2026 Perşembe sütununa denk gelir (Pazartesi başlangıç)', async ({ page }) => {
    await login(page, OWNER);

    const now = new Date();
    const delta = (2026 - now.getFullYear()) * 12 + (9 - now.getMonth()); // Ekim 2026
    const navBtn =
      delta > 0 ? page.getByRole('button', { name: 'Sonraki ay' }) : page.getByRole('button', { name: 'Önceki ay' });
    for (let i = 0; i < Math.abs(delta); i++) {
      await navBtn.click();
    }

    await expect(page.locator('.cal-month')).toHaveText('Ekim 2026');

    // 2026-10-01 Perşembe → Pazartesi başlangıçlı ızgarada 4. hücre (indeks 3)
    const day1 = page.locator('.cal-grid > *').nth(3);
    await expect(day1).toHaveText('1');
    await expect(day1).toHaveAttribute('aria-label', '1 Ekim');
  });

  test('takvim: güne eklenen araç ajandada görünür; "Bu güne araç ekle" tarihi önceden doldurur', async ({
    page,
    request
  }) => {
    const token = await apiLogin(request, OWNER);

    const now = new Date();
    const y = now.getFullYear();
    const m0 = now.getMonth();
    const daysInMonth = new Date(y, m0 + 1, 0).getDate();
    const targetDay = daysInMonth >= 15 ? 15 : daysInMonth;
    const dateStr = `${y}-${pad2(m0 + 1)}-${pad2(targetDay)}`;

    const customer = await createCustomer(request, token);
    const plate = uniqPlate();
    const vehicle = await createVehicle(request, token, { plaka: plate, musteri_id: customer.id });
    const wo = await createWorkOrder(request, token, {
      arac_id: vehicle.id,
      plaka: plate,
      giris_tarihi: isoAtNoon(y, m0, targetDay),
      durum: 'kabul',
      kalemler: [{ tur: 'iscilik', ad: 'Test işçilik', adet: 1, birim: 'Saat', birim_fiyat_kurus: 10000 }]
    });
    expect(wo.status, JSON.stringify(wo.body)).toBe(200);

    await login(page, OWNER);

    // İlgili gün hücresine tıkla → ajanda o günü gösterir
    const monthName = TR_MONTHS_LONG[m0];
    const dayCell = page.getByRole('button', { name: `${targetDay} ${monthName}` });
    // Dolu gün: gün hücresinde nokta görünür
    await expect(dayCell.locator('.dot')).toBeVisible();
    await dayCell.click();
    await expect(page.locator('.agenda')).toContainText(plate);

    // "Bu güne araç ekle" → yeni iş emri formu seçili tarihle açılır
    await page.getByRole('button', { name: 'Bu güne araç ekle' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(page.locator('#of-date')).toHaveValue(dateStr);
  });

  test('kısayol: "/" plaka kutusuna odaklar; input içinde yazarken tetiklenmez', async ({ page }) => {
    await login(page, OWNER);

    const q = page.locator('#q');
    await expect(q).not.toBeFocused();

    // Gövdedeyken "/" → plaka kutusuna odaklanır
    await page.keyboard.press('/');
    await expect(q).toBeFocused();

    // Input içinde "/" normal bir karakterdir; odak çalınmaz, değer korunur
    await q.fill('');
    await q.pressSequentially('34/');
    await expect(q).toHaveValue('34/');
    await expect(q).toBeFocused();
  });

  test('yerleşim: arama kutusu büyük kalır; formdaki plaka kutusu normal kontrol yüksekliğinde', async ({
    page
  }) => {
    await login(page, OWNER);

    const height = (sel) =>
      page.locator(sel).first().evaluate((el) => Math.round(el.getBoundingClientRect().height));

    // Pano arama kutusu BÜYÜK kalmalı (Bölüm 6.3) — kokpit düzeninde biraz daraltılır
    const searchBoxH = await height('.plate-row .plate-input');
    expect(searchBoxH).toBeGreaterThan(58);

    // Yeni iş emri formu açılır
    await page.getByRole('button', { name: 'Yeni iş emri' }).first().click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Formdaki plaka kutusu satır yüksekliğine YAYILMAMALI (regresyon koruması)
    const formPlateH = await height('.field > .plate-input');
    const dateH = await height('#of-date');
    expect(formPlateH).toBeLessThan(80);
    expect(formPlateH).toBeGreaterThanOrEqual(40);
    expect(Math.abs(formPlateH - dateH)).toBeLessThanOrEqual(14);
    // Arama kutusu form kutusundan belirgin şekilde büyük kalmalı
    expect(searchBoxH).toBeGreaterThan(formPlateH + 8);
  });
});
