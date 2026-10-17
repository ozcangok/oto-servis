import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull, like, or, desc, sql } from 'drizzle-orm';
import { getDb, getSqlite, customers, vehicles, workOrders, payments, workOrderLines } from '../db/index.js';
import { reverseWorkOrderStock } from '../services/stockService.js';
import { getPesinRate } from '../services/responseCompat.js';
import { logAudit } from '../services/auditService.js';
import type { Customer } from '@oto-servis/shared';
import { calculateWorkOrderTotals } from '@oto-servis/shared';

const customerInputSchema = z.object({
  ad_soyad: z.string().min(2, 'Müşteri adı soyadı en az 2 karakter olmalıdır.'),
  telefon: z.string().min(10, 'Geçerli bir telefon numarası giriniz.'),
  eposta: z.string().email('Geçerli bir e-posta giriniz.').optional().nullable(),
  vergi_no: z.string().optional().nullable(),
  notlar: z.string().optional().nullable()
});

export const customerRoutes: FastifyPluginAsync = async (fastify) => {
  // Authentication check hook
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // List & search customers
  fastify.get('/', {
    schema: {
      tags: ['Müşteriler'],
      summary: 'Müşterileri ara ve listele (sayfalı)'
    }
  }, async (request) => {
    const db = getDb();
    const query = (request.query as any)?.q?.trim();
    const page = Math.max(1, parseInt((request.query as any)?.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((request.query as any)?.limit || '20', 10)));
    const offset = (page - 1) * limit;

    let baseFilter = isNull(customers.deleted_at);

    let whereClause = baseFilter;
    if (query) {
      const searchPattern = `%${query}%`;
      whereClause = and(
        baseFilter,
        or(
          like(customers.ad_soyad, searchPattern),
          like(customers.telefon, searchPattern),
          like(customers.vergi_no, searchPattern)
        )
      )!;
    }

    const totalRow = db
      .select({ count: sql<number>`count(*)` })
      .from(customers)
      .where(whereClause)
      .get();
    const total = totalRow?.count ?? 0;

    const items = db
      .select()
      .from(customers)
      .where(whereClause)
      .orderBy(desc(customers.id))
      .limit(limit)
      .offset(offset)
      .all();

    return {
      success: true,
      items,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
      }
    };
  });

  // Get customer by ID with vehicles
  fastify.get('/:id', {
    schema: {
      tags: ['Müşteriler'],
      summary: 'Müşteri detayını ve araçlarını getir'
    }
  }, async (request, reply) => {
    const db = getDb();
    const id = Number((request.params as any).id);

    const customer = db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deleted_at)))
      .get();

    if (!customer) {
      return reply.status(404).send({ success: false, error: 'Müşteri bulunamadı.' });
    }

    const customerVehicles = db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.musteri_id, id), isNull(vehicles.deleted_at)))
      .all();

    return {
      success: true,
      customer,
      vehicles: customerVehicles
    };
  });

  // Get customer account statement (Cari Hesap Ekstresi)
  fastify.get('/:id/statement', {
    schema: {
      tags: ['Müşteriler'],
      summary: 'Müşteri cari hesap ekstresi ve bakiye özeti'
    }
  }, async (request, reply) => {
    const db = getDb();
    const id = Number((request.params as any).id);

    const customer = db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deleted_at)))
      .get();

    if (!customer) {
      return reply.status(404).send({ success: false, error: 'Müşteri bulunamadı.' });
    }

    const customerVehicles = db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.musteri_id, id), isNull(vehicles.deleted_at)))
      .all();

    const vehicleMap = new Map(customerVehicles.map((v) => [v.id, v]));

    let totalBilledKurus = 0;
    let totalPaidKurus = 0;
    const workOrderSummaries = [];

    // Peşin iskonto oranı TÜM iş emirleri için aynıdır: bir kez okunur.
    // (Önceden her iş emri için ayrı ayrı okunuyordu.)
    const pesinIskontoYuzde = await getPesinRate();

    for (const v of customerVehicles) {
      const orders = db
        .select()
        .from(workOrders)
        .where(and(eq(workOrders.arac_id, v.id), isNull(workOrders.deleted_at)))
        .all();

      for (const o of orders) {
        const lines = db.select().from(workOrderLines).where(eq(workOrderLines.is_emri_id, o.id)).all();
        const orderPayments = db.select().from(payments).where(eq(payments.is_emri_id, o.id)).all();
        const paid = orderPayments.reduce((s, p) => s + p.tutar_kurus, 0);

        const calc = calculateWorkOrderTotals({
          lines: lines.map((l) => ({ adet: l.adet, birim_fiyat_kuruş: l.birim_fiyat_kurus })),
          kdv_orani: o.kdv_orani,
          kdv_dahil_mi: Boolean(o.kdv_dahil_mi),
          iskonto_yuzde: o.iskonto_yuzde,
          iskonto_tutar_kurus: o.iskonto_tutar_kurus,
          pesin_fiyat_elle_kurus: o.pesin_fiyat_elle_kurus,
          pesin_iskonto_yuzde: pesinIskontoYuzde,
          odenen_kurus: paid
        });

        totalBilledKurus += calc.brut_kurus;
        totalPaidKurus += paid;

        workOrderSummaries.push({
          orderId: o.id,
          tarih: o.tarih,
          durum: o.durum,
          km: o.km,
          plaka: v.plaka_gorunen,
          aracModel: `${v.marka} ${v.model}`,
          toplam_kurus: calc.toplam_kurus,
          brut_kurus: calc.brut_kurus,
          pesin_fiyat_kurus: calc.pesin_fiyat_kurus,
          odenen_kurus: paid,
          kalan_kurus: calc.kalan_kurus,
          pesin_kalan_kurus: calc.pesin_kalan_kurus,
          payments: orderPayments
        });
      }
    }

    return {
      success: true,
      customer,
      vehicles: customerVehicles,
      statement: {
        totalBilledKurus,
        totalPaidKurus,
        remainingDebtKurus: Math.max(0, totalBilledKurus - totalPaidKurus),
        workOrders: workOrderSummaries
      }
    };
  });

  // Create customer
  fastify.post('/', {
    schema: {
      tags: ['Müşteriler'],
      summary: 'Yeni müşteri oluştur'
    }
  }, async (request, reply) => {
    const parse = customerInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz müşteri bilgisi.'
      });
    }

    const db = getDb();
    const now = new Date().toISOString();

    const newCustomer = db.insert(customers).values({
      ad_soyad: parse.data.ad_soyad.trim(),
      telefon: parse.data.telefon.trim(),
      eposta: parse.data.eposta?.trim() || null,
      vergi_no: parse.data.vergi_no?.trim() || null,
      notlar: parse.data.notlar?.trim() || null,
      is_sample: false,
      created_at: now,
      updated_at: now
    }).returning().get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'customer_create',
      hedef_tablo: 'customers',
      hedef_id: newCustomer.id,
      yeni_deger: newCustomer,
      detay: `Yeni müşteri eklendi: ${newCustomer.ad_soyad}`
    });

    return { success: true, customer: newCustomer };
  });

  // Update customer
  fastify.put('/:id', {
    schema: {
      tags: ['Müşteriler'],
      summary: 'Müşteri güncelle'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parse = customerInputSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz müşteri bilgisi.'
      });
    }

    const db = getDb();
    const existing = db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Müşteri bulunamadı.' });
    }

    const now = new Date().toISOString();
    const updated = db.update(customers).set({
      ad_soyad: parse.data.ad_soyad.trim(),
      telefon: parse.data.telefon.trim(),
      eposta: parse.data.eposta?.trim() || null,
      vergi_no: parse.data.vergi_no?.trim() || null,
      notlar: parse.data.notlar?.trim() || null,
      updated_at: now
    }).where(eq(customers.id, id)).returning().get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'customer_update',
      hedef_tablo: 'customers',
      hedef_id: id,
      eski_deger: existing,
      yeni_deger: updated,
      detay: `Müşteri güncellendi: ${updated.ad_soyad}`
    });

    return { success: true, customer: updated };
  });

  // Soft delete customer
  fastify.delete('/:id', {
    schema: {
      tags: ['Müşteriler'],
      summary: 'Müşteri sil (Yumuşak silme)'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = getDb();

    const existing = db
      .select()
      .from(customers)
      .where(and(eq(customers.id, id), isNull(customers.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Müşteri bulunamadı.' });
    }

    const now = new Date().toISOString();
    const sqlite = getSqlite();

    // Müşterinin araçları ve onlara bağlı açık iş emirleri de yumuşak
    // silinir (stok iadesiyle), yoksa panoda yetim kayıtlar görünür.
    const customerVehicles = db
      .select({ id: vehicles.id })
      .from(vehicles)
      .where(and(eq(vehicles.musteri_id, id), isNull(vehicles.deleted_at)))
      .all();

    let closedOrders = 0;
    sqlite.transaction(() => {
      for (const v of customerVehicles) {
        const openOrders = db
          .select({ id: workOrders.id })
          .from(workOrders)
          .where(and(eq(workOrders.arac_id, v.id), isNull(workOrders.deleted_at)))
          .all();
        for (const o of openOrders) {
          db.update(workOrders).set({ deleted_at: now, updated_at: now }).where(eq(workOrders.id, o.id)).run();
          reverseWorkOrderStock(o.id, request.user!.id);
          closedOrders++;
        }
        db.update(vehicles).set({ deleted_at: now, updated_at: now }).where(eq(vehicles.id, v.id)).run();
      }
      db.update(customers).set({ deleted_at: now, updated_at: now }).where(eq(customers.id, id)).run();
    })();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'customer_delete',
      hedef_tablo: 'customers',
      hedef_id: id,
      eski_deger: existing,
      detay: `Müşteri silindi: ${existing.ad_soyad} (${customerVehicles.length} araç, ${closedOrders} iş emriyle birlikte)`
    });

    return {
      success: true,
      message: customerVehicles.length > 0 || closedOrders > 0
        ? `Müşteri silindi (${customerVehicles.length} araç ve ${closedOrders} iş emri de kapatılıp parçalar stoğa iade edildi).`
        : 'Müşteri başarıyla silindi.'
    };
  });
};
