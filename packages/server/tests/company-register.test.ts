import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { initDatabase } from '../src/db/index.js';
import { initPlatformDb, closePlatformDb, findByEmail } from '../src/db/platform.js';
import { getDevOutbox, clearDevOutbox } from '../src/services/mailer.js';
import { buildApp } from '../src/app.js';

describe('Faz 2 revize: e-posta girisi ve firma kaydi', () => {
  let app: any;
  let tmpDir = '';

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'register-test-'));
    process.env.DATA_DIR = tmpDir;
    clearDevOutbox();
    initPlatformDb({ platformDbPath: path.join(tmpDir, 'platform.sqlite') });
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });
  });

  afterEach(() => {
    closePlatformDb();
    delete process.env.DATA_DIR;
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  });

  it('yeni firma kaydi dogrulama bekler, kodla aktiflesir', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/companies/register',
      payload: {
        company_ad: 'Ahmet Otomotiv',
        eposta: 'ahmet@ornek.com',
        telefon: '05321112233',
        admin_ad: 'Ahmet Usta',
        admin_password: 'AhmetSecret123'
      }
    });
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.success).toBe(true);
    expect(body.pending).toBe(true);
    expect(body.token).toBeUndefined();
    expect(body.company.slug).toBe('ahmet-otomotiv');

    // Kiracı dosyası gerçekten oluştu
    expect(fs.existsSync(path.join(tmpDir, 'tenants', 'ahmet-otomotiv.sqlite'))).toBe(true);

    // Doğrulamadan giriş engellenir
    const blocked = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'ahmet@ornek.com', password: 'AhmetSecret123' }
    });
    expect(blocked.statusCode).toBe(401);

    // Yanlış kod reddedilir
    const wrong = await app.inject({
      method: 'POST',
      url: '/api/companies/verify',
      payload: { eposta: 'ahmet@ornek.com', kod: '000000' }
    });
    expect(wrong.statusCode).toBe(400);

    // Doğru kod (dev outbox) aktifleştirir ve giriş yaptırır
    const code = getDevOutbox().find((m) => m.to === 'ahmet@ornek.com')?.code;
    expect(code).toMatch(/^\d{6}$/);
    const verified = await app.inject({
      method: 'POST',
      url: '/api/companies/verify',
      payload: { eposta: 'ahmet@ornek.com', kod: code }
    });
    expect(verified.statusCode).toBe(200);
    const vbody = JSON.parse(verified.body);
    expect(vbody.token).toBeDefined();
    expect(vbody.user.username).toBe('admin');

    // Dükkan adı formdan geldi
    const me = await app.inject({
      method: 'GET',
      url: '/api/settings',
      headers: { authorization: `Bearer ${vbody.token}` }
    });
    expect(JSON.parse(me.body).settings.shop_name).toBe('Ahmet Otomotiv');
  });

  it('dogrulanmis e-posta ile ikinci firma acilmasini engeller', async () => {
    const payload = {
      company_ad: 'Firma Bir',
      eposta: 'ortak@ornek.com',
      admin_ad: 'Yetkili Bir',
      admin_password: 'Secret1234'
    };
    await app.inject({ method: 'POST', url: '/api/companies/register', payload });
    const code = getDevOutbox().find((m) => m.to === 'ortak@ornek.com')?.code;
    await app.inject({ method: 'POST', url: '/api/companies/verify', payload: { eposta: 'ortak@ornek.com', kod: code } });

    const second = await app.inject({
      method: 'POST',
      url: '/api/companies/register',
      payload: { ...payload, company_ad: 'Firma İki', admin_ad: 'Yetkili İki' }
    });
    expect(second.statusCode).toBe(400);
    expect(JSON.parse(second.body).error).toContain('zaten kayıtlı');
  });

  it('bekleyen kayda tekrar kayit kod tazeler, kopya sirket acmaz', async () => {
    const payload = {
      company_ad: 'Tekrar Firma',
      eposta: 'tekrar@ornek.com',
      admin_ad: 'Tekrar Yetkili',
      admin_password: 'Secret1234'
    };
    const first = await app.inject({ method: 'POST', url: '/api/companies/register', payload });
    expect(JSON.parse(first.body).company.slug).toBe('tekrar-firma');

    const second = await app.inject({ method: 'POST', url: '/api/companies/register', payload });
    expect(second.statusCode).toBe(200);
    expect(JSON.parse(second.body).company.slug).toBe('tekrar-firma');
    expect(JSON.parse(second.body).pending).toBe(true);
  });

  it('e-posta ile giriş yapar, firma bağlamını çözer', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/companies/register',
      payload: {
        company_ad: 'Eposta Test',
        eposta: 'eposta@ornek.com',
        admin_ad: 'Eposta Yetkili',
        admin_password: 'Secret1234'
      }
    });
    const code = getDevOutbox().find((m) => m.to === 'eposta@ornek.com')?.code;
    await app.inject({
      method: 'POST',
      url: '/api/companies/verify',
      payload: { eposta: 'eposta@ornek.com', kod: code }
    });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'eposta@ornek.com', password: 'Secret1234' }
    });
    expect(login.statusCode).toBe(200);
    const body = JSON.parse(login.body);
    expect(body.company.slug).toBe('eposta-test');

    // Büyük/küçük harf duyarsız
    const loginUpper = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'EPOSTA@ornek.com', password: 'Secret1234' }
    });
    expect(loginUpper.statusCode).toBe(200);

    // Kayıtsız e-posta genel hata verir
    const missing = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'yok@ornek.com', password: 'Secret1234' }
    });
    expect(missing.statusCode).toBe(401);
  });

  it('e-postasız eski hesap kullanıcı adıyla girmeye devam eder', async () => {
    const { setupInitialAdmin } = await import('../src/services/authService.js');
    await setupInitialAdmin({ username: 'eskimez', password: 'EskiSecret123', full_name: 'Eski Kullanıcı' });

    const login = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'eskimez', password: 'EskiSecret123' }
    });
    expect(login.statusCode).toBe(200);
    expect(JSON.parse(login.body).user.username).toBe('eskimez');
  });

  it('kullanıcı güncelleme e-posta atar ve dizini senkron tutar', async () => {
    const { setupInitialAdmin, loginUser } = await import('../src/services/authService.js');
    const admin = (await setupInitialAdmin({
      username: 'admin',
      password: 'AdminSecret123',
      full_name: 'Yönetici'
    })) as any;
    const adminToken = (await loginUser('admin', 'AdminSecret123')).token;

    // E-postalı kullanıcı oluştur
    const created = await app.inject({
      method: 'POST',
      url: '/api/auth/users',
      headers: { authorization: `Bearer ${adminToken}` },
      payload: {
        username: 'kasiyer1',
        password: 'KasiyerSecret123',
        full_name: 'Kasiyer Bir',
        eposta: 'kasiyer@ornek.com',
        role: 'cashier'
      }
    });
    expect(created.statusCode).toBe(200);
    const userId = JSON.parse(created.body).user.id;
    expect(findByEmail('kasiyer@ornek.com')?.user_id).toBe(userId);

    // E-postayla giriş yapabilir
    const emailLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { identifier: 'kasiyer@ornek.com', password: 'KasiyerSecret123' }
    });
    expect(emailLogin.statusCode).toBe(200);

    // E-postayı değiştir
    const updated = await app.inject({
      method: 'PUT',
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { eposta: 'yeni@ornek.com' }
    });
    expect(updated.statusCode).toBe(200);
    expect(findByEmail('kasiyer@ornek.com')).toBeUndefined();
    expect(findByEmail('yeni@ornek.com')?.user_id).toBe(userId);

    // Kullanıcıyı silince dizinden de düşer
    const deleted = await app.inject({
      method: 'DELETE',
      url: `/api/auth/users/${userId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(deleted.statusCode).toBe(200);
    expect(findByEmail('yeni@ornek.com')).toBeUndefined();
  });
});
