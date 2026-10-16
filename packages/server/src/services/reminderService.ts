import { eq, and, isNull, lte, or } from 'drizzle-orm';
import { dbFrom, vehicles, customers, workOrders, type DbCtx } from '../db/index.js';
import { formatDate } from '@oto-servis/shared';

export interface NotificationProvider {
  sendSms(to: string, message: string): Promise<boolean>;
}

// Extensible provider implementation - default is manual send
export class ManualNotificationProvider implements NotificationProvider {
  async sendSms(to: string, message: string): Promise<boolean> {
    console.log(`[MANUAL_NOTIFICATION] SMS hazırlandı (${to}): ${message}`);
    return true;
  }
}

let activeNotificationProvider: NotificationProvider = new ManualNotificationProvider();

export function setNotificationProvider(provider: NotificationProvider) {
  activeNotificationProvider = provider;
}

export interface DueReminder {
  id: string; // unique virtual id
  tur: 'muayene' | 'bakim' | 'teslim_hazir';
  baslik: string;
  mesaj: string;
  hedef_tarih?: string | null;
  arac_id: number;
  plaka: string;
  musteri_id: number;
  musteri_ad: string;
  telefon: string;
}

export async function getDueReminders(ctx?: DbCtx): Promise<DueReminder[]> {
  const db = dbFrom(ctx);
  const now = new Date();
  const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const fifteenDaysLater = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000).toISOString();

  const results: DueReminder[] = [];

  // 1. Ready for delivery (durum: 'teslime_hazir')
  const readyOrders = db
    .select({
      order: workOrders,
      vehicle: vehicles,
      customer: customers
    })
    .from(workOrders)
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(and(eq(workOrders.durum, 'teslime_hazir'), isNull(workOrders.deleted_at)))
    .all();

  for (const r of readyOrders) {
    if (r.vehicle && r.customer) {
      results.push({
        id: `ready-${r.order.id}`,
        tur: 'teslim_hazir',
        baslik: 'Araç Teslime Hazır',
        mesaj: `Sayın ${r.customer.ad_soyad}, ${r.vehicle.plaka_gorunen} plakalı aracınızın servis işlemleri tamamlanmış olup teslime hazırdır.`,
        arac_id: r.vehicle.id,
        plaka: r.vehicle.plaka_gorunen,
        musteri_id: r.customer.id,
        musteri_ad: r.customer.ad_soyad,
        telefon: r.customer.telefon
      });
    }
  }

  // 2. Upcoming / Expired inspection (muayene)
  const allVehicles = db
    .select({
      vehicle: vehicles,
      customer: customers
    })
    .from(vehicles)
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(isNull(vehicles.deleted_at))
    .all();

  for (const v of allVehicles) {
    if (v.vehicle.muayene_tarihi && v.customer) {
      const muayeneDate = new Date(v.vehicle.muayene_tarihi);
      if (v.vehicle.muayene_tarihi <= thirtyDaysLater) {
        const isPast = muayeneDate.getTime() < now.getTime();
        results.push({
          id: `muayene-${v.vehicle.id}`,
          tur: 'muayene',
          baslik: isPast ? 'Muayene Tarihi Geçti' : 'Araç Muayenesi Yaklaşıyor',
          mesaj: `Sayın ${v.customer.ad_soyad}, ${v.vehicle.plaka_gorunen} plakalı aracınızın TÜVTÜRK muayene tarihi (${formatDate(v.vehicle.muayene_tarihi)}) ${isPast ? 'geçmiştir' : 'yaklaşmaktadır'}. Servisimizden muayene öncesi genel kontrol randevusu alabilirsiniz.`,
          hedef_tarih: v.vehicle.muayene_tarihi,
          arac_id: v.vehicle.id,
          plaka: v.vehicle.plaka_gorunen,
          musteri_id: v.customer.id,
          musteri_ad: v.customer.ad_soyad,
          telefon: v.customer.telefon
        });
      }
    }
  }

  // 3. Upcoming maintenance (bakim)
  const maintenanceOrders = db
    .select({
      order: workOrders,
      vehicle: vehicles,
      customer: customers
    })
    .from(workOrders)
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(isNull(workOrders.deleted_at))
    .all();

  for (const m of maintenanceOrders) {
    if (m.order.sonraki_bakim_tarihi && m.vehicle && m.customer) {
      if (m.order.sonraki_bakim_tarihi <= fifteenDaysLater) {
        results.push({
          id: `bakim-${m.order.id}`,
          tur: 'bakim',
          baslik: 'Periyodik Bakım Zamanı Yaklaştı',
          mesaj: `Sayın ${m.customer.ad_soyad}, ${m.vehicle.plaka_gorunen} plakalı aracınızın periyodik bakım tarihi (${formatDate(m.order.sonraki_bakim_tarihi)}) yaklaşmıştır. Güvenli sürüş için servisimize bekleriz.`,
          hedef_tarih: m.order.sonraki_bakim_tarihi,
          arac_id: m.vehicle.id,
          plaka: m.vehicle.plaka_gorunen,
          musteri_id: m.customer.id,
          musteri_ad: m.customer.ad_soyad,
          telefon: m.customer.telefon
        });
      }
    }
  }

  return results;
}
