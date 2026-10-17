import { test, expect, type Page } from '@playwright/test';
import { skipSplash } from './helpers.js';

/**
 * KATEGORİ 13 — ARAYÜZ TUTARLILIĞI (bayat önbellek / service worker koruması)
 *
 * Bildirilen hata: tarayıcıda giriş ekranı yenilendikçe BİRBİRİNDEN FARKLI
 * görünüyordu (biri güncel bordo tasarım, diğeri eski/yabancı bir tasarım).
 *
 * Kök neden: `public/sw.js` uygulama kabuğunu (HTML) `caches.match()` ile
 * KÖKENTEKİ TÜM önbelleklerden cache-first sunuyordu; ayrıca `index.html`
 * içindeki koşulsuz SW kaydı geliştirme modundaki temizlikle çakışıyordu.
 *
 * Bu testler o hatanın geri dönmemesini garanti eder:
 *  1) Geliştirme modunda HİÇ service worker ve önbellek kalmaz,
 *  2) Üst üste yenilemelerde giriş ekranı piksel/stil düzeyinde AYNI kalır,
 *  3) `sw.js` kökendeki yabancı önbelleklere bakmaz ve HTML'i ağdan alır.
 */

/** Giriş ekranının kimliğini çıkaran stil ölçümü (sürüm değişirse değişir). */
async function gorunumParmakIzi(page: Page) {
  return page.evaluate(() => {
    const baslik = document.querySelector('.sheet-head h2') as HTMLElement | null;
    const buton = document.querySelector('.btn.btn-primary') as HTMLElement | null;
    const bas = baslik ? getComputedStyle(baslik) : null;
    const b = buton ? getComputedStyle(buton) : null;
    return {
      baslikMetni: (baslik?.textContent || '').trim(),
      baslikDonusum: bas?.textTransform || '',
      baslikRengi: bas?.color || '',
      butonArka: b?.backgroundColor || '',
      butonYazi: (buton?.textContent || '').trim(),
      tema: document.documentElement.getAttribute('data-theme'),
      stilDosyalari: Array.from(document.querySelectorAll('link[rel="stylesheet"]')).map(
        (l) => (l as HTMLLinkElement).getAttribute('href')
      )
    };
  });
}

test.describe('13) Arayüz tutarlılığı (bayat önbellek / SW koruması)', () => {
  test('geliştirmede hiç service worker ve önbellek kalmaz', async ({ page }) => {
    await skipSplash(page);
    await page.goto('/');
    await expect(page.getByTestId('login-screen')).toBeVisible();
    // Geç kayıt olmaması için bekle: eski kodda kayıt 'load' olayında yapılıyordu.
    await page.waitForTimeout(1500);

    // main.tsx geliştirme temizliği: kayıt yok, önbellek yok
    const kayitli = await page.evaluate(async () =>
      (await navigator.serviceWorker.getRegistrations()).length
    );
    expect(kayitli, 'geliştirmede service worker kaydı kalmamalı').toBe(0);

    const onbellekler = await page.evaluate(async () => (await caches.keys()).length);
    expect(onbellekler, 'geliştirmede önbellek kalmamalı').toBe(0);

    // index.html içinde koşulsuz SW kaydı BULUNMAMALI (tek kaynak: main.tsx)
    const saticiKayit = await page.locator('script:has-text("serviceWorker.register")').count();
    expect(saticiKayit, 'index.html içinde SW kaydı olmamalı').toBe(0);
  });

  test('üst üste yenilemelerde giriş ekranı AYNI kalır (eski/yabancı sürüm sunulmaz)', async ({ page }) => {
    await skipSplash(page);
    await page.goto('/');
    await expect(page.getByTestId('login-screen')).toBeVisible();

    const ilk = await gorunumParmakIzi(page);

    // Güncel tasarımın kimliği: başlık büyük harfe ÇEVRİLMEZ, ana düğme bordodur.
    expect(ilk.baslikMetni).toBe('Servis Girişi');
    expect(ilk.baslikDonusum).toBe('none');
    expect(ilk.butonArka.replace(/\s/g, '')).toBe('rgb(185,28,28)');
    expect(ilk.butonYazi).toBe('Giriş Yap');

    for (let i = 0; i < 2; i++) {
      await page.reload();
      await expect(page.getByTestId('login-screen')).toBeVisible();
      const tekrar = await gorunumParmakIzi(page);
      expect(tekrar, `${i + 2}. yüklemede arayüz değişti`).toEqual(ilk);
    }
  });

  test('sw.js: kökendeki yabancı önbelleklere bakmaz, kabuğu ağdan alır', async ({ request }) => {
    const res = await request.get('/sw.js');
    expect(res.ok()).toBeTruthy();
    const kod = await res.text();
    // Yorumları ayıkla: kural KODDA aranır (açıklama metni kuralı bozmasın)
    const kodSade = kod.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

    // Sürüm artırılmış (eski önbellekler activate'te silinir)
    expect(kod).toContain('oto-servis-v3');
    // Kökendeki TÜM önbelleklere bakan global arama YASAK (hata buna yol açmıştı)
    expect(kodSade).not.toMatch(/caches\.match\(/);
    // Yalnızca kendi adlandırılmış önbelleğimiz kullanılır
    expect(kodSade).toContain('matchOwn');
    // HTML/gezinme: ağ öncelikli
    expect(kodSade).toContain("request.mode === 'navigate'");
    // Eski ve yabancı önbellekleri sil
    expect(kodSade).toContain('caches.delete');
  });
});
