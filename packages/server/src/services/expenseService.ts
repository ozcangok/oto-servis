import { and, eq, gte, lte, isNull, desc, inArray } from 'drizzle-orm';
import {
  getDb,
  expenses,
  users,
  workOrders,
  workOrderLines,
  vehicles,
  customers
} from '../db/index.js';
import { STAFF_EXPENSE_CATEGORIES, type UserRole } from '@oto-servis/shared';

export type ExpensePeriod = 'today' | 'month' | 'year' | 'all';

export const EXPENSE_PERIODS: ExpensePeriod[] = ['today', 'month', 'year', 'all'];

export interface PeriodBounds {
  period: ExpensePeriod;
  /** Gider tablosundaki (YYYY-MM-DD) karşılaştırma sınırları */
  startDateOnly: string | null;
  endDateOnly: string | null;
  /** İş emri tarihleri (ISO UTC) için karşılaştırma sınırları */
  startISO: string | null;
  endISO: string | null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function toDateOnly(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Seçilen dönemi yerel (dükkan saat dilimi) tarih sınırlarına çevirir.
 */
export function getPeriodBounds(period: ExpensePeriod): PeriodBounds {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();

  const make = (first: string, last: string): PeriodBounds => ({
    period,
    startDateOnly: first,
    endDateOnly: last,
    startISO: new Date(`${first}T00:00:00`).toISOString(),
    endISO: new Date(`${last}T23:59:59.999`).toISOString()
  });

  if (period === 'today') {
    const day = toDateOnly(now);
    return make(day, day);
  }

  if (period === 'month') {
    const first = `${y}-${pad2(m + 1)}-01`;
    const lastDay = new Date(y, m + 1, 0).getDate(); // bir sonraki ayın 0. günü = bu ayın son günü
    const last = `${y}-${pad2(m + 1)}-${pad2(lastDay)}`;
    return make(first, last);
  }

  if (period === 'year') {
    return make(`${y}-01-01`, `${y}-12-31`);
  }

  return {
    period: 'all',
    startDateOnly: null,
    endDateOnly: null,
    startISO: null,
    endISO: null
  };
}

/**
 * "Toplam Servis Geliri" = Kasa'daki "Toplam İşçilik Bedeli".
 * Silinen iş emri / araç / müşterilere ait işçilik kalemleri hariç tutulur.
 */
export function computeLaborIncomeKurus(startISO: string | null, endISO: string | null): number {
  const db = getDb();

  const conditions = [
    eq(workOrderLines.tur, 'iscilik'),
    isNull(workOrders.deleted_at),
    isNull(vehicles.deleted_at),
    isNull(customers.deleted_at)
  ];
  if (startISO) conditions.push(gte(workOrders.tarih, startISO));
  if (endISO) conditions.push(lte(workOrders.tarih, endISO));

  const rows = db
    .select({
      adet: workOrderLines.adet,
      birim_fiyat_kurus: workOrderLines.birim_fiyat_kurus
    })
    .from(workOrderLines)
    .innerJoin(workOrders, eq(workOrderLines.is_emri_id, workOrders.id))
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(and(...conditions))
    .all();

  let total = 0;
  for (const r of rows) {
    total += (r.adet || 1) * (r.birim_fiyat_kurus || 0);
  }
  return total;
}

export interface ExpenseOverview {
  period: ExpensePeriod;
  startDate: string | null;
  endDate: string | null;
  summary: {
    /** Personel için hesaplanmaz (yalnızca owner görür). */
    laborIncomeKurus?: number;
    /** Personel için hesaplanmaz (yalnızca owner görür). */
    netProfitKurus?: number;
    expenseTotalKurus: number;
    expenseCount: number;
  };
  items: any[];
}

/**
 * Dönemsel gider listesi + özet.
 * - owner: tüm kategoriler + servis geliri & net kâr
 * - staff: yalnızca yetkili (hassas olmayan) kategoriler; gelir/kâr hesaplanmaz.
 */
export function getExpenseOverview(period: ExpensePeriod, role: UserRole): ExpenseOverview {
  const db = getDb();
  const bounds = getPeriodBounds(period);

  const conditions = [];
  if (bounds.startDateOnly) conditions.push(gte(expenses.tarih, bounds.startDateOnly));
  if (bounds.endDateOnly) conditions.push(lte(expenses.tarih, bounds.endDateOnly));
  // GÜVENLİK: Personel (staff) yalnızca gündelik kategorileri görebilir.
  // Beyaz liste (whitelist) kullanılır: 'Personel' ve 'Fatura & Kira' (ve diğer
  // yetkisiz kategoriler) SQL sorgusunda hiç seçilmez → veri istemciye hiç gitmez.
  if (role !== 'owner') {
    conditions.push(inArray(expenses.kategori, STAFF_EXPENSE_CATEGORIES));
  }

  const baseQuery = db
    .select({ expense: expenses, user: users })
    .from(expenses)
    .leftJoin(users, eq(expenses.kullanici_id, users.id));

  const rows = (conditions.length ? baseQuery.where(and(...conditions)) : baseQuery)
    .orderBy(desc(expenses.tarih), desc(expenses.id))
    .all();

  let expenseTotalKurus = 0;
  const items = rows.map((r) => {
    expenseTotalKurus += r.expense.tutar_kurus;
    return {
      ...r.expense,
      kullanici: r.user ? { id: r.user.id, full_name: r.user.full_name } : null
    };
  });

  const summary: ExpenseOverview['summary'] = {
    expenseTotalKurus,
    expenseCount: items.length
  };

  // Servis geliri ve net kâr yalnızca dükkan sahibine gönderilir.
  if (role === 'owner') {
    const laborIncomeKurus = computeLaborIncomeKurus(bounds.startISO, bounds.endISO);
    summary.laborIncomeKurus = laborIncomeKurus;
    summary.netProfitKurus = laborIncomeKurus - expenseTotalKurus;
  }

  return {
    period,
    startDate: bounds.startDateOnly,
    endDate: bounds.endDateOnly,
    summary,
    items
  };
}
