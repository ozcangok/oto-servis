import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, desc } from 'drizzle-orm';
import { getDb, payments, workOrders, users } from '../db/index.js';
import { logAudit } from '../services/auditService.js';
import { normalizePaymentMethod } from '../services/responseCompat.js';
import type { PaymentMethod } from '@oto-servis/shared';

const paymentInputSchema = z.object({
  is_emri_id: z.number().int().positive('Geçerli bir iş emri seçiniz.'),
  tutar_kurus: z.number().int().positive('Ödeme tutarı 0\'dan büyük olmalıdır.'),
  yontem: z.string().optional().nullable(),
  odeme_yontemi: z.string().optional().nullable(),
  odeme_tarihi: z.string().optional().nullable(),
  tarih: z.string().optional().nullable(),
  notlar: z.string().optional().nullable()
});

export const paymentRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // Create payment
  fastify.post('/', {
    schema: {
      tags: ['Ödemeler'],
      summary: 'İş emrine ödeme ekle'
    }
  }, async (request, reply) => {
    const parse = paymentInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz ödeme bilgisi.'
      });
    }

    const db = getDb();
    const order = db.select().from(workOrders).where(eq(workOrders.id, parse.data.is_emri_id)).get();
    if (!order) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const now = new Date().toISOString();
    const newPayment = db.insert(payments).values({
      is_emri_id: parse.data.is_emri_id,
      tarih: parse.data.odeme_tarihi || parse.data.tarih || now,
      tutar_kurus: parse.data.tutar_kurus,
      yontem: normalizePaymentMethod(parse.data.odeme_yontemi ?? parse.data.yontem) as PaymentMethod,
      kullanici_id: request.user!.id,
      notlar: parse.data.notlar?.trim() || null,
      created_at: now
    }).returning().get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'payment_create',
      hedef_tablo: 'payments',
      hedef_id: newPayment.id,
      yeni_deger: newPayment,
      detay: `Ödeme alındı: ${(newPayment.tutar_kurus / 100).toFixed(2)} TL (${newPayment.yontem}) - İş Emri #${order.id}`
    });

    return { success: true, payment: newPayment };
  });

  // List payments for a work order
  fastify.get('/work-order/:id', {
    schema: {
      tags: ['Ödemeler'],
      summary: 'Bir iş emrinin tüm ödemelerini listele'
    }
  }, async (request) => {
    const id = Number((request.params as any).id);
    const db = getDb();

    const items = db
      .select({
        payment: payments,
        user: users
      })
      .from(payments)
      .leftJoin(users, eq(payments.kullanici_id, users.id))
      .where(eq(payments.is_emri_id, id))
      .orderBy(desc(payments.tarih))
      .all()
      .map((p) => ({
        ...p.payment,
        kullanici: p.user ? { id: p.user.id, full_name: p.user.full_name } : undefined
      }));

    return { success: true, items };
  });

  // Delete payment (Admin / Cashier only)
  fastify.delete('/:id', {
    schema: {
      tags: ['Ödemeler'],
      summary: 'Ödemeyi sil'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = getDb();

    const existing = db.select().from(payments).where(eq(payments.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Ödeme bulunamadı.' });
    }

    db.delete(payments).where(eq(payments.id, id)).run();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'payment_delete',
      hedef_tablo: 'payments',
      hedef_id: id,
      eski_deger: existing,
      detay: `Ödeme silindi: ${(existing.tutar_kurus / 100).toFixed(2)} TL - İş Emri #${existing.is_emri_id}`
    });

    return { success: true, message: 'Ödeme silindi.' };
  });
};
