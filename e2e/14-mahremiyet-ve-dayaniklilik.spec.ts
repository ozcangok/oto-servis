import { test, expect } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { OWNER, STAFF, login, logout, apiLogin, apiJson, uniqPhone } from './helpers.js';

/**
 * KATEGORİ 14 — ARAYÜZ MAHREMİYETİ, XSS VE EKRAN GÖRÜNTÜLERİ
 *
 * Bölüm 3 (arayüzler açılıyor) + Bölüm 4.3 (staff arayüzünde yetkisiz menü,
 * ekran, rakam ve buton bulunmaması) maddelerini gerçek tarayıcıda çalıştırır.
 *
 * Tasarım kararı gerektiren sapmalar (plan Bölüm 1.3: "bana bırak") burada
 * testi KIRMIZI yapmaz; ölçülür ve test-raporu/04-arayuz.md dosyasına yazılır.
 * Yalnızca gerçek güvenlik kusurları (XSS çalışması, yönlendirme başarısızlığı)
 * assertion ile kırmızıya düşürülür.
 */

const OUT_DIR = path.resolve(process.cwd(), 'test-raporu');
const SHOT_DIR = path.join(OUT_DIR, 'ekran');
const findings: string[] = [];

const SCREENS: Array<{ hash: string; name: string; ownerOnly?: boolean; dialog?: boolean }> = [
  { hash: '#/sorgu', name: 'arac-sorgu' },
  { hash: '#/araclar', name: 'araclar' },
  { hash: '#/musteriler', name: 'musteriler' },
  { hash: '#/parcalar', name: 'parca-arsivi' },
  { hash: '#/cari', name: 'cari-hesap' },
  { hash: '#/giderler', name: 'giderler' },
  { hash: '#/hatirlaticilar', name: 'hatirlaticilar' },
  { hash: '#/kasa', name: 'kasa', ownerOnly: true },
  { hash: '#/ayarlar', name: 'ayarlar', dialog: true, ownerOnly: true }
];

async function shot(page: any, name: string) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: path.join(SHOT_DIR, `${name}.png`) });
}

test.describe('14) Arayüz mahremiyeti, XSS ve ekran görüntüleri', () => {
  test.afterAll(() => {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const lines = ['# Arayüz Mahremiyeti ve Ekran Görüntüleri (Bölüm 3 + 4.3)', ''];
    if (findings.length) {
      lines.push('## Bulgular (tasarım kararı bekleyen sapmalar)', '');
      for (const f of findings) lines.push(`- ${f}`);
    } else {
      lines.push('Beklenmeyen sapma bulunmadı.');
    }
    lines.push('', `Ekran görüntüleri: \`test-raporu/ekran/\``, '');
    fs.writeFileSync(path.join(OUT_DIR, '04-arayuz.md'), lines.join('\n'), 'utf8');
  });

  test('staff ana ekranda mali rakamlar (KPI) taraması', async ({ page }) => {
    await login(page, STAFF);
    await page.goto('/#/sorgu');
    await page.waitForLoadState('networkidle');

    const text = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
    const html = await page.content();
    const forbidden = ['Bu ay (KDV dahil)', 'Toplam işçilik', 'Açık cari'];
    const found = forbidden.filter((f) => text.includes(f) || html.includes(f));

    if (found.length) {
      findings.push(
        `Ana ekran KPI kartları personelde de görünüyor: ${found.join(', ')} (varsayılan matrise göre personel mali rakam görmemeli)`
      );
    }

    // Gerçekten rakam sızıyor mu? (₺ içeren KPI değerleri)
    const kpiText = (await page.locator('.kpi').allInnerTexts()).join(' | ');
    if (/₺|TL/.test(kpiText)) {
      findings.push(`Personel ana ekranda para birimi içeren KPI değeri görüyor: "${kpiText.slice(0, 200)}"`);
    }
  });

  test('staff yasaklı adresler: kasa / ayarlar / kullanıcılar', async ({ page }) => {
    await login(page, STAFF);

    for (const hash of ['#/kasa', '#/ayarlar', '#/kullanicilar']) {
      await page.goto(`/${hash}`);
      await page.reload();
      const current = new URL(page.url()).hash;
      expect(current, `staff ${hash} adresinden yönlendirilmeli`).toBe('#/sorgu');
      await expect(page.locator('.kasa-sum')).toHaveCount(0);
      await expect(page.getByRole('dialog')).toHaveCount(0);
    }
  });

  test('staff cari hesap adresi ve menüsü (tasarım kararı: yalnızca sahip)', async ({ page }) => {
    await login(page, STAFF);
    const cariTabCount = await page.getByRole('tab', { name: 'Cari hesap' }).count();
    await page.goto('/#/cari');
    await page.reload();
    // Ölçüm: yalnızca GERÇEK cari içeriğine bak (sekme, adres ve ekran başlığı).
    // Gövde uzunluğuna bakmak yanlış pozitif üretiyordu: personel #/cari'den
    // yönlendirilse bile panonun gövdesi uzun olduğundan "görüyor" sanılıyordu.
    const hash = new URL(page.url()).hash;
    const cariScreenCount = await page.getByRole('heading', { name: 'Açık hesaplar' }).count();
    const cariVisible = hash === '#/cari' || cariScreenCount > 0;
    if (cariTabCount > 0 || cariVisible) {
      findings.push(
        'Personel "Cari hesap" menüsünü ve ekranını görebiliyor (varsayılan matrise göre cari/bakiyeler yalnızca sahipte)'
      );
    }
    // Karar verildi: cari hesap (bakiyeler) yalnızca dükkan sahibine açıktır.
    expect(cariTabCount, 'staff cari sekmesini görmemeli').toBe(0);
    expect(hash, 'staff #/cari adresinden yönlendirilmeli').not.toBe('#/cari');
    expect(cariScreenCount, 'staff cari ekranını görmemeli').toBe(0);
  });

  test('staff Ayarlar düğmesi ile modal açabiliyor mu (tasarım kararı: yalnızca sahip)', async ({ page }) => {
    await login(page, STAFF);
    const settingsBtn = page.getByRole('button', { name: /Ayarlar/i });
    if ((await settingsBtn.count()) > 0) {
      findings.push('Personel menüsünde "Ayarlar" düğmesi görünüyor (rota koruması var ama düğme korumasız)');
    }
    // Karar verildi: Ayarlar (dükkan bilgileri, KDV/iskonto, yedek) yalnızca sahipte.
    await expect(settingsBtn, 'staff menüde "Ayarlar" düğmesi görmemeli').toHaveCount(0);
    await page.goto('/#/ayarlar');
    await page.reload();
    await expect(page.getByRole('dialog'), 'staff Ayarlar modalını açamamalı').toHaveCount(0);
  });

  test('XSS: müşteri adına yazılan etiket çalışmaz', async ({ page, request }) => {
    const token = await apiLogin(request, OWNER);
    const payload = `<img src=x onerror="window.__oto_xss=1"><script>window.__oto_xss=2</script>`;
    const res = await apiJson(request, 'POST', '/api/customers', token, {
      ad_soyad: `XSS ${payload}`,
      telefon: uniqPhone()
    });
    expect(res.status).toBe(200);

    await login(page, OWNER);
    await page.goto('/#/musteriler');
    await page.waitForLoadState('networkidle');

    const flag = await page.evaluate(() => (window as any).__oto_xss);
    expect(flag, 'XSS payload çalıştı!').toBeUndefined();
    const injectedImgs = await page.locator('img[src="x"]').count();
    expect(injectedImgs, 'Enjekte edilen <img> DOM\'a girdi').toBe(0);

    // Metin olarak görünür olmalı (kaçış çalışıyor)
    await expect(page.locator('body')).toContainText('onerror');
  });

  test('hesaplara girip çık: staff cari göremez, owner görebilir', async ({ page }) => {
    // STAFF girişi
    await login(page, STAFF);
    await expect(page.getByRole('tab', { name: 'Cari hesap' })).toHaveCount(0);
    await expect(page.locator('.kpi-label', { hasText: 'Bu ay (KDV dahil)' })).toHaveCount(0);
    await expect(page.locator('.kpi-label', { hasText: 'Toplam işçilik' })).toHaveCount(0);
    await expect(page.locator('.kpi-label', { hasText: 'Açık cari' })).toHaveCount(0);

    // STAFF çıkışı
    await logout(page);
    await expect(page.getByTestId('login-screen')).toBeVisible();

    // OWNER girişi
    await login(page, OWNER);
    await expect(page.getByRole('tab', { name: 'Cari hesap' })).toBeVisible();
    await expect(page.locator('.kpi-label', { hasText: 'Bu ay (KDV dahil)' })).toBeVisible();
    await expect(page.locator('.kpi-label', { hasText: 'Toplam işçilik' })).toBeVisible();
    await expect(page.locator('.kpi-label', { hasText: 'Açık cari' })).toBeVisible();

    // OWNER çıkışı
    await logout(page);
    await expect(page.getByTestId('login-screen')).toBeVisible();
  });

  test('Ayarlar modalı açıkken adres değişirse modal kapanır (geri tuşu / kenar çubuğu)', async ({ page }) => {
    await login(page, OWNER);

    await page.goto('/#/ayarlar');
    await expect(page.getByRole('dialog')).toBeVisible();

    // Adres değişimi (kenar çubuğu veya Geri tuşu) modalı kapatmalı.
    await page.goto('/#/sorgu');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(new URL(page.url()).hash).toBe('#/sorgu');

    await page.goto('/#/ayarlar');
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.goBack();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Bölüm 3 — tüm ekranlar açılıyor + ekran görüntüleri (owner ve staff)', async ({ page }) => {
    test.slow();
    fs.mkdirSync(SHOT_DIR, { recursive: true });

    // OWNER — tüm ekranlar (açık tema)
    await login(page, OWNER);
    for (const s of SCREENS) {
      await page.goto(`/${s.hash}`);
      await page.waitForLoadState('load');
      await expect(page.locator('body')).toBeVisible();
      await page.waitForTimeout(350);
      await shot(page, `owner-${s.name}`);
    }

    // OWNER — koyu tema (ana ekran + kasa)
    await page.goto('/#/sorgu');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: /tema/i }).click();
    await page.waitForTimeout(350);
    await shot(page, 'owner-koyu-tema-sorgu');
    await page.goto('/#/kasa');
    await page.waitForLoadState('load');
    await page.waitForTimeout(350);
    await shot(page, 'owner-koyu-tema-kasa');

    // OWNER — dar ekran (mobil genişlik)
    await page.setViewportSize({ width: 480, height: 900 });
    await page.goto('/#/sorgu');
    await page.waitForLoadState('load');
    await page.waitForTimeout(350);
    await shot(page, 'owner-mobil-sorgu');

    // STAFF — erişebildiği ekranlar
    await page.setViewportSize({ width: 1440, height: 900 });
    await logout(page);
    await login(page, STAFF);
    for (const s of SCREENS.filter((x) => !x.ownerOnly)) {
      await page.goto(`/${s.hash}`);
      await page.waitForLoadState('load');
      await page.waitForTimeout(350);
      await shot(page, `staff-${s.name}`);
    }
  });
});
