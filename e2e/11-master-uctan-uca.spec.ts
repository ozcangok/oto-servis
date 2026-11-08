import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  OWNER,
  STAFF,
  login,
  apiLogin,
  apiJson,
  createCustomer,
  createVehicle,
  createWorkOrder,
  createExpense,
  createPart,
  getPart,
  uniqPlate,
  uniqPhone,
  dateOnly,
  todayOnly,
  isoAtNoon,
  getWhatsAppMessages,
  messagesForPlate
} from './helpers.js';

/**
 * KATEGORİ 11 — UÇTAN UCA "MASTER" ZİNCİR
 *
 * Tek bir zincirde, sistemin kurduğu mimarinin tamamı sınanır:
 *   1) Akış          : yeni araç + iş emri (arayüzden) → durum aşamaları
 *                      (Kabul edildi → Onarımda → Teslime hazır → Teslim edildi)
 *   2) Finans        : işçilik geliri / KDV / kasa tahsilatı / net kâr
 *                      kuruşu kuruşuna doğru mu?
 *   3) RBAC          : personel gizli giderleri (kira/maaş) ne görür ne ekler
 *   4) Kaskad        : plaka silinince bağlı tahsilat kasadan düşer, parça
 *                      stoğa iade edilir, kâr geri alınır
 *   5) Entegrasyon   : durum her değiştiğinde doğru müşteri/plaka/şablonla
 *                      WhatsApp taslağı düşer; yeni şablonla PDF hatasız üretilir
 */

// Kurumsal WhatsApp şablonları (paketle birebir; bkz. @oto-servis/shared/whatsapp.ts)
const TEMPLATES: Record<string, string> = {
  kabul:
    'Sayın {musteri}, {plaka} plakalı aracınız servisimize kabul edilmiştir. Aracınızın ilk kontrolleri yapılarak onarım/bakım süreci planlanacaktır. Bizi tercih ettiğiniz için teşekkür ederiz. - Çınar Otomotiv',
  onarimda:
    'Sayın {musteri}, {plaka} plakalı aracınızın bakım ve onarım işlemleri uzman teknisyenlerimiz tarafından başlatılmıştır. Süreç tamamlandığında tarafınıza bilgi verilecektir. - Çınar Otomotiv',
  teslime_hazir:
    'Sayın {musteri}, {plaka} plakalı aracınızın servis işlemleri ve son kalite kontrolleri başarıyla tamamlanmıştır. Aracınız teslime hazırdır, dilediğiniz zaman servisimizden teslim alabilirsiniz. - Çınar Otomotiv',
  teslim_edildi:
    'Sayın {musteri}, {plaka} plakalı aracınızın teslimatı gerçekleştirilmiştir. Çınar Otomotiv olarak size hizmet vermekten memnuniyet duyduk. Güvenli ve keyifli sürüşler dileriz.'
};

function expectedMessage(durum: string, musteri: string, plaka: string): string {
  return TEMPLATES[durum].replace(/\{musteri\}/g, musteri).replace(/\{plaka\}/g, plaka);
}

/** Zararsız/kaynak yükleme hatalarını ayıklar. */
function isBenignConsoleError(text: string): boolean {
  return (
    /favicon/i.test(text) ||
    /manifest/i.test(text) ||
    /Failed to load resource/i.test(text) ||
    /net::ERR_/i.test(text) ||
    /Download the React DevTools/i.test(text)
  );
}

test.describe('11) Uçtan uca master zincir', () => {
  // -------------------------------------------------------------------- 1
  test('akış + entegrasyon: arayüzden yeni araç/iş emri → tüm durumlar → WhatsApp taslakları → PDF', async ({
    page,
    request
  }) => {
    const token = await apiLogin(request, OWNER);
    // Kurumsal başlık (PDF) için dükkan adını sabitle
    const setRes = await apiJson(request, 'PUT', '/api/settings', token, {
      shop_name: 'Çınar Otomotiv - Özel Servis & Bakım Hizmetleri'
    });
    expect(setRes.status, JSON.stringify(setRes.body)).toBe(200);

    const plate = uniqPlate();
    const custName = `E2E Master Müşteri ${Date.now().toString().slice(-5)}`;

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !isBenignConsoleError(m.text())) errors.push('console: ' + m.text());
    });

    await login(page, OWNER);
    // Giriş yeni Panel'e düşer; bu test Araç sorgu panosundaki akışı doğrular.
    await page.getByRole('tab', { name: 'Araç sorgu' }).click();

    // PDF kütüphaneleri (html2canvas + jsPDF) hazır olana kadar bekle
    await page.waitForFunction(() => (window as any).html2canvas && (window as any).jspdf, null, {
      timeout: 30_000
    });
    // PDF üretimini gözlemle
    await page.evaluate(() => {
      const w = window as any;
      w.__pdfCaptured = [];
      const orig = w.html2canvas;
      w.html2canvas = (el: HTMLElement, opts: any) => {
        try {
          w.__pdfCaptured.push(el.outerHTML);
        } catch {}
        return orig(el, opts);
      };
    });

    // 1) Arayüzden yeni iş emri: yeni plaka + müşteri + işçilik satırı
    await page.getByRole('button', { name: 'Yeni iş emri' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.locator('#of-plate').fill(plate);
    // Yeni araç kutusu (müşteri alanı) gelene kadar bekle
    await expect(page.locator('#ofv-customer')).toBeVisible({ timeout: 15_000 });
    await page.locator('#ofv-customer').fill(custName);
    await page.locator('#ofv-phone').fill(uniqPhone());
    await page.locator('#of-complaint').fill('E2E master şikayet: periyodik bakım');

    // Yeni işçilik satırı ekle ve onu doldur (varsayılan parça satırı boş kalır ve kaydedilmez)
    await page.getByRole('button', { name: '+ İşçilik' }).click();
    const line = page.locator('#of-lines .lrow').last();
    await line.locator('.lname input').fill('E2E master işçilik');
    await line.locator('.lf input[type="number"]').first().fill('1'); // Adet
    await line.locator('.lf input[type="number"]').nth(1).fill('1000'); // Birim fiyat (TL)

    await page.getByRole('button', { name: 'Kaydet', exact: true }).click();
    await expect(dialog).toBeHidden({ timeout: 20_000 });

    // Sunucu tarafı: araç + iş emri gerçekten oluştu
    const bp = await apiJson(
      request,
      'GET',
      `/api/vehicles/by-plate/${encodeURIComponent(plate)}`,
      token
    );
    expect(bp.status, JSON.stringify(bp.body)).toBe(200);
    const plaka: string = bp.body.vehicle.plaka_gorunen;
    const orderId: number = bp.body.workOrders[0].id;

    // 2) Araç sorgu → iş emri kartı ve ilk aşama
    const q = page.locator('#q');
    await q.click();
    await q.fill(plaka);
    await q.press('Enter');
    await expect(page.locator('.order')).toHaveCount(1, { timeout: 15_000 });
    const stageSel = page.locator('.order .stage-sel').first();
    await expect(stageSel).toHaveValue('accepted'); // "Kabul edildi"

    // WhatsApp: iş emri kabul aşamasında oluşturuldu → 1 kayıt
    let msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(1);
    expect(msgs[0].durum).toBe('kabul');
    expect(msgs[0].mesaj).toBe(expectedMessage('kabul', custName, plaka));

    // 3) Durum aşamaları tek tek (arayüzdeki select ile)
    await stageSel.selectOption('repairing');
    await expect(stageSel).toHaveValue('repairing', { timeout: 15_000 });
    msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(2);
    expect(msgs[0].durum).toBe('onarimda');
    expect(msgs[0].mesaj).toBe(expectedMessage('onarimda', custName, plaka));

    await stageSel.selectOption('ready');
    await expect(stageSel).toHaveValue('ready', { timeout: 15_000 });
    msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(3);
    expect(msgs[0].durum).toBe('teslime_hazir');
    expect(msgs[0].mesaj).toBe(expectedMessage('teslime_hazir', custName, plaka));

    await stageSel.selectOption('delivered');
    await expect(stageSel).toHaveValue('delivered', { timeout: 15_000 });
    msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(4);
    expect(msgs[0].durum).toBe('teslim_edildi');
    expect(msgs[0].mesaj).toBe(expectedMessage('teslim_edildi', custName, plaka));

    // 4) Yeni şablonla PDF dökümü hatasız üretilir
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.getByRole('button', { name: 'PDF döküm', exact: true }).first().click()
    ]);
    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const dlPath = await download.path();
    expect(dlPath, 'indirilen PDF yolu alınamadı').toBeTruthy();
    const buf = fs.readFileSync(dlPath!);
    expect(buf.subarray(0, 5).toString(), 'geçerli PDF imzası (%PDF-)').toBe('%PDF-');
    expect(buf.length, 'PDF boş olmamalı').toBeGreaterThan(1000);

    const captured = (await page.evaluate(() => (window as any).__pdfCaptured.slice())) as string[];
    expect(captured.length, 'PDF üretim fonksiyonu tetiklenmedi').toBeGreaterThan(0);
    const html = captured[0];
    expect(html).toContain('İŞ EMRİ / TEKLİF FORMU');
    expect(html).toContain('Çınar Otomotiv');
    expect(html).toContain(custName);
    expect(html).toContain(plaka);
    expect(html).toContain('1.000,00 ₺'); // işçilik (KDV hariç)
    expect(html).toContain('200,00 ₺'); // KDV %20
    expect(html).toContain('1.200,00 ₺'); // KDV dahil toplam

    // Uygulama çökmedi
    await expect(page.locator('.topbar')).toBeVisible();
    expect(errors, errors.join('\n')).toEqual([]);

    // İş emri kimliği başka bir doğrulamada kullanılmadı ama oluştuğunu garanti et
    expect(orderId).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------- 2
  test('finans: işçilik geliri, KDV ve kasa tahsilatı kuruşu kuruşuna; net kâr gideri düşer', async ({
    request
  }) => {
    const token = await apiLogin(request, OWNER);
    const now = new Date();
    const today = dateOnly(now);
    const payISO = isoAtNoon(now.getFullYear(), now.getMonth(), now.getDate());

    const base = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    const baseCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;

    const cust = await createCustomer(request, token, {
      ad_soyad: `E2E Finans ${Date.now().toString().slice(-5)}`
    });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });

    // 1.000,00 TL işçilik (KDV hariç) → %20 KDV → 1.200,00 TL KDV dahil
    const wo = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka: veh.plaka_gorunen,
      giris_tarihi: payISO,
      kalemler: [
        { tur: 'iscilik', ad: 'E2E finans işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 100000 }
      ]
    });
    expect(wo.status, JSON.stringify(wo.body)).toBe(200);

    // 300,00 TL gider → net kârdan düşmeli
    const exp = await createExpense(request, token, {
      tarih: today,
      kategori: 'Sarf Malzeme',
      aciklama: 'E2E finans gideri',
      tutar_kurus: 30000
    });
    expect(exp.status, JSON.stringify(exp.body)).toBe(200);

    // Kâr-zarar: servis geliri +100.000 kuruş, net kâr +70.000 kuruş (gelir - gider)
    const after = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    expect(after.laborIncomeKurus - base.laborIncomeKurus).toBe(100000);
    expect(after.netProfitKurus - base.netProfitKurus).toBe(70000);

    // KDV dahil 1.200,00 TL tahsilat
    const pay = await apiJson(request, 'POST', '/api/payments', token, {
      is_emri_id: wo.body.workOrder.id,
      tutar_kurus: 120000,
      yontem: 'nakit',
      tarih: payISO
    });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);

    const afterCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;
    expect(afterCash.byMethod.nakit - baseCash.byMethod.nakit).toBe(120000);
    expect(afterCash.totalCollectedKurus - baseCash.totalCollectedKurus).toBe(120000);

    // KDV matematiği ve bakiye kuruşu kuruşuna
    const bp = await apiJson(
      request,
      'GET',
      `/api/vehicles/by-plate/${encodeURIComponent(veh.plaka_gorunen)}`,
      token
    );
    const o = (bp.body.workOrders as any[]).find((x) => x.id === wo.body.workOrder.id);
    expect(o).toBeTruthy();
    expect(o.net_kurus).toBe(100000); // KDV hariç
    expect(o.kdv_tutar_kurus).toBe(20000); // KDV %20
    expect(o.brut_kurus).toBe(120000); // KDV dahil
    expect(o.odenen_kurus).toBe(120000);
    expect(o.kalan_kurus).toBe(0);
  });

  // -------------------------------------------------------------------- 3
  test('RBAC: personel (staff) kira/maaş gibi gizli giderleri ne görür ne ekler', async ({
    page,
    request
  }) => {
    const owner = await apiLogin(request, OWNER);
    const t = todayOnly();
    const tag = Date.now().toString().slice(-5);
    const kira = `E2E KIRA ${tag}`;
    const maas = `E2E MAAS ${tag}`;
    const sarf = `E2E SARF ${tag}`;

    // Owner gizli iki + gündelik bir gider ekler
    expect(
      (await createExpense(request, owner, { tarih: t, kategori: 'Fatura & Kira', aciklama: kira, tutar_kurus: 50000 }))
        .status
    ).toBe(200);
    expect(
      (await createExpense(request, owner, { tarih: t, kategori: 'Personel', aciklama: maas, tutar_kurus: 40000 }))
        .status
    ).toBe(200);
    expect(
      (await createExpense(request, owner, { tarih: t, kategori: 'Sarf Malzeme', aciklama: sarf, tutar_kurus: 10000 }))
        .status
    ).toBe(200);

    // Sunucu: owner hepsini görür ve kâr hesaplanır (bu istekler henüz owner çereziyle)
    const ownerRes = await apiJson(request, 'GET', '/api/expenses?period=all', owner);
    const ownerItems = ownerRes.body.items as any[];
    expect(ownerItems.some((e) => e.aciklama === kira)).toBe(true);
    expect(ownerItems.some((e) => e.aciklama === maas)).toBe(true);
    expect(typeof ownerRes.body.summary.netProfitKurus).toBe('number');

    // Şimdi personele geç (sunucu çerezi Bearer'dan önce okur; sonraki istekler personel olur)
    const staff = await apiLogin(request, STAFF);

    // Sunucu: personel listesinde gizli kategoriler YOK; gelir/kâr HESAPLANMAZ
    const staffRes = await apiJson(request, 'GET', '/api/expenses?period=all', staff);
    expect(staffRes.status, JSON.stringify(staffRes.body)).toBe(200);
    const staffItems = staffRes.body.items as any[];
    expect(staffItems.some((e) => e.aciklama === kira), 'kira personel listesinde olmamalı').toBe(false);
    expect(staffItems.some((e) => e.aciklama === maas), 'maaş personel listesinde olmamalı').toBe(false);
    expect(staffItems.some((e) => e.aciklama === sarf), 'gündelik gider personel listesinde olmalı').toBe(true);
    expect(staffRes.body.summary.netProfitKurus).toBeUndefined();
    expect(staffRes.body.summary.laborIncomeKurus).toBeUndefined();

    // Sunucu: personel gizli kategori EKLEYEMEZ (403)
    const forbidden = await createExpense(request, staff, {
      tarih: t,
      kategori: 'Fatura & Kira',
      aciklama: 'E2E staff kira denemesi',
      tutar_kurus: 1000
    });
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(403);

    // Arayüz: personel girişinde Giderler sekmesi ve finansal özet DOM'da YOK
    await login(page, STAFF);
    await expect(page.getByRole('tab', { name: 'Giderler' })).toHaveCount(0);
    await page.goto('/#/giderler');
    await expect(page).toHaveURL(/#\/sorgu/);
    await expect(page.locator('.tbl')).toHaveCount(0);
    await expect(page.getByText(kira)).toHaveCount(0);
    await expect(page.getByText(maas)).toHaveCount(0);
    await expect(page.getByText('Net Kâr')).toHaveCount(0);
    await expect(page.getByText('Toplam Servis Geliri')).toHaveCount(0);
    await expect(page.locator('#gx-kategori')).toHaveCount(0);
  });

  // -------------------------------------------------------------------- 4
  test('kaskad: plaka silinince bağlı tahsilat kasadan düşer, parça stoğa iade edilir, kâr geri alınır', async ({
    page,
    request
  }) => {
    const token = await apiLogin(request, OWNER);
    const now = new Date();
    const today = dateOnly(now);
    const payISO = isoAtNoon(now.getFullYear(), now.getMonth(), now.getDate());

    const baseCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;
    const baseExp = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;

    const { part } = await createPart(request, token, { stok: 5 }); // alış 1000, satış 5000
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate });

    const wo = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka: veh.plaka_gorunen,
      giris_tarihi: payISO,
      kalemler: [
        { tur: 'parca', parca_id: part.id, ad: part.ad, adet: 2, birim: 'Adet', birim_fiyat_kurus: 5000 },
        { tur: 'iscilik', ad: 'E2E kaskad işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 100000 }
      ]
    });
    expect(wo.status, JSON.stringify(wo.body)).toBe(200);

    // Parça stoğu 5 → 3 düşmeli
    expect((await getPart(request, token, part.id)).stok_miktari).toBe(3);

    const pay = await apiJson(request, 'POST', '/api/payments', token, {
      is_emri_id: wo.body.workOrder.id,
      tutar_kurus: 50000,
      yontem: 'nakit',
      tarih: payISO
    });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);

    const midCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;
    const midExp = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    expect(midCash.byMethod.nakit - baseCash.byMethod.nakit).toBe(50000);
    expect(midExp.laborIncomeKurus - baseExp.laborIncomeKurus).toBe(100000);
    expect(midExp.netProfitKurus - baseExp.netProfitKurus).toBe(100000);

    // Arayüzden plakayı sil: Araçlar → plaka ara → Sil (iki aşamalı onay)
    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Araçlar' }).click();
    await page.locator('#vq').fill(veh.plaka_gorunen);
    const row = page.locator('.li', { hasText: veh.plaka_gorunen }).first();
    await expect(row).toBeVisible({ timeout: 15_000 });

    await row.getByRole('button', { name: 'Sil' }).click();
    const armed = row.getByRole('button', { name: 'Emin misin? Tekrar tıkla' });
    await expect(armed).toBeVisible();
    await armed.click();
    await expect(page.getByText('Araç silindi')).toBeVisible({ timeout: 15_000 });

    // Finansal kayıtlar temizlendi: tahsilat kasadan düşer, gelir ve net kâr geri alınır
    const afterCash = (await apiJson(request, 'GET', `/api/cash-desk/summary?date=${today}`, token)).body.summary;
    const afterExp = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    expect(afterCash.byMethod.nakit, 'tahsilat kasadan düşmedi').toBe(baseCash.byMethod.nakit);
    expect(afterCash.totalCollectedKurus).toBe(baseCash.totalCollectedKurus);
    expect(afterExp.laborIncomeKurus, 'işçilik geliri geri alınmadı').toBe(baseExp.laborIncomeKurus);
    expect(afterExp.netProfitKurus, 'net kâr geri alınmadı').toBe(baseExp.netProfitKurus);

    // Parça stoğu iade edildi: 3 → 5
    expect((await getPart(request, token, part.id)).stok_miktari).toBe(5);

    // Silinen araç artık sorgulanamaz
    const bp = await apiJson(
      request,
      'GET',
      `/api/vehicles/by-plate/${encodeURIComponent(veh.plaka_gorunen)}`,
      token
    );
    expect(bp.status).toBe(404);

    // Arayüzde de "kayıtlı değil" görünür
    await page.getByRole('tab', { name: 'Araç sorgu' }).click();
    const q = page.locator('#q');
    await q.click();
    await q.fill(veh.plaka_gorunen);
    await q.press('Enter');
    await expect(page.getByText('kayıtlı değil')).toBeVisible({ timeout: 15_000 });
  });

  // -------------------------------------------------------------------- 5
  test('3 sütunlu pano: pencere kaymaz; içerik .wrap içinde kayar; servis listesi ve takvim erişilebilir', async ({
    page,
    request
  }) => {
    const token = await apiLogin(request, OWNER);

    // Servis listesini doldur (pano uzun listeyi kart içinde gösterir)
    for (let i = 0; i < 9; i++) {
      const plate = uniqPlate();
      const veh = await createVehicle(request, token, { plaka: plate });
      const wo = await createWorkOrder(request, token, {
        arac_id: veh.id,
        plaka: veh.plaka_gorunen,
        durum: 'onarimda',
        kalemler: [
          { tur: 'iscilik', ad: 'E2E kokpit işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 1000 }
        ]
      });
      expect(wo.status, JSON.stringify(wo.body)).toBe(200);
    }

    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Araç sorgu' }).click();
    await expect(page.locator('.dashboard-layout')).toBeVisible();
    await expect(page.locator('.service-table-card')).toBeVisible();
    await expect(page.locator('.dashboard-calendar')).toBeVisible();
    await expect(page.locator('.svc')).toBeVisible();

    // 1) Pencere (sayfa) hiç kaymaz: doküman yüksekliği pencere yüksekliğini aşmaz
    const geo = await page.evaluate(() => {
      const wrap = document.querySelector('.wrap') as HTMLElement;
      return {
        winH: window.innerHeight,
        docH: document.documentElement.scrollHeight,
        bodyH: document.body.scrollHeight,
        wrapOverflowY: getComputedStyle(wrap).overflowY,
        wrapScrollH: wrap.scrollHeight,
        wrapClientH: wrap.clientHeight
      };
    });
    expect(geo.docH, 'sayfa yüksekliği pencereyi aşmamalı').toBeLessThanOrEqual(geo.winH + 2);
    expect(geo.bodyH).toBeLessThanOrEqual(geo.winH + 2);
    expect(geo.wrapOverflowY, 'kaydırma .wrap içinde olmalı').toBe('auto');
    expect(geo.wrapScrollH, 'pano içeriği .wrap içinde taşmalı').toBeGreaterThan(geo.wrapClientH);

    // 2) Pencereyi kaydırmaya çalışmak işe yaramaz
    const scrollTry = await page.evaluate(() => {
      window.scrollTo(0, 500);
      return window.scrollY;
    });
    expect(scrollTry).toBe(0);

    // 3) İçerik .wrap içinde kayar
    const scrolledTop = await page.evaluate(() => {
      const wrap = document.querySelector('.wrap') as HTMLElement;
      wrap.scrollTop = 400;
      return wrap.scrollTop;
    });
    expect(scrolledTop, 'içerik .wrap içinde kayabilmeli').toBeGreaterThan(0);

    // 4) Servis tablosu dar ekranda kartın içinde yatay kayabilir
    const svcScroll = await page.evaluate(() => {
      const el = document.querySelector('.service-table-scroll') as HTMLElement;
      return { overflowX: getComputedStyle(el).overflowX };
    });
    expect(svcScroll.overflowX).toBe('auto');

    // 5) Takvimin son gün hücresi DOM'da ve kaydırılarak erişilebilir
    const dayReachable = await page.evaluate(() => {
      const days = document.querySelectorAll('.cal-grid .day');
      const last = days[days.length - 1] as HTMLElement;
      last.scrollIntoView({ block: 'center' });
      const r = last.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= window.innerHeight + 2;
    });
    expect(dayReachable, 'takvimin son gün satırı erişilebilir olmalı').toBe(true);

    // 6) Diğer ekranlarda da pencere kaymaz; kaydırma içerik sütununda olur
    await page.getByRole('tab', { name: 'Araçlar' }).click();
    const other = await page.evaluate(() => ({
      winScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
      wrapOverflowY: getComputedStyle(document.querySelector('.wrap') as HTMLElement).overflowY
    }));
    expect(other.winScrollable, 'Araçlar ekranında da pencere kaymamalı').toBe(false);
    expect(other.wrapOverflowY).toBe('auto');
  });
});
