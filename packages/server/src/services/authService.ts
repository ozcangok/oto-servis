import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, sql } from 'drizzle-orm';
import { getDb, users, sessions, type DbCtx, type DbHandle, dbFrom } from '../db/index.js';
import type { TenantCtx } from '../tenantContext.js';
import {
  getCompanyBySlug,
  createPlatformSession,
  getPlatformSession,
  deletePlatformSession,
  deletePlatformSessionsForUser,
  getPlatformUserByUsername,
  findByEmail,
  upsertEmailIndex,
  removeEmailIndexForUser,
  isValidEmail,
  normalizeEmail,
  type Company
} from '../db/platform.js';
import { openTenantHandles } from '../tenantContext.js';
import { logAudit } from './auditService.js';
import type { UserRole, User } from '@oto-servis/shared';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_TTL_DAYS = 30;

export interface TenantAuthContext {
  user: Omit<User, 'password_hash'>;
  company: Company | null;
  isSuperadmin: boolean;
  handles: { db: DbHandle; sqlite: import('../db/index.js').SqliteHandle } | null;
}

function sessionExpiry(): { expiresAt: string; createdAt: string } {
  const now = new Date();
  return {
    expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString()
  };
}

function checkLockout(lockedUntil: string | null): string | null {
  if (!lockedUntil) return null;
  if (Date.now() < new Date(lockedUntil).getTime()) {
    const remainingMinutes = Math.ceil((new Date(lockedUntil).getTime() - Date.now()) / (60 * 1000));
    return `Çok fazla hatalı giriş denemesi. Hesabınız ${remainingMinutes} dakika kilitlidir.`;
  }
  return null;
}

/** İş DB'sindeki (varsayılan veya kiracı) kullanıcılarla girişin ortak çekirdeği. */
async function loginBusinessUser(
  db: DbHandle,
  companySlug: string | null,
  usernameInput: string,
  passwordInput: string,
  ipAddress?: string,
  auditCtx?: DbCtx
): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
  const normalizedUsername = usernameInput.trim().toLowerCase();

  const user = db.select().from(users).where(eq(users.username, normalizedUsername)).get();

  if (!user) {
    throw new Error('Kullanıcı adı veya parola hatalı.');
  }

  return completeLogin(db, companySlug, user, passwordInput, ipAddress, auditCtx);
}

async function completeLogin(
  db: DbHandle,
  companySlug: string | null,
  user: typeof users.$inferSelect,
  passwordInput: string,
  ipAddress?: string,
  auditCtx?: DbCtx
): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {

  if (!user.is_active) {
    throw new Error('Bu kullanıcı hesabı devre dışı bırakılmıştır. Lütfen yöneticinize başvurun.');
  }

  const lockedMsg = checkLockout(user.locked_until);
  if (lockedMsg) throw new Error(lockedMsg);

  const isPasswordValid = await bcrypt.compare(passwordInput, user.password_hash);

  if (!isPasswordValid) {
    const newFailCount = user.failed_login_attempts + 1;
    let lockedUntil: string | null = null;

    if (newFailCount >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }

    db.update(users)
      .set({
        failed_login_attempts: newFailCount,
        locked_until: lockedUntil,
        updated_at: new Date().toISOString()
      })
      .where(eq(users.id, user.id))
      .run();

    if (lockedUntil) {
      throw new Error(`5 hatalı giriş nedeniyle hesabınız ${LOCKOUT_MINUTES} dakika süreyle kilitlenmiştir.`);
    }

    throw new Error(`Kullanıcı adı veya parola hatalı. (Kalan hak: ${MAX_FAILED_ATTEMPTS - newFailCount})`);
  }

  // Reset failed attempts on success
  const now = new Date();
  db.update(users)
    .set({
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: now.toISOString()
    })
    .where(eq(users.id, user.id))
    .run();

  // Create platform session (tek oturum kaynağı)
  const token = crypto.randomBytes(32).toString('hex');
  const { expiresAt, createdAt } = sessionExpiry();
  createPlatformSession({ token, company_slug: companySlug, user_id: user.id, expires_at: expiresAt });

  await logAudit(
    {
      kullanici_id: user.id,
      kullanici_adi: user.username,
      islem: 'user_login',
      hedef_tablo: 'users',
      hedef_id: user.id,
      ip_adresi: ipAddress,
      detay: 'Başarılı kullanıcı girişi'
    },
    auditCtx
  );

  const { password_hash, ...safeUser } = user;
  return {
    token,
    user: safeUser as User
  };
}

export async function isSetupNeeded(ctx?: TenantCtx): Promise<boolean> {
  const db = dbFrom(ctx);
  const row = db.select({ count: sql<number>`count(*)` }).from(users).get();
  return (row?.count ?? 0) === 0;
}

export async function setupInitialAdmin(
  data: {
    username: string;
    password: string;
    full_name: string;
  },
  ctx?: TenantCtx
) {
  const needed = await isSetupNeeded(ctx);
  if (!needed) {
    throw new Error('Sistem kurulumu daha önce tamamlanmış. Yeni yönetici mevcut yönetim panelinden eklenmelidir.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(data.password, salt);
  const now = new Date().toISOString();

  const db = dbFrom(ctx);
  const result = db
    .insert(users)
    .values({
      username: data.username.trim().toLowerCase(),
      password_hash: passwordHash,
      full_name: data.full_name.trim(),
      role: 'admin',
      is_active: true,
      failed_login_attempts: 0,
      created_at: now,
      updated_at: now
    })
    .returning()
    .get();

  await logAudit(
    {
      kullanici_id: result.id,
      kullanici_adi: result.username,
      islem: 'user_create',
      hedef_tablo: 'users',
      hedef_id: result.id,
      yeni_deger: { username: result.username, role: result.role },
      detay: 'İlk kurulum: Ana yönetici hesabı oluşturuldu'
    },
    ctx
  );

  return result;
}

/**
 * Varsayılan (legacy) kiracıda giriş. İmza ve davranış geriye uyumlu.
 */
export async function loginUser(
  usernameInput: string,
  passwordInput: string,
  ipAddress?: string,
  ctx?: TenantCtx
): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
  const db = dbFrom(ctx);
  const companySlug = ctx?.companySlug ?? null;
  return loginBusinessUser(db, companySlug, usernameInput, passwordInput, ipAddress, ctx);
}

/**
 * Firma koduyla kiracı veritabanında giriş.
 */
export async function loginTenantUser(input: {
  companySlug: string;
  username: string;
  password: string;
  ipAddress?: string;
}): Promise<{ token: string; user: Omit<User, 'password_hash'>; company: Company }> {
  const slug = (input.companySlug || '').trim().toLowerCase();
  const company = getCompanyBySlug(slug);
  if (!company) {
    throw new Error('Firma kodu bulunamadı. Firma kodunuzu kontrol edin.');
  }
  if (company.durum === 'pending_verification') {
    throw new Error('E-posta doğrulaması gerekli. Kayıt sırasında gönderilen 6 haneli kodu girerek hesabınızı aktifleştirin.');
  }
  if (company.durum !== 'active') {
    throw new Error('Firma hesabı pasif durumda. Lütfen platform yöneticisiyle iletişime geçin.');
  }
  if (company.plan === 'trial' && company.trial_bitis && new Date(company.trial_bitis).getTime() < Date.now()) {
    throw new Error('Deneme süreniz dolmuş. Devam etmek için bir abonelik planı seçin.');
  }

  const handles = openTenantHandles(slug);
  const result = await loginBusinessUser(handles.db, slug, input.username, input.password, input.ipAddress, {
    db: handles.db,
    sqlite: handles.sqlite
  });
  return { ...result, company };
}

/**
 * E-posta (veya geçiş dönemi için kullanıcı adı) ile giriş.
 * E-posta platform dizininden firma eşleşir; '@' içermeyen girdiler
 * varsayılan DB'de kullanıcı adı olarak denenir (eski hesaplar).
 */
export async function loginWithIdentifier(
  identifierInput: string,
  passwordInput: string,
  ipAddress?: string
): Promise<{ token: string; user: Omit<User, 'password_hash'>; company: Company | null }> {
  const identifier = (identifierInput || '').trim();

  if (identifier.includes('@')) {
    if (!isValidEmail(identifier)) {
      throw new Error('Geçerli bir e-posta adresi girin.');
    }
    const entry = findByEmail(identifier);
    if (!entry) {
      throw new Error('E-posta veya parola hatalı.');
    }

    if (entry.company_slug) {
      const company = getCompanyBySlug(entry.company_slug);
      if (!company) {
        throw new Error('Firma bulunamadı. Destek ile iletişime geçin.');
      }
      if (company.durum === 'pending_verification') {
        throw new Error('E-posta doğrulaması gerekli. Kayıt sırasında gönderilen 6 haneli kodu girerek hesabınızı aktifleştirin.');
      }
      if (company.durum !== 'active') {
        throw new Error('Firma hesabı pasif durumda. Lütfen platform yöneticisiyle iletişime geçin.');
      }
      if (company.plan === 'trial' && company.trial_bitis && new Date(company.trial_bitis).getTime() < Date.now()) {
        throw new Error('Deneme süreniz dolmuş. Devam etmek için bir abonelik planı seçin.');
      }
      const handles = openTenantHandles(entry.company_slug);
      const user = handles.db.select().from(users).where(eq(users.id, entry.user_id)).get();
      if (!user) {
        throw new Error('E-posta veya parola hatalı.');
      }
      const result = await completeLogin(handles.db, entry.company_slug, user, passwordInput, ipAddress, {
        db: handles.db,
        sqlite: handles.sqlite
      });
      return { ...result, company };
    }

    const db = getDb();
    const user = db.select().from(users).where(eq(users.id, entry.user_id)).get();
    if (!user) {
      throw new Error('E-posta veya parola hatalı.');
    }
    const result = await completeLogin(db, null, user, passwordInput, ipAddress);
    return { ...result, company: null };
  }

  // E-posta içermeyen girdi: varsayılan DB'de kullanıcı adı dene (geçiş uyumluluğu)
  const result = await loginUser(identifier, passwordInput, ipAddress);
  return { ...result, company: null };
}
export async function loginSuperadmin(
  usernameInput: string,
  passwordInput: string,
  ipAddress?: string
): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
  const admin = getPlatformUserByUsername(usernameInput);
  if (!admin) {
    throw new Error('Kullanıcı adı veya parola hatalı.');
  }
  if (!admin.is_active) {
    throw new Error('Bu yönetici hesabı devre dışı bırakılmıştır.');
  }

  const lockedMsg = checkLockout(admin.locked_until);
  if (lockedMsg) throw new Error(lockedMsg);

  const ok = await bcrypt.compare(passwordInput, admin.password_hash);
  const platformDb = (await import('../db/platform.js')).getPlatformDb();
  if (!ok) {
    const newFailCount = (admin as any).failed_login_attempts + 1;
    let lockedUntil: string | null = null;
    if (newFailCount >= MAX_FAILED_ATTEMPTS) {
      lockedUntil = new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000).toISOString();
    }
    platformDb
      .prepare('UPDATE platform_users SET failed_login_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?')
      .run(newFailCount, lockedUntil, new Date().toISOString(), admin.id);
    if (lockedUntil) {
      throw new Error(`5 hatalı giriş nedeniyle hesabınız ${LOCKOUT_MINUTES} dakika süreyle kilitlenmiştir.`);
    }
    throw new Error(`Kullanıcı adı veya parola hatalı. (Kalan hak: ${MAX_FAILED_ATTEMPTS - newFailCount})`);
  }

  platformDb
    .prepare('UPDATE platform_users SET failed_login_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), admin.id);

  const token = crypto.randomBytes(32).toString('hex');
  const { expiresAt } = sessionExpiry();
  createPlatformSession({ token, company_slug: null, user_id: admin.id, is_superadmin: true, expires_at: expiresAt });

  const { password_hash, ...safeUser } = admin as any;
  return { token, user: { ...safeUser, role: 'superadmin' } as User };
}

/**
 * Oturum doğrulama (geriye uyumlu imza). Platform oturumlarına bakar;
 * şirket yoksa varsayılan DB'deki kullanıcıyı döner.
 */
export async function validateSession(token: string): Promise<User | null> {
  const ctx = await resolveRequestAuth(token);
  return ctx?.user ?? null;
}

/**
 * Auth hook'un kullandığı tam bağlam çözümleyici.
 */
export async function resolveRequestAuth(token: string): Promise<TenantAuthContext | null> {
  if (!token) return null;

  const session = getPlatformSession(token);
  if (!session) return null;

  if (Date.now() > new Date(session.expires_at).getTime()) {
    deletePlatformSession(token);
    return null;
  }

  if (session.is_superadmin) {
    const admin = (await import('../db/platform.js')).getPlatformDb()
      .prepare('SELECT * FROM platform_users WHERE id = ?')
      .get(session.user_id) as any;
    if (!admin || !admin.is_active) return null;
    const { password_hash, ...safeUser } = admin;
    return {
      user: { ...safeUser, role: 'superadmin' } as User,
      company: null,
      isSuperadmin: true,
      handles: null
    };
  }

  if (!session.company_slug) {
    // Legacy oturum: varsayılan DB
    const db = getDb();
    const user = db.select().from(users).where(eq(users.id, session.user_id)).get();
    if (!user || !user.is_active) return null;
    const { password_hash, ...safeUser } = user;
    return { user: safeUser as User, company: null, isSuperadmin: false, handles: null };
  }

  const company = getCompanyBySlug(session.company_slug);
  if (!company || company.durum !== 'active') return null;

  let handles;
  try {
    handles = openTenantHandles(session.company_slug);
  } catch {
    return null;
  }
  const user = handles.db.select().from(users).where(eq(users.id, session.user_id)).get();
  if (!user || !user.is_active) return null;
  const { password_hash, ...safeUser } = user;
  return {
    user: safeUser as User,
    company,
    isSuperadmin: false,
    handles: { db: handles.db, sqlite: handles.sqlite }
  };
}

export async function logoutUser(token: string) {
  if (!token) return;
  deletePlatformSession(token);
  // Eski dönemden kalma iş-DB oturum satırını da temizle (zararsız)
  try {
    const db = getDb();
    db.delete(sessions).where(eq(sessions.id, token)).run();
  } catch {}
}

export async function createUser(
  adminUser: User,
  data: {
    username: string;
    password: string;
    full_name: string;
    role: UserRole;
    eposta?: string | null;
  },
  ctx?: TenantCtx
): Promise<User> {
  if (data.role === 'superadmin') {
    throw new Error('Süper admin bu ekrandan oluşturulamaz.');
  }
  const db = dbFrom(ctx);
  const normalizedUsername = data.username.trim().toLowerCase();

  const existing = db.select().from(users).where(eq(users.username, normalizedUsername)).get();
  if (existing) {
    throw new Error('Bu kullanıcı adı zaten kullanılmaktadır.');
  }

  const email = data.eposta ? normalizeEmail(data.eposta) : null;
  if (email && !isValidEmail(email)) {
    throw new Error('Geçerli bir e-posta adresi girin.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(data.password, salt);
  const now = new Date().toISOString();

  const newUser = db
    .insert(users)
    .values({
      username: normalizedUsername,
      password_hash: passwordHash,
      eposta: email,
      full_name: data.full_name.trim(),
      role: data.role,
      is_active: true,
      failed_login_attempts: 0,
      created_at: now,
      updated_at: now
    })
    .returning()
    .get();

  if (email) {
    upsertEmailIndex(email, ctx?.companySlug ?? null, newUser.id);
  }

  await logAudit(
    {
      kullanici_id: adminUser.id,
      kullanici_adi: adminUser.username,
      islem: 'user_create',
      hedef_tablo: 'users',
      hedef_id: newUser.id,
      yeni_deger: { username: newUser.username, role: newUser.role, full_name: newUser.full_name },
      detay: `Yeni kullanıcı oluşturuldu: ${newUser.username} (${newUser.role})`
    },
    ctx
  );

  const { password_hash, ...safeUser } = newUser;
  return safeUser as User;
}

export async function updateUser(
  adminUser: User,
  targetUserId: number,
  data: {
    full_name?: string;
    role?: UserRole;
    eposta?: string | null;
    is_active?: boolean;
  },
  ctx?: TenantCtx
): Promise<User> {
  const db = dbFrom(ctx);
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) {
    throw new Error('Kullanıcı bulunamadı.');
  }
  if (data.role === 'superadmin') {
    throw new Error('Süper admin bu ekrandan atanamaz.');
  }
  if (adminUser.id === targetUserId && (data.role || data.is_active === false)) {
    throw new Error('Kendi rolünüzü veya aktifliğinizi değiştiremezsiniz.');
  }

  const patch: Record<string, any> = { updated_at: new Date().toISOString() };
  if (data.full_name !== undefined) {
    if (data.full_name.trim().length < 2) throw new Error('Ad soyad en az 2 karakter olmalıdır.');
    patch.full_name = data.full_name.trim();
  }
  if (data.role !== undefined) patch.role = data.role;
  if (data.is_active !== undefined) patch.is_active = data.is_active;

  const companySlug = ctx?.companySlug ?? null;
  if (data.eposta !== undefined) {
    const email = data.eposta ? normalizeEmail(data.eposta) : null;
    if (email && !isValidEmail(email)) {
      throw new Error('Geçerli bir e-posta adresi girin.');
    }
    removeEmailIndexForUser(companySlug, targetUserId);
    if (email) {
      upsertEmailIndex(email, companySlug, targetUserId);
    }
    patch.eposta = email;
  }

  const updated = db.update(users).set(patch).where(eq(users.id, targetUserId)).returning().get();

  await logAudit(
    {
      kullanici_id: adminUser.id,
      kullanici_adi: adminUser.username,
      islem: 'settings_update',
      hedef_tablo: 'users',
      hedef_id: targetUserId,
      eski_deger: { username: target.username, role: target.role },
      yeni_deger: { username: updated.username, role: updated.role },
      detay: `Kullanıcı güncellendi: ${target.username}`
    },
    ctx
  );

  const { password_hash, ...safeUser } = updated;
  return safeUser as User;
}

export async function deleteUser(adminUser: User, targetUserId: number, ctx?: TenantCtx) {
  const db = dbFrom(ctx);
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) {
    throw new Error('Kullanıcı bulunamadı.');
  }
  if (adminUser.id === targetUserId) {
    throw new Error('Kendinizi silemezsiniz.');
  }

  const companySlug = ctx?.companySlug ?? null;

  // Oturumları ve e-posta dizinini temizle
  deletePlatformSessionsForUser(companySlug, targetUserId);
  removeEmailIndexForUser(companySlug, targetUserId);
  db.delete(sessions).where(eq(sessions.user_id, targetUserId)).run();
  db.delete(users).where(eq(users.id, targetUserId)).run();

  await logAudit(
    {
      kullanici_id: adminUser.id,
      kullanici_adi: adminUser.username,
      islem: 'user_delete',
      hedef_tablo: 'users',
      hedef_id: targetUserId,
      eski_deger: { username: target.username, role: target.role },
      detay: `Kullanıcı silindi: ${target.username}`
    },
    ctx
  );
}

export async function resetUserPassword(
  adminUser: User,
  targetUserId: number,
  newPassword: string,
  ctx?: TenantCtx
) {
  const db = dbFrom(ctx);
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) {
    throw new Error('Kullanıcı bulunamadı.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(newPassword, salt);
  const now = new Date().toISOString();

  db.update(users)
    .set({
      password_hash: passwordHash,
      failed_login_attempts: 0,
      locked_until: null,
      updated_at: now
    })
    .where(eq(users.id, targetUserId))
    .run();

  const companySlug = (ctx as TenantCtx | undefined)?.companySlug ?? null;
  deletePlatformSessionsForUser(companySlug, targetUserId);
  db.delete(sessions).where(eq(sessions.user_id, targetUserId)).run();

  await logAudit(
    {
      kullanici_id: adminUser.id,
      kullanici_adi: adminUser.username,
      islem: 'settings_update',
      hedef_tablo: 'users',
      hedef_id: targetUserId,
      detay: `Kullanıcı parolası sıfırlandı: ${target.username}`
    },
    ctx
  );
}

export async function listUsers(ctx?: TenantCtx): Promise<User[]> {
  const db = dbFrom(ctx);
  const all = db.select().from(users).all();
  return all.map(({ password_hash, ...u }) => u as User);
}
