import { test, expect, type Page } from '@playwright/test';
import { OWNER, login } from './helpers.js';

/**
 * KATEGORİ 12 — PREMIUM MASAÜSTÜ KATMANI
 *
 * 1) Holografik, saat/gün duyarlı ve 7 saniye DOKUNULMAZ açılış (splash) ekranı
 * 2) 3 dakikalık hareketsizlik (idle) güvenlik kilidi → oturum sıfırlama
 * 3) Zorunlu yedekleme + güvenli kapanış (veda) ekranı ve 10 sn ilerleme çubuğu
 *
 * Splash ekranını görmek isteyen testler `login()` yardımcısını KULLANMAZ;
 * doğrudan `page.goto('/')` yapar ve gerçek zaman davranışını doğrular.
 */

/**
 * Sayfa içindeki sistem saatini sabitler (yerel saat).
 * Böylece "06:00–11:59 / 12:00–16:59 / 17:00–05:59" ve hafta sonu kuralları
 * deterministik olarak doğrulanabilir.
 */
async function freezeClock(page: Page, y: number, m: number, d: number, h: number, min = 0): Promise<void> {
  await page.addInitScript(
    (fixed: { y: number; m: number; d: number; h: number; min: number }) => {
      const RealDate = Date;
      class MockDate extends RealDate {
        constructor(...args: any[]) {
          if (args.length === 0) {
            super(fixed.y, fixed.m, fixed.d, fixed.h, fixed.min, 0, 0);
          } else {
            // @ts-ignore — gerçek Date kurucu imzalarını aynen aktar
            super(...args);
          }
        }
        static now(): number {
          return new RealDate(fixed.y, fixed.m, fixed.d, fixed.h, fixed.min, 0, 0).getTime();
        }
      }
      (window as any).Date = MockDate;
    },
    { y, m, d, h, min }
  );
}

const hintOpacity = (page: Page) =>
  page.getByTestId('splash-hint').evaluate((el) => getComputedStyle(el).opacity);

test.describe('12) Premium masaüstü katmanı (splash · kilit · güvenli kapanış)', () => {
  test('açılış: saat/gün duyarlı holografik splash zorunlu kilit süresi boyunca geçilemez', async ({ page }) => {
    // Zamanlama kırılganlığını önlemek için zorunlu kilit süresi kısaltılır;
    // ÜRETİM değerinin 7000 ms olduğu ayrı testte (`data-lock-ms`) doğrulanır.
    await page.addInitScript(() => {
      (window as any).__OTO_SPLASH_LOCK_MS = 4500;
    });
    await freezeClock(page, 2026, 9, 17, 9, 30); // 17 Ekim 2026 Cumartesi 09:30
    await page.goto('/');

    const splash = page.getByTestId('splash');
    await expect(splash).toBeVisible();
    await expect(splash).toHaveAttribute('data-phase', 'locked');

    // Kilit süresi dolmadan tıklama veya fare hareketi ekranı GEÇEMEZ
    await page.mouse.click(400, 300);
    await page.mouse.move(500, 320);
    await expect(splash).toHaveAttribute('data-phase', 'locked');
    await expect(page.getByTestId('login-screen')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await hintOpacity(page)).toBe('0');

    // Metin: günaydın + o günün adı + marka + hafta sonu dileği
    await expect(page.getByTestId('splash-text')).toHaveText(
      "Günaydın! Harika bir Cumartesi sabahından Çınar Otomotiv'e Hoş Geldiniz. İyi hafta sonları dileriz."
    );

    // Holografik efekt: gradyan yazının İÇİNE hapsedilmiş ve 5 sn'de başa sarmalı
    const holo = await page.getByTestId('splash-text').evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        clip: s.webkitBackgroundClip || (s as any).backgroundClip,
        fill: s.webkitTextFillColor,
        anim: s.animationName,
        dur: s.animationDuration
      };
    });
    expect(holo.clip).toBe('text');
    expect(holo.fill).toBe('rgba(0, 0, 0, 0)');
    expect(holo.anim).toContain('holo-shift');
    expect(holo.dur).toBe('5s');

    // Kilit süresi dolunca "Devam etmek için..." yazısı zarifçe belirir
    await expect(splash).toHaveAttribute('data-phase', 'ready', { timeout: 10_000 });
    await expect.poll(() => hintOpacity(page), { timeout: 5_000 }).toBe('1');
    await expect(page.getByTestId('splash-hint')).toContainText('Devam etmek için tıklayın veya fareyi hareket ettirin');

    // Fare hareketi → yumuşak fade-out → doğrudan giriş ekranı
    await page.mouse.move(520, 340);
    await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('splash')).toHaveCount(0);
  });

  test('açılış: zorunlu kilit süresi üretimde 7 saniyedir; 17:00 sonrası akşam metni yazılır', async ({ page }) => {
    await freezeClock(page, 2026, 9, 12, 20, 15); // 12 Ekim 2026 Pazartesi 20:15
    await page.goto('/');

    // ÜRETİM değeri: ilk 7 saniye dokunulmaz
    await expect(page.getByTestId('splash')).toHaveAttribute('data-lock-ms', '7000');

    const text = page.getByTestId('splash-text');
    await expect(text).toHaveText("İyi Akşamlar! Çınar Otomotiv'e Hoş Geldiniz.");
    await expect(text).not.toContainText('hafta sonu');
  });

  test('açılış: 12:00-16:59 dilimi iyi günler der', async ({ page }) => {
    await freezeClock(page, 2026, 9, 14, 13, 5); // 14 Ekim 2026 Çarşamba 13:05
    await page.goto('/');
    await expect(page.getByTestId('splash-text')).toHaveText("İyi Günler! Çınar Otomotiv'e Hoş Geldiniz.");
  });

  test('açılış ekranı aynı sekmede yalnızca bir kez gösterilir', async ({ page }) => {
    await page.goto('/');
    const splash = page.getByTestId('splash');
    await expect(splash).toBeVisible();

    await expect(splash).toHaveAttribute('data-phase', 'ready', { timeout: 15_000 });
    await page.mouse.move(500, 300);
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 10_000 });

    // Aynı sekmede yeniden yükleme → splash tekrar gelmez
    await page.reload();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByTestId('splash')).toHaveCount(0);
  });

  test('hareketsizlik kilidi: buzlu cam iner, ilk harekette oturum güvenle kapanır', async ({ page }) => {
    // Üretimde 180.000 ms; ölçüm için kısaltılır
    await page.addInitScript(() => {
      (window as any).__OTO_IDLE_MS = 700;
    });
    await login(page, OWNER);

    const lock = page.getByTestId('idle-lock');
    await expect(lock).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('idle-title')).toHaveText('İyi çalışmalar');
    await expect(page.getByTestId('idle-sub')).toHaveText('Oturumunuz güvenliğe alındı.');

    // Arka plandaki veriler okunmaz olmalı: yoğun buzlu cam katmanı
    const blur = await lock.evaluate((el) => getComputedStyle(el).backdropFilter || (getComputedStyle(el) as any).webkitBackdropFilter);
    expect(blur).toContain('blur');
    // Kabuk hâlâ DOM'da (kilit onun üzerinde)
    await expect(page.locator('.topbar')).toHaveCount(1);

    // Yerleşme süresi (600 ms) geçmeli: kilit yeni inmişken gelen hareket yok sayılır
    await page.waitForTimeout(750);

    // İlk fare hareketi → kilit kalkar, token/session sıfırlanır, giriş ekranı
    await page.mouse.move(420, 320);
    await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('idle-lock')).toHaveCount(0);
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.getByTestId('login-notice')).toContainText(
      'Güvenliğiniz için oturumunuz otomatik kapatıldı'
    );

    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });

  test('elle kilit: "Ekranı kilitle" düğmesi 3 dakika beklemeden katmanı indirir', async ({ page }) => {
    await login(page, OWNER);

    // Düğme sağ üstte, "Hatırlatıcılar" zil ikonunun HEMEN YANINDADIR
    const heroAksiyon = page.locator('.hero-actions');
    const lockBtn = page.getByTestId('lock-now');
    await expect(heroAksiyon.getByTestId('lock-now')).toBeVisible();
    await expect(heroAksiyon.getByRole('link', { name: 'Hatırlatıcılar' })).toBeVisible();
    await expect(lockBtn).toHaveAttribute('aria-label', 'Ekranı kilitle');
    await expect(lockBtn).toHaveAttribute('title', 'Ekranı kilitle');
    // Sağ üstte İKİ ikon: hatırlatıcı (zil) + ekranı kilitle
    await expect(heroAksiyon.locator('.icon-btn')).toHaveCount(2);
    // Sol menüde ARTIK yok (sağ üste taşındı)
    await expect(page.locator('.menu').getByTestId('lock-now')).toHaveCount(0);

    // Beklemeden kilit: oturum açıkken tıkla → buzlu cam ANINDA iner
    await lockBtn.click();

    const lock = page.getByTestId('idle-lock');
    await expect(lock).toBeVisible();
    await expect(page.getByTestId('idle-title')).toHaveText('İyi çalışmalar');
    await expect(page.getByTestId('idle-sub')).toHaveText('Oturumunuz güvenliğe alındı.');
    // Kilit indiği anda oturum hâlâ ayakta (henüz açılmadı)
    await expect(page.locator('.topbar')).toHaveCount(1);
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).not.toBeNull();

    // Yerleşme süresi: düğmeye basan tıklamanın sarsıntısı kilidi kaldırmaz
    await page.waitForTimeout(150);
    await expect(lock).toBeVisible();

    // Yerleşme süresi geçtikten sonraki ilk hareket → hareketsizlik kilidiyle
    // AYNI davranış: token/session sıfırlanır, giriş ekranı + güvenlik bildirimi
    await page.waitForTimeout(650);
    await page.mouse.move(460, 300);
    await expect(page.getByTestId('login-screen')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByTestId('idle-lock')).toHaveCount(0);
    await expect(page.locator('.topbar')).toHaveCount(0);
    await expect(page.getByTestId('login-notice')).toContainText(
      'Güvenliğiniz için oturumunuz otomatik kapatıldı'
    );
    expect(await page.evaluate(() => localStorage.getItem('auth_token'))).toBeNull();
  });

  test('güvenli kapanış: veda ekranı, holografik metin ve 10 sn ilerleme çubuğu', async ({ page }) => {
    await freezeClock(page, 2026, 9, 12, 20, 15); // Pazartesi 20:15 → iyi akşamlar
    await login(page, OWNER);

    // Electron ana süreci pencereyi kapatmadan önce bu olayı yayınlar
    await page.evaluate(() => window.dispatchEvent(new Event('oto:shutdown')));

    const shut = page.getByTestId('shutdown');
    await expect(shut).toBeVisible();
    await expect(page.getByTestId('shutdown-text')).toHaveText(
      'Çınar Otomotiv iyi akşamlar diler. Verileriniz güvenle yedekleniyor...'
    );
    await expect(shut).toHaveAttribute('data-duration', '10000');

    const bar = page.getByTestId('shutdown-progress');
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute('aria-valuemax', '100');
    expect(await bar.locator('i').evaluate((el) => getComputedStyle(el).animationDuration)).toBe('10s');

    // Veda ekranı zorunlu süre boyunca kaybolmaz; dönen gösterge çalışır
    await page.waitForTimeout(1200);
    await expect(shut).toBeVisible();
    expect(await page.locator('.shut-status .spin').evaluate((el) => getComputedStyle(el).animationName)).toContain('spin');
  });
});
