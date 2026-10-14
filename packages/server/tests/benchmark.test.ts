import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { bootstrapSchema } from '../src/db/index.js';
import { normalizePlate, formatPlateDisplay } from '@oto-servis/shared';

describe('Phase 7: Performance & Load Benchmark (50.000 Work Orders, 20.000 Vehicles)', () => {
  it('executes plate search in under 200 ms with 20.000 vehicles and 50.000 work orders', () => {
    // In-memory SQLite with WAL & indexes
    const sqlite = new Database(':memory:');
    sqlite.pragma('synchronous = OFF');
    sqlite.pragma('journal_mode = MEMORY');
    bootstrapSchema(sqlite);

    console.log('[BENCHMARK] 20.000 araç ve 50.000 iş emri oluşturuluyor...');

    const insertCustomer = sqlite.prepare(
      'INSERT INTO customers (ad_soyad, telefon, created_at, updated_at) VALUES (?, ?, ?, ?)'
    );
    const insertVehicle = sqlite.prepare(
      'INSERT INTO vehicles (musteri_id, plaka_norm, plaka_gorunen, marka, model, yil, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );
    const insertOrder = sqlite.prepare(
      'INSERT INTO work_orders (arac_id, tarih, km, durum, sikayet, olusturan_kullanici_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    );

    const now = new Date().toISOString();

    // 1. Insert user id 1 for foreign key
    sqlite.prepare('INSERT INTO users (id, username, password_hash, full_name, role, created_at, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?)').run('admin', 'hash', 'Admin', 'admin', now, now);

    // Batch insert customers & vehicles
    const insertVehiclesBatch = sqlite.transaction(() => {
      // 1000 customers
      for (let c = 1; c <= 1000; c++) {
        insertCustomer.run(`Müşteri ${c}`, `0532000${c.toString().padStart(4, '0')}`, now, now);
      }

      // 20.000 vehicles
      for (let v = 1; v <= 20000; v++) {
        const custId = (v % 1000) + 1;
        const rawPlate = `34 ABC ${v}`;
        const norm = normalizePlate(rawPlate);
        const display = formatPlateDisplay(norm);
        insertVehicle.run(custId, norm, display, 'Renault', 'Megane', 2020, now, now);
      }
    });

    insertVehiclesBatch();

    // 2. Batch insert 50.000 work orders
    const insertOrdersBatch = sqlite.transaction(() => {
      for (let o = 1; o <= 50000; o++) {
        const vehId = (o % 20000) + 1;
        insertOrder.run(vehId, now, 50000 + o, 'kabul', `Periyodik arıza şikayeti #${o}`, 1, now, now);
      }
    });

    insertOrdersBatch();

    console.log('[BENCHMARK] Veri tabanı hazırlandı. Plaka sorgusu test ediliyor...');

    // 3. Query benchmark: Search for plate "34ABC15000" with JOIN on customer and work orders
    const targetPlateNorm = '34ABC15000';

    const queryStmt = sqlite.prepare(`
      SELECT 
        v.id AS vehicle_id,
        v.plaka_norm,
        v.plaka_gorunen,
        v.marka,
        v.model,
        c.ad_soyad AS customer_name,
        c.telefon AS customer_phone,
        w.id AS work_order_id,
        w.tarih,
        w.durum,
        w.km
      FROM vehicles v
      LEFT JOIN customers c ON v.musteri_id = c.id
      LEFT JOIN work_orders w ON w.arac_id = v.id
      WHERE v.plaka_norm = ? AND v.deleted_at IS NULL
    `);

    // Measure execution time
    const start = performance.now();
    const rows = queryStmt.all(targetPlateNorm) as any[];
    const durationMs = performance.now() - start;

    console.log(`[BENCHMARK] Plaka sorgusu tamamlandı: ${durationMs.toFixed(3)} ms (Dönen satır: ${rows.length})`);

    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].plaka_norm).toBe(targetPlateNorm);
    // User requirement: < 200 ms
    expect(durationMs).toBeLessThan(200);
  });
});
