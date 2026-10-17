import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull, like, or, desc, sql } from 'drizzle-orm';
import { getDb, parts, stockMovements } from '../db/index.js';
import { getPartStock, adjustStock } from '../services/stockService.js';
import { logAudit } from '../services/auditService.js';
import type { Part } from '@oto-servis/shared';

const partInputSchema = z.object({
  ad: z.string().min(2, 'Parça adı gereklidir.'),
  kod: z.string().min(1, 'Parça kodu gereklidir.'),
  barkod: z.string().optional().nullable(),
  uyumlu_arac: z.string().optional().nullable(),
  muadil: z.string().optional().nullable(),
  // Fiyatlar ve diğer teknik alanlar İSTEĞE BAĞLI: yalnızca stok güncellenirken
  // boş bırakılabilir. Gönderilmezse mevcut değer korunur (güncelleme) veya
  // varsayılana düşülür (oluşturma).
  birim: z.string().optional(),
  kritik_stok: z.number().min(0).optional(),
  alis_kurus: z.number().int().min(0).optional(),
  satis_kurus: z.number().int().min(0).optional(),
  raf: z.string().optional().nullable(),
  aktif: z.boolean().optional(),
  // "Stok adedi": stok, hareketlerden türetilir; bu alan verilirse uygun bir
  // stok hareketi (giriş/düzeltme) otomatik oluşturulur.
  stok_miktari: z.number().min(0).optional()
});

const stockInSchema = z.object({
  miktar: z.number().positive("Gelen miktar 0'dan büyük olmalıdır."),
  yeni_alis_fiyati_kurus: z.number().int().min(0).optional()
});

const stockMovementInputSchema = z.object({
  miktar: z.number().int('Miktar tam sayı olmalıdır.'),
  tur: z.enum(['giris', 'iade', 'duzeltme']),
  notlar: z.string().optional().nullable(),
  override_negative: z.boolean().optional()
});

export const partRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // List & search parts
  fastify.get('/', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Parçaları ara ve listele (ad, kod, barkod, uyumlu araç)'
    }
  }, async (request) => {
    const db = getDb();
    const query = (request.query as any)?.q?.trim();
    const page = Math.max(1, parseInt((request.query as any)?.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((request.query as any)?.limit || '20', 10)));
    const offset = (page - 1) * limit;

    let baseFilter = isNull(parts.deleted_at);

    let whereClause = baseFilter;
    if (query) {
      const p = `%${query}%`;
      whereClause = and(
        baseFilter,
        or(
          like(parts.ad, p),
          like(parts.kod, p),
          like(parts.barkod, p),
          like(parts.uyumlu_arac, p),
          like(parts.muadil, p)
        )
      )!;
    }

    const totalRow = db
      .select({ count: sql<number>`count(*)` })
      .from(parts)
      .where(whereClause)
      .get();
    const total = totalRow?.count ?? 0;

    const items = db
      .select()
      .from(parts)
      .where(whereClause)
      .orderBy(desc(parts.id))
      .limit(limit)
      .offset(offset)
      .all();

    // Enrich with calculated current stock
    const enriched = items.map((p) => {
      const stock = getPartStock(p.id);
      return {
        ...p,
        alis_kurus: p.alis_kurus,
        satis_kurus: p.satis_kurus,
        stok_miktari: stock,
        is_critical: stock <= p.kritik_stok
      };
    });

    return {
      success: true,
      items: enriched,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  });

  // Fast barcode lookup for scanner
  fastify.get('/by-barcode/:barcode', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Barkod ile anında parça sorgulama'
    }
  }, async (request, reply) => {
    const db = getDb();
    const barcode = (request.params as any).barcode?.trim();

    if (!barcode) {
      return reply.status(400).send({ success: false, error: 'Barkod boş olamaz.' });
    }

    const part = db
      .select()
      .from(parts)
      .where(and(eq(parts.barkod, barcode), isNull(parts.deleted_at)))
      .get();

    if (!part) {
      return reply.status(404).send({ success: false, error: 'Bu barkoda ait parça bulunamadı.' });
    }

    const stock = getPartStock(part.id);
    return {
      success: true,
      part: {
        ...part,
        alis_kurus: part.alis_kurus,
        satis_kurus: part.satis_kurus,
        stok_miktari: stock,
        is_critical: stock <= part.kritik_stok
      }
    };
  });

  // Critical stock list
  fastify.get('/critical', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Kritik stok seviyesinin altına inen parçalar'
    }
  }, async (request) => {
    const db = getDb();
    const all = db.select().from(parts).where(isNull(parts.deleted_at)).all();

    const criticalList = [];
    for (const p of all) {
      const stock = getPartStock(p.id);
      if (stock <= p.kritik_stok) {
        criticalList.push({
          ...p,
          alis_kurus: p.alis_kurus,
          satis_kurus: p.satis_kurus,
          stok_miktari: stock,
          is_critical: true
        });
      }
    }

    return { success: true, count: criticalList.length, items: criticalList };
  });

  // Get part by ID with recent stock history
  fastify.get('/:id', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Parça detayı ve stok hareket geçmişi'
    }
  }, async (request, reply) => {
    const db = getDb();
    const id = Number((request.params as any).id);

    const part = db
      .select()
      .from(parts)
      .where(and(eq(parts.id, id), isNull(parts.deleted_at)))
      .get();

    if (!part) {
      return reply.status(404).send({ success: false, error: 'Parça bulunamadı.' });
    }

    const stock = getPartStock(part.id);
    const movements = db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.parca_id, id))
      .orderBy(desc(stockMovements.tarih), desc(stockMovements.id))
      .limit(50)
      .all();

    return {
      success: true,
      part: {
        ...part,
        alis_kurus: part.alis_kurus,
        satis_kurus: part.satis_kurus,
        stok_miktari: stock,
        is_critical: stock <= part.kritik_stok
      },
      movements
    };
  });

  // Create part
  fastify.post('/', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Yeni parça ekle'
    }
  }, async (request, reply) => {
    // Mechanic cannot add prices or create parts unless allowed
    const parse = partInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz parça verisi.'
      });
    }

    const db = getDb();
    const now = new Date().toISOString();

    // Check barcode uniqueness
    if (parse.data.barkod) {
      const existingBarcode = db
        .select()
        .from(parts)
        .where(and(eq(parts.barkod, parse.data.barkod), isNull(parts.deleted_at)))
        .get();
      if (existingBarcode) {
        return reply.status(400).send({
          success: false,
          error: `"${parse.data.barkod}" barkodlu parça zaten mevcut: ${existingBarcode.ad}`
        });
      }
    }

    const newPart = db.insert(parts).values({
      ad: parse.data.ad.trim(),
      kod: parse.data.kod.trim(),
      barkod: parse.data.barkod?.trim() || null,
      uyumlu_arac: parse.data.uyumlu_arac?.trim() || null,
      muadil: parse.data.muadil?.trim() || null,
      birim: parse.data.birim || 'Adet',
      kritik_stok: parse.data.kritik_stok ?? 3,
      alis_kurus: parse.data.alis_kurus ?? 0,
      satis_kurus: parse.data.satis_kurus ?? 0,
      raf: parse.data.raf?.trim() || null,
      aktif: parse.data.aktif ?? true,
      is_sample: false,
      created_at: now,
      updated_at: now
    }).returning().get();

    // Başlangıç stok adedi verilmişse, stok hareketiyle (giriş) oluştur.
    if (parse.data.stok_miktari && parse.data.stok_miktari > 0) {
      adjustStock(newPart.id, parse.data.stok_miktari, 'giris', request.user!.id, {
        notlar: 'Parça oluşturulurken girilen başlangıç stoğu',
        overrideNegativeStock: true,
        ipAddress: request.ip
      });
    }

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'part_create',
      hedef_tablo: 'parts',
      hedef_id: newPart.id,
      yeni_deger: newPart,
      detay: `Yeni parça eklendi: ${newPart.ad} (${newPart.kod})`
    });

    return { success: true, part: { ...newPart, stok_miktari: getPartStock(newPart.id) } };
  });

  // Update part
  fastify.put('/:id', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Parça güncelle'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parse = partInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz parça verisi.'
      });
    }

    const db = getDb();
    const existing = db
      .select()
      .from(parts)
      .where(and(eq(parts.id, id), isNull(parts.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Parça bulunamadı.' });
    }

    // Check barcode uniqueness
    if (parse.data.barkod && parse.data.barkod !== existing.barkod) {
      const duplicateBarcode = db
        .select()
        .from(parts)
        .where(and(eq(parts.barkod, parse.data.barkod), isNull(parts.deleted_at)))
        .get();
      if (duplicateBarcode) {
        return reply.status(400).send({
          success: false,
          error: `"${parse.data.barkod}" barkodlu başka bir parça zaten mevcut.`
        });
      }
    }

    const now = new Date().toISOString();
    const updated = db.update(parts).set({
      ad: parse.data.ad.trim(),
      kod: parse.data.kod.trim(),
      barkod: parse.data.barkod?.trim() || null,
      uyumlu_arac: parse.data.uyumlu_arac?.trim() || null,
      muadil: parse.data.muadil?.trim() || null,
      // Gönderilmeyen alanlar mevcut değerini KORUR (kısmi güncelleme güvenli).
      birim: parse.data.birim || existing.birim,
      kritik_stok: parse.data.kritik_stok ?? existing.kritik_stok,
      alis_kurus: parse.data.alis_kurus ?? existing.alis_kurus,
      satis_kurus: parse.data.satis_kurus ?? existing.satis_kurus,
      raf: parse.data.raf?.trim() || null,
      aktif: parse.data.aktif ?? existing.aktif,
      updated_at: now
    }).where(eq(parts.id, id)).returning().get();

    // Stok adedi verilmişse, stok hareketleriyle istenen değere getir.
    // (Stok, stok hareketlerinden türetilir; bu yüzden "düzeltme" hareketi eklenir.)
    if (parse.data.stok_miktari !== undefined) {
      const currentStock = getPartStock(id);
      const delta = parse.data.stok_miktari - currentStock;
      if (delta !== 0) {
        adjustStock(id, delta, 'duzeltme', request.user!.id, {
          notlar: `Parça düzenlenirken stok düzeltmesi (${currentStock} → ${parse.data.stok_miktari})`,
          overrideNegativeStock: request.user!.role === 'owner',
          ipAddress: request.ip
        });
      }
    }

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'part_update',
      hedef_tablo: 'parts',
      hedef_id: id,
      eski_deger: existing,
      yeni_deger: updated,
      detay: `Parça güncellendi: ${updated.ad}`
    });

    return { success: true, part: { ...updated, stok_miktari: getPartStock(id) } };
  });

  // Manual stock movement (giriş, sayım düzeltme, iade)
  fastify.post('/:id/stock-movement', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Manuel stok hareketi ekle (giriş, düzeltme/sayım, iade)'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parse = stockMovementInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz stok hareketi.'
      });
    }

    try {
      const result = adjustStock(
        id,
        parse.data.miktar,
        parse.data.tur,
        request.user!.id,
        {
          notlar: parse.data.notlar || undefined,
          // Negatif stok yalnızca dükkan sahibine açıktır; personel istek
          // gövdesindeki bayrakla bu korumayı aşamaz.
          overrideNegativeStock: request.user!.role === 'owner',
          ipAddress: request.ip
        }
      );

      return {
        success: true,
        message: 'Stok hareketi başarıyla işlendi.',
        result
      };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Stock in (depo girişi): stoğu artırır, istenirse alış fiyatını günceller
  fastify.post('/:id/stock-in', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Stok girişi yap (ve isteğe bağlı yeni alış fiyatı)'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parse = stockInSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz stok girişi.'
      });
    }

    const db = getDb();
    const existing = db
      .select()
      .from(parts)
      .where(and(eq(parts.id, id), isNull(parts.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Parça bulunamadı.' });
    }

    try {
      const result = adjustStock(id, parse.data.miktar, 'giris', request.user!.id, {
        notlar: 'Depo girişi',
        overrideNegativeStock: true,
        ipAddress: request.ip
      });

      if (parse.data.yeni_alis_fiyati_kurus !== undefined) {
        db.update(parts)
          .set({ alis_kurus: parse.data.yeni_alis_fiyati_kurus, updated_at: new Date().toISOString() })
          .where(eq(parts.id, id))
          .run();
      }

      return { success: true, message: 'Stoğa eklendi.', result, stok_miktari: getPartStock(id) };
    } catch (err: any) {
      return reply.status(400).send({ success: false, error: err.message });
    }
  });

  // Soft delete part
  fastify.delete('/:id', {
    schema: {
      tags: ['Yedek Parça'],
      summary: 'Parçayı sil (Yumuşak silme)'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = getDb();

    const existing = db
      .select()
      .from(parts)
      .where(and(eq(parts.id, id), isNull(parts.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Parça bulunamadı.' });
    }

    const now = new Date().toISOString();
    db.update(parts).set({ deleted_at: now, updated_at: now }).where(eq(parts.id, id)).run();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'part_delete',
      hedef_tablo: 'parts',
      hedef_id: id,
      eski_deger: existing,
      detay: `Parça silindi: ${existing.ad}`
    });

    return { success: true, message: 'Parça silindi.' };
  });
};
