/**
 * Shared Calculation Engine and Currency/Date Formatters
 * Used on both Fastify Backend and React Frontend for identical results.
 */

export interface WorkOrderLineInput {
  adet: number;
  birim_fiyat_kuruş: number;
}

export interface CalculationInput {
  lines: WorkOrderLineInput[];
  kdv_orani: number; // e.g. 20 for 20%
  kdv_dahil_mi: boolean; // true = lines are tax-inclusive, false = tax-exclusive
  iskonto_yuzde?: number; // e.g. 10 for 10%
  iskonto_tutar_kurus?: number; // fixed discount in kuruş
  pesin_fiyat_elle_kurus?: number | null; // manual override for cash price
  pesin_iskonto_yuzde?: number; // default 5 for 5%
  odenen_kurus?: number; // total payments made so far
}

export interface CalculationResult {
  toplam_kurus: number; // Σ(adet * birim_fiyat_kuruş)
  iskonto_kurus: number; // Total discount applied
  net_kurus: number; // Subtotal before KDV (matrah)
  kdv_tutar_kurus: number; // Calculated tax amount
  brut_kurus: number; // Final gross price payable (KDV dahil)
  pesin_fiyat_kurus: number; // Peşin fiyat (ara toplam/KDV hariç tutar üzerinden)
  odenen_kurus: number; // Total paid
  kalan_kurus: number; // brut_kurus - odenen_kurus (>= 0)
  pesin_kalan_kurus: number; // pesin_fiyat_kurus - odenen_kurus (>= 0)
}

/**
 * Calculates work order totals, discounts, taxes and cash prices
 */
export function calculateWorkOrderTotals(input: CalculationInput): CalculationResult {
  const kdvOrani = Number.isFinite(input.kdv_orani) ? input.kdv_orani : 20;
  const pesinIskontoYuzde = Number.isFinite(input.pesin_iskonto_yuzde) ? (input.pesin_iskonto_yuzde ?? 5) : 5;
  const iskontoYuzde = Math.max(0, input.iskonto_yuzde || 0);
  const iskontoTutar = Math.max(0, input.iskonto_tutar_kurus || 0);
  const odenen = Math.max(0, input.odenen_kurus || 0);

  // 1. Kalemler toplamı = Σ(adet × birim_fiyat_kuruş)
  let toplamKurus = 0;
  for (const line of input.lines) {
    const adet = Math.max(0, line.adet);
    const birim = Math.max(0, line.birim_fiyat_kuruş);
    toplamKurus += Math.round(adet * birim);
  }

  // 2. İskonto = toplam × yüzde/100 + tutar, kalemler toplamını geçemez
  const calculatedDiscount = Math.round((toplamKurus * iskontoYuzde) / 100) + iskontoTutar;
  const iskontoKurus = Math.min(toplamKurus, Math.max(0, calculatedDiscount));

  let netKurus = 0;
  let brutKurus = 0;
  let kdvTutarKurus = 0;

  if (input.kdv_dahil_mi) {
    // KDV dahilse: brüt = toplam − iskonto, net = brüt / (1 + KDV). Kuruşa yuvarla.
    brutKurus = toplamKurus - iskontoKurus;
    netKurus = Math.round(brutKurus / (1 + kdvOrani / 100));
    kdvTutarKurus = brutKurus - netKurus;
  } else {
    // Fiyatlar KDV hariçse: net = toplam − iskonto, brüt = net × (1 + KDV). Kuruşa yuvarla.
    netKurus = toplamKurus - iskontoKurus;
    kdvTutarKurus = Math.round((netKurus * kdvOrani) / 100);
    brutKurus = netKurus + kdvTutarKurus;
  }

  // 3. Peşin fiyat = elle girilmişse o, yoksa ARA TOPLAM (KDV hariç tutar) × (1 − peşin_iskonto%).
  // KDV oranı peşin fiyatı etkilemez.
  let pesinFiyatKurus = 0;
  if (input.pesin_fiyat_elle_kurus !== undefined && input.pesin_fiyat_elle_kurus !== null && input.pesin_fiyat_elle_kurus > 0) {
    pesinFiyatKurus = Math.round(input.pesin_fiyat_elle_kurus);
  } else {
    pesinFiyatKurus = Math.round(netKurus * (1 - pesinIskontoYuzde / 100));
  }

  // 4. Kalan bakiyeler
  const kalanKurus = Math.max(0, brutKurus - odenen);
  const pesinKalanKurus = Math.max(0, pesinFiyatKurus - odenen);

  return {
    toplam_kurus: toplamKurus,
    iskonto_kurus: iskontoKurus,
    net_kurus: netKurus,
    kdv_tutar_kurus: kdvTutarKurus,
    brut_kurus: brutKurus,
    pesin_fiyat_kurus: pesinFiyatKurus,
    odenen_kurus: odenen,
    kalan_kurus: kalanKurus,
    pesin_kalan_kurus: pesinKalanKurus
  };
}

/**
 * Formats an integer amount in kuruş to Turkish Lira string:
 * e.g. 123450 -> "1.234,50 ₺"
 * e.g. 237600 -> "2.376,00 ₺"
 */
export function formatCurrency(kurus: number | null | undefined): string {
  if (kurus === null || kurus === undefined || isNaN(kurus)) {
    return '0,00 ₺';
  }

  const isNegative = kurus < 0;
  const absKurus = Math.abs(kurus);
  const lira = Math.floor(absKurus / 100);
  const cents = absKurus % 100;

  // Thousand separators with dots (tr-TR style)
  const liraFormatted = lira.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const centsFormatted = cents.toString().padStart(2, '0');

  return `${isNegative ? '-' : ''}${liraFormatted},${centsFormatted} ₺`;
}

/**
 * Parses user input in Lira (e.g. "1.234,50" or "1234.50" or "1234,5") into kuruş integer
 */
export function parseCurrencyToKurus(input: string | number): number {
  if (typeof input === 'number') {
    return Math.round(input * 100);
  }
  if (!input) return 0;
  
  // Clean non-currency characters except dot, comma, minus
  let cleaned = input.trim().replace(/[^\d.,-]/g, '');
  if (!cleaned) return 0;

  // If contains both '.' and ',', determine decimal separator
  if (cleaned.includes('.') && cleaned.includes(',')) {
    // E.g. 1.234,50 -> remove dots, replace comma with dot
    cleaned = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    // E.g. 1234,50 -> replace comma with dot
    cleaned = cleaned.replace(',', '.');
  }

  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

/**
 * Formats an ISO UTC date string into Europe/Istanbul local date: "14.10.2026"
 */
export function formatDate(isoString: string | Date | null | undefined): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  }).format(d);
}

/**
 * Formats an ISO UTC date string into Europe/Istanbul local date and time: "14.10.2026 15:30"
 */
export function formatDateTime(isoString: string | Date | null | undefined): string {
  if (!isoString) return '-';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '-';

  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);
}
