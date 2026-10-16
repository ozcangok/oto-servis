import { eq, and, isNull } from 'drizzle-orm';
import { dbFrom, customers, vehicles, workOrders, payments, workOrderLines, type DbCtx } from '../db/index.js';
import { logAudit } from './auditService.js';
import type { User } from '@oto-servis/shared';

export async function exportCustomerKvkkData(customerId: number, ctx?: DbCtx) {
  const db = dbFrom(ctx);
  const customer = db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) {
    throw new Error('Müşteri bulunamadı.');
  }

  const custVehicles = db.select().from(vehicles).where(eq(vehicles.musteri_id, customerId)).all();

  const vehicleIds = custVehicles.map((v) => v.id);
  const allOrders: any[] = [];

  for (const v of custVehicles) {
    const orders = db.select().from(workOrders).where(eq(workOrders.arac_id, v.id)).all();
    for (const o of orders) {
      const lines = db.select().from(workOrderLines).where(eq(workOrderLines.is_emri_id, o.id)).all();
      const orderPayments = db.select().from(payments).where(eq(payments.is_emri_id, o.id)).all();
      allOrders.push({
        ...o,
        kalemler: lines,
        odemeler: orderPayments
      });
    }
  }

  return {
    exportDate: new Date().toISOString(),
    musteri: customer,
    araclar: custVehicles,
    isEmirleri: allOrders
  };
}

export async function anonymizeCustomer(customerId: number, adminUser: User, ctx?: DbCtx) {
  const db = dbFrom(ctx);
  const customer = db.select().from(customers).where(eq(customers.id, customerId)).get();
  if (!customer) {
    throw new Error('Müşteri bulunamadı.');
  }

  const now = new Date().toISOString();
  const anonymized = db.update(customers).set({
    ad_soyad: `KVKK Anonim Müşteri #${customer.id}`,
    telefon: '0000000000',
    eposta: null,
    vergi_no: null,
    notlar: 'KVKK kapsamında silindi / anonimleştirildi',
    deleted_at: now,
    updated_at: now
  }).where(eq(customers.id, customerId)).returning().get();

  await logAudit({
    kullanici_id: adminUser.id,
    kullanici_adi: adminUser.username,
    islem: 'customer_anonymize',
    hedef_tablo: 'customers',
    hedef_id: customerId,
    eski_deger: { ad_soyad: customer.ad_soyad, telefon: customer.telefon },
    yeni_deger: anonymized,
    detay: `KVKK kapsamında müşteri anonimleştirildi: #${customerId}`
  }, ctx);

  return anonymized;
}
