import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { eq, and, isNull, desc, sql, inArray, like } from 'drizzle-orm';
import path from 'path';
import fs from 'fs';
import {
  getDb,
  getSqlite,
  workOrders,
  workOrderLines,
  vehicles,
  customers,
  payments,
  photos,
  users,
  parts
} from '../db/index.js';
import { withVehicleAliases, withOrderAliases, flattenOrderContext, normalizePaymentMethod, getPesinRate } from '../services/responseCompat.js';
import {
  applyWorkOrderStockDelta,
  reverseWorkOrderStock
} from '../services/stockService.js';
import { logAudit } from '../services/auditService.js';
import { recordStatusNotification } from '../services/whatsappService.js';
import { calculateWorkOrderTotals } from '@oto-servis/shared';
import type { WorkOrderStatus, LineType, PaymentMethod } from '@oto-servis/shared';

const lineItemSchema = z.object({
  id: z.number().optional(),
  tur: z.enum(['parca', 'iscilik']),
  parca_id: z.number().int().optional().nullable(),
  ad: z.string().min(1, 'Kalem adı boş olamaz.'),
  adet: z.number().int().min(1, 'Adet en az 1 olmalıdır.').default(1),
  birim: z.string().default('Adet'),
  birim_fiyat_kurus: z.number().int().min(0, 'Fiyat negatif olamaz.').default(0)
});

const workOrderCreateSchema = z.object({
  arac_id: z.number().int().positive('Araç seçimi zorunludur.'),
  km: z.number().int().min(0).default(0),
  kilometre: z.number().int().min(0).optional().nullable(), // istemci takma adı
  giris_tarihi: z.string().optional().nullable(), // istemci takma adı (tarih)
  durum: z.enum(['kabul', 'onarimda', 'teslime_hazir', 'teslim_edildi']).default('kabul'),
  sikayet: z.string().min(1, 'Müşteri şikayeti/talep giriniz.'),
  kdv_orani: z.number().int().min(0).max(100).default(20),
  kdv_dahil_mi: z.boolean().default(false),
  iskonto_yuzde: z.number().int().min(0).max(100).default(0),
  iskonto_tutar_kurus: z.number().int().min(0).default(0),
  pesin_iskonto_yuzde: z.number().min(0).max(100).optional().nullable(),
  pesin_fiyat_elle_kurus: z.number().int().min(0).optional().nullable(),
  sonraki_bakim_tarihi: z.string().optional().nullable(),
  sonraki_bakim_km: z.number().int().min(0).optional().nullable(),
  kalemler: z.array(lineItemSchema).default([]),
  override_negative_stock: z.boolean().optional()
});

export const workOrderRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('preHandler', async (request, reply) => {
    if (!request.user) {
      return reply.status(401).send({ success: false, error: 'Oturum açmanız gerekmektedir.' });
    }
  });

  // List work orders (with filtering and pagination)
  fastify.get('/', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'İş emirlerini listele ve filtrele'
    }
  }, async (request) => {
    const db = getDb();
    const status = (request.query as any)?.durum as WorkOrderStatus | undefined;
    const query = (request.query as any)?.q?.trim();
    const page = Math.max(1, parseInt((request.query as any)?.page || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((request.query as any)?.limit || '20', 10)));
    const offset = (page - 1) * limit;

    let baseFilter = isNull(workOrders.deleted_at);

    const conditions = [baseFilter];
    if (status) {
      conditions.push(eq(workOrders.durum, status));
    }

    const whereClause = and(...conditions)!;

    const totalRow = db
      .select({ count: sql<number>`count(*)` })
      .from(workOrders)
      .where(whereClause)
      .get();
    const total = totalRow?.count ?? 0;

    const orders = db
      .select({
        workOrder: workOrders,
        vehicle: vehicles,
        customer: customers
      })
      .from(workOrders)
      .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .where(whereClause)
      .orderBy(desc(workOrders.tarih), desc(workOrders.id))
      .limit(limit)
      .offset(offset)
      .all();

    const pesinRate = await getPesinRate();

    const items = orders.map(({ workOrder, vehicle, customer }) => {
      // Get lines
      const lines = db
        .select()
        .from(workOrderLines)
        .where(eq(workOrderLines.is_emri_id, workOrder.id))
        .all();

      // Get payments
      const orderPayments = db
        .select()
        .from(payments)
        .where(eq(payments.is_emri_id, workOrder.id))
        .all();

      const totalPaid = orderPayments.reduce((s, p) => s + p.tutar_kurus, 0);

      // Bu ay toplam işçilik bedeli için: işçilik kalemleri toplamı
      const iscilikToplamKurus = lines
        .filter((l) => l.tur === 'iscilik')
        .reduce((s, l) => s + (Number(l.adet) || 0) * (l.birim_fiyat_kurus || 0), 0);

      const calc = calculateWorkOrderTotals({
        lines: lines.map((l) => ({ adet: l.adet, birim_fiyat_kuruş: l.birim_fiyat_kurus })),
        kdv_orani: workOrder.kdv_orani,
        kdv_dahil_mi: Boolean(workOrder.kdv_dahil_mi),
        iskonto_yuzde: workOrder.iskonto_yuzde,
        iskonto_tutar_kurus: workOrder.iskonto_tutar_kurus,
        pesin_fiyat_elle_kurus: workOrder.pesin_fiyat_elle_kurus,
        pesin_iskonto_yuzde: pesinRate,
        odenen_kurus: totalPaid
      });

      return withOrderAliases(
        {
          ...workOrder,
          arac: vehicle ? { ...withVehicleAliases(vehicle), musteri: customer } : undefined,
          kalem_sayisi: lines.length,
          toplam_kurus: calc.toplam_kurus,
          net_kurus: calc.net_kurus,
          kdv_tutar_kurus: calc.kdv_tutar_kurus,
          iskonto_kurus: calc.iskonto_kurus,
          brut_kurus: calc.brut_kurus,
          pesin_fiyat_kurus: calc.pesin_fiyat_kurus,
          odenen_kurus: totalPaid,
          kalan_kurus: calc.kalan_kurus,
          iscilik_toplam_kurus: iscilikToplamKurus
        },
        flattenOrderContext(vehicle, customer)
      );
    });

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

  // Get full work order details
  fastify.get('/:id', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'İş emri detayını, kalemlerini, ödemelerini ve fotoğraflarını getir'
    }
  }, async (request, reply) => {
    const db = getDb();
    const id = Number((request.params as any).id);

    const row = db
      .select({
        workOrder: workOrders,
        vehicle: vehicles,
        customer: customers,
        creator: users
      })
      .from(workOrders)
      .leftJoin(vehicles, eq(workOrders.arac_id, vehicles.id))
      .leftJoin(customers, eq(vehicles.musteri_id, customers.id))
      .leftJoin(users, eq(workOrders.olusturan_kullanici_id, users.id))
      .where(and(eq(workOrders.id, id), isNull(workOrders.deleted_at)))
      .get();

    if (!row) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const lines = db
      .select()
      .from(workOrderLines)
      .where(eq(workOrderLines.is_emri_id, id))
      .all();

    const orderPayments = db
      .select({
        payment: payments,
        user: users
      })
      .from(payments)
      .leftJoin(users, eq(payments.kullanici_id, users.id))
      .where(eq(payments.is_emri_id, id))
      .all()
      .map((p) => ({
        ...p.payment,
        kullanici: p.user ? { id: p.user.id, full_name: p.user.full_name } : undefined
      }));

    const orderPhotos = db.select().from(photos).where(eq(photos.is_emri_id, id)).all();

    const totalPaid = orderPayments.reduce((s, p) => s + p.tutar_kurus, 0);
    const pesinRate = await getPesinRate();

    const calc = calculateWorkOrderTotals({
      lines: lines.map((l) => ({ adet: l.adet, birim_fiyat_kuruş: l.birim_fiyat_kurus })),
      kdv_orani: row.workOrder.kdv_orani,
      kdv_dahil_mi: Boolean(row.workOrder.kdv_dahil_mi),
      iskonto_yuzde: row.workOrder.iskonto_yuzde,
      iskonto_tutar_kurus: row.workOrder.iskonto_tutar_kurus,
      pesin_fiyat_elle_kurus: row.workOrder.pesin_fiyat_elle_kurus,
      pesin_iskonto_yuzde: pesinRate,
      odenen_kurus: totalPaid
    });

    const safeLines = lines;

    return {
      success: true,
      workOrder: withOrderAliases(
        {
          ...row.workOrder,
          arac: row.vehicle ? { ...withVehicleAliases(row.vehicle), musteri: row.customer } : undefined,
          olusturan: row.creator ? { id: row.creator.id, full_name: row.creator.full_name, username: row.creator.username } : undefined,
          kalemler: safeLines,
          odemeler: orderPayments,
          fotograflar: orderPhotos,
          toplam_kurus: calc.toplam_kurus,
          iskonto_kurus: calc.iskonto_kurus,
          net_kurus: calc.net_kurus,
          kdv_tutar_kurus: calc.kdv_tutar_kurus,
          brut_kurus: calc.brut_kurus,
          pesin_fiyat_kurus: calc.pesin_fiyat_kurus,
          odenen_kurus: totalPaid,
          kalan_kurus: calc.kalan_kurus,
          pesin_kalan_kurus: calc.pesin_kalan_kurus
        },
        flattenOrderContext(row.vehicle, row.customer)
      )
    };
  });

  // Create work order
  fastify.post('/', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'Yeni iş emri oluştur'
    }
  }, async (request, reply) => {
    const parse = workOrderCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz iş emri verisi.'
      });
    }

    const db = getDb();
    const sqlite = getSqlite();

    const vehicle = db
      .select()
      .from(vehicles)
      .where(and(eq(vehicles.id, parse.data.arac_id), isNull(vehicles.deleted_at)))
      .get();

    if (!vehicle) {
      return reply.status(404).send({ success: false, error: 'Araç bulunamadı.' });
    }

    const now = new Date().toISOString();
    let warnings: string[] = [];

    let result: any;
    try {
      result = sqlite.transaction(() => {
      // 1. Insert work order
      const newOrder = db.insert(workOrders).values({
        arac_id: parse.data.arac_id,
        tarih: parse.data.giris_tarihi || now,
        km: parse.data.kilometre ?? parse.data.km,
        durum: parse.data.durum,
        sikayet: parse.data.sikayet.trim(),
        kdv_orani: parse.data.kdv_orani,
        kdv_dahil_mi: parse.data.kdv_dahil_mi,
        iskonto_yuzde: parse.data.iskonto_yuzde,
        iskonto_tutar_kurus: parse.data.iskonto_tutar_kurus,
        pesin_fiyat_elle_kurus: parse.data.pesin_fiyat_elle_kurus || null,
        sonraki_bakim_tarihi: parse.data.sonraki_bakim_tarihi || null,
        sonraki_bakim_km: parse.data.sonraki_bakim_km || null,
        olusturan_kullanici_id: request.user!.id,
        is_sample: false,
        created_at: now,
        updated_at: now
      }).returning().get();

      // 2. Insert lines
      const partUsages: Array<{ parca_id: number; adet: number }> = [];

      for (const line of parse.data.kalemler) {
        db.insert(workOrderLines).values({
          is_emri_id: newOrder.id,
          tur: line.tur,
          parca_id: line.parca_id || null,
          ad: line.ad.trim(),
          adet: line.adet,
          birim: line.birim,
          birim_fiyat_kurus: line.birim_fiyat_kurus,
          created_at: now
        }).run();

        if (line.tur === 'parca' && line.parca_id) {
          partUsages.push({ parca_id: line.parca_id, adet: line.adet });
        }
      }

      // 3. Apply stock delta — YALNIZCA dükkan sahibi negatif stok'a izin
      // verebilir; personel (staff) asla eksiye düşüremez.
      warnings = applyWorkOrderStockDelta(
        newOrder.id,
        partUsages,
        request.user!.id,
        request.user!.role === 'owner'
      );

      return newOrder;
      })();
    } catch (err: any) {
      const msg = err?.message || 'İş emri oluşturulamadı.';
      // Yetersiz stok gibi iş kuralı ihlalleri 400 olarak döner
      return reply.status(/stok/i.test(msg) ? 400 : 500).send({ success: false, error: msg });
    }

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'work_order_create',
      hedef_tablo: 'work_orders',
      hedef_id: result.id,
      yeni_deger: result,
      detay: `Yeni iş emri oluşturuldu #${result.id} (${vehicle.plaka_gorunen})`
    });

    // İletişim merkezi: yeni iş emri kabul durumuyla açıldıysa WhatsApp kaydı düş
    recordStatusNotification(result.id, result.durum);

    return {
      success: true,
      workOrder: result,
      warnings
    };
  });

  // Update work order
  fastify.put('/:id', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'İş emrini güncelle'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const parse = workOrderCreateSchema.safeParse(request.body);
    if (!parse.success) {
      return reply.status(400).send({
        success: false,
        error: parse.error.issues[0]?.message || 'Geçersiz iş emri verisi.'
      });
    }

    const db = getDb();
    const sqlite = getSqlite();

    const existing = db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), isNull(workOrders.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const now = new Date().toISOString();
    let warnings: string[] = [];

    const updated = sqlite.transaction(() => {
      // 1. Update work order main record
      const upd = db.update(workOrders).set({
        km: parse.data.kilometre ?? parse.data.km,
        ...(parse.data.giris_tarihi ? { tarih: parse.data.giris_tarihi } : {}),
        durum: parse.data.durum,
        sikayet: parse.data.sikayet.trim(),
        kdv_orani: parse.data.kdv_orani,
        kdv_dahil_mi: parse.data.kdv_dahil_mi,
        iskonto_yuzde: parse.data.iskonto_yuzde,
        iskonto_tutar_kurus: parse.data.iskonto_tutar_kurus,
        pesin_fiyat_elle_kurus: parse.data.pesin_fiyat_elle_kurus || null,
        sonraki_bakim_tarihi: parse.data.sonraki_bakim_tarihi || null,
        sonraki_bakim_km: parse.data.sonraki_bakim_km || null,
        updated_at: now
      }).where(eq(workOrders.id, id)).returning().get();

      // 2. Replace lines
      db.delete(workOrderLines).where(eq(workOrderLines.is_emri_id, id)).run();

      const partUsages: Array<{ parca_id: number; adet: number }> = [];
      for (const line of parse.data.kalemler) {
        db.insert(workOrderLines).values({
          is_emri_id: id,
          tur: line.tur,
          parca_id: line.parca_id || null,
          ad: line.ad.trim(),
          adet: line.adet,
          birim: line.birim,
          birim_fiyat_kurus: line.birim_fiyat_kurus,
          created_at: now
        }).run();

        if (line.tur === 'parca' && line.parca_id) {
          partUsages.push({ parca_id: line.parca_id, adet: line.adet });
        }
      }

      // 3. Apply stock delta
      warnings = applyWorkOrderStockDelta(
        id,
        partUsages,
        request.user!.id,
        parse.data.override_negative_stock || request.user!.role === 'owner'
      );

      return upd;
    })();

    // Servis durumu değiştiyse iletişim merkezine WhatsApp kaydı düş
    if (updated.durum !== existing.durum) {
      recordStatusNotification(id, updated.durum);
    }

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'work_order_update',
      hedef_tablo: 'work_orders',
      hedef_id: id,
      eski_deger: existing,
      yeni_deger: updated,
      detay: `İş emri güncellendi #${id}`
    });

    return { success: true, workOrder: updated, warnings };
  });

  // Update work order status only (used by stage dropdowns and quick actions)
  fastify.put('/:id/status', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'İş emri durumunu güncelle'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const body = (request.body as any) || {};
    const durum = body.durum;

    if (!['kabul', 'onarimda', 'onarımda', 'tamamlandı', 'teslime_hazir', 'teslim_edildi'].includes(durum)) {
      return reply.status(400).send({ success: false, error: 'Geçersiz servis durumu.' });
    }

    // Normalize legacy/alternate spellings to canonical DB values
    const canonical =
      durum === 'onarımda' ? 'onarimda'
      : durum === 'tamamlandı' ? 'teslime_hazir'
      : durum;

    const db = getDb();
    const existing = db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), isNull(workOrders.deleted_at)))
      .get();

    if (!existing) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const now = new Date().toISOString();
    const updated = db.update(workOrders).set({
      durum: canonical,
      ...(body.kapanis_tarihi ? { kapanis_tarihi: body.kapanis_tarihi } : {}),
      ...(canonical === 'teslim_edildi' && !existing.kapanis_tarihi && !body.kapanis_tarihi
        ? { kapanis_tarihi: now }
        : {}),
      updated_at: now
    }).where(eq(workOrders.id, id)).returning().get();

    // Servis durumu değiştiyse iletişim merkezine WhatsApp kaydı düş
    if (updated.durum !== existing.durum) {
      recordStatusNotification(id, updated.durum);
    }

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'work_order_update',
      hedef_tablo: 'work_orders',
      hedef_id: id,
      eski_deger: { durum: existing.durum },
      yeni_deger: { durum: updated.durum },
      detay: `İş emri durumu güncellendi #${id}: ${updated.durum}`
    });

    return { success: true, workOrder: withOrderAliases(updated, {}) };
  });

  // Add payment to work order (used by "Ödeme ekle" dialogs)
  fastify.post('/:id/payments', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'İş emrine ödeme ekle'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const body = (request.body as any) || {};
    const tutar = body.tutar_kurus;

    if (!Number.isInteger(tutar) || tutar <= 0) {
      return reply.status(400).send({ success: false, error: 'Ödeme tutarı 0\'dan büyük olmalıdır.' });
    }

    const db = getDb();
    const order = db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), isNull(workOrders.deleted_at)))
      .get();

    if (!order) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const now = new Date().toISOString();
    const newPayment = db.insert(payments).values({
      is_emri_id: id,
      tarih: body.odeme_tarihi || body.tarih || now,
      tutar_kurus: tutar,
      yontem: normalizePaymentMethod(body.odeme_yontemi ?? body.yontem),
      kullanici_id: request.user!.id,
      notlar: body.notlar?.trim() || null,
      created_at: now
    }).returning().get();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'payment_create',
      hedef_tablo: 'payments',
      hedef_id: newPayment.id,
      yeni_deger: newPayment,
      detay: `Ödeme alındı: ${(newPayment.tutar_kurus / 100).toFixed(2)} TL (${newPayment.yontem}) - İş Emri #${id}`
    });

    return { success: true, payment: newPayment };
  });

  // Action: Peşin Kapat (Close with cash payment of remaining discounted balance)
  fastify.post('/:id/pesin-kapat', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'İş emrini peşin fiyat üzerinden tahsil ederek kapat'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = getDb();
    const sqlite = getSqlite();

    const order = db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), isNull(workOrders.deleted_at)))
      .get();

    if (!order) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const lines = db.select().from(workOrderLines).where(eq(workOrderLines.is_emri_id, id)).all();
    const existingPayments = db.select().from(payments).where(eq(payments.is_emri_id, id)).all();
    const paidSoFar = existingPayments.reduce((s, p) => s + p.tutar_kurus, 0);
    const pesinRate = await getPesinRate();

    const calc = calculateWorkOrderTotals({
      lines: lines.map((l) => ({ adet: l.adet, birim_fiyat_kuruş: l.birim_fiyat_kurus })),
      kdv_orani: order.kdv_orani,
      kdv_dahil_mi: Boolean(order.kdv_dahil_mi),
      iskonto_yuzde: order.iskonto_yuzde,
      iskonto_tutar_kurus: order.iskonto_tutar_kurus,
      pesin_fiyat_elle_kurus: order.pesin_fiyat_elle_kurus,
      pesin_iskonto_yuzde: pesinRate,
      odenen_kurus: paidSoFar
    });

    const now = new Date().toISOString();
    const method: PaymentMethod = ((request.body as any)?.yontem as PaymentMethod) || 'nakit';

    sqlite.transaction(() => {
      // If there is remaining cash balance, record payment
      if (calc.pesin_kalan_kurus > 0) {
        db.insert(payments).values({
          is_emri_id: id,
          tarih: now,
          tutar_kurus: calc.pesin_kalan_kurus,
          yontem: method,
          kullanici_id: request.user!.id,
          notlar: 'Peşin kapatma tahsilatı',
          created_at: now
        }).run();
      }

      // Close work order
      db.update(workOrders).set({
        durum: 'teslim_edildi',
        kapanis_tarihi: now,
        updated_at: now
      }).where(eq(workOrders.id, id)).run();
    })();

    // Servis durumu teslim edildi'ye geçtiyse iletişim merkezine kayıt düş
    if (order.durum !== 'teslim_edildi') {
      recordStatusNotification(id, 'teslim_edildi');
    }

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'payment_create',
      hedef_tablo: 'work_orders',
      hedef_id: id,
      detay: `İş emri peşin kapatıldı #${id}. Tahsil edilen peşin bakiye: ${(calc.pesin_kalan_kurus / 100).toFixed(2)} TL`
    });

    return {
      success: true,
      message: 'İş emri peşin fiyat üzerinden tahsil edildi ve başarıyla kapatıldı.'
    };
  });

  // Action: Yeniden Aç (Reopen work order)
  fastify.post('/:id/reopen', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'Kapanmış iş emrini yeniden aç'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = getDb();

    const order = db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), isNull(workOrders.deleted_at)))
      .get();

    if (!order) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const now = new Date().toISOString();
    db.update(workOrders).set({
      durum: 'onarimda',
      kapanis_tarihi: null,
      updated_at: now
    }).where(eq(workOrders.id, id)).run();

    // Servis durumu onarımda'ya döndüyse iletişim merkezine kayıt düş
    if (order.durum !== 'onarimda') {
      recordStatusNotification(id, 'onarimda');
    }

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'work_order_reopen',
      hedef_tablo: 'work_orders',
      hedef_id: id,
      detay: `İş emri yeniden açıldı #${id}`
    });

    return { success: true, message: 'İş emri yeniden açıldı.' };
  });

  // Soft delete work order (reverses all stock movements)
  fastify.delete('/:id', {
    schema: {
      tags: ['İş Emirleri'],
      summary: 'İş emrini sil (Stok hareketleri otomatik tersine döner)'
    }
  }, async (request, reply) => {
    const id = Number((request.params as any).id);
    const db = getDb();
    const sqlite = getSqlite();

    const order = db
      .select()
      .from(workOrders)
      .where(and(eq(workOrders.id, id), isNull(workOrders.deleted_at)))
      .get();

    if (!order) {
      return reply.status(404).send({ success: false, error: 'İş emri bulunamadı.' });
    }

    const now = new Date().toISOString();

    sqlite.transaction(() => {
      // 1. Soft delete
      db.update(workOrders).set({
        deleted_at: now,
        updated_at: now
      }).where(eq(workOrders.id, id)).run();

      // 2. Reverse stock movements
      reverseWorkOrderStock(id, request.user!.id);
    })();

    await logAudit({
      kullanici_id: request.user!.id,
      kullanici_adi: request.user!.username,
      islem: 'work_order_delete',
      hedef_tablo: 'work_orders',
      hedef_id: id,
      detay: `İş emri silindi ve parçalar stoka iade edildi #${id}`
    });

    return {
      success: true,
      message: 'İş emri silindi ve kullanılan tüm parçalar otomatik olarak stoka iade edildi.'
    };
  });
};
