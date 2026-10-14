import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import path from 'path';
import fs from 'fs';
import { initDatabase, getDb, customers, vehicles, parts, workOrders, payments } from '../src/db/index.js';
import { createBackup, restoreBackup, getBackupStatus } from '../src/services/backupService.js';
import { normalizePlate, formatPlateDisplay } from '@oto-servis/shared';
import { eq } from 'drizzle-orm';

describe('Phase 6: Backup & Disaster Recovery Restore Test', () => {
  const testDir = path.join(process.cwd(), 'scratch', 'backup-test');
  const testDbDir = path.join(testDir, 'data');
  const testBackupDir = path.join(testDir, 'backups');
  const testDbPath = path.join(testDbDir, 'oto-servis.sqlite');

  beforeEach(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
    fs.mkdirSync(testDbDir, { recursive: true });
    fs.mkdirSync(testBackupDir, { recursive: true });

    process.env.DATA_DIR = testDbDir;
    process.env.BACKUP_DIR = testBackupDir;

    initDatabase({ dbPath: testDbPath });
  });

  afterEach(() => {
    try {
      if (fs.existsSync(testDir)) {
        fs.rmSync(testDir, { recursive: true, force: true });
      }
    } catch {}
  });

  it('performs full backup, deletes database, restores and verifies all records are identical', async () => {
    const db = getDb();
    const now = new Date().toISOString();

    // 1. Insert test records
    const cust = db.insert(customers).values({
      ad_soyad: 'Hasan Yedektest',
      telefon: '05339998877',
      eposta: 'hasan@yedek.com',
      created_at: now,
      updated_at: now
    }).returning().get();

    const veh = db.insert(vehicles).values({
      musteri_id: cust.id,
      plaka_norm: normalizePlate('34 BAK 99'),
      plaka_gorunen: formatPlateDisplay('34 BAK 99'),
      marka: 'Toyota',
      model: 'Corolla',
      created_at: now,
      updated_at: now
    }).returning().get();

    const part = db.insert(parts).values({
      ad: 'Hava Filtresi Test',
      kod: 'FLT-TEST-99',
      barkod: '869000999888',
      birim: 'Adet',
      kritik_stok: 5,
      alis_kurus: 15000,
      satis_kurus: 30000,
      created_at: now,
      updated_at: now
    }).returning().get();

    // 2. Create online backup using VACUUM INTO + ZIP
    const backupRes = await createBackup(testBackupDir);
    expect(fs.existsSync(backupRes.fullPath)).toBe(true);
    expect(backupRes.sizeBytes).toBeGreaterThan(1000);

    const status = await getBackupStatus();
    expect(status.backupCount).toBeGreaterThanOrEqual(1);
    expect(status.isStale).toBe(false);

    // 3. Disaster Simulation: Wipe the database by deleting records
    db.delete(vehicles).run();
    db.delete(customers).run();
    db.delete(parts).run();

    expect(db.select().from(customers).all().length).toBe(0);
    expect(db.select().from(vehicles).all().length).toBe(0);
    expect(db.select().from(parts).all().length).toBe(0);

    // 4. Restore from backup
    const restoreRes = await restoreBackup(backupRes.fullPath);
    expect(restoreRes.success).toBe(true);

    // 5. Verify records are completely restored!
    const restoredDb = getDb();
    const restoredCust = restoredDb.select().from(customers).where(eq(customers.id, cust.id)).get();
    expect(restoredCust).toBeDefined();
    expect(restoredCust?.ad_soyad).toBe('Hasan Yedektest');
    expect(restoredCust?.telefon).toBe('05339998877');

    const restoredVeh = restoredDb.select().from(vehicles).where(eq(vehicles.id, veh.id)).get();
    expect(restoredVeh).toBeDefined();
    expect(restoredVeh?.plaka_norm).toBe('34BAK99');
    expect(restoredVeh?.marka).toBe('Toyota');

    const restoredPart = restoredDb.select().from(parts).where(eq(parts.id, part.id)).get();
    expect(restoredPart).toBeDefined();
    expect(restoredPart?.kod).toBe('FLT-TEST-99');
    expect(restoredPart?.satis_kurus).toBe(30000);
  });
});
