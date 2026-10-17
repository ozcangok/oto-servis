import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq, and, sql } from 'drizzle-orm';
import { getDb, users, sessions } from '../db/index.js';
import { logAudit } from './auditService.js';
import type { UserRole, User } from '@oto-servis/shared';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;
const SESSION_TTL_DAYS = 30;

// Giriş hatalarında kullanıcı adı numaralandırmasını (ve yanıt zamanı sızıntısını)
// önlemek için TÜM başarısız denemeler birebir aynı mesajı döner.
const INVALID_CREDENTIALS_MESSAGE = 'Kullanıcı adı/e-posta veya parola hatalı.';
// Var olmayan kullanıcıda da bcrypt maliyetini ödemek için sabit bir hash.
const DUMMY_HASH = bcrypt.hashSync('gecersiz-kullanici-zamanlama-esitlemesi', 10);

export async function isSetupNeeded(): Promise<boolean> {
  const db = getDb();
  const row = db.select({ count: sql<number>`count(*)` }).from(users).get();
  return (row?.count ?? 0) === 0;
}

export async function setupInitialAdmin(data: {
  username: string;
  password: string;
  full_name: string;
}) {
  const needed = await isSetupNeeded();
  if (!needed) {
    throw new Error('Sistem kurulumu daha önce tamamlanmış. Yeni yönetici mevcut yönetim panelinden eklenmelidir.');
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(data.password, salt);
  const now = new Date().toISOString();

  const db = getDb();
  const result = db.insert(users).values({
    username: data.username.trim().toLowerCase(),
    password_hash: passwordHash,
    full_name: data.full_name.trim(),
    role: 'owner',
    is_active: true,
    failed_login_attempts: 0,
    created_at: now,
    updated_at: now
  }).returning().get();

  await logAudit({
    kullanici_id: result.id,
    kullanici_adi: result.username,
    islem: 'user_create',
    hedef_tablo: 'users',
    hedef_id: result.id,
    yeni_deger: { username: result.username, role: result.role },
    detay: 'İlk kurulum: Ana yönetici hesabı oluşturuldu'
  });

  return result;
}

export async function loginUser(
  usernameInput: string,
  passwordInput: string,
  ipAddress?: string
): Promise<{ token: string; user: Omit<User, 'password_hash'> }> {
  const db = getDb();
  const identifier = usernameInput.trim().toLowerCase();

  // Kullanıcı adı veya e-posta ile giriş yapılabilir (tek dükkân modeli).
  let user = db.select().from(users).where(eq(users.username, identifier)).get();
  if (!user) {
    user = db
      .select()
      .from(users)
      .where(sql`lower(${users.eposta}) = ${identifier}`)
      .get();
  }

  if (!user) {
    // Kullanıcı adı numaralandırmayı ve zamanlama sızıntısını önlemek için
    // kayıt olmasa da bcrypt karşılaştırması yapıp aynı genel hatayı döneriz.
    await bcrypt.compare(passwordInput, DUMMY_HASH);
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
  }

  if (!user.is_active) {
    throw new Error('Bu kullanıcı hesabı devre dışı bırakılmıştır. Lütfen yöneticinize başvurun.');
  }

  // Check brute force lockout
  if (user.locked_until) {
    const lockTime = new Date(user.locked_until).getTime();
    if (Date.now() < lockTime) {
      const remainingMinutes = Math.ceil((lockTime - Date.now()) / (60 * 1000));
      throw new Error(`Çok fazla hatalı giriş denemesi. Hesabınız ${remainingMinutes} dakika kilitlidir.`);
    }
  }

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

    // Kalan deneme hakkını (ve dolayısıyla kullanıcının varlığını) ele vermeyiz;
    // hatasız kullanıcı ile birebir aynı mesaj döner.
    throw new Error(INVALID_CREDENTIALS_MESSAGE);
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

  // Create session
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

  db.insert(sessions).values({
    id: token,
    user_id: user.id,
    expires_at: expiresAt,
    created_at: now.toISOString()
  }).run();

  await logAudit({
    kullanici_id: user.id,
    kullanici_adi: user.username,
    islem: 'user_login',
    hedef_tablo: 'users',
    hedef_id: user.id,
    ip_adresi: ipAddress,
    detay: 'Başarılı kullanıcı girişi'
  });

  const { password_hash, ...safeUser } = user;
  return {
    token,
    user: safeUser as User
  };
}

export async function validateSession(token: string): Promise<User | null> {
  if (!token) return null;
  const db = getDb();

  const session = db.select().from(sessions).where(eq(sessions.id, token)).get();
  if (!session) return null;

  const expiresTime = new Date(session.expires_at).getTime();
  if (Date.now() > expiresTime) {
    db.delete(sessions).where(eq(sessions.id, token)).run();
    return null;
  }

  const user = db.select().from(users).where(eq(users.id, session.user_id)).get();
  if (!user || !user.is_active) {
    return null;
  }

  const { password_hash, ...safeUser } = user;
  return safeUser as User;
}

export async function logoutUser(token: string) {
  if (!token) return;
  const db = getDb();
  db.delete(sessions).where(eq(sessions.id, token)).run();
}

export async function createUser(
  adminUser: User,
  data: {
    username: string;
    password: string;
    full_name: string;
    role: UserRole;
    eposta?: string | null;
  }
): Promise<User> {
  const db = getDb();
  const normalizedUsername = data.username.trim().toLowerCase();
  const normalizedEmail = data.eposta?.trim().toLowerCase() || null;

  if (data.role !== 'owner' && data.role !== 'staff') {
    throw new Error('Geçersiz rol. Yalnızca "owner" veya "staff" tanımlanabilir.');
  }

  const existing = db.select().from(users).where(eq(users.username, normalizedUsername)).get();
  if (existing) {
    throw new Error('Bu kullanıcı adı zaten kullanılmaktadır.');
  }

  if (normalizedEmail) {
    const emailTaken = db
      .select()
      .from(users)
      .where(sql`lower(${users.eposta}) = ${normalizedEmail}`)
      .get();
    if (emailTaken) {
      throw new Error('Bu e-posta adresi başka bir kullanıcıda kayıtlı.');
    }
  }

  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(data.password, salt);
  const now = new Date().toISOString();

  const newUser = db.insert(users).values({
    username: normalizedUsername,
    eposta: normalizedEmail,
    password_hash: passwordHash,
    full_name: data.full_name.trim(),
    role: data.role,
    is_active: true,
    failed_login_attempts: 0,
    created_at: now,
    updated_at: now
  }).returning().get();

  await logAudit({
    kullanici_id: adminUser.id,
    kullanici_adi: adminUser.username,
    islem: 'user_create',
    hedef_tablo: 'users',
    hedef_id: newUser.id,
    yeni_deger: { username: newUser.username, role: newUser.role, full_name: newUser.full_name },
    detay: `Yeni kullanıcı oluşturuldu: ${newUser.username} (${newUser.role})`
  });

  const { password_hash, ...safeUser } = newUser;
  return safeUser as User;
}

export async function deleteUser(adminUser: User, targetUserId: number) {
  if (adminUser.id === targetUserId) {
    throw new Error('Kendinizi silemezsiniz.');
  }

  const db = getDb();
  const target = db.select().from(users).where(eq(users.id, targetUserId)).get();
  if (!target) {
    throw new Error('Kullanıcı bulunamadı.');
  }

  // Delete sessions first
  db.delete(sessions).where(eq(sessions.user_id, targetUserId)).run();
  db.delete(users).where(eq(users.id, targetUserId)).run();

  await logAudit({
    kullanici_id: adminUser.id,
    kullanici_adi: adminUser.username,
    islem: 'user_delete',
    hedef_tablo: 'users',
    hedef_id: targetUserId,
    eski_deger: { username: target.username, role: target.role },
    detay: `Kullanıcı silindi: ${target.username}`
  });
}

export async function resetUserPassword(
  adminUser: User,
  targetUserId: number,
  newPassword: string
) {
  const db = getDb();
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

  // Invalidate user's existing sessions
  db.delete(sessions).where(eq(sessions.user_id, targetUserId)).run();

  await logAudit({
    kullanici_id: adminUser.id,
    kullanici_adi: adminUser.username,
    islem: 'user_password_reset',
    hedef_tablo: 'users',
    hedef_id: targetUserId,
    detay: `Kullanıcı parolası sıfırlandı: ${target.username}`
  });
}

export async function listUsers(): Promise<User[]> {
  const db = getDb();
  const all = db.select().from(users).all();
  return all.map(({ password_hash, ...u }) => u as User);
}
