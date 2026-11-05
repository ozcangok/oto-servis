import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import {
  getDb,
  partRequests,
  parts,
  users,
  workOrders,
  vehicles,
  customers
} from '../db/index.js';
import { adjustStock } from '../services/stockService.js';
import { logAudit } from '../services/auditService.js';

const createRequestSchema = z
  .object({
    parca_id: z.number().int().positive().optional().nullable(),
    parca_ad: z.string().max(200).optional().nullable(),
    adet: z.number().int().min(1, 'Adet en az 1 olmalıdır.').max(999).default(1),
    is_emri_id: z.number().int().positive().optional().nullable(),
    notlar: z.string().max(500).optional().nullable()
  })
  .refine((v) => v.parca_id || (v.parca_ad && v.parca_ad.trim().length > 0), {
    message: 'Parça seçilmeli veya parça adı girilmelidir.',
    path: ['parca_ad']
  });

/**
 * Yedek parça talepleri.
 *
 * Personel stokta olmayan/azalan bir parçayı talep eder; dükkan sahibi
 * talebi onayladığında parça stoğa +adet olarak eklenir. Böylece personel
 * doğrudan stok/fiyat verisine erişmeden mevcut stok akışı kullanılır.
 */
export const partRequestRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.get('/', {
    schema: { tags: ['Parça Talepleri'], summary: 'Parça taleplerini listele' }
  }, async (request) => {
    const db = getDb();
    const q = (request.query as any) || {};
    const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
    const durum = q.durum ? String(q.durum) : null;

    const conditions: any[] = [];
    if (request.user!.role !== 'owner') {
      conditions.push(eq(partRequests.talep_eden_id, request.user!.id));
    }
    if (durum) {
      conditions.push(
        eq(partRequests.durum, durum as 'bekliyor' | 'onaylandi' | 'reddedildi')
      );
    }

    const rows = db
      .select({
        request: partRequests,
        part: parts,
        requester: users,
        order: workOrders,
        vehicle: vehicles,
        customer: customers
      })
      .from(partRequests)
      .leftJoin(parts, eq(partRequests.parca_id, parts.id))
      .leftJoin(users, eq(partRequests.talep_eden_id, users.id))
      .leftJoin(workOrders, eq(partRequests.is_emri_id, workOrders.id))
      .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(partRequests.created_at), desc(partRequests.id))
      .limit(limit)
      .all();

    return {
      success: true,
      count: rows.length,
      requests: rows.map(({ request, part, requester, order, vehicle, customer }) => ({
        ...request,
        parca_ad: part?.ad || request.parca_ad,
        parca_kritik_stok: part?.kritik_stok ?? null,
        talep_eden_ad: requester?.full_name ?? null,
        is_emri_durum: order?.durum ?? null,
        plaka: vehicle?.plaka_gorunen ?? null,
        musteri_ad: customer?.ad_soyad ?? null
      }))
    };
  });

  fastify.post('/', {
    schema: { tags: ['Parça Talepleri'], summary: 'Yeni parça talebi oluştur' }
  }, async (request, reply) => {
    const parse = createRequestSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz parça talebi.'
      });
    }

    const db = getDb();
    const { parca_id, adet, is_emri_id, notlar } = parse.data;
    let parcaAd = (parse.data.parca_ad || '').trim();

    if (parca_id) {
      const part = db.select().from(parts).where(eq(parts.id, parca_id)).get();
      if (!part) {
        return reply.status(404).send({ success: false, error: 'Parça bulunamadı.' });
      }
      parcaAd = part.ad;
    }

    if (is_emri_id) {
      const order = db.select().from(workOrders).where(eq(workOrders.id, is_emri_id)).get();
      if (!order) {
        return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
      }
      if (request.user!.role !== 'owner' && order.atanan_kullanici_id !== request.user!.id) {
        return reply.status(403).send({
          success: false,
          error: 'Yalnızca size atanan iş emirleri için parça talep edebilirsiniz.'
        });
      }
    }

    const now = new Date().toISOString();
    const created = db
      .insert(partRequests)
      .values({
        parca_id: parca_id ?? null,
        parca_ad: parcaAd,
        adet,
        is_emri_id: is_emri_id ?? null,
        talep_eden_id: request.user!.id,
        durum: 'bekliyor',
        notlar: notlar || null,
        created_at: now,
        updated_at: now
      })
      .returning()
      .get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'part_request_create',
      hedef_tablo: 'part_requests',
      hedef_id: created.id,
      yeni_deger: created,
      detay: `Parça talebi: ${parcaAd} x${adet}`
    });

    return { success: true, request: created };
  });

  fastify.patch('/:id/onayla', {
    schema: { tags: ['Parça Talepleri'], summary: 'Parça talebini onayla ve stoğa ekle' }
  }, async (request, reply) => {
    if (request.user!.role !== 'owner') {
      return reply.status(403).send({
        success: false,
        error: 'Parça talebini yalnızca dükkan sahibi onaylayabilir.'
      });
    }

    const db = getDb();
    const id = Number((request.params as any).id);
    const existing = db.select().from(partRequests).where(eq(partRequests.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Parça talebi bulunamadı.' });
    }
    if (existing.durum !== 'bekliyor') {
      return reply.status(400).send({ success: false, error: 'Bu talep zaten sonuçlandırılmış.' });
    }

    try {
      if (existing.parca_id) {
        adjustStock(existing.parca_id, existing.adet, 'giris', request.user!.id, {
          notlar: `Parça talebi onayı #${id}`,
          overrideNegativeStock: true
        });
      }

      const updated = db
        .update(partRequests)
        .set({ durum: 'onaylandi', updated_at: new Date().toISOString() })
        .where(eq(partRequests.id, id))
        .returning()
        .get();

      await logAudit({
        kullanici_id: request.user!.id,
        kullanici_adi: request.user!.username,
        islem: 'part_request_approve',
        hedef_tablo: 'part_requests',
        hedef_id: id,
        eski_deger: existing,
        yeni_deger: updated,
        detay: `Parça talebi onaylandı: ${existing.parca_ad} x${existing.adet}`
      });

      return { success: true, request: updated };
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: err?.message || 'Parça talebi onaylanamadı.'
      });
    }
  });

  fastify.patch('/:id/reddet', {
    schema: { tags: ['Parça Talepleri'], summary: 'Parça talebini reddet' }
  }, async (request, reply) => {
    if (request.user!.role !== 'owner') {
      return reply.status(403).send({
        success: false,
        error: 'Parça talebini yalnızca dükkan sahibi reddedebilir.'
      });
    }

    const db = getDb();
    const id = Number((request.params as any).id);
    const existing = db.select().from(partRequests).where(eq(partRequests.id, id)).get();
    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Parça talebi bulunamadı.' });
    }
    if (existing.durum !== 'bekliyor') {
      return reply.status(400).send({ success: false, error: 'Bu talep zaten sonuçlandırılmış.' });
    }

    const updated = db
      .update(partRequests)
      .set({ durum: 'reddedildi', updated_at: new Date().toISOString() })
      .where(eq(partRequests.id, id))
      .returning()
      .get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'part_request_reject',
      hedef_tablo: 'part_requests',
      hedef_id: id,
      eski_deger: existing,
      yeni_deger: updated,
      detay: `Parça talebi reddedildi: ${existing.parca_ad} x${existing.adet}`
    });

    return { success: true, request: updated };
  });
};
