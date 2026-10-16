import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema.js';
import path from 'path';
import fs from 'fs';

let currentDb: ReturnType<typeof drizzle<typeof schema>> | null = null;
let currentSqlite: Database.Database | null = null;

export interface InitDbOptions {
  dbPath?: string;
  inMemory?: boolean;
}

export type DbHandle = ReturnType<typeof drizzle<typeof schema>>;
export type SqliteHandle = Database.Database;

export interface DbHandles {
  db: DbHandle;
  sqlite: SqliteHandle;
  dbFilePath: string;
}

/** Servis fonksiyonlarına istek bağlamını taşımak için kullanılır. */
export interface DbCtx {
  db?: DbHandle;
  sqlite?: SqliteHandle;
}

export function dbFrom(ctx?: DbCtx): DbHandle {
  return ctx?.db ?? getDb();
}

export function sqliteFrom(ctx?: DbCtx): SqliteHandle {
  return ctx?.sqlite ?? getSqlite();
}

function openDatabaseFile(dbFilePath: string, inMemory: boolean): DbHandles {
  const sqlite = new Database(dbFilePath);

  // WAL mode for high concurrency and performance
  if (!inMemory) {
    sqlite.pragma('journal_mode = WAL');
  }
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('synchronous = NORMAL');

  // Ensure all tables and indexes exist
  bootstrapSchema(sqlite);

  const db = drizzle(sqlite, { schema });
  return { db, sqlite, dbFilePath };
}

export function initDatabase(options: InitDbOptions = {}) {
  let dbFilePath: string;

  if (options.inMemory) {
    dbFilePath = ':memory:';
  } else if (options.dbPath) {
    dbFilePath = options.dbPath;
    const parentDir = path.dirname(dbFilePath);
    if (parentDir && parentDir !== ':memory:' && !fs.existsSync(parentDir)) {
      fs.mkdirSync(parentDir, { recursive: true });
    }
  } else {
    const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    dbFilePath = path.join(dataDir, 'oto-servis.sqlite');
  }

  const { db, sqlite } = openDatabaseFile(dbFilePath, !!options.inMemory);
  currentSqlite = sqlite;
  currentDb = db;

  return { db, sqlite, dbFilePath };
}

/**
 * Kiracı (tenant) veritabanını açar. Global varsayılan DB'ye dokunmaz;
 * her kiracı dosyası için bağımsız tutamaç döner. Açık dosyalar önbellekte
 * tutulur (çok kiracılı çalışmada dosya tanıtıcısı patlamasını önler).
 */
const tenantHandleCache = new Map<string, DbHandles>();
const MAX_TENANT_HANDLES = 50;

export function openTenantDb(dbFilePath: string): DbHandles {
  const cached = tenantHandleCache.get(dbFilePath);
  if (cached) {
    // LRU: yeniden erişileni sona taşı
    tenantHandleCache.delete(dbFilePath);
    tenantHandleCache.set(dbFilePath, cached);
    return cached;
  }

  const parentDir = path.dirname(dbFilePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const handles = openDatabaseFile(dbFilePath, false);
  tenantHandleCache.set(dbFilePath, handles);

  while (tenantHandleCache.size > MAX_TENANT_HANDLES) {
    const oldest = tenantHandleCache.keys().next();
    if (oldest.done) break;
    const key = oldest.value;
    const h = tenantHandleCache.get(key);
    tenantHandleCache.delete(key);
    try {
      h?.sqlite.close();
    } catch {}
  }

  return handles;
}

export function closeTenantDb(dbFilePath: string) {
  const h = tenantHandleCache.get(dbFilePath);
  tenantHandleCache.delete(dbFilePath);
  if (h) {
    try {
      h.sqlite.close();
    } catch {}
  }
}

export function getDb() {
  if (!currentDb) {
    initDatabase();
  }
  return currentDb!;
}

export function getSqlite() {
  if (!currentSqlite) {
    initDatabase();
  }
  return currentSqlite!;
}

/**
 * Creates all tables and indexes directly if they don't already exist.
 * This ensures single-click zero-configuration startup for desktop, local, and tests.
 */
export function bootstrapSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      eposta TEXT,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'mechanic',
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad_soyad TEXT NOT NULL,
      telefon TEXT NOT NULL,
      eposta TEXT,
      vergi_no TEXT,
      notlar TEXT,
      is_sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_customers_telefon ON customers(telefon);
    CREATE INDEX IF NOT EXISTS idx_customers_ad_soyad ON customers(ad_soyad);

    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      musteri_id INTEGER NOT NULL REFERENCES customers(id),
      plaka_norm TEXT NOT NULL UNIQUE,
      plaka_gorunen TEXT NOT NULL,
      marka TEXT NOT NULL,
      model TEXT NOT NULL,
      yil INTEGER,
      sasi_no TEXT,
      motor_kodu TEXT,
      muayene_tarihi TEXT,
      notlar TEXT,
      is_sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_vehicles_plaka_norm ON vehicles(plaka_norm);
    CREATE INDEX IF NOT EXISTS idx_vehicles_musteri_id ON vehicles(musteri_id);
    CREATE INDEX IF NOT EXISTS idx_vehicles_sasi_no ON vehicles(sasi_no);

    CREATE TABLE IF NOT EXISTS parts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ad TEXT NOT NULL,
      kod TEXT NOT NULL,
      barkod TEXT UNIQUE,
      uyumlu_arac TEXT,
      muadil TEXT,
      birim TEXT NOT NULL DEFAULT 'Adet',
      kritik_stok INTEGER NOT NULL DEFAULT 3,
      alis_kurus INTEGER NOT NULL DEFAULT 0,
      satis_kurus INTEGER NOT NULL DEFAULT 0,
      raf TEXT,
      aktif INTEGER NOT NULL DEFAULT 1,
      is_sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_parts_barkod ON parts(barkod);
    CREATE INDEX IF NOT EXISTS idx_parts_kod ON parts(kod);
    CREATE INDEX IF NOT EXISTS idx_parts_ad ON parts(ad);

    CREATE TABLE IF NOT EXISTS work_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      arac_id INTEGER NOT NULL REFERENCES vehicles(id),
      tarih TEXT NOT NULL,
      km INTEGER NOT NULL DEFAULT 0,
      durum TEXT NOT NULL DEFAULT 'kabul',
      sikayet TEXT NOT NULL,
      kdv_orani INTEGER NOT NULL DEFAULT 20,
      kdv_dahil_mi INTEGER NOT NULL DEFAULT 0,
      iskonto_yuzde INTEGER NOT NULL DEFAULT 0,
      iskonto_tutar_kurus INTEGER NOT NULL DEFAULT 0,
      pesin_fiyat_elle_kurus INTEGER,
      sonraki_bakim_tarihi TEXT,
      sonraki_bakim_km INTEGER,
      kapanis_tarihi TEXT,
      olusturan_kullanici_id INTEGER NOT NULL REFERENCES users(id),
      is_sample INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_work_orders_arac_id ON work_orders(arac_id);
    CREATE INDEX IF NOT EXISTS idx_work_orders_durum ON work_orders(durum);
    CREATE INDEX IF NOT EXISTS idx_work_orders_tarih ON work_orders(tarih);

    CREATE TABLE IF NOT EXISTS work_order_lines (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_emri_id INTEGER NOT NULL REFERENCES work_orders(id),
      tur TEXT NOT NULL,
      parca_id INTEGER REFERENCES parts(id),
      ad TEXT NOT NULL,
      adet INTEGER NOT NULL DEFAULT 1,
      birim TEXT NOT NULL DEFAULT 'Adet',
      birim_fiyat_kurus INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_work_order_lines_is_emri_id ON work_order_lines(is_emri_id);
    CREATE INDEX IF NOT EXISTS idx_work_order_lines_parca_id ON work_order_lines(parca_id);

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_emri_id INTEGER NOT NULL REFERENCES work_orders(id),
      tarih TEXT NOT NULL,
      tutar_kurus INTEGER NOT NULL,
      yontem TEXT NOT NULL,
      kullanici_id INTEGER NOT NULL REFERENCES users(id),
      notlar TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_payments_is_emri_id ON payments(is_emri_id);
    CREATE INDEX IF NOT EXISTS idx_payments_tarih ON payments(tarih);

    CREATE TABLE IF NOT EXISTS stock_movements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parca_id INTEGER NOT NULL REFERENCES parts(id),
      miktar INTEGER NOT NULL,
      tur TEXT NOT NULL,
      is_emri_id INTEGER REFERENCES work_orders(id),
      tarih TEXT NOT NULL,
      kullanici_id INTEGER NOT NULL REFERENCES users(id),
      notlar TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_stock_movements_parca_id ON stock_movements(parca_id);
    CREATE INDEX IF NOT EXISTS idx_stock_movements_is_emri_id ON stock_movements(is_emri_id);

    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      is_emri_id INTEGER NOT NULL REFERENCES work_orders(id),
      dosya_yolu TEXT NOT NULL,
      dosya_adi TEXT NOT NULL,
      boyut_bytes INTEGER NOT NULL,
      mime_tipi TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_photos_is_emri_id ON photos(is_emri_id);

    CREATE TABLE IF NOT EXISTS reminders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tur TEXT NOT NULL,
      referans_id INTEGER NOT NULL,
      baslik TEXT NOT NULL,
      mesaj TEXT NOT NULL,
      hedef_tarih TEXT,
      gonderildi_tarihi TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_reminders_tur ON reminders(tur);
    CREATE INDEX IF NOT EXISTS idx_reminders_hedef_tarih ON reminders(hedef_tarih);

    CREATE TABLE IF NOT EXISTS settings (
      anahtar TEXT PRIMARY KEY,
      deger TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kullanici_id INTEGER,
      kullanici_adi TEXT,
      islem TEXT NOT NULL,
      hedef_tablo TEXT NOT NULL,
      hedef_id INTEGER,
      eski_deger TEXT,
      yeni_deger TEXT,
      ip_adresi TEXT,
      detay TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_log_hedef_tablo ON audit_log(hedef_tablo);
    CREATE INDEX IF NOT EXISTS idx_audit_log_islem ON audit_log(islem);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
  `);

  // Normalize legacy status spellings to canonical ASCII values
  sqlite.exec(`
    UPDATE work_orders SET durum = 'onarimda' WHERE durum = 'onarımda';
    UPDATE work_orders SET durum = 'teslime_hazir' WHERE durum = 'tamamlandı';
  `);

  // Sonradan eklenen kolonlar (mevcut DB'ler için migration)
  ensureColumn(sqlite, 'users', 'eposta', 'TEXT');
}

export * from './schema.js';

/**
 * Eski veritabanlarına sonradan eklenen kolonları idempotent şekilde ekler.
 */
export function ensureColumn(sqlite: Database.Database, table: string, column: string, ddl: string) {
  const cols = sqlite.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${ddl}`);
  }
}
