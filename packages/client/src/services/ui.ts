import { formatCurrency, formatDate, formatDateTime, formatPlateDisplay, normalizePlate } from '@oto-servis/shared';

let toastTimer: any;
export function toast(msg: string) {
  const t = document.getElementById('toast');
  if (t) {
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('on'), 3200);
  } else {
    console.log('[Toast]', msg);
  }
}

export const STAGES: [string, string][] = [
  ['accepted', 'Kabul edildi'],
  ['repairing', 'Onarımda'],
  ['ready', 'Teslime hazır'],
  ['delivered', 'Teslim edildi']
];

export const STAGE_TXT: Record<string, string> = {
  accepted: 'Kabul edildi',
  repairing: 'Onarımda',
  ready: 'Teslime hazır',
  delivered: 'Teslim edildi'
};

export const STATUS_TXT: Record<string, string> = {
  paid: 'Ödendi',
  partial: 'Kısmi ödeme',
  open: 'Ödenmedi'
};

export const PAYMENT_METHODS = ['Nakit', 'Kredi kartı', 'Havale / EFT'];

export function fdate(iso?: string | null): string {
  if (!iso) return '-';
  try {
    const p = String(iso).split('T')[0].split('-');
    if (p.length === 3) return `${p[2]}.${p[1]}.${p[0]}`;
  } catch {}
  return String(iso);
}

export function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function money(kurusOrLira: number, isKurus = true): string {
  const kurus = isKurus ? kurusOrLira : Math.round(kurusOrLira * 100);
  return formatCurrency(kurus);
}

export function numfmt(n: number | string | null | undefined): string {
  const val = Number(n) || 0;
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(val);
}

export function waPhone(p?: string | null): string {
  let d = String(p || '').replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('0')) d = '90' + d.slice(1);
  else if (d.length === 10) d = '90' + d;
  return d;
}

export { formatPlateDisplay, normalizePlate, formatCurrency, formatDate, formatDateTime };
