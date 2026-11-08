import { desc, eq } from 'drizzle-orm';
import { getDb, reminderResolutions, whatsappMessages, workOrders, vehicles, customers, users } from '../db/index.js';
import {
  buildStatusWhatsAppMessage,
  buildInvoiceWhatsAppMessage,
  isStatusNotificationStage,
  type WorkOrderStatus
} from '@oto-servis/shared';

/**
 * İş emrinin servis durumu değiştiğinde iletişim merkezine (Hatırlatıcılar)
 * yeni bir WhatsApp gönderim kaydı düşer. Kayıt; müşteri adı, telefonu,
 * plakası ve o aşamaya ait kurumsal mesaj metnini (anlık görüntü) saklar.
 *
 * Aynı durum için tekrar çağrılırsa yeni kayıt oluşturulmaz; çağıran taraf
 * yalnızca gerçek bir durum DEĞİŞİMİNDE çağırmalıdır.
 */
export function recordStatusNotification(isEmriId: number, durum: string): number | null {
  if (!isStatusNotificationStage(durum)) return null;

  const db = getDb();
  const row = db
    .select({ vehicle: vehicles, customer: customers })
    .from(workOrders)
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(eq(workOrders.id, isEmriId))
    .get();

  if (!row?.vehicle || !row?.customer) return null;

  const mesaj = buildStatusWhatsAppMessage(
    durum as WorkOrderStatus,
    row.customer.ad_soyad,
    row.vehicle.plaka_gorunen
  );
  if (!mesaj) return null;

  const inserted = db
    .insert(whatsappMessages)
    .values({
      is_emri_id: isEmriId,
      durum: durum as WorkOrderStatus,
      musteri_id: row.customer.id,
      musteri_ad: row.customer.ad_soyad,
      telefon: row.customer.telefon,
      plaka: row.vehicle.plaka_gorunen,
      mesaj,
      gonderildi_tarihi: null,
      created_at: new Date().toISOString()
    })
    .returning()
    .get();

  return inserted?.id ?? null;
}

/**
 * Fatura kesildiğinde iletişim merkezine (Hatırlatıcılar) yeni bir WhatsApp
 * gönderim kaydı düşer. Böylece mevcut WhatsApp akışı bozulmadan fatura
 * bildirimi de aynı kuyruğa eklenir.
 */
export function recordInvoiceNotification(
  isEmriId: number,
  faturaNo: string,
  tutarKurus: number
): number | null {
  const db = getDb();
  const row = db
    .select({ vehicle: vehicles, customer: customers })
    .from(workOrders)
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .where(eq(workOrders.id, isEmriId))
    .get();

  if (!row?.vehicle || !row?.customer) return null;

  const tutar = new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY'
  }).format(tutarKurus / 100);

  const mesaj = buildInvoiceWhatsAppMessage(
    row.customer.ad_soyad,
    row.vehicle.plaka_gorunen,
    faturaNo,
    tutar
  );

  const inserted = db
    .insert(whatsappMessages)
    .values({
      is_emri_id: isEmriId,
      durum: 'fatura',
      musteri_id: row.customer.id,
      musteri_ad: row.customer.ad_soyad,
      telefon: row.customer.telefon,
      plaka: row.vehicle.plaka_gorunen,
      mesaj,
      gonderildi_tarihi: null,
      created_at: new Date().toISOString()
    })
    .returning()
    .get();

  return inserted?.id ?? null;
}

/**
 * Gönderim kayıtlarını en yeniden en eskiye doğru listeler.
 *
 * ÖNEMLİ: Müşteri adı, telefonu ve plaka; kayıt oluşturulduğu andaki
 * kopyadan (snapshot) DEĞİL, GÜNCEL müşteri/araç verisinden türetilir.
 * Böylece müşteri adı/telefonu veya araç plakası sonradan değiştirilirse
 * hatırlatıcı kaydı ve mesajı da anında güncellenir. Kayıt yalnızca
 * "hangi aşamada, ne zaman" bilgisini kalıcı tutar.
 */
export function listStatusNotifications(limit = 50): any[] {
  const db = getDb();
  const safeLimit = Math.min(200, Math.max(1, Math.floor(limit) || 50));

  const rows = db
    .select({
      msg: whatsappMessages,
      vehicle: vehicles,
      customer: customers
    })
    .from(whatsappMessages)
    .leftJoin(workOrders, eq(whatsappMessages.is_emri_id, workOrders.id))
    .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
    .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
    .orderBy(desc(whatsappMessages.created_at), desc(whatsappMessages.id))
    .limit(safeLimit)
    .all();

  return rows.map(({ msg, vehicle, customer }) => {
    const musteriAd = customer?.ad_soyad || msg.musteri_ad;
    const telefon = customer?.telefon || msg.telefon;
    const plaka = vehicle?.plaka_gorunen || msg.plaka;
    const mesaj =
      buildStatusWhatsAppMessage(msg.durum as WorkOrderStatus, musteriAd, plaka) || msg.mesaj;

    return {
      ...msg,
      musteri_id: customer?.id ?? msg.musteri_id,
      musteri_ad: musteriAd,
      telefon,
      plaka,
      mesaj
    };
  });
}

/** Kaydı "gönderildi" olarak işaretler (wa.me açıldığında çağrılır). */
export function markStatusNotificationSent(id: number) {
  const db = getDb();
  const now = new Date().toISOString();
  const updated = db
    .update(whatsappMessages)
    .set({ gonderildi_tarihi: now })
    .where(eq(whatsappMessages.id, id))
    .returning()
    .get();
  return updated ?? null;
}

/**
 * Bir müşteri hatırlatıcısını "çözümlendi" olarak işaretler.
 * reminder_id sanal kimliğidir (örn. "muayene-123", "bakim-456").
 */
export function markReminderResolved(reminderId: string, userId: number) {
  const db = getDb();
  const now = new Date().toISOString();

  // Zaten çözümlenmişse tekrar işleme
  const existing = db
    .select()
    .from(reminderResolutions)
    .where(eq(reminderResolutions.reminder_id, reminderId))
    .get();

  if (existing) return existing;

  const inserted = db
    .insert(reminderResolutions)
    .values({
      reminder_id: reminderId,
      resolved_at: now,
      user_id: userId,
      created_at: now
    })
    .returning()
    .get();

  return inserted ?? null;
}

/**
 * Tüm çözümlenmiş hatırlatıcı kimliklerini döndürür.
 * GET /reminders/due yanıtından bunları filtrelemek için kullanılır.
 */
export function getResolvedReminderIds(): string[] {
  const db = getDb();
  const rows = db
    .select({ reminder_id: reminderResolutions.reminder_id })
    .from(reminderResolutions)
    .all();
  return rows.map((r) => r.reminder_id);
}
