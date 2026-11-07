import { formatCurrency } from '@oto-servis/shared';
import { orderDateKey, toDateKey } from './calendar.js';

/**
 * YEREL (OFFLINE) ANALİZ MOTORU
 * ---------------------------------------------------------------------------
 * Hiçbir bulut servisi, API anahtarı veya ağ bağlantısı kullanmaz. Yalnızca
 * uygulamanın kendi SQLite/IndexedDB verisinden gelen iş emirleri ve parça
 * stoklarını deterministik kurallarla yorumlar.
 *
 * Aynı girdi + aynı gün → her zaman aynı çıktı. Rastgelelik, tarih dışında
 * değişen gizli durum veya harici çağrı yoktur.
 */

export interface OfflineOrder {
  id?: number | string;
  plaka?: string | null;
  musteri_ad?: string | null;
  arac_marka?: string | null;
  arac_model?: string | null;
  durum?: string | null;
  giris_tarihi?: string | null;
  tarih?: string | null;
  sikayet?: string | null;
  brut_tutar_kurus?: number | null;
  net_tutar_kurus?: number | null;
  kalan_tutar_kurus?: number | null;
  odenen_tutar_kurus?: number | null;
  iscilik_toplam_kurus?: number | null;
  atanan?: { id?: number; full_name?: string | null } | null;
  updated_at?: string | null;
  [key: string]: unknown;
}

export interface OfflinePart {
  id?: number | string;
  ad?: string | null;
  kod?: string | null;
  birim?: string | null;
  stok_miktari?: number | null;
  kritik_stok?: number | null;
  [key: string]: unknown;
}

export interface OfflineAnalyticsInput {
  orders: OfflineOrder[];
  parts: OfflinePart[];
  now?: Date;
  /** Örn. "Çınar Otomotiv" — metinlerde kullanılır. */
  shopName?: string;
}

export interface OfflineWorkloadDay {
  dateKey: string;
  label: string;
  count: number;
  revenueKurus: number;
}

export interface OfflineAnalysisMetrics {
  inShopCount: number;
  readyCount: number;
  pendingPartsCount: number;
  todayAppointments: number;
  monthRevenueKurus: number;
  previousMonthRevenueKurus: number;
  monthTrendPct: number | null;
  monthLaborKurus: number;
  monthPartsKurus: number;
  openReceivablesKurus: number;
  openCustomersCount: number;
  overdueReceivablesKurus: number;
  overdueCount: number;
  lowStockCount: number;
  criticalStockCount: number;
}

export interface OfflineAnalysisOutput {
  /** Zorunlu sözleşme alanları. */
  dailyDigest: string[];
  financialRiskAlerts: string[];
  inventoryWarnings: string[];
  predictiveWorkload: string;

  /** Arayüzün ek olarak kullandığı deterministik çıktılar. */
  metrics: OfflineAnalysisMetrics;
  workload: OfflineWorkloadDay[];
  generatedAt: string;
}

const DELIVERED = new Set(['teslim_edildi', 'delivered', 'iptal', 'cancel', 'cancelled']);
const READY = new Set(['teslime_hazir', 'tamamlandı', 'tamamlandi', 'ready']);
const PENDING_PARTS = new Set(['parca_bekliyor', 'parça bekliyor', 'waiting_parts']);

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shortDayLabel(d: Date): string {
  return new Intl.DateTimeFormat('tr-TR', { weekday: 'short' }).format(d);
}

function money(kurus: number): string {
  return formatCurrency(Math.max(0, Math.round(kurus || 0)));
}

function orderKey(o: OfflineOrder): string {
  return orderDateKey(o.giris_tarihi ?? o.tarih);
}

function isDelivered(o: OfflineOrder): boolean {
  return DELIVERED.has(String(o.durum ?? '').toLocaleLowerCase('tr-TR'));
}

function isReady(o: OfflineOrder): boolean {
  return READY.has(String(o.durum ?? '').toLocaleLowerCase('tr-TR'));
}

function isPendingParts(o: OfflineOrder): boolean {
  return PENDING_PARTS.has(String(o.durum ?? '').toLocaleLowerCase('tr-TR'));
}

function partLabel(p: OfflinePart): string {
  return String(p.ad || p.kod || 'İsimsiz parça').trim();
}

/**
 * Ana giriş noktası. Saf fonksiyon: yalnızca parametrelerini okur.
 */
export function analyzeOffline(input: OfflineAnalyticsInput): OfflineAnalysisOutput {
  const now = input.now ?? new Date();
  const today = startOfDay(now);
  const todayKey = toDateKey(today);
  const thisMonth = monthKey(today);
  const previousMonth = monthKey(new Date(today.getFullYear(), today.getMonth() - 1, 1));

  const orders = Array.isArray(input.orders) ? input.orders : [];
  const parts = Array.isArray(input.parts) ? input.parts : [];

  const inShop = orders.filter((o) => !isDelivered(o) && orderKey(o) && orderKey(o) <= todayKey);
  const ready = inShop.filter(isReady);
  const pendingParts = inShop.filter(isPendingParts);
  const todayAppointments = orders.filter((o) => orderKey(o) === todayKey && !isDelivered(o));

  const monthOrders = orders.filter((o) => orderKey(o).startsWith(thisMonth));
  const previousMonthOrders = orders.filter((o) => orderKey(o).startsWith(previousMonth));

  const monthRevenueKurus = monthOrders.reduce((sum, o) => sum + (Number(o.brut_tutar_kurus) || 0), 0);
  const previousMonthRevenueKurus = previousMonthOrders.reduce(
    (sum, o) => sum + (Number(o.brut_tutar_kurus) || 0),
    0
  );
  const monthLaborKurus = monthOrders.reduce(
    (sum, o) => sum + (Number(o.iscilik_toplam_kurus) || 0),
    0
  );
  const monthPartsKurus = Math.max(0, monthRevenueKurus - monthLaborKurus);

  const openOrders = orders.filter((o) => (Number(o.kalan_tutar_kurus) || 0) > 0);
  const openReceivablesKurus = openOrders.reduce(
    (sum, o) => sum + (Number(o.kalan_tutar_kurus) || 0),
    0
  );
  const openCustomers = new Set(
    openOrders.map((o) => String(o.musteri_ad || o.plaka || '').trim()).filter(Boolean)
  );

  const overdueThreshold = toDateKey(addDays(today, -30));
  const overdueOrders = openOrders.filter((o) => {
    const key = orderKey(o);
    return Boolean(key) && key < overdueThreshold;
  });
  const overdueReceivablesKurus = overdueOrders.reduce(
    (sum, o) => sum + (Number(o.kalan_tutar_kurus) || 0),
    0
  );

  const lowStock = parts.filter((p) => {
    const stock = Number(p.stok_miktari) || 0;
    const critical = Number(p.kritik_stok) || 0;
    return critical > 0 && stock <= critical;
  });
  const criticalStock = lowStock.filter((p) => {
    const stock = Number(p.stok_miktari) || 0;
    const critical = Number(p.kritik_stok) || 0;
    return stock <= 0 || (critical > 0 && stock / critical < 0.5);
  });

  const monthTrendPct =
    previousMonthRevenueKurus > 0
      ? Math.round(((monthRevenueKurus - previousMonthRevenueKurus) / previousMonthRevenueKurus) * 100)
      : null;

  // Önümüzdeki 7 günün planlı iş yükü (bugün dahil).
  const workload: OfflineWorkloadDay[] = Array.from({ length: 7 }, (_, i) => {
    const day = addDays(today, i);
    const key = toDateKey(day);
    const dayOrders = orders.filter((o) => orderKey(o) === key && !isDelivered(o));
    return {
      dateKey: key,
      label: shortDayLabel(day),
      count: dayOrders.length,
      revenueKurus: dayOrders.reduce((sum, o) => sum + (Number(o.brut_tutar_kurus) || 0), 0)
    };
  });

  const busiest = workload.reduce(
    (best, day) => (day.count > best.count ? day : best),
    workload[0]
  );

  const dailyDigest: string[] = [];
  if (inShop.length > 0) {
    dailyDigest.push(
      `Serviste ${inShop.length} araç var; ${ready.length} araç teslime hazır.`
    );
  } else {
    dailyDigest.push('Serviste aktif araç yok; yeni iş emri bekleniyor.');
  }
  if (todayAppointments.length > 0) {
    dailyDigest.push(`Bugün ${todayAppointments.length} araç kabulü planlanmış.`);
  }
  if (pendingParts.length > 0) {
    dailyDigest.push(
      `${pendingParts.length} araç parça bekliyor; parça temini gecikirse teslim tarihleri kayabilir.`
    );
  }
  if (lowStock.length > 0) {
    dailyDigest.push(
      `${lowStock.length} parça kritik stok seviyesinde veya altında; sipariş listesini kontrol edin.`
    );
  }
  if (overdueOrders.length > 0) {
    dailyDigest.push(
      `${overdueOrders.length} iş emrinde vadesi geçen ${money(overdueReceivablesKurus)} alacak var.`
    );
  }

  const financialRiskAlerts: string[] = [];
  if (overdueOrders.length > 0) {
    financialRiskAlerts.push(
      `${overdueOrders.length} müşteride ${money(overdueReceivablesKurus)} vadesi geçen alacak bulunuyor. Tahsilat önceliği önerilir.`
    );
  }
  if (openReceivablesKurus > 0) {
    financialRiskAlerts.push(
      `Toplam açık cari ${money(openReceivablesKurus)}; ${openCustomers.size} müşteriye dağılmış durumda.`
    );
  }
  if (monthTrendPct !== null && monthTrendPct < 0) {
    financialRiskAlerts.push(
      `Bu ay ciro önceki aya göre %${Math.abs(monthTrendPct)} düşük. İşçilik/parça dağılımını gözden geçirin.`
    );
  }
  if (monthTrendPct !== null && monthTrendPct > 0) {
    financialRiskAlerts.push(
      `Bu ay ciro önceki aya göre %${monthTrendPct} yukarıda; tahsilat hızı korunursa nakit akışı olumlu.`
    );
  }
  if (financialRiskAlerts.length === 0) {
    financialRiskAlerts.push('Finansal risk sinyali yok; açık alacaklar kontrol altında.');
  }

  const inventoryWarnings = criticalStock.length
    ? criticalStock.slice(0, 5).map((p) => {
        const stock = Number(p.stok_miktari) || 0;
        const critical = Number(p.kritik_stok) || 0;
        return `${partLabel(p)}: ${stock} ${p.birim || 'adet'} kaldı (kritik seviye ${critical}).`;
      })
    : lowStock.length
      ? lowStock.slice(0, 5).map((p) => {
          const stock = Number(p.stok_miktari) || 0;
          const critical = Number(p.kritik_stok) || 0;
          return `${partLabel(p)}: ${stock} ${p.birim || 'adet'} (kritik ${critical}) — sipariş planlayın.`;
        })
      : ['Kritik stok uyarısı yok; parça seviyeleri yeterli.'];

  let predictiveWorkload: string;
  if (busiest && busiest.count > 0) {
    const partsNote =
      pendingParts.length > 0
        ? ` ${pendingParts.length} araç parça beklediği için parça girişinde yük artabilir.`
        : '';
    predictiveWorkload = `Önümüzdeki 7 günde en yoğun gün ${busiest.label} (${busiest.count} araç). Toplam planlı kabul ${workload.reduce(
      (sum, d) => sum + d.count,
      0
    )} araç.${partsNote}`;
  } else if (inShop.length > 0) {
    predictiveWorkload = `Planlı randevu görünmüyor; serviste ${inShop.length} araçlık mevcut yük devam ediyor.`;
  } else {
    predictiveWorkload = 'Önümüzdeki 7 gün için planlı iş yok; kapasite müsait.';
  }

  return {
    dailyDigest,
    financialRiskAlerts,
    inventoryWarnings,
    predictiveWorkload,
    metrics: {
      inShopCount: inShop.length,
      readyCount: ready.length,
      pendingPartsCount: pendingParts.length,
      todayAppointments: todayAppointments.length,
      monthRevenueKurus,
      previousMonthRevenueKurus,
      monthTrendPct,
      monthLaborKurus,
      monthPartsKurus,
      openReceivablesKurus,
      openCustomersCount: openCustomers.size,
      overdueReceivablesKurus,
      overdueCount: overdueOrders.length,
      lowStockCount: lowStock.length,
      criticalStockCount: criticalStock.length
    },
    workload,
    generatedAt: now.toISOString()
  };
}

/**
 * Personel için finansal olmayan günlük servis notları.
 * Aynı veri kümesinden türetilir; para/maliyet/ciro içermez.
 */
export function buildStaffNotes(orders: OfflineOrder[], now: Date = new Date()): string[] {
  const today = startOfDay(now);
  const todayKey = toDateKey(today);
  const tomorrowKey = toDateKey(addDays(today, 1));

  const active = orders.filter((o) => !isDelivered(o));
  const ready = active.filter(isReady);
  const waitingParts = active.filter(isPendingParts);
  const todayJobs = active.filter((o) => orderKey(o) === todayKey);
  const tomorrowJobs = active.filter((o) => orderKey(o) === tomorrowKey);

  const notes: string[] = [];

  if (todayJobs.length > 0) {
    notes.push(`Bugün ${todayJobs.length} araç kabulü var: ${todayJobs.map((o) => o.plaka || 'plaka yok').join(', ')}.`);
  }
  if (tomorrowJobs.length > 0) {
    notes.push(`Yarın ${tomorrowJobs.length} araç planlanmış: ${tomorrowJobs.map((o) => o.plaka || 'plaka yok').join(', ')}.`);
  }
  if (ready.length > 0) {
    notes.push(`Teslime hazır ${ready.length} araç müşteriye teslim için hazırlanmayı bekliyor.`);
  }
  if (waitingParts.length > 0) {
    notes.push(`Parça bekleyen ${waitingParts.length} araç var; parça gelmeden işleme başlamayın.`);
  }

  const assigned = active.filter((o) => o.atanan?.full_name);
  if (assigned.length > 0) {
    const names = Array.from(new Set(assigned.map((o) => String(o.atanan?.full_name)))).slice(0, 3);
    notes.push(`Atanan teknisyenler: ${names.join(', ')}.`);
  }

  if (notes.length === 0) {
    notes.push('Bugün için planlı servis notu yok. Yeni iş emri geldiğinde burada görünecek.');
  }

  return notes;
}
