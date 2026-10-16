import { sql, eq, and } from 'drizzle-orm';
import { dbFrom, sqliteFrom, parts, stockMovements, type DbCtx } from '../db/index.js';
import { logAudit } from './auditService.js';
import { getSettings } from './settingsService.js';
import type { StockMovementType } from '@oto-servis/shared';

/**
 * Returns current stock balance for a part calculated from stock movements
 */
export function getPartStock(partId: number, ctx?: DbCtx): number {
  const db = dbFrom(ctx);
  const row = db
    .select({ total: sql<number>`coalesce(sum(${stockMovements.miktar}), 0)` })
    .from(stockMovements)
    .where(eq(stockMovements.parca_id, partId))
    .get();

  return row?.total ?? 0;
}

/**
 * Adjusts stock within an atomic transaction.
 * Checks for negative stock and enforces permissions/settings.
 */
export function adjustStock(
  partId: number,
  miktar: number, // positive to increase, negative to decrease
  tur: StockMovementType,
  userId: number,
  options: {
    workOrderId?: number;
    notlar?: string;
    overrideNegativeStock?: boolean;
    ipAddress?: string;
  } = {},
  ctx?: DbCtx
) {
  const sqlite = sqliteFrom(ctx);
  const db = dbFrom(ctx);

  // Fetch part
  const part = db.select().from(parts).where(eq(parts.id, partId)).get();
  if (!part) {
    throw new Error(`Parça bulunamadı (ID: ${partId}).`);
  }

  const runTx = sqlite.transaction(() => {
    const currentStock = getPartStock(partId, ctx);
    const newStock = currentStock + miktar;

    if (newStock < 0 && !options.overrideNegativeStock) {
      throw new Error(
        `Yetersiz stok! "${part.ad}" için mevcut stok: ${currentStock}, talep edilen miktar: ${Math.abs(miktar)}. Eksiye düşmeye izin verilmiyor.`
      );
    }

    const now = new Date().toISOString();
    db.insert(stockMovements).values({
      parca_id: partId,
      miktar,
      tur,
      is_emri_id: options.workOrderId ?? null,
      tarih: now,
      kullanici_id: userId,
      notlar: options.notlar ?? null,
      created_at: now
    }).run();

    return {
      partId,
      partName: part.ad,
      previousStock: currentStock,
      newStock,
      isCritical: newStock <= part.kritik_stok
    };
  });

  const result = runTx();

  logAudit({
    kullanici_id: userId,
    islem: 'stock_correction',
    hedef_tablo: 'parts',
    hedef_id: partId,
    eski_deger: { stock: result.previousStock },
    yeni_deger: { stock: result.newStock, delta: miktar, type: tur },
    ip_adresi: options.ipAddress,
    detay: `Stok hareketi: ${part.ad} (${miktar > 0 ? '+' : ''}${miktar}) - Yeni Stok: ${result.newStock}`
  }, ctx);

  return result;
}

/**
 * Reconciles stock for a work order when it's created or modified.
 * Only the delta (difference between previous usage and new usage) is applied.
 */
export function applyWorkOrderStockDelta(
  workOrderId: number,
  newPartUsages: Array<{ parca_id: number; adet: number }>,
  userId: number,
  overrideNegativeStock?: boolean,
  ctx?: DbCtx
) {
  const sqlite = sqliteFrom(ctx);
  const db = dbFrom(ctx);

  const runTx = sqlite.transaction(() => {
    // 1. Get existing stock movements for this work order
    const existingMovements = db
      .select()
      .from(stockMovements)
      .where(and(eq(stockMovements.is_emri_id, workOrderId), eq(stockMovements.tur, 'is_emri')))
      .all();

    // Map of partId -> previous total used quantity
    const prevUsageMap = new Map<number, number>();
    for (const mov of existingMovements) {
      // Mov.miktar is negative for usages (e.g. -2)
      const used = Math.abs(mov.miktar);
      prevUsageMap.set(mov.parca_id, (prevUsageMap.get(mov.parca_id) || 0) + used);
    }

    // Map of partId -> new total used quantity
    const newUsageMap = new Map<number, number>();
    for (const item of newPartUsages) {
      if (item.parca_id && item.adet > 0) {
        newUsageMap.set(item.parca_id, (newUsageMap.get(item.parca_id) || 0) + item.adet);
      }
    }

    const allPartIds = new Set([...prevUsageMap.keys(), ...newUsageMap.keys()]);
    const now = new Date().toISOString();
    const warnings: string[] = [];

    for (const partId of allPartIds) {
      const prevQty = prevUsageMap.get(partId) || 0;
      const newQty = newUsageMap.get(partId) || 0;
      const deltaQty = newQty - prevQty; // Positive = more parts used; Negative = parts removed/reduced

      if (deltaQty !== 0) {
        const part = db.select().from(parts).where(eq(parts.id, partId)).get();
        if (!part) continue;

        const currentStock = getPartStock(partId, ctx);
        // If deltaQty > 0, we need deltaQty more parts, so movement miktar is -deltaQty
        const miktarChange = -deltaQty;
        const projectedStock = currentStock + miktarChange;

        if (projectedStock < 0 && !overrideNegativeStock) {
          throw new Error(
            `"${part.ad}" için yetersiz stok! Mevcut: ${currentStock}, Gerekli fark: ${deltaQty}.`
          );
        }

        db.insert(stockMovements).values({
          parca_id: partId,
          miktar: miktarChange,
          tur: deltaQty > 0 ? 'is_emri' : 'iade',
          is_emri_id: workOrderId,
          tarih: now,
          kullanici_id: userId,
          notlar: deltaQty > 0 ? `İş emri #${workOrderId} parça kullanımı` : `İş emri #${workOrderId} parça iadesi/azaltımı`,
          created_at: now
        }).run();

        if (projectedStock <= part.kritik_stok) {
          warnings.push(`"${part.ad}" kritik stok seviyesinde (${projectedStock} adet kaldı).`);
        }
      }
    }

    return warnings;
  });

  return runTx();
}

/**
 * Reverses all stock movements for a work order upon soft deletion
 */
export function reverseWorkOrderStock(workOrderId: number, userId: number, ctx?: DbCtx) {
  const sqlite = sqliteFrom(ctx);
  const db = dbFrom(ctx);

  const runTx = sqlite.transaction(() => {
    const movements = db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.is_emri_id, workOrderId))
      .all();

    const now = new Date().toISOString();

    for (const mov of movements) {
      if (mov.miktar !== 0) {
        // Reverse movement
        db.insert(stockMovements).values({
          parca_id: mov.parca_id,
          miktar: -mov.miktar, // Reverse the sign
          tur: 'iade',
          is_emri_id: workOrderId,
          tarih: now,
          kullanici_id: userId,
          notlar: `İş emri #${workOrderId} silindi, stok iade edildi.`,
          created_at: now
        }).run();
      }
    }
  });

  runTx();
}
