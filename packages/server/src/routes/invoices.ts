import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull, desc, like } from 'drizzle-orm';
import {
  getDb,
  invoices,
  workOrders,
  workOrderLines,
  payments,
  vehicles,
  customers
} from '../db/index.js';
import { calculateWorkOrderTotals } from '@oto-servis/shared';
import { getPesinRate } from '../services/responseCompat.js';
import { recordInvoiceNotification } from '../services/whatsappService.js';
import { logAudit } from '../services/auditService.js';

const createInvoiceSchema = z.object({
  is_emri_id: z.number().int().positive('Geçerli bir iş emri seçilmelidir.'),
  notlar: z.string().max(500).optional().nullable()
});

/**
 * Fatura modülü.
 *
 * Fatura, iş emrinin kalemleri ve ödemeleri üzerinden hesaplanan brüt tutar
 * ile oluşturulur. Fatura kesildiğinde mevcut WhatsApp iletişim kuyruğuna
 * (whatsapp_messages) otomatik bir gönderim kaydı düşer; gerçek gönderim
 * Hatırlatıcılar ekranındaki mevcut akıştan yapılır.
 *
 * Finansal veri olduğu için tüm fatura uçları yalnızca dükkan sahibine açıktır.
 */
export const invoiceRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.user?.role !== 'owner') {
      return reply
        .status(403)
        .send({ success: false, error: 'Bu işlem için dükkan sahibi yetkisi gereklidir.' });
    }
  });

  fastify.get('/', {
    schema: { tags: ['Faturalar'], summary: 'Fatura listesi' }
  }, async (request) => {
    const db = getDb();
    const q = (request.query as any) || {};
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const isEmriId = Number(q.is_emri_id) || null;
    const durum = q.durum ? String(q.durum) : null;

    const conditions: any[] = [];
    if (isEmriId) conditions.push(eq(invoices.is_emri_id, isEmriId));
    if (durum) conditions.push(eq(invoices.durum, durum as 'kesildi' | 'iptal'));

    const rows = db
      .select({
        invoice: invoices,
        order: workOrders,
        vehicle: vehicles,
        customer: customers
      })
      .from(invoices)
      .leftJoin(workOrders, eq(invoices.is_emri_id, workOrders.id))
      .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(invoices.tarih), desc(invoices.id))
      .limit(limit)
      .all();

    return {
      success: true,
      count: rows.length,
      invoices: rows.map(({ invoice, order, vehicle, customer }) => ({
        ...invoice,
        is_emri_durum: order?.durum ?? null,
        plaka: vehicle?.plaka_gorunen ?? null,
        musteri_ad: customer?.ad_soyad ?? null,
        musteri_telefon: customer?.telefon ?? null,
        is_emri_tarih: order?.tarih ?? null
      }))
    };
  });

  fastify.post('/', {
    schema: { tags: ['Faturalar'], summary: 'İş emri için fatura kes' }
  }, async (request, reply) => {
    const parse = createInvoiceSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz fatura verisi.'
      });
    }

    const db = getDb();
    const isEmriId = parse.data.is_emri_id;

    const orderRow = db
      .select({ order: workOrders, vehicle: vehicles, customer: customers })
      .from(workOrders)
      .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(and(eq(workOrders.id, isEmriId), isNull(workOrders.deleted_at)))
      .get();

    if (!orderRow?.order) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const existing = db
      .select()
      .from(invoices)
      .where(and(eq(invoices.is_emri_id, isEmriId), eq(invoices.durum, 'kesildi')))
      .get();

    if (existing) {
      return reply.status(409).send({
        success: false,
        error: `Bu iş emri için ${existing.fatura_no} numaralı fatura zaten kesilmiş.`,
        invoice: existing
      });
    }

    const lines = db
      .select()
      .from(workOrderLines)
      .where(eq(workOrderLines.is_emri_id, isEmriId))
      .all();

    const paid = db
      .select()
      .from(payments)
      .where(eq(payments.is_emri_id, isEmriId))
      .all()
      .reduce((sum, p) => sum + p.tutar_kurus, 0);

    const pesinRate = await getPesinRate();
    const calc = calculateWorkOrderTotals({
      lines: lines.map((l) => ({ adet: l.adet, birim_fiyat_kuruş: l.birim_fiyat_kurus })),
      kdv_orani: orderRow.order.kdv_orani,
      kdv_dahil_mi: Boolean(orderRow.order.kdv_dahil_mi),
      iskonto_yuzde: orderRow.order.iskonto_yuzde,
      iskonto_tutar_kurus: orderRow.order.iskonto_tutar_kurus,
      pesin_fiyat_elle_kurus: orderRow.order.pesin_fiyat_elle_kurus,
      pesin_iskonto_yuzde: pesinRate,
      odenen_kurus: paid
    });

    if (calc.brut_kurus <= 0) {
      return reply.status(400).send({
        success: false,
        error: 'Fatura kesmek için iş emrinde tutar bulunmalıdır.'
      });
    }

    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const prefix = `FTR-${year}-`;
    const last = db
      .select({ no: invoices.fatura_no })
      .from(invoices)
      .where(like(invoices.fatura_no, `${prefix}%`))
      .orderBy(desc(invoices.fatura_no))
      .get();
    const nextSeq = last?.no ? Number(last.no.slice(prefix.length)) + 1 : 1;
    const faturaNo = `${prefix}${String(Number.isFinite(nextSeq) ? nextSeq : 1).padStart(4, '0')}`;

    const created = db
      .insert(invoices)
      .values({
        is_emri_id: isEmriId,
        fatura_no: faturaNo,
        tarih: now,
        tutar_kurus: calc.brut_kurus,
        kdv_kurus: calc.kdv_tutar_kurus,
        durum: 'kesildi',
        notlar: parse.data.notlar || null,
        olusturan_kullanici_id: request.user!.id,
        created_at: now,
        updated_at: now
      })
      .returning()
      .get();

    // Mevcut WhatsApp kuyruğuna fatura bildirimi düş.
    recordInvoiceNotification(isEmriId, faturaNo, calc.brut_kurus);

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'invoice_create',
      hedef_tablo: 'invoices',
      hedef_id: created.id,
      yeni_deger: created,
      detay: `Fatura kesildi: ${faturaNo} (iş emri #${isEmriId})`
    });

    return {
      success: true,
      invoice: {
        ...created,
        plaka: orderRow.vehicle?.plaka_gorunen ?? null,
        musteri_ad: orderRow.customer?.ad_soyad ?? null
      }
    };
  });

  fastify.patch('/:id/iptal', {
    schema: { tags: ['Faturalar'], summary: 'Faturayı iptal et' }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = getDb();

    const existing = db.select().from(invoices).where(eq(invoices.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Fatura bulunamadı.' });
    }
    if (existing.durum === 'iptal') {
      return reply.status(400).send({ success: false, error: 'Fatura zaten iptal edilmiş.' });
    }

    const updated = db
      .update(invoices)
      .set({ durum: 'iptal', updated_at: new Date().toISOString() })
      .where(eq(invoices.id, id))
      .returning()
      .get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'invoice_cancel',
      hedef_tablo: 'invoices',
      hedef_id: id,
      eski_deger: existing,
      yeni_deger: updated,
      detay: `Fatura iptal edildi: ${existing.fatura_no}`
    });

    return { success: true, invoice: updated };
  });
};
