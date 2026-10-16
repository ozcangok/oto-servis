import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';
import { users } from '../db/index.js';
import {
  createCompany,
  createPlatformSession,
  getCompanyBySlug,
  normalizeCompanySlug,
  isValidCompanySlug,
  isValidEmail,
  normalizeEmail,
  upsertEmailIndex,
  getEmailVerification,
  upsertEmailVerification,
  bumpVerificationAttempts,
  deleteEmailVerification,
  setCompanyStatus,
  findByEmail,
  type Company
} from '../db/platform.js';
import { openTenantHandles, type TenantCtx } from '../tenantContext.js';
import { updateSettings } from './settingsService.js';
import { loginTenantUser } from './authService.js';
import { sendOtpEmail } from './mailer.js';
import { logAudit } from './auditService.js';
import type { User } from '@oto-servis/shared';

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export interface RegisterCompanyInput {
  company_ad: string;
  eposta: string;
  telefon?: string | null;
  adres?: string | null;
  admin_ad: string;
  admin_password: string;
}

function uniqueSlug(base: string): string {
  let slug = base;
  for (let i = 2; i <= 20; i++) {
    if (isValidCompanySlug(slug) && !getCompanyBySlug(slug)) {
      return slug;
    }
    slug = `${base}-${i}`;
  }
  throw new Error('Uygun bir firma kodu üretilemedi.');
}

function generateOtp(): { code: string; hash: string } {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const hash = crypto.createHash('sha256').update(code).digest('hex');
  return { code, hash };
}

function validateRegisterInput(input: RegisterCompanyInput): { companyAd: string; email: string; adminAd: string } {
  const companyAd = (input.company_ad || '').trim();
  const email = normalizeEmail(input.eposta || '');
  const adminAd = (input.admin_ad || '').trim();

  if (companyAd.length < 2) {
    throw new Error('Firma adı en az 2 karakter olmalıdır.');
  }
  if (!isValidEmail(email)) {
    throw new Error('Geçerli bir e-posta adresi girin.');
  }
  if (adminAd.length < 2) {
    throw new Error('Yetkili ad soyadı en az 2 karakter olmalıdır.');
  }
  if (!input.admin_password || input.admin_password.length < 6) {
    throw new Error('Parola en az 6 karakter olmalıdır.');
  }
  return { companyAd, email, adminAd };
}

/**
 * Yeni firma kaydı: şirket (doğrulama bekliyor) + kiracı dosyası +
 * pasif yönetici + OTP e-postası. Panel girişi doğrulamadan sonra.
 */
export async function registerCompany(input: RegisterCompanyInput): Promise<{
  pending: true;
  email: string;
  company: Company;
  mailSent: boolean;
  devMode: boolean;
}> {
  const { companyAd, email, adminAd } = validateRegisterInput(input);

  if (findByEmail(email)) {
    throw new Error('Bu e-posta adresi zaten kayıtlı. Giriş yapmayı deneyin.');
  }

  // Bekleyen doğrulaması varsa şirketi yeniden kurmadan kod tazele
  const pending = getEmailVerification(email);
  if (pending) {
    const company = getCompanyBySlug(pending.company_slug);
    if (company && company.durum === 'pending_verification') {
      const { code, hash } = generateOtp();
      upsertEmailVerification({
        eposta: email,
        kod_hash: hash,
        company_slug: pending.company_slug,
        user_id: pending.user_id,
        expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString()
      });
      const mail = await sendOtpEmail(email, code, company.ad);
      return { pending: true, email, company, mailSent: mail.sent, devMode: mail.devMode };
    }
    deleteEmailVerification(email);
  }

  const baseSlug = normalizeCompanySlug(companyAd);
  const slug = uniqueSlug(baseSlug);

  const company = createCompany({
    slug,
    ad: companyAd,
    eposta: email,
    telefon: input.telefon?.trim() || null,
    adres: input.adres?.trim() || null,
    durum: 'pending_verification'
  });

  const handles = openTenantHandles(slug);
  const now = new Date().toISOString();
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(input.admin_password, salt);

  const admin = handles.db
    .insert(users)
    .values({
      username: 'admin',
      password_hash: passwordHash,
      eposta: email,
      full_name: adminAd,
      role: 'admin',
      is_active: false,
      failed_login_attempts: 0,
      created_at: now,
      updated_at: now
    })
    .returning()
    .get();

  const ctx: TenantCtx = { db: handles.db, sqlite: handles.sqlite, companySlug: slug };

  await updateSettings(
    {
      shop_name: companyAd,
      shop_phone: input.telefon?.trim() || ''
    } as any,
    ctx
  );

  await logAudit(
    {
      kullanici_id: admin.id,
      kullanici_adi: admin.username,
      islem: 'user_create',
      hedef_tablo: 'users',
      hedef_id: admin.id,
      detay: `Firma kaydı (doğrulama bekleniyor): ${companyAd} (${slug})`
    },
    ctx
  );

  const { code, hash } = generateOtp();
  upsertEmailVerification({
    eposta: email,
    kod_hash: hash,
    company_slug: slug,
    user_id: admin.id,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString()
  });

  const mail = await sendOtpEmail(email, code, companyAd);
  return { pending: true, email, company, mailSent: mail.sent, devMode: mail.devMode };
}

/**
 * Doğrulama kodunu kontrol eder; doğruysa hesabı aktifleştirip giriş yaptırır.
 */
export async function verifyCompanyEmail(input: { eposta: string; kod: string }): Promise<{
  token: string;
  user: Omit<User, 'password_hash'>;
  company: Company;
}> {
  const email = normalizeEmail(input.eposta || '');
  const code = (input.kod || '').trim();

  const row = getEmailVerification(email);
  if (!row) {
    throw new Error('Doğrulama kaydı bulunamadı. Yeniden kod isteyin.');
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteEmailVerification(email);
    throw new Error('Kodun süresi dolmuş. Yeniden kod isteyin.');
  }
  if (row.attempts >= OTP_MAX_ATTEMPTS) {
    deleteEmailVerification(email);
    throw new Error('Çok fazla hatalı deneme. Yeniden kod isteyin.');
  }

  const hash = crypto.createHash('sha256').update(code).digest('hex');
  const match =
    hash.length === row.kod_hash.length && crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(row.kod_hash));
  if (!match) {
    const attempts = bumpVerificationAttempts(email);
    const remaining = Math.max(0, OTP_MAX_ATTEMPTS - attempts);
    if (remaining <= 0) {
      deleteEmailVerification(email);
      throw new Error('Çok fazla hatalı deneme. Yeniden kod isteyin.');
    }
    throw new Error(`Kod hatalı. Kalan deneme hakkı: ${remaining}`);
  }

  const company = getCompanyBySlug(row.company_slug);
  if (!company) {
    deleteEmailVerification(email);
    throw new Error('Firma kaydı bulunamadı.');
  }

  const handles = openTenantHandles(row.company_slug);
  const now = new Date().toISOString();
  handles.db.update(users).set({ is_active: true, updated_at: now }).where(eq(users.id, row.user_id)).run();
  setCompanyStatus(row.company_slug, 'active');
  upsertEmailIndex(email, row.company_slug, row.user_id);
  deleteEmailVerification(email);

  await logAudit(
    {
      kullanici_id: row.user_id,
      islem: 'user_login',
      hedef_tablo: 'users',
      hedef_id: row.user_id,
      detay: `E-posta doğrulandı, firma aktifleşti: ${company.ad}`
    },
    { db: handles.db, sqlite: handles.sqlite }
  );

  // Parola bu adımda bilinmediği için platform oturumu doğrudan açılır
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  createPlatformSession({ token, company_slug: row.company_slug, user_id: row.user_id, expires_at: expiresAt });

  const user = handles.db.select().from(users).where(eq(users.id, row.user_id)).get();
  if (!user) {
    deleteEmailVerification(email);
    throw new Error('Kullanıcı kaydı bulunamadı.');
  }
  const { password_hash, ...safeUser } = user;
  const freshCompany = getCompanyBySlug(row.company_slug)!;
  return { token, user: safeUser as User, company: freshCompany };
}

/**
 * Doğrulama kodunu yeniden gönderir.
 */
export async function resendVerificationCode(eposta: string): Promise<{ mailSent: boolean; devMode: boolean }> {
  const email = normalizeEmail(eposta || '');
  const row = getEmailVerification(email);
  if (!row) {
    throw new Error('Doğrulama kaydı bulunamadı. Önce kayıt olun.');
  }
  const company = getCompanyBySlug(row.company_slug);
  if (!company) {
    deleteEmailVerification(email);
    throw new Error('Firma kaydı bulunamadı.');
  }

  const { code, hash } = generateOtp();
  upsertEmailVerification({
    eposta: email,
    kod_hash: hash,
    company_slug: row.company_slug,
    user_id: row.user_id,
    expires_at: new Date(Date.now() + OTP_TTL_MS).toISOString()
  });

  const mail = await sendOtpEmail(email, code, company.ad);
  return { mailSent: mail.sent, devMode: mail.devMode };
}
