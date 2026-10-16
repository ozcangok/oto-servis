/**
 * İstemci–sunucu yanıt uyumluluk katmanı.
 *
 * Arayüz (client) tarihsel olarak şu alan adlarını okur:
 * - Araçlarda `plaka`
 * - İş emirlerinde `giris_tarihi`, `brut_tutar_kurus`, `net_tutar_kurus`,
 *   `toplam_tutar_kurus`, `iskonto_tutar_kurus`, `odenen_tutar_kurus`,
 *   `kalan_tutar_kurus` ve düzleştirilmiş `plaka`, `musteri_ad`,
 *   `arac_marka`, `arac_model`
 *
 * Sunucu ise `plaka_gorunen`, `tarih`, `brut_kurus` ... adlarını üretir.
 * Bu modül mevcut alanları KORUYARAK istemcinin beklediği takma adları
 * ekler; böylece eski arayüz sürümleri dahil her şey çalışır.
 */

import { getSettings } from './settingsService.js';

export function withVehicleAliases<T extends Record<string, any>>(
  vehicle: T | null | undefined
): T | null | undefined {
  if (!vehicle) return vehicle;
  const v = vehicle as Record<string, any>;
  return {
    ...vehicle,
    plaka: v.plaka_gorunen ?? v.plaka_norm ?? v.plaka
  };
}

export interface OrderFlatContext {
  plaka?: string | null;
  musteri_ad?: string | null;
  arac_marka?: string | null;
  arac_model?: string | null;
}

export function flattenOrderContext(
  vehicle?: Record<string, any> | null,
  customer?: Record<string, any> | null
): OrderFlatContext {
  return {
    plaka: vehicle?.plaka_gorunen ?? vehicle?.plaka_norm ?? null,
    musteri_ad: customer?.ad_soyad ?? null,
    arac_marka: vehicle?.marka ?? null,
    arac_model: vehicle?.model ?? null
  };
}

export function withOrderAliases<T extends Record<string, any>>(
  order: T,
  flat: OrderFlatContext = {}
): T {
  const o = (order || {}) as Record<string, any>;
  return {
    ...order,
    giris_tarihi: o.giris_tarihi ?? o.tarih,
    brut_tutar_kurus: o.brut_tutar_kurus ?? o.brut_kurus,
    net_tutar_kurus: o.net_tutar_kurus ?? o.net_kurus,
    toplam_tutar_kurus: o.toplam_tutar_kurus ?? o.toplam_kurus,
    iskonto_tutar_kurus: o.iskonto_tutar_kurus ?? o.iskonto_kurus,
    odenen_tutar_kurus: o.odenen_tutar_kurus ?? o.odenen_kurus,
    kalan_tutar_kurus: o.kalan_tutar_kurus ?? o.kalan_kurus,
    ...flat
  };
}

export interface CashDeskCompatInput {
  totalCollectedKurus?: number;
  byMethod?: { nakit?: number; kredi_karti?: number; havale?: number };
  items?: Array<Record<string, any>>;
  [key: string]: any;
}

export type CanonicalPaymentMethod = 'nakit' | 'kredi_karti' | 'havale' | 'cek_senet';

const PAYMENT_METHOD_DISPLAY: Record<CanonicalPaymentMethod, string> = {
  nakit: 'Nakit',
  kredi_karti: 'Kredi kartı',
  havale: 'Havale / EFT',
  cek_senet: 'Çek/Senet'
};

export function paymentMethodDisplay(yontem: unknown): string {
  const canonical = normalizePaymentMethod(yontem);
  return PAYMENT_METHOD_DISPLAY[canonical];
}

/**
 * Peşin iskontosu oranını belirler: istekte açıkça verildiyse o,
 * yoksa ayarlardaki varsayılan (ayar yoksa %5 geriye uyumluluk).
 */
export async function getPesinRate(explicit?: number | null): Promise<number> {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  try {
    const settings = await getSettings();
    if (typeof settings.default_cash_discount_rate === 'number') {
      return settings.default_cash_discount_rate;
    }
  } catch {}
  return 5;
}

/**
 * Arayüz Türkçe görünen ad gönderir ("Nakit", "Kredi kartı", "Havale / EFT"),
 * raporlar ise standart anahtar bekler. Her iki biçimi de standartlaştırır.
 */
export function normalizePaymentMethod(input: unknown): CanonicalPaymentMethod {
  const s = String(input ?? '')
    .trim()
    .toLocaleLowerCase('tr-TR');
  if (s.includes('kredi')) return 'kredi_karti';
  if (s.includes('havale') || s.includes('eft')) return 'havale';
  if (s.includes('cek') || s.includes('çek') || s.includes('senet')) return 'cek_senet';
  return 'nakit';
}

/**
 * Kasa özetine arayüzün beklediği snake_case takma adları ekler.
 * Mevcut camelCase alanlar korunur.
 */
export function withCashDeskAliases<T extends CashDeskCompatInput>(summary: T): T {
  const nakit = summary.byMethod?.nakit || 0;
  const krediKarti = summary.byMethod?.kredi_karti || 0;
  const havale = summary.byMethod?.havale || 0;

  const transactions = (summary.items || []).map((t) => ({
    ...t,
    musteri_ad: t.musteri_ad ?? t.musteri ?? '',
    odeme_yontemi: t.odeme_yontemi ?? paymentMethodDisplay(t.yontem),
    method: t.method ?? paymentMethodDisplay(t.yontem),
    amount: t.amount ?? t.tutar_kurus ?? 0
  }));

  return {
    ...summary,
    nakit_kurus: nakit,
    kart_kurus: krediKarti,
    havale_kurus: havale,
    by_method: {
      nakit,
      kredi_karti: krediKarti,
      kart: krediKarti,
      havale,
      havale_eft: havale
    },
    payments: transactions,
    transactions
  };
}
