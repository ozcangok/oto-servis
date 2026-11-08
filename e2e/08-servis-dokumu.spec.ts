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
  shop_name: 'Çınar Otomotiv - Özel Servis & Bakım Hizmetleri',
  shop_owner: 'Sezer Çınar',
  shop_phone: '0530 766 52 60',
  shop_address: 'Esenşehir, Muradiye Sk. No:42 D:B, 34776 Ümraniye/İstanbul',
  shop_email: 'info@cinarotomotiv.com',
  shop_tax_office: 'Marmara V.D.',
  shop_tax_number: '1234567890',
  default_kdv_rate: 20
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
    expect(html).toContain('İŞ EMRİ / TEKLİF FORMU');
    expect(html).toContain('Çınar Otomotiv');
    expect(html).toContain('Esenşehir, Muradiye Sk. No:42 D:B, 34776 Ümraniye/İstanbul');
    expect(html).toContain('T: 0530 766 52 60');
    expect(html).toContain('Vergi Dairesi: Marmara V.D.');
    expect(html).toContain('Tarih:');
    expect(html).toContain('34 ABC 123');

    // Yan yana müşteri/araç matrisi
    expect(html).toContain('MÜŞTERİ BİLGİLERİ');
    expect(html).toContain('ARAÇ BİLGİLERİ');

    // Araç inceleme şeması: harici görsel; eski amatör kutu ve SVG yok.
    expect(html).toContain('ARAÇ İNCELEME ŞEMASI');
    expect(html).not.toContain('ARAÇ GÖRÜNÜMÜ');
    expect(html).not.toContain('class="blueprint"');

    // STRICT PDF şartnamesi: araç krokisi artık harici `blueprint.png`
    // görselinden gelir; AI tarafından çizilen SVG geometrisi kaldırıldı.
    // Zemin beyaz, metinler koyu slate, filigran %6.
    expect(html).toContain('src="/blueprint.png"');
    expect(html).toContain('alt="Araç Krokisi"');
    expect(html).toContain('max-height: 180px');
    expect(html).toContain('object-fit: contain');
    expect(html).not.toContain('inspect-svg');
    expect(html).not.toContain('bp-row');
    expect(html).toContain('background:#FFFFFF');
    expect(html).not.toContain('#1E40AF');
    expect(html).not.toContain('#1E3A8A');
    expect(html).not.toContain('stroke="#FFFFFF"');
    expect(html).toContain('#E2E8F0');
    expect(html).toContain('#334155');
    expect(html).toContain('#1E293B');
    expect(html).toContain('Inter');
    expect(html).toContain('#0F172A');
    expect(html).toContain('#F8FAFC');
    expect(html).toContain('border-radius:12px');
    expect(html).toContain('border-radius:8px');
    expect(html).toContain('opacity:0.06');
    expect(html).toContain('z-index:-1');

    // Müşteri / araç matrisi alanları
    expect(html).toContain('Ad Soyad');
    expect(html).toContain('Telefon');
    expect(html).toContain('E-posta');
    expect(html).toContain('Şikayet / Talep');
    expect(html).toContain('Marka / Model');
    expect(html).toContain('Model Yılı');
    expect(html).toContain('Şasi No');
    expect(html).toContain('Motor No');
    expect(html).toContain('Kilometre');
    expect(html).toContain('Belge No');
    expect(html).not.toContain('Vade Tarihi');
    expect(html).toContain('IS-');

    // Profesyonel tablo başlıkları (VIP matris)
    expect(html).toContain('>KOD<');
    expect(html).toContain('AÇIKLAMA / PARÇA / İŞLEM');
    expect(html).toContain('>TÜR<');
    expect(html).toContain('MİKTAR');
    expect(html).toContain('BİRİM FİYAT');
    expect(html).toContain('>TUTAR<');
    expect(html).toContain('Parça');
    expect(html).toContain('İşçilik');
    expect(html).toMatch(/class="num amt"/); // tutarlar sağa hizalı

    // Sağa hizalı özet paneli
    expect(html).toContain('summary');
    expect(html).toContain('Ara Toplam');
    expect(html).toContain('%20 KDV');
    expect(html).toContain('GENEL TOPLAM');

    // Yasal uyarı + çift imza/kaşe bloğu
    expect(html).toContain('Bu belge bilgi amaçlı servis dökümüdür, resmi fatura yerine geçmesi için faturaya dönüştürülmelidir.');
    expect(html).toContain('Müşteri Teslim Onayı / İmza');
    expect(html).toContain('Servis Danışmanı / Kaşe & İmza');
    expect(html).toContain('Kaşe & İmza (Sezer Çınar)');
    expect(html).not.toContain('sig-line');
    expect(html).toMatch(/\.legal\{[^}]*font-style:italic/);
    expect(html).toMatch(/\.legal\{[^}]*text-align:center/);

    // Logo alanı: gerçek <img> + dosya yoksa devreye giren yedek vektör amblem
    const logo = await page.evaluate((h) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:794px;background:#fff;';
      host.innerHTML = h;
      document.body.appendChild(host);
      const img = host.querySelector('.stmt-logo-img') as HTMLImageElement | null;
      const svg = host.querySelector('.stmt-logo-fallback .stmt-logo') as SVGSVGElement | null;
      const res = {
        hasImg: !!img,
        src: img?.getAttribute('src') || '',
        alt: img?.getAttribute('alt') || '',
        hasFallback: !!svg,
        shapes: svg ? svg.querySelectorAll('path, rect, polygon, circle, line').length : 0
      };
      host.remove();
      return res;
    }, html);
    expect(logo.hasImg, 'gerçek logo <img> öğesi bulunamadı').toBe(true);
    expect(logo.src, 'logo kaynağı logo.png olmalı').toContain('logo.png');
    expect(logo.alt, 'logo alt metni kurumsal olmalı').toContain('Logo');
    expect(logo.hasFallback, 'logo yedek amblemi bulunamadı').toBe(true);
    expect(logo.shapes, 'yedek amblem vektör şekilleri içermeli').toBeGreaterThan(0);
    expect(html).not.toMatch(/<img[^>]+src=""/); // kırık/boş görsel referansı yok
  });

  test('kurumsal künye yalnızca canlı global ayarlardan gelir; PDF modülünde sabit şirket verisi yoktur', async ({ page }) => {
    await login(page, OWNER);
    const customSettings = {
      shopName: 'Deneme Otomotiv - Test Hizmetleri',
      address: 'Test Mah. Test Sk. No:1',
      phone: '0212 000 00 00',
      email: 'test@example.com',
      taxOffice: 'Test V.D.',
      taxNumber: '9999999999',
      ownerName: 'Test Yetkili'
    };
    const html = await buildStatementHTML(page, SAMPLE_ORDERS, SAMPLE_VEHICLE, customSettings);

    // CamelCase ayar nesnesi doğrudan PDF'e yansır.
    expect(html).toContain('DENEME OTOMOTİV');
    expect(html).toContain('Test Hizmetleri');
    expect(html).toContain('Test Mah. Test Sk. No:1');
    expect(html).toContain('T: 0212 000 00 00');
    expect(html).toContain('test@example.com');
    expect(html).toContain('Vergi Dairesi: Test V.D.');
    expect(html).toContain('VKN: 9999999999');
    expect(html).toContain('Test Yetkili');

    // Filigran da canlı ayarlardan üretilir.
    expect(html).toContain('class="watermark"');
    expect(html).toContain('DENEME OTOMOTİV');

    // PDF modülünde eski sabit şirket verisi kalmamalı.
    expect(html).not.toContain('Esenşehir');
    expect(html).not.toContain('0530 766 52 60');
    expect(html).not.toContain('Marmara V.D.');
    expect(html).not.toContain('ÇINAR OTOMOTİV');
    expect(html).not.toContain('Çınar Otomotiv');
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
    const setRes = await apiJson(request, 'PUT', '/api/settings', token, {
      shop_name: 'Çınar Otomotiv - Özel Servis & Bakım Hizmetleri'
    });
    expect(setRes.status, JSON.stringify(setRes.body)).toBe(200);

    // Gerçek iş emri: 1.000,00 TL işçilik + %20 KDV → KDV dahil 1.200,00 ₺
    const cust = await createCustomer(request, token, { ad_soyad: PDF_MUSTERI, telefon: uniqPhone(), vergi_no: '312' });
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

    const pdfBtn = page.getByRole('button', { name: 'PDF döküm', exact: true });
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

    expect(html).toContain('İŞ EMRİ / TEKLİF FORMU');
    expect(html).toContain('Çınar Otomotiv'); // dükkan başlığı
    expect(html).toContain('Çınar Otomotiv'); // dinamik marka adı
    expect(html).toContain('Özel Servis &amp; Bakım Hizmetleri'); // dinamik hizmet unvanı (HTML-escaped)
    expect(html).toContain(PDF_MUSTERI); // güncel müşteri adı
    expect(html).toContain('MÜŞTERİ BİLGİLERİ');
    expect(html).toContain(plaka); // plaka
    expect(html).toContain('1.000,00 ₺'); // Ara toplam (KDV hariç)
    expect(html).toContain('200,00 ₺'); // KDV %20
    expect(html).toContain('1.200,00 ₺'); // Genel toplam
    expect(html).toContain('GENEL TOPLAM');

    // 4) Görsel kontrol: gerçek logo dosyası servis ediliyor ve başlıkta
    // 56px yüksekliğinde render ediliyor; dosya yoksa vektör yedeği hazır.
    expect(html).toContain('stmt-logo-img');
    expect(html).toContain('logo.png');
    const logo = await page.evaluate((h) => {
      const host = document.createElement('div');
      host.style.cssText = 'position:fixed;left:0;top:0;width:794px;background:#fff;';
      host.innerHTML = h;
      document.body.appendChild(host);
      const img = host.querySelector('.stmt-logo-img') as HTMLImageElement | null;
      const svg = host.querySelector('.stmt-logo-fallback .stmt-logo') as SVGSVGElement | null;
      const res = {
        hasImg: !!img,
        imgSrc: img?.getAttribute('src') || '',
        imgHeight: img ? parseFloat(getComputedStyle(img).height) : 0,
        hasFallback: !!svg,
        shapes: svg ? svg.querySelectorAll('path, rect, polygon, circle, line').length : 0
      };
      host.remove();
      return res;
    }, html);
    expect(logo.hasImg, 'gerçek logo <img> öğesi bulunamadı').toBe(true);
    expect(logo.imgSrc, 'logo kaynağı logo.png olmalı').toContain('logo.png');
    expect(logo.imgHeight, 'logo yüksekliği 56px olmalı').toBeGreaterThanOrEqual(50);
    expect(logo.hasFallback, 'logo yedek amblemi bulunamadı').toBe(true);
    expect(logo.shapes, 'yedek amblem vektör şekilleri içermeli').toBeGreaterThan(0);

    // Logo dosyası gerçekten yüklenebiliyor mu? (kırık görsel olmamalı)
    const logoFile = await page.evaluate(async () => {
      const img = new Image();
      img.src = '/logo.png';
      await new Promise<void>((resolve) => {
        img.addEventListener('load', () => resolve(), { once: true });
        img.addEventListener('error', () => resolve(), { once: true });
      });
      return { complete: img.complete, width: img.naturalWidth, height: img.naturalHeight };
    });
    expect(logoFile.width, 'logo.png gerçek bir görsel olmalı').toBeGreaterThan(0);
    expect(logoFile.height, 'logo.png gerçek bir görsel olmalı').toBeGreaterThan(0);

    // Hiçbir beklenmedik hata (pageerror / console error) olmamalı
    expect(errors, errors.join('\n')).toEqual([]);
  });
});
