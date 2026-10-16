import { describe, it, expect, beforeEach } from 'vitest';
import { initDatabase, getDb, users, sessions } from '../src/db/index.js';
import {
  isSetupNeeded,
  setupInitialAdmin,
  loginUser,
  createUser,
  listUsers,
  resetUserPassword,
  deleteUser
} from '../src/services/authService.js';
import { buildApp } from '../src/app.js';

describe('Auth Service and RBAC Permissions', () => {
  beforeEach(() => {
    // Isolated in-memory database for each test suite
    initDatabase({ inMemory: true });
  });

  it('detects fresh database and completes initial admin setup', async () => {
    expect(await isSetupNeeded()).toBe(true);

    const admin = await setupInitialAdmin({
      username: 'admin',
      password: 'SuperSecretPassword123',
      full_name: 'Ahmet Usta'
    });

    expect(admin.username).toBe('admin');
    expect(admin.role).toBe('owner');
    expect(admin.full_name).toBe('Ahmet Usta');

    // Second call must fail
    expect(await isSetupNeeded()).toBe(false);
    await expect(
      setupInitialAdmin({
        username: 'admin2',
        password: 'password',
        full_name: 'Ali'
      })
    ).rejects.toThrow('Sistem kurulumu daha önce tamamlanmış');
  });

  it('authenticates user and creates valid session', async () => {
    await setupInitialAdmin({
      username: 'admin',
      password: 'CorrectPassword123',
      full_name: 'Ahmet Usta'
    });

    const loginRes = await loginUser('admin', 'CorrectPassword123');
    expect(loginRes.token).toBeDefined();
    expect(loginRes.user.username).toBe('admin');
    expect(loginRes.user.role).toBe('owner');
  });

  it('protects against brute force: locks account after 5 failed attempts', async () => {
    await setupInitialAdmin({
      username: 'admin',
      password: 'CorrectPassword123',
      full_name: 'Ahmet Usta'
    });

    // 4 failed attempts
    for (let i = 1; i <= 4; i++) {
      await expect(loginUser('admin', 'WrongPassword')).rejects.toThrow(
        /parola hatalı/
      );
    }

    // 5th attempt locks the account
    await expect(loginUser('admin', 'WrongPassword')).rejects.toThrow(
      /5 hatalı giriş nedeniyle hesabınız 15 dakika süreyle kilitlenmiştir/
    );

    // Subsequent attempt even with correct password is rejected due to lockout
    await expect(loginUser('admin', 'CorrectPassword123')).rejects.toThrow(
      /Çok fazla hatalı giriş denemesi. Hesabınız/
    );
  });

  it('allows owner to create staff users and manage them', async () => {
    const admin = await setupInitialAdmin({
      username: 'admin',
      password: 'AdminPassword123',
      full_name: 'Patron'
    });

    // Create staff
    const cashier = await createUser(admin as any, {
      username: 'eleman1',
      password: 'CashierPassword123',
      full_name: 'Mehmet Eleman',
      role: 'staff'
    });
    expect(cashier.role).toBe('staff');

    // Create second staff
    const mechanic = await createUser(admin as any, {
      username: 'usta1',
      password: 'MechanicPassword123',
      full_name: 'Hasan Usta',
      role: 'staff'
    });
    expect(mechanic.role).toBe('staff');

    const allUsers = await listUsers();
    expect(allUsers.length).toBe(3);

    // Reset staff password
    await resetUserPassword(admin as any, mechanic.id, 'NewMechanicPassword456');
    const ustaLogin = await loginUser('usta1', 'NewMechanicPassword456');
    expect(ustaLogin.user.id).toBe(mechanic.id);

    // Delete first staff
    await deleteUser(admin as any, cashier.id);
    const remainingUsers = await listUsers();
    expect(remainingUsers.length).toBe(2);
  });

  it('serves auth endpoints via Fastify app', async () => {
    const app = await buildApp({ enableRateLimit: false });

    // Check setup status
    const resSetup = await app.inject({
      method: 'GET',
      url: '/api/auth/setup-status'
    });
    expect(resSetup.statusCode).toBe(200);
    expect(JSON.parse(resSetup.body)).toEqual({ needed: true });

    // Run setup
    const resDoSetup = await app.inject({
      method: 'POST',
      url: '/api/auth/setup',
      payload: {
        username: 'admin',
        password: 'AdminPassword123',
        full_name: 'Servis Yöneticisi'
      }
    });
    expect(resDoSetup.statusCode).toBe(200);
    const setupData = JSON.parse(resDoSetup.body);
    expect(setupData.success).toBe(true);
    expect(setupData.user.username).toBe('admin');
    expect(resDoSetup.headers['set-cookie']).toBeDefined();

    // Login with wrong password
    const resFail = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'Wrong' }
    });
    expect(resFail.statusCode).toBe(401);
    expect(JSON.parse(resFail.body).success).toBe(false);

    // Login with correct password
    const resLogin = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { username: 'admin', password: 'AdminPassword123' }
    });
    expect(resLogin.statusCode).toBe(200);
    const loginData = JSON.parse(resLogin.body);
    expect(loginData.success).toBe(true);

    // Verify session via /api/auth/me using token
    const resMe = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: `Bearer ${loginData.token}`
      }
    });
    expect(resMe.statusCode).toBe(200);
    expect(JSON.parse(resMe.body).user.username).toBe('admin');
  });
});
