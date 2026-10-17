/**
 * Saat/gün duyarlı karşılama ve veda metinleri.
 *
 * Buradaki fonksiyonlar SAF'tır: sistem saatini (`new Date()`) her zaman YEREL
 * saat dilimiyle okur ve milisaniye hassasiyetinde sınır kontrolü yapar.
 * Açılış (splash), güvenlik kilidi ve güvenli kapanış ekranlarının tüm metinleri
 * tek bir kaynaktan üretilir; böylece söz dizimi hiçbir ekranda ayrışmaz.
 *
 * Zaman dilimleri (yerel saat):
 *   06:00 – 11:59  → sabah   ("Günaydın! Harika bir <Gün> sabahından ...")
 *   12:00 – 16:59  → gündüz  ("İyi Günler! ...")
 *   17:00 – 05:59  → akşam   ("İyi Akşamlar! ...")
 * Cumartesi (6) veya Pazar (0) ise metnin sonuna hafta sonu dileği eklenir.
 */

/** Uygulamanın karşılama/veda ekranlarında görünen sabit marka adı. */
export const APP_BRAND_NAME = 'Çınar Otomotiv';

/** Haftanın gün adları — `Date.getDay()` (0 = Pazar) sırasına göre. */
export const DAY_NAMES_TR = [
  'Pazar',
  'Pazartesi',
  'Salı',
  'Çarşamba',
  'Perşembe',
  'Cuma',
  'Cumartesi'
] as const;

export type DayPart = 'morning' | 'afternoon' | 'evening';

/** Cumartesi veya Pazar mı? (`getDay()`: 0 = Pazar, 6 = Cumartesi) */
export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** Yerel saat dilimine göre Türkçe gün adı. */
export function dayNameTr(date: Date): string {
  return DAY_NAMES_TR[date.getDay()] ?? '';
}

/** 06:00–11:59 sabah · 12:00–16:59 gündüz · 17:00–05:59 akşam. */
export function dayPart(date: Date): DayPart {
  const hour = date.getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  return 'evening';
}

const WEEKEND_WISH = 'İyi hafta sonları dileriz.';

/**
 * Açılış ekranı karşılama metni (kolon başlıkları ve gövde).
 * Örn. Cumartesi 09:30 → "Günaydın! Harika bir Cumartesi sabahından Çınar Otomotiv'e Hoş Geldiniz. İyi hafta sonları dileriz."
 */
export function splashGreeting(date: Date = new Date(), brand: string = APP_BRAND_NAME): string {
  const part = dayPart(date);

  let text: string;
  if (part === 'morning') {
    text = `Günaydın! Harika bir ${dayNameTr(date)} sabahından ${brand}'e Hoş Geldiniz.`;
  } else if (part === 'afternoon') {
    text = `İyi Günler! ${brand}'e Hoş Geldiniz.`;
  } else {
    text = `İyi Akşamlar! ${brand}'e Hoş Geldiniz.`;
  }

  return isWeekend(date) ? `${text} ${WEEKEND_WISH}` : text;
}

/**
 * Güvenli kapanış (veda) metni.
 * 06:00–16:59 → "iyi günler", 17:00–05:59 → "iyi akşamlar" diler.
 */
export function farewellGreeting(date: Date = new Date(), brand: string = APP_BRAND_NAME): string {
  const salutation = dayPart(date) === 'evening' ? 'iyi akşamlar' : 'iyi günler';
  const text = `${brand} ${salutation} diler. Verileriniz güvenle yedekleniyor...`;

  return isWeekend(date) ? `${text} ${WEEKEND_WISH}` : text;
}
