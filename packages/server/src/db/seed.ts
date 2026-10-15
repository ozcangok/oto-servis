import { getDb, getSqlite, users, customers, vehicles, parts, workOrders, workOrderLines, payments, stockMovements } from './index.js';
import { normalizePlate, formatPlateDisplay } from '@oto-servis/shared';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

export async function seedDatabase() {
  const db = getDb();
  const sqlite = getSqlite();
  const now = new Date().toISOString();

  console.log('[SEED] Başlangıç ve örnek veriler yükleniyor...');

  // 1. Users
  const existingAdmin = db.select().from(users).where(eq(users.username, 'admin')).get();
  let adminId = existingAdmin?.id;

  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash('admin123', salt);
    const newAdmin = db.insert(users).values({
      username: 'admin',
      password_hash: passHash,
      full_name: 'Ahmet Usta (Yönetici)',
      role: 'admin',
      is_active: true,
      created_at: now,
      updated_at: now
    }).returning().get();
    adminId = newAdmin.id;

    // Cashier
    const cashierHash = await bcrypt.hash('kasiyer123', salt);
    db.insert(users).values({
      username: 'kasiyer',
      password_hash: cashierHash,
      full_name: 'Selin Kasiyer',
      role: 'cashier',
      is_active: true,
      created_at: now,
      updated_at: now
    }).run();

    // Mechanic
    const mechanicHash = await bcrypt.hash('usta123', salt);
    db.insert(users).values({
      username: 'usta',
      password_hash: mechanicHash,
      full_name: 'Kemal Usta',
      role: 'mechanic',
      is_active: true,
      created_at: now,
      updated_at: now
    }).run();
  }

  // Check if sample data already exists
  const existingCust = db.select().from(customers).limit(1).get();
  if (existingCust) {
    console.log('[SEED] Müşteri ve örnek veriler zaten mevcut.');
    return;
  }

  // 2. Sample Customers
  const cust1 = db.insert(customers).values({
    ad_soyad: 'Mehmet Yılmaz',
    telefon: '0532 111 22 33',
    eposta: 'mehmet.yilmaz@example.com',
    vergi_no: '12345678901',
    notlar: 'Sürekli müşteri, titiz araç sahibi',
    is_sample: true,
    created_at: now,
    updated_at: now
  }).returning().get();

  const cust2 = db.insert(customers).values({
    ad_soyad: 'Ayşe Kaya',
    telefon: '0542 333 44 55',
    eposta: 'ayse.kaya@example.com',
    vergi_no: null,
    notlar: 'Şirket aracı filosu',
    is_sample: true,
    created_at: now,
    updated_at: now
  }).returning().get();

  // 3. Sample Vehicles
  const veh1 = db.insert(vehicles).values({
    musteri_id: cust1.id,
    plaka_norm: normalizePlate('34 ABC 123'),
    plaka_gorunen: formatPlateDisplay('34 ABC 123'),
    marka: 'Renault',
    model: 'Megane IV 1.5 dCi',
    yil: 2020,
    sasi_no: 'VF1RFB00123456789',
    motor_kodu: 'K9K 656',
    muayene_tarihi: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(),
    notlar: '10.000 km periyodik bakım takviminde',
    is_sample: true,
    created_at: now,
    updated_at: now
  }).returning().get();

  const veh2 = db.insert(vehicles).values({
    musteri_id: cust2.id,
    plaka_norm: normalizePlate('06 B 1234'),
    plaka_gorunen: formatPlateDisplay('06 B 1234'),
    marka: 'Ford',
    model: 'Focus 1.5 EcoBlue',
    yil: 2019,
    sasi_no: 'WF0SXXGCS12345678',
    motor_kodu: 'ZTDA',
    muayene_tarihi: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // Muayenesi geçmiş örnek
    notlar: 'Frenlerden ses geliyor şikayeti var',
    is_sample: true,
    created_at: now,
    updated_at: now
  }).returning().get();

  // 4. Sample Parts
  const partsList = [
    {
      ad: 'Motor Yağı 5W-30 (4 Litre)',
      kod: 'YAG-5W30-4L',
      barkod: '8690123456781',
      uyumlu_arac: 'Renault Megane, Ford Focus, Fiat Egea',
      muadil: 'Castrol Edge, Mobil 1 ESP',
      birim: 'Adet',
      kritik_stok: 5,
      alis_kurus: 45000, // 450 ₺
      satis_kurus: 85000, // 850 ₺
      raf: 'A-12',
      stok_giris: 20
    },
    {
      ad: 'Yağ Filtresi (Orijinal)',
      kod: 'FLT-YAG-01',
      barkod: '8690123456782',
      uyumlu_arac: 'Renault 1.5 dCi Motorlar',
      muadil: 'Mann W79, Bosch F026407001',
      birim: 'Adet',
      kritik_stok: 3,
      alis_kurus: 9000, // 90 ₺
      satis_kurus: 18000, // 180 ₺
      raf: 'B-04',
      stok_giris: 15
    },
    {
      ad: 'Hava Filtresi',
      kod: 'FLT-HAV-02',
      barkod: '8690123456783',
      uyumlu_arac: 'Renault Megane IV, Talisman',
      muadil: 'Filtron AP185/8',
      birim: 'Adet',
      kritik_stok: 3,
      alis_kurus: 12000, // 120 ₺
      satis_kurus: 24000, // 240 ₺
      raf: 'B-05',
      stok_giris: 12
    },
    {
      ad: 'Ön Fren Balata Takımı',
      kod: 'BLT-ON-01',
      barkod: '8690123456784',
      uyumlu_arac: 'Ford Focus, C-Max',
      muadil: 'TRW GDB1956, Brembo P24151',
      birim: 'Takım',
      kritik_stok: 2,
      alis_kurus: 35000, // 350 ₺
      satis_kurus: 75000, // 750 ₺
      raf: 'C-01',
      stok_giris: 6
    }
  ];

  const createdParts: any[] = [];
  for (const p of partsList) {
    const part = db.insert(parts).values({
      ad: p.ad,
      kod: p.kod,
      barkod: p.barkod,
      uyumlu_arac: p.uyumlu_arac,
      muadil: p.muadil,
      birim: p.birim,
      kritik_stok: p.kritik_stok,
      alis_kurus: p.alis_kurus,
      satis_kurus: p.satis_kurus,
      raf: p.raf,
      aktif: true,
      is_sample: true,
      created_at: now,
      updated_at: now
    }).returning().get();

    // Initial stock movement
    db.insert(stockMovements).values({
      parca_id: part.id,
      miktar: p.stok_giris,
      tur: 'giris',
      tarih: now,
      kullanici_id: adminId || 1,
      notlar: 'Açılış stok girişi',
      created_at: now
    }).run();

    createdParts.push(part);
  }

  // 5. Sample Work Order matching the prompt's exact verification rule:
  // 2 x 850 ₺ parça + 500 ₺ işçilik, %10 iskonto, %20 KDV -> KDV dahil 2.376,00 ₺, peşin (ara toplamdan %5) 1.881,00 ₺
  const order1 = db.insert(workOrders).values({
    arac_id: veh1.id,
    tarih: now,
    km: 85200,
    durum: 'onarimda',
    sikayet: '10.000 km periyodik yağ bakımı ve genel kontrol',
    kdv_orani: 20,
    kdv_dahil_mi: false,
    iskonto_yuzde: 10,
    iskonto_tutar_kurus: 0,
    sonraki_bakim_tarihi: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    sonraki_bakim_km: 95200,
    olusturan_kullanici_id: adminId || 1,
    is_sample: true,
    created_at: now,
    updated_at: now
  }).returning().get();

  // Part lines: 2 x 850 ₺
  db.insert(workOrderLines).values({
    is_emri_id: order1.id,
    tur: 'parca',
    parca_id: createdParts[0].id,
    ad: createdParts[0].ad,
    adet: 2,
    birim: 'Adet',
    birim_fiyat_kurus: 85000,
    created_at: now
  }).run();

  // Labor line: 1 x 500 ₺
  db.insert(workOrderLines).values({
    is_emri_id: order1.id,
    tur: 'iscilik',
    parca_id: null,
    ad: 'Periyodik Bakım ve Yağ Değişimi İşçiliği',
    adet: 1,
    birim: 'Adet',
    birim_fiyat_kurus: 50000,
    created_at: now
  }).run();

  // Deduct stock for the 2 parts
  db.insert(stockMovements).values({
    parca_id: createdParts[0].id,
    miktar: -2,
    tur: 'is_emri',
    is_emri_id: order1.id,
    tarih: now,
    kullanici_id: adminId || 1,
    notlar: `İş emri #${order1.id} kullanımı`,
    created_at: now
  }).run();

  // Sample partial payment: 1.000 ₺
  db.insert(payments).values({
    is_emri_id: order1.id,
    tarih: now,
    tutar_kurus: 100000,
    yontem: 'nakit',
    kullanici_id: adminId || 1,
    notlar: 'Kapora / Avans ödemesi',
    created_at: now
  }).run();

  console.log('[SEED] Örnek veriler başarıyla yüklendi.');
}

/**
 * Purges all sample data with a single click/call
 */
export async function purgeSampleData() {
  const sqlite = getSqlite();
  const db = getDb();

  console.log('[PURGE] Örnek veriler temizleniyor...');

  sqlite.transaction(() => {
    // Get sample work orders
    const sampleOrders = db.select({ id: workOrders.id }).from(workOrders).where(eq(workOrders.is_sample, true)).all();
    for (const o of sampleOrders) {
      db.delete(payments).where(eq(payments.is_emri_id, o.id)).run();
      db.delete(workOrderLines).where(eq(workOrderLines.is_emri_id, o.id)).run();
      db.delete(stockMovements).where(eq(stockMovements.is_emri_id, o.id)).run();
    }
    db.delete(workOrders).where(eq(workOrders.is_sample, true)).run();

    // Sample parts
    const sampleParts = db.select({ id: parts.id }).from(parts).where(eq(parts.is_sample, true)).all();
    for (const p of sampleParts) {
      db.delete(stockMovements).where(eq(stockMovements.parca_id, p.id)).run();
    }
    db.delete(parts).where(eq(parts.is_sample, true)).run();

    // Vehicles & Customers
    db.delete(vehicles).where(eq(vehicles.is_sample, true)).run();
    db.delete(customers).where(eq(customers.is_sample, true)).run();
  })();

  console.log('[PURGE] Örnek veriler temizlendi.');
}

// Allow running directly via CLI
if (process.argv[1] && (process.argv[1].endsWith('seed.ts') || process.argv[1].endsWith('seed.js'))) {
  seedDatabase().then(() => process.exit(0)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
