import { test, expect } from './fixture.js';
import { MIDSCENE_READY, SKIP_REASON, OWNER, login } from './helpers.js';

/**
 * AI 4 — Servis dökümü (PDF) okunabilirlik.
 *
 * Regresyon: Döküm şablonu uygulamanın global CSS'inden etkilenmemeli. Koyu
 * temada dahi bilgi kutuları AÇIK zeminli ve yazılar koyu olmalı; "koyu zemin
 * üzerine koyu yazı" gibi okunmaz bir alan kalmamalı.
 *
 * Döküm HTML'i gerçek uygulama modülünden üretilip sayfaya yerleştirilir; ardından
 * Midscene'in görsel muhakemesiyle okunabilirlik ve içerik doğrulanır.
 */

const SAMPLE_ORDERS = [
  {
    giris_tarihi: '2026-10-14T09:00:00.000Z',
    km: 128500,
    durum: 'teslim_edildi',
    sikayet: 'Periyodik bakım talebi.',
    kdv_orani: 20,
    kdv_dahil_mi: false,
    net_tutar_kurus: 100000,
    kdv_tutar_kurus: 20000,
    brut_tutar_kurus: 120000,
    iskonto_tutar_kurus: 0,
    pesin_fiyat_kurus: 120000,
    odenen_tutar_kurus: 120000,
    kalan_tutar_kurus: 0,
    kalemler: [
      { tur: 'iscilik', ad: 'Periyodik bakım işçiliği', adet: 1, birim: 'Adet', birim_fiyat_kurus: 100000 }
    ],
    odemeler: []
  }
];

const SAMPLE_VEHICLE = {
  plaka: '34ABC123',
  marka: 'Volkswagen',
  model: 'Passat',
  yil: 2019,
  musteri: { ad_soyad: 'Ayşe Kaya', telefon: '0542 333 44 55' }
};

const SAMPLE_SETTINGS = {
  shop_name: 'Çınar Otomotiv',
  shop_phone: '0532 000 00 00',
  shop_address: 'Oto Sanayi Sitesi B Blok No: 12, İstanbul'
};

/** Döküm şablonunu gerçek uygulama modülünden üretip sayfaya yerleştirir. */
async function renderStatement(page: any, theme: 'light' | 'dark'): Promise<void> {
  await page.evaluate(
    async (payload: any) => {
      document.documentElement.setAttribute('data-theme', payload.theme);
      const mod: any = await import('/src/services/pdfExport.ts');
      const html = mod.statementHTML(payload.orders, payload.vehicle, payload.settings);
      document.getElementById('ai-stmt-host')?.remove();
      const host = document.createElement('div');
      host.id = 'ai-stmt-host';
      host.style.cssText =
        'position:fixed;left:0;top:0;width:794px;background:#fff;z-index:2147483647;';
      host.innerHTML = html;
      document.body.appendChild(host);
    },
    { orders: SAMPLE_ORDERS, vehicle: SAMPLE_VEHICLE, settings: SAMPLE_SETTINGS, theme }
  );
}

test.describe('AI 4) Servis dökümü (PDF) okunabilirlik', () => {
  test('koyu temada bilgi kutuları açık zemin + koyu yazı ile okunur (regresyon)', async ({
    page,
    agentForPage
  }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, OWNER);
    await renderStatement(page, 'dark');

    await agent.aiAssert(
      '"Müşteri Bilgileri" ve "Araç Bilgileri" kutularının zemini AÇIK renkli ve içindeki etiket ve değer yazıları koyu renkte, net okunur; koyu zemin üzerine koyu yazı olan okunmaz bir alan YOK'
    );
    await agent.aiAssert(
      'Dökümde "Ayşe Kaya" müşteri adı ve "34 ABC 123" plakası okunur biçimde görünüyor'
    );
  });

  test('açık temada da döküm tutarlı ve okunur', async ({ page, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, OWNER);
    await renderStatement(page, 'light');

    await agent.aiAssert(
      'Dökümde "SERVİS DÖKÜMÜ" başlığı, müşteri/araç bilgi kutuları ve tutar tablosu net ve okunur biçimde görünüyor'
    );
  });

  test('AI sorgusuyla müşteri, plaka ve KDV dahil toplamı doğru okur', async ({ page, agentForPage }) => {
    test.skip(!MIDSCENE_READY, SKIP_REASON);
    const agent = await agentForPage(page);

    await login(page, OWNER);
    await renderStatement(page, 'dark');

    const data = await agent.aiQuery<{ musteri: string; plaka: string; kdvDahil: string }>(
      '{musteri: string, plaka: string, kdvDahil: string}, dökümdeki müşteri adını, plakayı ve "KDV Dahil Toplam" satırındaki tutarı çıkar'
    );

    expect(data.plaka).toContain('34 ABC 123');
    expect(data.musteri).toContain('Ayşe Kaya');
    expect(data.kdvDahil).toContain('1.200,00');
  });
});
