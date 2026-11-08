import { test, expect } from '@playwright/test';
import { OWNER, login } from './helpers.js';

/**
 * KATEGORİ — OTOMATİK GÜNCELLEME (Auto-Update)
 *
 * Masaüstü (Electron) köprüsü tarayıcıda tanımlı olmadığı için,
 * sayfaya init script ile bir taklit (mock) `window.otoDesktop` köprüsü
 * enjekte edilir. E2E testleri gerçek GitHub'e bağlanmaz; sadece
 * arayüz davranışını ve köprü çağrılarını doğrular.
 */

function mockDesktopBridge(page: any) {
  let installCalled = false;
  let checkCalled = false;
  let statusCb: ((status: any) => void) | null = null;

  return page.addInitScript(() => {
    (window as any).__updateInstallCalled = false;
    (window as any).__updateCheckCalled = false;
    (window as any).__updateStatusCb = null;

    (window as any).__emitUpdateStatus = (status: any) => {
      try {
        const cb = (window as any).__updateStatusCb;
        if (cb) cb(status);
        window.dispatchEvent(new CustomEvent('oto:update-status', { detail: status }));
      } catch {}
    };

    (window as any).otoDesktop = {
      isElectron: true,
      apiBase: 'http://127.0.0.1:3101',
      appVersion: '1.0.0',
      onShutdown: (cb: () => void) => () => {},
      onUpdateStatus: (cb: (status: any) => void) => {
        (window as any).__updateStatusCb = cb;
        return () => {
          (window as any).__updateStatusCb = null;
        };
      },
      getUpdateStatus: async () => null,
      checkForUpdates: async () => {
        (window as any).__updateCheckCalled = true;
        return { ok: true };
      },
      installUpdate: async () => {
        (window as any).__updateInstallCalled = true;
        return { ok: true };
      },
      downloadUpdate: async () => ({ ok: true }),
      openReleasePage: async () => ({ ok: true })
    };
  });
}

test.describe('otomatik güncelleme', () => {
  test('tarayıcı (Electron olmayan) ortamda güncelleme öğeleri görünmez', async ({ page }) => {
    await login(page, OWNER);

    // Özel köprü yok; sidebar'da "Güncellemeler" düğmesi olmamalı.
    await expect(page.getByTestId('check-updates')).toBeHidden();
  });

  test('indirilen güncelleme kartı gösterilir ve "Şimdi Güncelle" köprüyü çağırır', async ({ page }) => {
    mockDesktopBridge(page);

    await login(page, OWNER);

    const isElectron = await page.evaluate(() => (window as any).otoDesktop?.isElectron === true);
    expect(isElectron).toBe(true);

    // "Güncellemeler" düğmesi görünür.
    const updateBtn = page.getByTestId('check-updates');
    await expect(updateBtn).toBeVisible();
    await updateBtn.click();

    // Güncelleme indirildi durumunu simüle et.
    await page.evaluate(() => {
      (window as any).__emitUpdateStatus({
        state: 'downloaded',
        version: '1.0.99',
        currentVersion: '1.0.0'
      });
    });

    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible();
    await expect(page.getByText('Yeni sürüm hazır', { exact: false })).toBeVisible();
    await expect(page.getByText('v1.0.99', { exact: false })).toBeVisible();

    // "Şimdi Güncelle" tıklandığında installUpdate çağrılmalı.
    const installBtn = page.getByRole('button', { name: /Şimdi Güncelle/ });
    await expect(installBtn).toBeVisible();
    await installBtn.click();

    await expect(page.evaluate(() => (window as any).__updateInstallCalled)).resolves.toBe(true);
  });

  test('"Daha Sonra" demenin ardından güncelleme kartı gizlenir (autoInstallOnAppQuit devam eder)', async ({ page }) => {
    mockDesktopBridge(page);

    await login(page, OWNER);

    await page.evaluate(() => {
      (window as any).__emitUpdateStatus({
        state: 'downloaded',
        version: '1.0.99',
        currentVersion: '1.0.0'
      });
    });

    const banner = page.getByTestId('update-banner');
    await expect(banner).toBeVisible();

    const laterBtn = page.getByRole('button', { name: /Daha Sonra/ });
    await expect(laterBtn).toBeVisible();
    await laterBtn.click();

    await expect(banner).toBeHidden();
    await expect(page.evaluate(() => (window as any).__updateInstallCalled)).resolves.toBe(false);
  });
});
