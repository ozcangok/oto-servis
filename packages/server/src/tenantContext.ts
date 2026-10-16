import type { FastifyRequest } from 'fastify';
import { openTenantDb, getDb, getSqlite } from './db/index.js';
import { getDataDir, tenantDbPath, getCompanyBySlug, type Company } from './db/platform.js';
import type { DbCtx, DbHandle, SqliteHandle } from './db/index.js';

export interface TenantCtx extends DbCtx {
  companySlug?: string | null;
}

export interface TenantHandles {
  db: DbHandle;
  sqlite: SqliteHandle;
  company: Company;
}

/**
 * Kiracı dosyasını açar (önbellekli). Şirket kaydı yoksa/pasifse açmaz.
 */
export function openTenantHandles(slug: string): TenantHandles {
  const company = getCompanyBySlug(slug);
  if (!company) {
    throw new Error('Firma bulunamadı.');
  }
  const filePath = tenantDbPath(getDataDir(), slug);
  const { db, sqlite } = openTenantDb(filePath);
  return { db, sqlite, company };
}

/**
 * İstek bağlamından servis ctx'i üretir. Kiracı yoksa boş ctx döner
 * (servisler varsayılan/legacy DB'ye düşer).
 */
export function reqCtx(request: FastifyRequest): TenantCtx {
  const tenant = (request as any).tenant as
    | { company: Company | null; db: DbHandle; sqlite: SqliteHandle }
    | null
    | undefined;
  if (tenant && tenant.db) {
    return { db: tenant.db, sqlite: tenant.sqlite, companySlug: tenant.company?.slug ?? null };
  }
  return {};
}

/** Rota içinde varsayılan getDb() yerine kullanılır. */
export function reqDb(request: FastifyRequest) {
  return reqCtx(request).db ?? getDb();
}

/** Rota içinde varsayılan getSqlite() yerine kullanılır. */
export function reqSqlite(request: FastifyRequest) {
  return reqCtx(request).sqlite ?? getSqlite();
}
