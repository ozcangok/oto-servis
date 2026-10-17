import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import {
  OWNER,
  login,
  apiLogin,
  apiJson,
  createCustomer,
  createVehicle,
  createWorkOrder,
  uniqPlate,
  uniqPhone
} from './helpers.js';

/**
 * KATEGORİ 7 — KURUMSAL SERVİS DÖKÜMÜ (PDF)
 *
 * 1) Şablon/tasarım: logolu başlık, yan yana bilgi kartları, açık gri başlıklı
 *    tablo, sağa hizalı tutarlar, çerçeveli özet paneli ve italik yasal altbilgi.
 * 2) Uçtan uca: gerçek bir iş emrinden "PDF döküm" tıklanınca uygulama çökmez,
 *    PDF üretimi hatasız tetiklenir; şablona GÜNCEL müşteri adı, plaka ve
 *    muhasebe tablosundaki KDV dahil toplam doğru çekilir.
 * 3) Görsel: logo alanı boş/kırık değildir; vektör amblem başarıyla render edilir.
 */

// --------------------------------------------------------------------- Test 1
// Tasarım & şablon doğruluğu (istemci modülünden doğrudan üretim)

const SAMPLE_ORDERS = [
  {
    giris_tarihi: '2026-10-14T09:00:00.000Z',
    km: 128500,
    durum: 'teslim_edildi',
    sikayet: 'Periyodik bakım talebi.',
    kdv_orani: 20,
    kdv_dahil_mi: false,
    net_tutar_kurus: 420000,
    kdv_tutar_kurus: 84000,
    brut_tutar_kurus: 504000,
    iskonto_tutar_kurus: 0,
    pesin_fiyat_kurus: 490000,
    odenen_tutar_kurus: 300000,
    kalan_tutar_kurus: 204000,
    kalemler: [
      { tur: 'iscilik', ad: 'Periyodik bakım işçiliği', adet: 1, birim: 'Adet', birim_fiyat_kurus: 90000 },
      { tur: 'parca', ad: 'Yağ filtresi', adet: 2, birim: 'Adet', birim_fiyat_kurus: 50000 }
    ],
    odemeler: []
  }
];

const SAMPLE_VEHICLE = {
  plaka: '34ABC123',
  marka: 'Volkswagen',
  model: 'Passat',
  yil: 2019,
  sasi_no: 'WVWZZZ3CZKE123456',
  motor_kodu: 'DETA-1.6',
  musteri: { ad_soyad: 'Ayşe Kaya', telefon: '0542 333 44 55' }
};

const SAMPLE_SETTINGS = {
  shop_name: 'Çınar Otomotiv',
  shop_phone: '0532 000 00 00',
  shop_address: 'Oto Sanayi Sitesi B Blok No: 12, İstanbul',
  shop_tax_office: 'Marmara V.D.',
  shop_tax_number: '1234567890'
};

/** İstemci modülünden döküm HTML'ini üretir (string evaluate → tarayıcı native import). */
async function buildStatementHTML(page: any, orders: any, vehicle: any, settings: any): Promise<string> {
  return page.evaluate(
    `(async () => {
      const mod = await import('/src/services/pdfExport.ts');
      return mod.statementHTML(${JSON.stringify(orders)}, ${JSON.stringify(vehicle)}, ${JSON.stringify(settings)});
    })()`
  );
}

test.describe('7) Kurumsal Servis Dökümü (PDF) — şablon & tasarım', () => {
  test('logolu başlık, bilgi kartları, gri tablo başlığı, sağa hizalı tutarlar ve yasal altbilgi içerir', async ({ page }) => {
    await login(page, OWNER);
    const html = await buildStatementHTML(page, SAMPLE_ORDERS, SAMPLE_VEHICLE, SAMPLE_SETTINGS);

    // Logolu kurumsal başlık + dükkan adı/adres/iletişim/vergi
    expect(html).toContain('stmt-logo');
    expect(html).toContain('SERVİS DÖKÜMÜ');
    expect(html).toContain('ÇINAR OTOMOTİV');
    expect(html).toContain('Oto Sanayi Sitesi B Blok No: 12');
    expect(html).toContain('Tel: 0532 000 00 00');
    expect(html).toContain('Vergi Dairesi: Marmara V.D.');
    expect(html).toContain('Belge Tarihi');
    expect(html).toContain('34 ABC 123');

    // Yan yana bilgi kartları
    expect(html).toContain('Müşteri Bilgileri');
    expect(html).toContain('Araç Bilgileri');

    // Profesyonel tablo başlıkları
    expect(html).toContain('>Tür<');
    expect(html).toContain('Parça / İşlem');
    expect(html).toContain('>Adet<');
    expect(html).toContain('>Tutar<');
    expect(html).toMatch(/class="r amt"/); // tutarlar sağa hizalı

    // Sağ altta çerçeveli özet paneli
    expect(html).toContain('totpanel');
    expect(html).toContain('Ara Toplam (KDV hariç)');
    expect(html).toContain('KDV %20');
    expect(html).toContain('KDV Dahil Toplam');
    expect(html).toContain('Peşin Fiyat');

    // Ortalanmış, italik resmi yasal uyarı (birebir)
    expect(html).toContain('Bu belge bilgi amaçlı servis dökümüdür, mali fatura yerine geçmez.');
    expect(html).toMatch(/\.ftr\{[^}]*font-style:italic/);
    expect(html).toMatch(/\.ftr\{[^}]*text-align:center/);

    // Logo alanı boş/kırık değil: vektör amblem gerçekten render ediliyor
    const logo = await page.evaluate((h) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:794px;background:#fff;';
      host.innerHTML = h;
      document.body.appendChild(host);
      const svg = host.querySelector('.stmt-logo') as SVGSVGElement | null;
      const r = svg ? svg.getBoundingClientRect() : null;
      const res = {
        found: !!svg,
        w: r ? r.width : 0,
        h: r ? r.height : 0,
        shapes: svg ? svg.querySelectorAll('path, rect, polygon, circle, line').length : 0
      };
      host.remove();
      return res;
    }, html);
    expect(logo.found, 'logo konteyneri bulunamadı').toBe(true);
    expect(logo.w, 'logo genişliği > 0 olmalı (boş/kırık değil)').toBeGreaterThan(10);
    expect(logo.h, 'logo yüksekliği > 0 olmalı (boş/kırık değil)').toBeGreaterThan(10);
    expect(logo.shapes, 'logo vektör şekilleri içermeli').toBeGreaterThan(0);
    expect(html).not.toMatch(/<img[^>]+src=""/); // kırık/boş görsel referansı yok
  });
});

// --------------------------------------------------------------------- Test 2
// Uçtan uca: gerçek iş emri → "PDF döküm" → gerçek PDF + veri doğruluğu

const PDF_MUSTERI = `E2E PDF Müşteri`;
const PDF_TELEFON = '0555 321 00 99';

/** Zararsız/ kaynak yükleme hatalarını ayıklar. */
function isBenignConsoleError(text: string): boolean {
  return (
    /favicon/i.test(text) ||
    /manifest/i.test(text) ||
    /Failed to load resource/i.test(text) ||
    /net::ERR_/i.test(text) ||
    /Download the React DevTools/i.test(text)
  );
}

test.describe('7) Kurumsal Servis Dökümü (PDF) — uçtan uca üretim', () => {
  test('iş emrinden "PDF döküm" tıklanınca PDF hatasız üretilir; müşteri, plaka, KDV dahil toplam ve logo doğru gelir', async ({
    page,
    request
  }) => {
    const token = await apiLogin(request, OWNER);

    // Kurumsal başlık için dükkan adını sabitle
    const setRes = await apiJson(request, 'PUT', '/api/settings', token, { shop_name: 'Çınar Otomotiv' });
    expect(setRes.status, JSON.stringify(setRes.body)).toBe(200);

    // Gerçek iş emri: 1.000,00 TL işçilik + %20 KDV → KDV dahil 1.200,00 ₺
    const cust = await createCustomer(request, token, { ad_soyad: PDF_MUSTERI, telefon: uniqPhone() });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });
    const plaka = veh.plaka_gorunen;

    const wo = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka,
      durum: 'teslim_edildi',
      kalemler: [
        { tur: 'iscilik', ad: 'E2E PDF işçiliği', adet: 1, birim: 'Adet', birim_fiyat_kurus: 100000 }
      ]
    });
    expect(wo.status, JSON.stringify(wo.body)).toBe(200);

    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error' && !isBenignConsoleError(m.text())) errors.push('console: ' + m.text());
    });

    await login(page, OWNER);

    // PDF kütüphaneleri (html2canvas + jsPDF) CDN'den hazır olana kadar bekle
    await page.waitForFunction(() => (window as any).html2canvas && (window as any).jspdf, null, {
      timeout: 25_000
    });

    // PDF üretimini gözlemle: html2canvas'ı sarıp #stmt HTML'ini yakala
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

    // Araç sorgu → plaka yaz → iş emri kartı gelir
    await page.getByRole('tab', { name: 'Araç sorgu' }).click();
    const q = page.locator('#q');
    await q.click();
    await q.fill(plaka);

    const pdfBtn = page.getByRole('button', { name: 'PDF döküm' });
    await expect(pdfBtn).toBeVisible({ timeout: 15_000 });

    // 1) PDF üretimi hatasız tetiklenir ve gerçek bir PDF indirilir
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), pdfBtn.click()]);

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
    const dlPath = await download.path();
    expect(dlPath, 'indirilen PDF yolu alınamadı').toBeTruthy();
    const buf = fs.readFileSync(dlPath!);
    expect(buf.subarray(0, 5).toString(), 'geçerli PDF imzası (%PDF-)').toBe('%PDF-');
    expect(buf.length, 'PDF boş olmamalı').toBeGreaterThan(1000);

    // 2) Uygulama çökmedi: kabuk ve sekmeler hâlâ çalışıyor
    await expect(page.locator('.topbar')).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Hatırlatıcılar' })).toBeVisible();

    // 3) Üretilen şablon doğru veriyi içeriyor
    const captured = (await page.evaluate(() => (window as any).__pdfCaptured.slice())) as string[];
    expect(captured.length, 'PDF üretim fonksiyonu tetiklenmedi').toBeGreaterThan(0);
    const html = captured[0];

    expect(html).toContain('SERVİS DÖKÜMÜ');
    expect(html).toContain('ÇINAR OTOMOTİV'); // dükkan başlığı
    expect(html).toContain(PDF_MUSTERI); // güncel müşteri adı
    expect(html).toContain(plaka); // plaka
    expect(html).toContain('1.000,00 ₺'); // Ara toplam (KDV hariç)
    expect(html).toContain('200,00 ₺'); // KDV %20
    expect(html).toContain('1.200,00 ₺'); // KDV dahil toplam
    expect(html).toContain('KDV Dahil Toplam');

    // 4) Görsel kontrol: logo alanı dolu ve render edilmiş (boş/kırık değil)
    expect(html).toContain('stmt-logo');
    const logo = await page.evaluate((h) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:794px;background:#fff;';
      host.innerHTML = h;
      document.body.appendChild(host);
      const svg = host.querySelector('.stmt-logo') as SVGSVGElement | null;
      const r = svg ? svg.getBoundingClientRect() : null;
      const res = {
        found: !!svg,
        w: r ? r.width : 0,
        h: r ? r.height : 0,
        shapes: svg ? svg.querySelectorAll('path, rect, polygon, circle, line').length : 0
      };
      host.remove();
      return res;
    }, html);
    expect(logo.found, 'PDF içindeki logo konteyneri bulunamadı').toBe(true);
    expect(logo.w, 'logo genişliği > 0 olmalı').toBeGreaterThan(10);
    expect(logo.h, 'logo yüksekliği > 0 olmalı').toBeGreaterThan(10);
    expect(logo.shapes, 'logo vektör şekilleri içermeli').toBeGreaterThan(0);

    // Hiçbir beklenmedik hata (pageerror / console error) olmamalı
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
