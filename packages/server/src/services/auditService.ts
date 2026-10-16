import { dbFrom, auditLog, type DbCtx } from '../db/index.js';
import type { AuditAction } from '@oto-servis/shared';

export interface LogAuditOptions {
  kullanici_id?: number | null;
  kullanici_adi?: string | null;
  islem: AuditAction;
  hedef_tablo: string;
  hedef_id?: number | null;
  eski_deger?: any;
  yeni_deger?: any;
  ip_adresi?: string | null;
  detay?: string | null;
}

export async function logAudit(options: LogAuditOptions, ctx?: DbCtx) {
  try {
    const db = dbFrom(ctx);
    const now = new Date().toISOString();

    db.insert(auditLog).values({
      kullanici_id: options.kullanici_id ?? null,
      kullanici_adi: options.kullanici_adi ?? null,
      islem: options.islem,
      hedef_tablo: options.hedef_tablo,
      hedef_id: options.hedef_id ?? null,
      eski_deger: options.eski_deger !== undefined ? JSON.stringify(options.eski_deger) : null,
      yeni_deger: options.yeni_deger !== undefined ? JSON.stringify(options.yeni_deger) : null,
      ip_adresi: options.ip_adresi ?? null,
      detay: options.detay ?? null,
      created_at: now
    }).run();
  } catch (err) {
    // Audit log write failure shouldn't crash the main operation, but should be logged to stderr
    console.error('[AUDIT_LOG_ERROR]', err);
  }
}
