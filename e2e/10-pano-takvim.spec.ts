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

  test('randevu: gelecek tarihli kayıt listede görünmez, bugünkü görünür ve "İşleme al" açılır', async ({
    page,
    request
  }) => {
    const token = await apiLogin(request, OWNER);

    const now = new Date();
    const y = now.getFullYear();
    const m0 = now.getMonth();
    const d = now.getDate();

    // Bugünün randevusu
    const cToday = await createCustomer(request, token, { ad_soyad: 'Bugün Randevu' });
    const todayPlate = uniqPlate();
    const vToday = await createVehicle(request, token, { plaka: todayPlate, musteri_id: cToday.id });
    const woToday = await createWorkOrder(request, token, {
      arac_id: vToday.id,
      plaka: todayPlate,
      giris_tarihi: isoAtNoon(y, m0, d),
      durum: 'kabul',
      kalemler: [{ tur: 'iscilik', ad: 'Bugün işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 5000 }]
    });
    expect(woToday.status, JSON.stringify(woToday.body)).toBe(200);

    // Gelecek (3 gün sonra) randevusu — henüz servise gelmedi
    const future = new Date(y, m0, d + 3);
    const cFuture = await createCustomer(request, token, { ad_soyad: 'Gelecek Randevu' });
    const futurePlate = uniqPlate();
    const vFuture = await createVehicle(request, token, { plaka: futurePlate, musteri_id: cFuture.id });
    const woFuture = await createWorkOrder(request, token, {
      arac_id: vFuture.id,
      plaka: futurePlate,
      giris_tarihi: isoAtNoon(future.getFullYear(), future.getMonth(), future.getDate()),
      durum: 'kabul',
      kalemler: [{ tur: 'iscilik', ad: 'Gelecek işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 5000 }]
    });
    expect(woFuture.status, JSON.stringify(woFuture.body)).toBe(200);

    await login(page, OWNER);

    // Gelecek randevu "Serviste olan araçlar" listesinde YOK; bugünkü VAR.
    const svc = page.locator('.svc');
    await expect(svc).toContainText(todayPlate);
    await expect(svc).not.toContainText(futurePlate);

    // Takvim ajandasında bugünkü randevu → tek tık "İşleme al" iş emri formunu açar.
    const agendaItem = page.locator('.agenda-item', { hasText: todayPlate }).first();
    await agendaItem.getByRole('button', { name: 'İşleme al' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
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
