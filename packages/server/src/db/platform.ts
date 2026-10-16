import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

let platformSqlite: Database.Database | null = null;
let platformDbPath = '';

export interface InitPlatformOptions {
  platformDbPath?: string;
}

export interface CompanyInput {
  slug: string;
  ad: string;
  eposta?: string | null;
  telefon?: string | null;
  adres?: string | null;
  plan?: string;
  durum?: string;
}

export interface Company {
  id: number;
  slug: string;
  ad: string;
  eposta: string | null;
  telefon: string | null;
  adres: string | null;
  plan: string;
  durum: string;
  trial_bitis: string | null;
  donem_bitis: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/**
 * Firma kodu (slug) kuralları: küçük harf, rakam ve tire.
 * Dosya yolu geçişine (path traversal) karşı ilk savunma hattı.
 */
export function isValidCompanySlug(slug: string): boolean {
  return /^[a-z0-9][a-z0-9-]{2,30}[a-z0-9]$/.test(slug || '');
}

export function normalizeCompanySlug(raw: string): string {
  return (raw || '')
    .toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Kiracı veritabanı dosya yolu. Slug doğrulanmadan yol üretilmez.
 */
export function tenantDbPath(dataDir: string, slug: string): string {
  if (!isValidCompanySlug(slug)) {
    throw new Error('Geçersiz firma kodu.');
  }
  return path.join(dataDir, 'tenants', `${slug}.sqlite`);
}

export function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

export function initPlatformDb(options: InitPlatformOptions = {}) {
  const filePath =
    options.platformDbPath || path.join(getDataDir(), 'platform.sqlite');

  if (platformSqlite && platformDbPath === filePath) {
    return { sqlite: platformSqlite, platformDbPath: filePath };
  }

  const parentDir = path.dirname(filePath);
  if (!fs.existsSync(parentDir)) {
    fs.mkdirSync(parentDir, { recursive: true });
  }

  const sqlite = new Database(filePath);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');

  bootstrapPlatformSchema(sqlite);

  // Testlerde her initPlatformDb çağrısı taze dosya/DB demektir;
  // aynı dosya yoluna bağlı eski tutamacı kapat.
  if (platformSqlite && platformDbPath !== filePath) {
    try {
      platformSqlite.close();
    } catch {}
  }
  platformSqlite = sqlite;
  platformDbPath = filePath;

  return { sqlite, platformDbPath: filePath };
}

export function getPlatformDb(): Database.Database {
  if (!platformSqlite) {
    initPlatformDb();
  }
  return platformSqlite!;
}

export function closePlatformDb() {
  if (platformSqlite) {
    try {
      platformSqlite.close();
    } catch {}
    platformSqlite = null;
    platformDbPath = '';
  }
}

export function bootstrapPlatformSchema(sqlite: Database.Database) {
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      ad TEXT NOT NULL,
      eposta TEXT,
      telefon TEXT,
      adres TEXT,
      plan TEXT NOT NULL DEFAULT 'trial',
      durum TEXT NOT NULL DEFAULT 'active',
      trial_bitis TEXT,
      donem_bitis TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      deleted_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_companies_slug ON companies(slug);
    CREATE INDEX IF NOT EXISTS idx_companies_durum ON companies(durum);

    CREATE TABLE IF NOT EXISTS platform_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      failed_login_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS platform_sessions (
      token TEXT PRIMARY KEY,
      company_slug TEXT,
      user_id INTEGER NOT NULL,
      is_superadmin INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_platform_sessions_company ON platform_sessions(company_slug);
    CREATE INDEX IF NOT EXISTS idx_platform_sessions_expires ON platform_sessions(expires_at);

    -- E-posta -> (firma, kullanıcı) genel dizini. E-posta platformda tektir.
    CREATE TABLE IF NOT EXISTS user_emails (
      eposta TEXT PRIMARY KEY,
      company_slug TEXT,
      user_id INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_user_emails_company ON user_emails(company_slug);

    -- E-posta doğrulama kodları (kayıt OTP akışı)
    CREATE TABLE IF NOT EXISTS email_verifications (
      eposta TEXT PRIMARY KEY,
      kod_hash TEXT NOT NULL,
      company_slug TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
  `);
}

export interface EmailIndexEntry {
  eposta: string;
  company_slug: string | null;
  user_id: number;
  created_at: string;
}

export function normalizeEmail(raw: string): string {
  return (raw || '').trim().toLowerCase();
}

export function isValidEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test((raw || '').trim());
}

export function findByEmail(eposta: string): EmailIndexEntry | undefined {
  const sqlite = getPlatformDb();
  return sqlite.prepare('SELECT * FROM user_emails WHERE eposta = ?').get(normalizeEmail(eposta)) as
    | EmailIndexEntry
    | undefined;
}

export function upsertEmailIndex(eposta: string, companySlug: string | null, userId: number) {
  const normalized = normalizeEmail(eposta);
  if (!isValidEmail(normalized)) {
    throw new Error('Geçerli bir e-posta adresi girin.');
  }
  const sqlite = getPlatformDb();
  const existing = sqlite.prepare('SELECT * FROM user_emails WHERE eposta = ?').get(normalized) as
    | EmailIndexEntry
    | undefined;
  if (existing && (existing.company_slug !== companySlug || existing.user_id !== userId)) {
    throw new Error('Bu e-posta adresi başka bir hesapta kayıtlı.');
  }
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO user_emails (eposta, company_slug, user_id, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(eposta) DO UPDATE SET company_slug = excluded.company_slug, user_id = excluded.user_id'
    )
    .run(normalized, companySlug, userId, now);
}

export interface EmailVerification {
  eposta: string;
  kod_hash: string;
  company_slug: string;
  user_id: number;
  attempts: number;
  expires_at: string;
  created_at: string;
}

export function getEmailVerification(eposta: string): EmailVerification | undefined {
  const sqlite = getPlatformDb();
  return sqlite.prepare('SELECT * FROM email_verifications WHERE eposta = ?').get(normalizeEmail(eposta)) as
    | EmailVerification
    | undefined;
}

export function upsertEmailVerification(entry: {
  eposta: string;
  kod_hash: string;
  company_slug: string;
  user_id: number;
  expires_at: string;
}) {
  const sqlite = getPlatformDb();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      `INSERT INTO email_verifications (eposta, kod_hash, company_slug, user_id, attempts, expires_at, created_at)
       VALUES (?, ?, ?, ?, 0, ?, ?)
       ON CONFLICT(eposta) DO UPDATE SET kod_hash = excluded.kod_hash, company_slug = excluded.company_slug,
         user_id = excluded.user_id, attempts = 0, expires_at = excluded.expires_at, created_at = excluded.created_at`
    )
    .run(normalizeEmail(entry.eposta), entry.kod_hash, entry.company_slug, entry.user_id, entry.expires_at, now);
}

export function bumpVerificationAttempts(eposta: string): number {
  const sqlite = getPlatformDb();
  sqlite.prepare('UPDATE email_verifications SET attempts = attempts + 1 WHERE eposta = ?').run(normalizeEmail(eposta));
  const row = getEmailVerification(eposta);
  return row?.attempts ?? 0;
}

export function deleteEmailVerification(eposta: string) {
  const sqlite = getPlatformDb();
  sqlite.prepare('DELETE FROM email_verifications WHERE eposta = ?').run(normalizeEmail(eposta));
}

export function setCompanyStatus(slug: string, durum: string) {
  const sqlite = getPlatformDb();
  sqlite.prepare('UPDATE companies SET durum = ?, updated_at = ? WHERE slug = ?').run(
    durum,
    new Date().toISOString(),
    slug
  );
}

export function removeEmailIndex(eposta: string) {
  const sqlite = getPlatformDb();
  sqlite.prepare('DELETE FROM user_emails WHERE eposta = ?').run(normalizeEmail(eposta));
}

export function removeEmailIndexForUser(companySlug: string | null, userId: number) {
  const sqlite = getPlatformDb();
  if (companySlug === null) {
    sqlite.prepare('DELETE FROM user_emails WHERE company_slug IS NULL AND user_id = ?').run(userId);
  } else {
    sqlite.prepare('DELETE FROM user_emails WHERE company_slug = ? AND user_id = ?').run(companySlug, userId);
  }
}

export function createCompany(input: CompanyInput): Company {
  const sqlite = getPlatformDb();
  const slug = normalizeCompanySlug(input.slug || input.ad || '');
  if (!isValidCompanySlug(slug)) {
    throw new Error('Geçerli bir firma kodu üretilemedi. Firma adını kontrol edin.');
  }
  if (!input.ad || input.ad.trim().length < 2) {
    throw new Error('Firma adı en az 2 karakter olmalıdır.');
  }

  const existing = sqlite
    .prepare('SELECT id FROM companies WHERE slug = ? AND deleted_at IS NULL')
    .get(slug) as any;
  if (existing) {
    throw new Error(`"${slug}" firma kodu zaten kullanımda.`);
  }

  const now = new Date().toISOString();
  const trialBitis = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const row = sqlite
    .prepare(
      `INSERT INTO companies (slug, ad, eposta, telefon, adres, plan, durum, trial_bitis, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      slug,
      input.ad.trim(),
      input.eposta?.trim() || null,
      input.telefon?.trim() || null,
      input.adres?.trim() || null,
      input.plan || 'trial',
      input.durum || 'active',
      trialBitis,
      now,
      now
    );

  return getCompanyById(Number(row.lastInsertRowid))!;
}

export function getCompanyBySlug(slug: string): Company | undefined {
  const sqlite = getPlatformDb();
  return sqlite
    .prepare('SELECT * FROM companies WHERE slug = ? AND deleted_at IS NULL')
    .get(slug) as Company | undefined;
}

export function getCompanyById(id: number): Company | undefined {
  const sqlite = getPlatformDb();
  return sqlite
    .prepare('SELECT * FROM companies WHERE id = ? AND deleted_at IS NULL')
    .get(id) as Company | undefined;
}

export function listCompanies(): Company[] {
  const sqlite = getPlatformDb();
  return sqlite
    .prepare('SELECT * FROM companies WHERE deleted_at IS NULL ORDER BY id ASC')
    .all() as Company[];
}

export interface PlatformUser {
  id: number;
  username: string;
  password_hash: string;
  full_name: string;
  is_active: number;
  failed_login_attempts: number;
  locked_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlatformSession {
  token: string;
  company_slug: string | null;
  user_id: number;
  is_superadmin: number;
  expires_at: string;
  created_at: string;
}

export function createPlatformUser(input: {
  username: string;
  password_hash: string;
  full_name: string;
}): PlatformUser {
  const sqlite = getPlatformDb();
  const username = input.username.trim().toLowerCase();
  if (username.length < 3) {
    throw new Error('Kullanıcı adı en az 3 karakter olmalıdır.');
  }
  const existing = sqlite.prepare('SELECT id FROM platform_users WHERE username = ?').get(username);
  if (existing) {
    throw new Error('Bu kullanıcı adı zaten kullanılmaktadır.');
  }
  const now = new Date().toISOString();
  const row = sqlite
    .prepare(
      'INSERT INTO platform_users (username, password_hash, full_name, is_active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)'
    )
    .run(username, input.password_hash, input.full_name.trim(), now, now);
  return sqlite.prepare('SELECT * FROM platform_users WHERE id = ?').get(Number(row.lastInsertRowid)) as PlatformUser;
}

export function getPlatformUserByUsername(username: string): PlatformUser | undefined {
  const sqlite = getPlatformDb();
  return sqlite.prepare('SELECT * FROM platform_users WHERE username = ?').get(username.trim().toLowerCase()) as
    | PlatformUser
    | undefined;
}

export function createPlatformSession(input: {
  token: string;
  company_slug: string | null;
  user_id: number;
  is_superadmin?: boolean;
  expires_at: string;
}): PlatformSession {
  const sqlite = getPlatformDb();
  const now = new Date().toISOString();
  sqlite
    .prepare(
      'INSERT INTO platform_sessions (token, company_slug, user_id, is_superadmin, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(input.token, input.company_slug, input.user_id, input.is_superadmin ? 1 : 0, input.expires_at, now);
  return sqlite.prepare('SELECT * FROM platform_sessions WHERE token = ?').get(input.token) as PlatformSession;
}

export function getPlatformSession(token: string): PlatformSession | undefined {
  const sqlite = getPlatformDb();
  return sqlite.prepare('SELECT * FROM platform_sessions WHERE token = ?').get(token) as
    | PlatformSession
    | undefined;
}

export function deletePlatformSession(token: string) {
  const sqlite = getPlatformDb();
  sqlite.prepare('DELETE FROM platform_sessions WHERE token = ?').run(token);
}

export function deletePlatformSessionsForUser(companySlug: string | null, userId: number) {
  const sqlite = getPlatformDb();
  if (companySlug === null) {
    sqlite.prepare('DELETE FROM platform_sessions WHERE company_slug IS NULL AND user_id = ?').run(userId);
  } else {
    sqlite.prepare('DELETE FROM platform_sessions WHERE company_slug = ? AND user_id = ?').run(companySlug, userId);
  }
}

/**
 * Eski tek-kiracılı dönemden kalan iş DB'sindeki oturumları platform
 * tablosuna taşır (company_slug NULL = varsayılan/legacy kiracı).
 * Böylece mevcut açık oturumlar Faz 2 geçişinde düşmez.
 */
export function migrateLegacySessions(legacySqlite: Database.Database): number {
  const sqlite = getPlatformDb();
  let moved = 0;

  const tables = legacySqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'sessions'")
    .get() as any;
  if (!tables) return 0;

  const rows = legacySqlite.prepare('SELECT id, user_id, expires_at, created_at FROM sessions').all() as Array<{
    id: string;
    user_id: number;
    expires_at: string;
    created_at: string;
  }>;

  const insert = sqlite.prepare(
    'INSERT OR IGNORE INTO platform_sessions (token, company_slug, user_id, is_superadmin, expires_at, created_at) VALUES (?, NULL, ?, 0, ?, ?)'
  );
  const tx = sqlite.transaction(() => {
    for (const r of rows) {
      if (!r.id || r.user_id === undefined) continue;
      const info = insert.run(r.id, r.user_id, r.expires_at, r.created_at);
      moved += Number(info.changes || 0);
    }
  });
  tx();
  return moved;
}
