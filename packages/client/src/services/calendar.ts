/**
 * Takvim yardımcıları (Faz E).
 *
 * Amaç: iş emirlerini gün bazında göstermek. Tarih anahtarları DAİMA yerel
 * takvim günü olarak üretilir (toISOString() UTC'ye kaydırdığı için
 * kullanılmaz). Ayrıca her gün için ayrı ayrı filtreleme yapmak yerine tek
 * geçişte bir Map kurulur.
 */

export type AgendaOrder = {
  id?: number;
  plaka?: string | null;
  musteri_ad?: string | null;
  arac_marka?: string | null;
  arac_model?: string | null;
  sikayet?: string | null;
  durum?: string | null;
  giris_tarihi?: string | null;
  tarih?: string | null;
  brut_tutar_kurus?: number | null;
  [key: string]: any;
};

/** Bir Date'i yerel takvim günü anahtarına ("YYYY-MM-DD") çevirir. */
export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Pazartesi ile başlayan bir ay ızgarası üretir.
 * Baştaki boş günler `null` ile temsil edilir.
 */
export function buildMonthCells(year: number, month: number): (number | null)[] {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // 0 = Pazartesi
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = Array(offset).fill(null);
  for (let i = 1; i <= days; i++) cells.push(i);
  return cells;
}

/**
 * Bir iş emrinin takvim günü anahtarını döndürür.
 * "YYYY-MM-DD" biçimindeki girişler saat dilimi kayması olmadan aynen kullanılır;
 * tam zaman damgaları yerel güne çevrilir.
 */
export function orderDateKey(iso?: string | null): string {
  const s = String(iso ?? '').trim();
  if (!s) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : toDateKey(d);
}

/** İş emirlerini tek geçişte gün → iş listesi map'ine dönüştürür. */
export function buildOrdersByDate(orders: AgendaOrder[]): Map<string, AgendaOrder[]> {
  const map = new Map<string, AgendaOrder[]>();
  for (const o of orders) {
    const key = orderDateKey(o.giris_tarihi ?? o.tarih);
    if (!key) continue;
    const list = map.get(key);
    if (list) list.push(o);
    else map.set(key, [o]);
  }
  return map;
}

/** Verilen gün anahtarı için iş emirlerini döndürür. */
export function getAgendaForDate(
  ordersByDate: Map<string, AgendaOrder[]>,
  dateKey: string
): AgendaOrder[] {
  return ordersByDate.get(dateKey) || [];
}

/** "Ekim 2026" biçiminde ay etiketi. */
export function formatMonthLabel(d: Date): string {
  const s = new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric' }).format(d);
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

/** "Cumartesi, 17 Ekim 2026" biçiminde uzun tarih. */
export function formatLongDateTR(d: Date): string {
  const w = new Intl.DateTimeFormat('tr-TR', { weekday: 'long' }).format(d);
  const rest = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const weekday = w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1);
  return `${weekday}, ${rest}`;
}

/** Takvim ajandası başlığı: "Bugün 17 Ekim Cumartesi" biçiminde. */
export function formatAgendaTitle(d: Date): string {
  const s = new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'long', weekday: 'long' }).format(d);
  return s.charAt(0).toLocaleUpperCase('tr-TR') + s.slice(1);
}

/** İş emrinin saat bilgisi (varsa yerel "HH:MM", yoksa "-"). */
export function orderTimeLabel(iso?: string | null): string {
  const s = String(iso ?? '').trim();
  if (!s) return '-';
  // Yalnızca tarih verilmişse saat bilgisi yoktur.
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return '-';
  const d = new Date(s);
  if (isNaN(d.getTime())) return '-';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  if (hh === '00' && mm === '00') return '-';
  return `${hh}:${mm}`;
}
