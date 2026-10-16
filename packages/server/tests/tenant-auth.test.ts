import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import bcrypt from 'bcryptjs';
import Database from 'better-sqlite3';
import { initDatabase, users } from '../src/db/index.js';
import {
  initPlatformDb,
  closePlatformDb,
  createCompany,
  createPlatformUser,
  migrateLegacySessions
} from '../src/db/platform.js';
import { openTenantHandles } from '../src/tenantContext.js';
import { buildApp } from '../src/app.js';

describe('Faz 2: firma_kodu ile giris ve kiracı izolasyonu', () => {
  let app: any;
  let tmpDir = '';
  let tenantToken = '';
  let legacyToken = '';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tenant-auth-test-'));
    process.env.DATA_DIR = tmpDir;
    initPlatformDb({ platformDbPath: path.join(tmpDir, 'platform.sqlite') });
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });

    // Varsayılan (legacy) kiracıda bir admin
    const { setupInitialAdmin, loginUser } = await import('../src/services/authService.js');
    await setupInitialAdmin({ username: 'admin', password: 'AdminPassword123', full_name: 'Varsayılan Yönetici' });
    legacyToken = (await loginUser('admin', 'AdminPassword123')).token;

    // Kiracı şirket + tenant DB + kiracı admini
    createCompany({ slug: 'cinar-otomotiv', ad: 'Çınar Otomotiv', telefon: '05307665260' });
    const handles = openTenantHandles('cinar-otomotiv');
    const now = new Date().toISOString();
    const hash = await bcrypt.hash('CinarSecret123', 10);
    handles.db
      .insert(users)
      .values({
        username: 'cinaradmin',
        password_hash: hash,
        full_name: 'Çınar Yönetici',
        role: 'admin',
        is_active: true,
        failed_login_attempts: 0,
        created_at: now,
        updated_at: now
      })
      .run();
  });

  afterEach(() => {
    closePlatformDb();
    delete process.env.DATA_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('firma_kodu ile kiracı giriş yapar ve şirket bilgisi döner', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { firma_kodu: 'cinar-otomotiv', username: 'cinaradmin', password: 'CinarSecret123' }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.token).toBeDefined();
    expect(body.company.slug).toBe('cinar-otomotiv');
    tenantToken = body.token;

    const me = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${tenantToken}` }
    });
    expect(me.statusCode).toBe(200);
    expect(JSON.parse(me.body).user.username).toBe('cinaradmin');
  });

  it('hatalı firma kodu ve pasif şirket girişi engeller', async () => {
    const bad = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { firma_kodu: 'olmayan-firma', username: 'x', password: 'y' }
    });
    expect(bad.statusCode).toBe(401);
    expect(JSON.parse(bad.body).error).toContain('Firma kodu');

    // Şirketi pasife al
    const { getPlatformDb } = await import('../src/db/platform.js');
    getPlatformDb().prepare("UPDATE companies SET durum = 'suspended' WHERE slug = 'cinar-otomotiv'").run();

    const suspended = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { firma_kodu: 'cinar-otomotiv', username: 'cinaradmin', password: 'CinarSecret123' }
    });
    expect(suspended.statusCode).toBe(401);
    expect(JSON.parse(suspended.body).error).toContain('pasif');
  });

  it('kiracı verisi varsayılan DB ile karışmaz', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { firma_kodu: 'cinar-otomotiv', username: 'cinaradmin', password: 'CinarSecret123' }
    });
    const token = JSON.parse(login.body).token;

    // Kiracı olarak müşteri oluştur
    const created = await app.inject({
      method: 'POST',
      url: '/api/customers',
      headers: { authorization: `Bearer ${token}` },
      payload: { ad_soyad: 'Kiracı Müşteri', telefon: '05311112233' }
    });
    expect(created.statusCode).toBe(200);

    // Legacy oturum kiracı müşterisini göremez
    const legacyList = await app.inject({
      method: 'GET',
      url: '/api/customers?q=Kiracı',
      headers: { authorization: `Bearer ${legacyToken}` }
    });
    expect(JSON.parse(legacyList.body).items.length).toBe(0);

    // Kiracı oturum legacy müşteriyi göremez
    const tenantList = await app.inject({
      method: 'GET',
      url: '/api/customers',
      headers: { authorization: `Bearer ${token}` }
    });
    const names = JSON.parse(tenantList.body).items.map((c: any) => c.ad_soyad);
    expect(names).toEqual(['Kiracı Müşteri']);
  });

  it('süper admin girişi ve firma listesi çalışır', async () => {
    const hash = await bcrypt.hash('SuperSecret123', 10);
    createPlatformUser({ username: 'patron', password_hash: hash, full_name: 'Platform Sahibi' });

    const login = await app.inject({
      method: 'POST',
      url: '/api/platform/login',
      payload: { username: 'patron', password: 'SuperSecret123' }
    });
    expect(login.statusCode).toBe(200);
    const body = JSON.parse(login.body);
    expect(body.user.role).toBe('superadmin');

    const companies = await app.inject({
      method: 'GET',
      url: '/api/platform/companies',
      headers: { authorization: `Bearer ${body.token}` }
    });
    expect(companies.statusCode).toBe(200);
    expect(JSON.parse(companies.body).companies.length).toBe(1);

    // Normal kullanıcı süper admin uçlarına giremez
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/platform/companies',
      headers: { authorization: `Bearer ${legacyToken}` }
    });
    expect(forbidden.statusCode).toBe(403);
  });

  it('legacy oturum satırlarını platforma taşır', () => {
    const legacyFile = path.join(tmpDir, 'legacy.sqlite');
    const legacy = new Database(legacyFile);
    legacy.exec(
      `CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL);
       INSERT INTO sessions VALUES ('tok-1', 1, '2999-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
       INSERT INTO sessions VALUES ('tok-2', 2, '2999-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');`
    );
    const moved = migrateLegacySessions(legacy);
    legacy.close();
    expect(moved).toBe(2);
    // Tekrar çalıştırma çift kayıt üretmez
    const legacy2 = new Database(legacyFile, { readonly: true });
    expect(migrateLegacySessions(legacy2)).toBe(0);
    legacy2.close();
  });
});
