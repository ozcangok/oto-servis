import { and, gte, lte, eq, isNull, inArray, sql } from 'drizzle-orm';
import { getDb, payments, workOrders, vehicles, customers, users, workOrderLines } from '../db/index.js';
import { formatCurrency, formatDateTime } from '@oto-servis/shared';
import type { PaymentMethod } from '@oto-servis/shared';

export interface CashDeskSummary {
  startDate: string;
  endDate: string;
  totalCollectedKurus: number;
  byMethod: {
    nakit: number;
    kredi_karti: number;
    havale: number;
  };
  totalLaborKurus: number;
  grandTotalLaborKurus: number;
  laborCount: number;
  grandTotalLaborCount: number;
  paymentsCount: number;
  items: any[];
  laborItems: any[];
}

export async function getCashDeskSummary(startDate?: string, endDate?: string): Promise<CashDeskSummary> {
  const db = getDb();

  // Defaults to today if not provided
  const now = new Date();
  const start = startDate || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0).toISOString();
  const end = endDate || new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();

  // Silinen (yumuşak silme) iş emirleri, araçlar ve müşterilere ait
  // tahsilatlar kasa raporunda görünmez; yoksa silinen kayıtların
  // tutarları kasadan düşmez.
  const whereClause = and(
    gte(payments.tarih, start),
    lte(payments.tarih, end),
    isNull(workOrders.deleted_at),
    isNull(vehicles.deleted_at),
    isNull(customers.deleted_at)
  )!;

  const rows = db
    .select({
      payment: payments,
      user: users,
      workOrder: workOrders,
      vehicle: vehicles,
      customer: customers
    })
    .from(payments)
    .leftJoin(users, eq(payments.kullanici_id, users.id))
    .leftJoin(workOrders, eq(payments.is_emri_id, workOrders.id))
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(whereClause)
    .orderBy(payments.tarih)
    .all();

  const byMethod = {
    nakit: 0,
    kredi_karti: 0,
    havale: 0
  };

  let totalCollectedKurus = 0;

  const items = rows.map((r) => {
    const tutar = r.payment.tutar_kurus;
    totalCollectedKurus += tutar;
    if (r.payment.yontem in byMethod) {
      byMethod[r.payment.yontem as keyof typeof byMethod] += tutar;
    }

    return {
      id: r.payment.id,
      tarih: r.payment.tarih,
      tutar_kurus: tutar,
      yontem: r.payment.yontem,
      notlar: r.payment.notlar,
      kullanici: r.user ? { id: r.user.id, full_name: r.user.full_name } : undefined,
      is_emri_id: r.payment.is_emri_id,
      plaka: r.vehicle?.plaka_gorunen,
      musteri: r.customer?.ad_soyad
    };
  });

  // İşçilik bedelleri, müşterinin ÖDEME YAPTIĞI güne göre raporlanır.
  // Bir iş emrinin işçiliği, o iş emrine ait en son ödemenin tarihine atanır;
  // böylece dün açılıp bugün tahsil edilen işin işçiliği bugünün kasasında görünür
  // ve ödemesi alınmamış işlerin işçiliği kasaya yazılmaz.
  const orderPaymentDates = db
    .select({
      is_emri_id: payments.is_emri_id,
      paidAt: sql<string>`MAX(${payments.tarih})`.as('paid_at')
    })
    .from(payments)
    .innerJoin(workOrders, eq(payments.is_emri_id, workOrders.id))
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(
      and(
        isNull(workOrders.deleted_at),
        isNull(vehicles.deleted_at),
        isNull(customers.deleted_at)
      )
    )
    .groupBy(payments.is_emri_id)
    .all();

  const paidOrderIds: number[] = [];
  const paidOrderDates = new Map<number, string>();
  for (const r of orderPaymentDates) {
    if (r.is_emri_id != null && r.paidAt && r.paidAt >= start && r.paidAt <= end) {
      paidOrderIds.push(r.is_emri_id);
      paidOrderDates.set(r.is_emri_id, r.paidAt);
    }
  }

  const periodLaborRows =
    paidOrderIds.length > 0
      ? db
          .select({
            line: workOrderLines,
            workOrder: workOrders,
            vehicle: vehicles,
            customer: customers
          })
          .from(workOrderLines)
          .innerJoin(workOrders, eq(workOrderLines.is_emri_id, workOrders.id))
          .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
          .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
          .where(
            and(
              eq(workOrderLines.tur, 'iscilik'),
              isNull(workOrders.deleted_at),
              isNull(vehicles.deleted_at),
              isNull(customers.deleted_at),
              inArray(workOrderLines.is_emri_id, paidOrderIds)
            )
          )
          .orderBy(workOrders.tarih)
          .all()
      : [];

  let totalLaborKurus = 0;
  const laborItems = periodLaborRows.map((r) => {
    const lineTotal = (r.line.adet || 1) * (r.line.birim_fiyat_kurus || 0);
    totalLaborKurus += lineTotal;
    return {
      id: r.line.id,
      is_emri_id: r.line.is_emri_id,
      ad: r.line.ad,
      adet: r.line.adet,
      birim: r.line.birim,
      birim_fiyat_kurus: r.line.birim_fiyat_kurus,
      toplam_kurus: lineTotal,
      tarih: paidOrderDates.get(r.line.is_emri_id) ?? r.workOrder.tarih,
      plaka: r.vehicle?.plaka_gorunen,
      musteri: r.customer?.ad_soyad
    };
  });

  // Calculate All-time Labor Costs (Tüm zamanlar işçilik toplamı)
  const allLaborRows = db
    .select({
      adet: workOrderLines.adet,
      birim_fiyat_kurus: workOrderLines.birim_fiyat_kurus
    })
    .from(workOrderLines)
    .innerJoin(workOrders, eq(workOrderLines.is_emri_id, workOrders.id))
    .where(
      and(
        eq(workOrderLines.tur, 'iscilik'),
        isNull(workOrders.deleted_at)
      )
    )
    .all();

  let grandTotalLaborKurus = 0;
  for (const r of allLaborRows) {
    grandTotalLaborKurus += (r.adet || 1) * (r.birim_fiyat_kurus || 0);
  }

  return {
    startDate: start,
    endDate: end,
    totalCollectedKurus,
    byMethod,
    totalLaborKurus,
    grandTotalLaborKurus,
    laborCount: laborItems.length,
    grandTotalLaborCount: allLaborRows.length,
    paymentsCount: items.length,
    items,
    laborItems
  };
}

/**
 * Generates UTF-8 CSV with Turkish characters (with BOM) for Excel compatibility
 */
export function generateCashDeskCsv(summary: CashDeskSummary): string {
  // UTF-8 BOM
  let csv = '\uFEFF';
  csv += 'İşlem No;Tarih;Müşteri;Plaka;İş Emri No;Ödeme Yöntemi;Tutar (TL);Tahsil Eden;Açıklama\n';

  for (const item of summary.items) {
    const dateFormatted = formatDateTime(item.tarih);
    const amountLira = (item.tutar_kurus / 100).toFixed(2).replace('.', ',');
    const methodStr =
      item.yontem === 'nakit'
        ? 'Nakit'
        : item.yontem === 'kredi_karti'
        ? 'Kredi Kartı'
        : item.yontem === 'havale'
        ? 'Havale/EFT'
        : 'Diğer';

    csv += `"${item.id}";"${dateFormatted}";"${item.musteri || ''}";"${item.plaka || ''}";"#${item.is_emri_id}";"${methodStr}";"${amountLira}";"${item.kullanici?.full_name || ''}";"${item.notlar || ''}"\n`;
  }

  // Summary lines
  csv += '\n';
  csv += `;;;;;Toplam Nakit;"${(summary.byMethod.nakit / 100).toFixed(2).replace('.', ',')}";;\n`;
  csv += `;;;;;Toplam Kredi Kartı;"${(summary.byMethod.kredi_karti / 100).toFixed(2).replace('.', ',')}";;\n`;
  csv += `;;;;;Toplam Havale/EFT;"${(summary.byMethod.havale / 100).toFixed(2).replace('.', ',')}";;\n`;
  csv += `;;;;;GENEL TAHSİLAT TOPLAMI;"${(summary.totalCollectedKurus / 100).toFixed(2).replace('.', ',')}";;\n`;
  csv += `;;;;;DÖNEM İŞÇİLİK BEDELİ TOPLAMI;"${(summary.totalLaborKurus / 100).toFixed(2).replace('.', ',')}";;\n`;
  csv += `;;;;;TÜM ZAMANLAR İŞÇİLİK TOPLAMI;"${(summary.grandTotalLaborKurus / 100).toFixed(2).replace('.', ',')}";;\n`;

  if (summary.laborItems && summary.laborItems.length > 0) {
    csv += '\n--- DÖNEM GİRİLEN İŞÇİLİK KALEMLERİ ---\n';
    csv += 'İş Emri No;Tarih;Müşteri;Plaka;İşçilik Tanımı;Miktar;Birim;Birim Fiyat (TL);Toplam Tutar (TL)\n';
    for (const l of summary.laborItems) {
      const dateFormatted = formatDateTime(l.tarih);
      const unitPriceLira = (l.birim_fiyat_kurus / 100).toFixed(2).replace('.', ',');
      const totalLira = (l.toplam_kurus / 100).toFixed(2).replace('.', ',');
      csv += `"#${l.is_emri_id}";"${dateFormatted}";"${l.musteri || ''}";"${l.plaka || ''}";"${l.ad}";"${l.adet}";"${l.birim}";"${unitPriceLira}";"${totalLira}"\n`;
    }
  }

  return csv;
}
