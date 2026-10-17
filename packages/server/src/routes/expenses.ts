import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { getDb, expenses } from '../db/index.js';
import { getExpenseOverview, EXPENSE_PERIODS, type ExpensePeriod } from '../services/expenseService.js';
import { logAudit } from '../services/auditService.js';
import { EXPENSE_CATEGORIES, SENSITIVE_EXPENSE_CATEGORIES } from '@oto-servis/shared';

const expenseInputSchema = z.object({
  tarih: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Geçerli bir tarih giriniz (YYYY-AA-GG).'),
  kategori: z
    .string()
    .refine((v) => (EXPENSE_CATEGORIES as readonly string[]).includes(v), 'Geçersiz gider kategorisi.'),
  aciklama: z.string().trim().min(2, 'Açıklama en az 2 karakter olmalıdır.'),
  tutar_kurus: z
    .number()
    .int('Tutar kuruş cinsinden tam sayı olmalıdır.')
    .positive('Tutar sıfırdan büyük olmalıdır.')
});

export const expenseRoutes: FastifyPluginAsync = async (fastify) => {
  // Giderler modülü tüm personelin erişimine açıktır; ancak gelir/kâr özeti ve
  // hassas kategoriler (Fatura & Kira, Personel) yalnızca dükkan sahibine özeldir.
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // Gider listesi + dönemsel özet (gelir/kâr yalnızca owner'a gönderilir)
  fastify.get('/', {
    schema: {
      tags: ['Giderler'],
      summary: 'Dönemsel gider listesi ve özet (gelir/kâr yalnızca dükkan sahibine)'
    }
  }, async (request) => {
    const raw = String((request.query as any)?.period || 'month');
    const period: ExpensePeriod = (EXPENSE_PERIODS as string[]).includes(raw)
      ? (raw as ExpensePeriod)
      : 'month';

    const overview = getExpenseOverview(period, request.user!.role);
    return {
      success: true,
      period: overview.period,
      startDate: overview.startDate,
      endDate: overview.endDate,
      summary: overview.summary,
      items: overview.items
    };
  });

  // Yeni gider ekle (owner tüm kategoriler, staff yalnızca gündelik kategoriler)
  fastify.post('/', {
    schema: {
      tags: ['Giderler'],
      summary: 'Yeni dükkan gideri ekle'
    }
  }, async (request, reply) => {
    const parse = expenseInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz gider verisi.'
      });
    }

    // Personel hassas kategorileri ekleyemez.
    if (
      request.user!.role !== 'owner' &&
      (SENSITIVE_EXPENSE_CATEGORIES as readonly string[]).includes(parse.data.kategori)
    ) {
      return reply.status(403).send({
        success: false,
        error: 'Bu kategoriyi yalnızca dükkan sahibi ekleyebilir.'
      });
    }

    const db = getDb();
    const now = new Date().toISOString();

    const newExpense = db.insert(expenses).values({
      tarih: parse.data.tarih,
      kategori: parse.data.kategori,
      aciklama: parse.data.aciklama,
      tutar_kurus: parse.data.tutar_kurus,
      kullanici_id: request.user!.id,
      created_at: now,
      updated_at: now
    }).returning().get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'expense_create',
      hedef_tablo: 'expenses',
      hedef_id: newExpense.id,
      yeni_deger: newExpense,
      ip_adresi: request.ip,
      detay: `Gider eklendi: ${newExpense.kategori} - ${newExpense.aciklama} (${(newExpense.tutar_kurus / 100).toFixed(2)} TL)`
    });

    return { success: true, expense: newExpense };
  });

  // Gider güncelle (yalnızca dükkan sahibi)
  fastify.put('/:id', {
    schema: {
      tags: ['Giderler'],
      summary: 'Gider kaydını güncelle (Yalnızca dükkan sahibi)'
    }
  }, async (request, reply) => {
    if (request.user!.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Gider kaydını yalnızca dükkan sahibi güncelleyebilir.' });
    }

    const id = Number((request.params as any).id);
    if (!Number.isInteger(id)) {
      return reply.status(400).send({ success: false, error: 'Geçersiz gider kimliği.' });
    }

    const parse = expenseInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz gider verisi.'
      });
    }

    const db = getDb();
    const existing = db.select().from(expenses).where(eq(expenses.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Gider kaydı bulunamadı.' });
    }

    const now = new Date().toISOString();
    const updated = db.update(expenses).set({
      tarih: parse.data.tarih,
      kategori: parse.data.kategori,
      aciklama: parse.data.aciklama,
      tutar_kurus: parse.data.tutar_kurus,
      updated_at: now
    }).where(eq(expenses.id, id)).returning().get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'expense_update',
      hedef_tablo: 'expenses',
      hedef_id: id,
      eski_deger: existing,
      yeni_deger: updated,
      ip_adresi: request.ip,
      detay: `Gider güncellendi: ${updated.kategori} - ${updated.aciklama}`
    });

    return { success: true, expense: updated };
  });

  // Gider sil
  fastify.delete('/:id', {
    schema: {
      tags: ['Giderler'],
      summary: 'Gider kaydını sil (Yalnızca dükkan sahibi)'
    }
  }, async (request, reply) => {
    if (request.user!.role !== 'owner') {
      return reply.status(403).send({ success: false, error: 'Gider kaydını yalnızca dükkan sahibi silebilir.' });
    }

    const id = Number((request.params as any).id);
    if (!Number.isInteger(id)) {
      return reply.status(400).send({ success: false, error: 'Geçersiz gider kimliği.' });
    }

    const db = getDb();
    const existing = db.select().from(expenses).where(eq(expenses.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Gider kaydı bulunamadı.' });
    }

    db.delete(expenses).where(eq(expenses.id, id)).run();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'expense_delete',
      hedef_tablo: 'expenses',
      hedef_id: id,
      eski_deger: existing,
      ip_adresi: request.ip,
      detay: `Gider silindi: ${existing.kategori} - ${existing.aciklama}`
    });

    return { success: true, message: 'Gider silindi.' };
  });
};
