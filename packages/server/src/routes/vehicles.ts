import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull, isNotNull, like, or, desc, sql } from 'drizzle-orm';
import { getDb, getSqlite, vehicles, customers, workOrders, workOrderLines, payments, photos } from '../db/index.js';
import { reverseWorkOrderStock } from '../services/stockService.js';
import { normalizePlate, formatPlateDisplay, calculateWorkOrderTotals } from '@oto-servis/shared';
import { logAudit } from '../services/auditService.js';
import { withVehicleAliases, withOrderAliases, flattenOrderContext, getPesinRate } from '../services/responseCompat.js';
import { reqDb, reqSqlite, reqCtx } from '../tenantContext.js';

const vehicleInputSchema = z.object({
  musteri_id: z.number().int().positive().optional().nullable(),
  musteri_ad_soyad: z.string().optional().nullable(),
  musteri_ad: z.string().optional().nullable(), // eski istemcilerle uyumluluk takma adı
  musteri_telefon: z.string().optional().nullable(),
  musteri_eposta: z.string().optional().nullable(),
  plaka: z.string().min(2, 'Geçerli bir plaka giriniz.'),
  marka: z.string().min(1, 'Araç markası gereklidir.'),
  model: z.string().min(1, 'Araç modeli gereklidir.'),
  yil: z.number().int().min(1950).max(2100).optional().nullable(),
  sasi_no: z.string().optional().nullable(),
  motor_kodu: z.string().optional().nullable(),
  muayene_tarihi: z.string().optional().nullable(),
  notlar: z.string().optional().nullable()
});

// Güncelleme (PUT) için kısmi şema: plaka/marka/model gönderilmezse mevcut değer korunur
const vehicleUpdateSchema = vehicleInputSchema.extend({
  plaka: z.string().min(2, 'Geçerli bir plaka giriniz.').optional().nullable(),
  marka: z.string().min(1, 'Araç markası gereklidir.').optional().nullable(),
  model: z.string().min(1, 'Araç modeli gereklidir.').optional().nullable()
});

/**
 * Eski istemci sürümleri müşteri adını `musteri_ad` alanıyla gönderir.
 * Önbellekte kalmış arayüzlerin de kayıt yapabilmesi için takma adı
 * `musteri_ad_soyad` alanına taşır.
 */
function applyCustomerAlias<T>(input: T): T {
  if (input && typeof input === 'object' && !Array.isArray(input)) {
    const hasNew = typeof (input as any).musteri_ad_soyad === 'string' && (input as any).musteri_ad_soyad.trim() !== '';
    if (!hasNew && typeof (input as any).musteri_ad === 'string') {
      return { ...input, musteri_ad_soyad: (input as any).musteri_ad };
    }
  }
  return input;
}

export const vehicleRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // Search vehicles (by plate, customer name, phone, VIN, make/model)
  fastify.get('/search', {
    schema: {
      tags: ['Araçlar'],
      summary: 'Araçları plaka, müşteri, telefon, şasi veya model ile ara'
    }
  }, async (request) => {
    const db = reqDb(request);
    const query = (request.query as any)?.q?.trim() || '';
    const page = Math.max(1, parseInt((request.query as any)?.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((request.query as any)?.limit || '20', 10)));
    const offset = (page - 1) * limit;

    const normQ = normalizePlate(query);
    const searchPattern = `%${query}%`;
    const normPattern = `%${normQ}%`;

    // Join vehicles with customers
    let whereCondition = isNull(vehicles.deleted_at);

    if (query) {
      whereCondition = and(
        isNull(vehicles.deleted_at),
        or(
          like(vehicles.plaka_norm, normPattern),
          like(vehicles.marka, searchPattern),
          like(vehicles.model, searchPattern),
          like(vehicles.sasi_no, searchPattern),
          like(customers.ad_soyad, searchPattern),
          like(customers.telefon, searchPattern)
        )
      )!;
    }

    const totalRow = db
      .select({ count: sql<number>`count(*)` })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(whereCondition)
      .get();
    const total = totalRow?.count ?? 0;

    const rows = db
      .select({
        vehicle: vehicles,
        customer: customers
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(whereCondition)
      .orderBy(desc(vehicles.id))
      .limit(limit)
      .offset(offset)
      .all();

    const items = rows.map((r) => ({
      ...withVehicleAliases(r.vehicle),
      musteri: r.customer
    }));

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

  // Exact search by license plate with complete vehicle history and financial summary
  fastify.get('/by-plate/:plate', {
    schema: {
      tags: ['Araçlar'],
      summary: 'Plaka ile araç sorgulama ve geçmiş servis dökümü'
    }
  }, async (request, reply) => {
    const db = reqDb(request);
    const rawPlate = (request.params as any).plate;
    const normPlate = normalizePlate(rawPlate);

    if (!normPlate) {
      return reply.status(400).send({ success: false, error: 'Geçersiz plaka formatı.' });
    }

    const row = db
      .select({
        vehicle: vehicles,
        customer: customers
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(and(eq(vehicles.plaka_norm, normPlate), isNull(vehicles.deleted_at)))
      .get();

    if (!row) {
      return reply.status(404).send({
        success: false,
        error: `"${formatPlateDisplay(normPlate)}" plakalı araç sistemde kayıtlı değil.`
      });
    }

    // Get all past work orders for this vehicle (ordered newest first)
    const orders = db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.arac_id, row.vehicle.id), isNull(workOrders.deleted_at)))
      .orderBy(desc(workOrders.tarih), desc(workOrders.id))
      .all();

    let grandTotalGrossKurus = 0;
    let grandTotalCashPriceKurus = 0;
    let grandTotalPaidKurus = 0;
    const pesinRate = await getPesinRate(undefined, reqCtx(request));

    const enrichedOrders = orders.map((order) => {
      // Lines
      const lines = db
        .select()
        .from(workOrderLines)
        .where(eq(workOrderLines.is_emri_id, order.id))
        .all();

      // Payments
      const orderPayments = db
        .select()
        .from(payments)
        .where(eq(payments.is_emri_id, order.id))
        .all();

      // Photos
      const orderPhotos = db
        .select()
        .from(photos)
        .where(eq(photos.is_emri_id, order.id))
        .all();

      const totalPaid = orderPayments.reduce((sum, p) => sum + p.tutar_kurus, 0);

      const calc = calculateWorkOrderTotals({
        lines: lines.map((l) => ({ adet: l.adet, birim_fiyat_kuruş: l.birim_fiyat_kurus })),
        kdv_orani: order.kdv_orani,
        kdv_dahil_mi: Boolean(order.kdv_dahil_mi),
        iskonto_yuzde: order.iskonto_yuzde,
        iskonto_tutar_kurus: order.iskonto_tutar_kurus,
        pesin_fiyat_elle_kurus: order.pesin_fiyat_elle_kurus,
        pesin_iskonto_yuzde: pesinRate,
        odenen_kurus: totalPaid
      });

      grandTotalGrossKurus += calc.brut_kurus;
      grandTotalCashPriceKurus += calc.pesin_fiyat_kurus;
      grandTotalPaidKurus += totalPaid;

      return {
        ...order,
        kalemler: lines,
        odemeler: orderPayments,
        fotograflar: orderPhotos,
        toplam_kurus: calc.toplam_kurus,
        net_kurus: calc.net_kurus,
        kdv_tutar_kurus: calc.kdv_tutar_kurus,
        iskonto_kurus: calc.iskonto_kurus ?? 0,
        brut_kurus: calc.brut_kurus,
        pesin_fiyat_kurus: calc.pesin_fiyat_kurus,
        odenen_kurus: calc.odenen_kurus,
        kalan_kurus: calc.kalan_kurus
      };
    });

    return {
      success: true,
      vehicle: {
        ...withVehicleAliases(row.vehicle),
        musteri: row.customer
      },
      customer: row.customer,
      workOrders: enrichedOrders,
      history: enrichedOrders.map((order) =>
        withOrderAliases(order, flattenOrderContext(row.vehicle, row.customer))
      ),
      summary: {
        totalWorkOrders: enrichedOrders.length,
        grandTotalGrossKurus,
        grandTotalCashPriceKurus,
        grandTotalPaidKurus,
        grandTotalRemainingKurus: Math.max(0, grandTotalGrossKurus - grandTotalPaidKurus)
      }
    };
  });

  // Get vehicle by ID
  fastify.get('/:id', {
    schema: {
      tags: ['Araçlar'],
      summary: 'Araç detayını getir'
    }
  }, async (request, reply) => {
    const db = reqDb(request);
    const id = Number((request.params as any).id);

    const row = db
      .select({
        vehicle: vehicles,
        customer: customers
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(and(eq(vehicles.id, id), isNull(vehicles.deleted_at)))
      .get();

    if (!row) {
      return reply.status(404).send({ success: false, error: 'Araç bulunamadı.' });
    }

    return {
      success: true,
      vehicle: {
        ...withVehicleAliases(row.vehicle),
        musteri: row.customer
      }
    };
  });

  // Create vehicle
  fastify.post('/', {
    schema: {
      tags: ['Araçlar'],
      summary: 'Yeni araç kaydı ekle'
    }
  }, async (request, reply) => {
    const parse = vehicleInputSchema.safeParse(applyCustomerAlias(request.body));
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz araç bilgisi.'
      });
    }

    const norm = normalizePlate(parse.data.plaka);
    const display = formatPlateDisplay(norm);

    if (!norm) {
      return reply.status(400).send({ success: false, error: 'Geçerli bir plaka giriniz.' });
    }

    const db = reqDb(request);

    // Check if plate already exists and not deleted
    const existing = db
      .select({
        vehicle: vehicles,
        customer: customers
      })
      .from(vehicles)
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(and(eq(vehicles.plaka_norm, norm), isNull(vehicles.deleted_at)))
      .get();

    if (existing) {
      return reply.send({
        success: true,
        vehicle: {
          ...withVehicleAliases(existing.vehicle),
          musteri: existing.customer
        },
        message: `"${display}" plakalı araç sistemde zaten kayıtlı, mevcut araç seçildi.`
      });
    }

    const now = new Date().toISOString();
    let finalMusteriId = parse.data.musteri_id;

    if (!finalMusteriId) {
      const adSoyad = parse.data.musteri_ad_soyad?.trim();
      const telefon = parse.data.musteri_telefon?.trim();

      if (!adSoyad) {
        return reply.status(400).send({
          success: false,
          error: 'Lütfen müşteri adı ve soyadı giriniz veya kayıtlı bir müşteri seçiniz.'
        });
      }

      // Check if a customer with the same phone already exists
      let matchedCust: any = null;
      if (telefon && telefon.length >= 7) {
        matchedCust = db
          .select()
          .from(customers)
          .where(and(eq(customers.telefon, telefon), isNull(customers.deleted_at)))
          .get();
      }

      if (matchedCust) {
        finalMusteriId = matchedCust.id;
      } else {
        const newCust = db.insert(customers).values({
          ad_soyad: adSoyad,
          telefon: telefon || '0500 000 00 00',
          eposta: parse.data.musteri_eposta?.trim() || null,
          is_sample: false,
          created_at: now,
          updated_at: now
        }).returning().get();
        finalMusteriId = newCust.id;
      }
    }

    if (!finalMusteriId) {
      return reply.status(400).send({
        success: false,
        error: 'Müşteri kaydı oluşturulamadı veya seçilemedi.'
      });
    }

    const musteriId: number = finalMusteriId;

    // Aynı plaka daha önce silinmişse (yumuşak silme): yeni kayıt yerine
    // silinmiş kaydı geri getir, yoksa UNIQUE(plaka_norm) çakışması olur.
    const deletedDup = db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.plaka_norm, norm), isNotNull(vehicles.deleted_at)))
      .get();

    if (deletedDup) {
      const restored = db.update(vehicles).set({
        musteri_id: musteriId,
        plaka_gorunen: display,
        marka: parse.data.marka.trim(),
        model: parse.data.model.trim(),
        yil: parse.data.yil || null,
        sasi_no: parse.data.sasi_no?.trim() || null,
        motor_kodu: parse.data.motor_kodu?.trim() || null,
        muayene_tarihi: parse.data.muayene_tarihi || null,
        notlar: parse.data.notlar?.trim() || null,
        is_sample: false,
        deleted_at: null,
        updated_at: now
      }).where(eq(vehicles.id, deletedDup.id)).returning().get();

      const restoredCustomer = db.select().from(customers).where(eq(customers.id, musteriId)).get();

      await logAudit({
        kullanici_id: request.user!.id,
        kullanici_adi: request.user!.username,
        islem: 'work_order_create',
        hedef_tablo: 'vehicles',
        hedef_id: restored.id,
        yeni_deger: restored,
        detay: `Silinmiş araç kaydı geri getirildi: ${restored.plaka_gorunen}`
      }, reqCtx(request));

      return {
        success: true,
        vehicle: {
          ...withVehicleAliases(restored),
          musteri: restoredCustomer
        },
        message: `"${display}" plakası daha önce silinmiş, kaydı geri getirildi.`
      };
    }

    let newVehicle;
    try {
      newVehicle = db.insert(vehicles).values({
        musteri_id: musteriId,
        plaka_norm: norm,
        plaka_gorunen: display,
        marka: parse.data.marka.trim(),
        model: parse.data.model.trim(),
        yil: parse.data.yil || null,
        sasi_no: parse.data.sasi_no?.trim() || null,
        motor_kodu: parse.data.motor_kodu?.trim() || null,
        muayene_tarihi: parse.data.muayene_tarihi || null,
        notlar: parse.data.notlar?.trim() || null,
        is_sample: false,
        created_at: now,
        updated_at: now
      }).returning().get();
    } catch (err: any) {
      return reply.status(400).send({
        success: false,
        error: `"${display}" plakalı bir araç zaten kayıtlı. Plakayı kontrol edip tekrar deneyin.`
      });
    }

    const customerObj = db.select().from(customers).where(eq(customers.id, musteriId)).get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'work_order_create',
      hedef_tablo: 'vehicles',
      hedef_id: newVehicle.id,
      yeni_deger: newVehicle,
      detay: `Yeni araç kaydedildi: ${newVehicle.plaka_gorunen}`
    }, reqCtx(request));

    return {
      success: true,
      vehicle: {
        ...withVehicleAliases(newVehicle),
        musteri: customerObj
      }
    };
  });

  // Update vehicle
  fastify.put('/:id', {
    schema: {
      tags: ['Araçlar'],
      summary: 'Araç bilgisi güncelle'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parse = vehicleUpdateSchema.safeParse(applyCustomerAlias(request.body));
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz araç bilgisi.'
      });
    }

    const db = reqDb(request);
    const existing = db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), isNull(vehicles.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Araç bulunamadı.' });
    }

    const norm = parse.data.plaka ? normalizePlate(parse.data.plaka) : existing.plaka_norm;
    const display = parse.data.plaka ? formatPlateDisplay(norm) : existing.plaka_gorunen;
    const marka = parse.data.marka?.trim() || existing.marka;
    const model = parse.data.model?.trim() || existing.model;

    // If plate changed, check uniqueness (including soft-deleted rows,
    // since UNIQUE(plaka_norm) covers them too)
    if (norm !== existing.plaka_norm) {
      const duplicate = db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.plaka_norm, norm), isNull(vehicles.deleted_at)))
        .get();

      if (duplicate) {
        return reply.status(400).send({
          success: false,
          error: `"${display}" plakalı başka bir araç zaten mevcut.`
        });
      }

      const deletedHolder = db
        .select()
        .from(vehicles)
        .where(and(eq(vehicles.plaka_norm, norm), isNotNull(vehicles.deleted_at)))
        .get();

      if (deletedHolder) {
        return reply.status(400).send({
          success: false,
          error: `"${display}" plakası silinmiş bir kayda ait. Bu plakayı kullanmak için "Yeni araç" ile yeniden kaydedin, kaydı geri getirilir.`
        });
      }
    }

    const now = new Date().toISOString();
    const targetMusteriId = parse.data.musteri_id || existing.musteri_id;

    // Update linked customer name/phone when provided (e.g. from "Araç bilgisi" modal)
    if (targetMusteriId && (parse.data.musteri_ad_soyad?.trim() || parse.data.musteri_telefon?.trim())) {
      const linkedCustomer = db
        .select()
        .from(customers)
        .where(and(eq(customers.id, targetMusteriId), isNull(customers.deleted_at)))
        .get();

      if (linkedCustomer) {
        db.update(customers).set({
          ...(parse.data.musteri_ad_soyad?.trim() ? { ad_soyad: parse.data.musteri_ad_soyad.trim() } : {}),
          ...(parse.data.musteri_telefon?.trim() ? { telefon: parse.data.musteri_telefon.trim() } : {}),
          updated_at: now
        }).where(eq(customers.id, targetMusteriId)).run();
      }
    }

    const updated = db.update(vehicles).set({
      ...(parse.data.musteri_id ? { musteri_id: parse.data.musteri_id } : {}),
      plaka_norm: norm,
      plaka_gorunen: display,
      marka,
      model,
      yil: parse.data.yil || null,
      sasi_no: parse.data.sasi_no?.trim() || null,
      motor_kodu: parse.data.motor_kodu?.trim() || null,
      muayene_tarihi: parse.data.muayene_tarihi || null,
      notlar: parse.data.notlar?.trim() || null,
      updated_at: now
    }).where(eq(vehicles.id, id)).returning().get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'settings_update',
      hedef_tablo: 'vehicles',
      hedef_id: id,
      eski_deger: existing,
      yeni_deger: updated,
      detay: `Araç güncellendi: ${updated.plaka_gorunen}`
    }, reqCtx(request));

    return { success: true, vehicle: withVehicleAliases(updated) };
  });

  // Soft delete vehicle
  fastify.delete('/:id', {
    schema: {
      tags: ['Araçlar'],
      summary: 'Araç sil (Yumuşak silme)'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = reqDb(request);

    const existing = db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, id), isNull(vehicles.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'Araç bulunamadı.' });
    }

    const now = new Date().toISOString();
    const sqlite = reqSqlite(request);

    // Araca bağlı açık iş emirleri de yumuşak silinir (stok iadesiyle),
    // yoksa panoda ve cari hesapta yetim kayıtlar görünür.
    const openOrders = db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(and(eq(workOrders.arac_id, id), isNull(workOrders.deleted_at)))
      .all();

    sqlite.transaction(() => {
      db.update(vehicles).set({ deleted_at: now, updated_at: now }).where(eq(vehicles.id, id)).run();
      for (const o of openOrders) {
        db.update(workOrders).set({ deleted_at: now, updated_at: now }).where(eq(workOrders.id, o.id)).run();
        reverseWorkOrderStock(o.id, request.user!.id, reqCtx(request));
      }
    })();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'work_order_delete',
      hedef_tablo: 'vehicles',
      hedef_id: id,
      eski_deger: existing,
      detay: `Araç silindi: ${existing.plaka_gorunen} (${openOrders.length} bağlı iş emriyle birlikte)`
    }, reqCtx(request));

    return {
      success: true,
      message: openOrders.length > 0
        ? `Araç silindi (${openOrders.length} bağlı iş emri de kapatılıp parçalar stoğa iade edildi).`
        : 'Araç silindi.'
    };
  });
};
