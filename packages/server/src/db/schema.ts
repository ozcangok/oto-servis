import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core';

/**
 * Users table with role-based access control and brute force protection
 */
export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  eposta: text('eposta'),
  password_hash: text('password_hash').notNull(),
  full_name: text('full_name').notNull(),
  role: text('role', { enum: ['owner', 'staff'] }).notNull().default('staff'),
  is_active: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  failed_login_attempts: integer('failed_login_attempts').notNull().default(0),
  locked_until: text('locked_until'), // ISO UTC string
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

/**
 * User Sessions table for httpOnly cookie authentication
 */
export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(), // Session token UUID / secure random string
  user_id: integer('user_id').notNull().references(() => users.id),
  expires_at: text('expires_at').notNull(),
  created_at: text('created_at').notNull()
}, (table) => ({
  userIdIdx: index('idx_sessions_user_id').on(table.user_id)
}));

/**
 * Customers table
 */
export const customers = sqliteTable('customers', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ad_soyad: text('ad_soyad').notNull(),
  telefon: text('telefon').notNull(),
  eposta: text('eposta'),
  vergi_no: text('vergi_no'),
  notlar: text('notlar'),
  is_sample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_at: text('deleted_at')
}, (table) => ({
  telefonIdx: index('idx_customers_telefon').on(table.telefon),
  adSoyadIdx: index('idx_customers_ad_soyad').on(table.ad_soyad)
}));

/**
 * Vehicles table with unique normalized license plate
 */
export const vehicles = sqliteTable('vehicles', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  musteri_id: integer('musteri_id').notNull().references(() => customers.id),
  plaka_norm: text('plaka_norm').notNull().unique(),
  plaka_gorunen: text('plaka_gorunen').notNull(),
  marka: text('marka').notNull(),
  model: text('model').notNull(),
  yil: integer('yil'),
  sasi_no: text('sasi_no'),
  motor_kodu: text('motor_kodu'),
  muayene_tarihi: text('muayene_tarihi'), // ISO UTC date
  notlar: text('notlar'),
  is_sample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_at: text('deleted_at')
}, (table) => ({
  plakaNormIdx: index('idx_vehicles_plaka_norm').on(table.plaka_norm),
  musteriIdIdx: index('idx_vehicles_musteri_id').on(table.musteri_id),
  sasiNoIdx: index('idx_vehicles_sasi_no').on(table.sasi_no)
}));

/**
 * Parts table
 */
export const parts = sqliteTable('parts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  ad: text('ad').notNull(),
  kod: text('kod').notNull(),
  barkod: text('barkod').unique(),
  uyumlu_arac: text('uyumlu_arac'),
  muadil: text('muadil'),
  birim: text('birim').notNull().default('Adet'),
  kritik_stok: integer('kritik_stok').notNull().default(3),
  alis_kurus: integer('alis_kurus').notNull().default(0),
  satis_kurus: integer('satis_kurus').notNull().default(0),
  raf: text('raf'),
  aktif: integer('aktif', { mode: 'boolean' }).notNull().default(true),
  is_sample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_at: text('deleted_at')
}, (table) => ({
  barkodIdx: index('idx_parts_barkod').on(table.barkod),
  kodIdx: index('idx_parts_kod').on(table.kod),
  adIdx: index('idx_parts_ad').on(table.ad)
}));

/**
 * Work orders (İş Emirleri)
 */
export const workOrders = sqliteTable('work_orders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  arac_id: integer('arac_id').notNull().references(() => vehicles.id),
  tarih: text('tarih').notNull(), // UTC ISO
  km: integer('km').notNull().default(0),
  durum: text('durum', { enum: ['kabul', 'onarimda', 'teslime_hazir', 'teslim_edildi'] })
    .notNull()
    .default('kabul'),
  sikayet: text('sikayet').notNull(),
  kdv_orani: integer('kdv_orani').notNull().default(20),
  kdv_dahil_mi: integer('kdv_dahil_mi', { mode: 'boolean' }).notNull().default(false),
  iskonto_yuzde: integer('iskonto_yuzde').notNull().default(0),
  iskonto_tutar_kurus: integer('iskonto_tutar_kurus').notNull().default(0),
  pesin_fiyat_elle_kurus: integer('pesin_fiyat_elle_kurus'),
  sonraki_bakim_tarihi: text('sonraki_bakim_tarihi'),
  sonraki_bakim_km: integer('sonraki_bakim_km'),
  kapanis_tarihi: text('kapanis_tarihi'),
  olusturan_kullanici_id: integer('olusturan_kullanici_id').notNull().references(() => users.id),
  is_sample: integer('is_sample', { mode: 'boolean' }).notNull().default(false),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull(),
  deleted_at: text('deleted_at')
}, (table) => ({
  aracIdIdx: index('idx_work_orders_arac_id').on(table.arac_id),
  durumIdx: index('idx_work_orders_durum').on(table.durum),
  tarihIdx: index('idx_work_orders_tarih').on(table.tarih)
}));

/**
 * Work order lines (Parça ve İşçilik Kalemleri)
 */
export const workOrderLines = sqliteTable('work_order_lines', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  is_emri_id: integer('is_emri_id').notNull().references(() => workOrders.id),
  tur: text('tur', { enum: ['parca', 'iscilik'] }).notNull(),
  parca_id: integer('parca_id').references(() => parts.id),
  ad: text('ad').notNull(),
  adet: integer('adet').notNull().default(1),
  birim: text('birim').notNull().default('Adet'),
  birim_fiyat_kurus: integer('birim_fiyat_kurus').notNull().default(0),
  created_at: text('created_at').notNull()
}, (table) => ({
  isEmriIdIdx: index('idx_work_order_lines_is_emri_id').on(table.is_emri_id),
  parcaIdIdx: index('idx_work_order_lines_parca_id').on(table.parca_id)
}));

/**
 * Payments (Ödemeler)
 */
export const payments = sqliteTable('payments', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  is_emri_id: integer('is_emri_id').notNull().references(() => workOrders.id),
  tarih: text('tarih').notNull(),
  tutar_kurus: integer('tutar_kurus').notNull(),
  yontem: text('yontem', { enum: ['nakit', 'kredi_karti', 'havale', 'cek_senet'] }).notNull(),
  kullanici_id: integer('kullanici_id').notNull().references(() => users.id),
  notlar: text('notlar'),
  created_at: text('created_at').notNull()
}, (table) => ({
  isEmriIdIdx: index('idx_payments_is_emri_id').on(table.is_emri_id),
  tarihIdx: index('idx_payments_tarih').on(table.tarih)
}));

/**
 * Stock movements (Stok Hareketleri)
 */
export const stockMovements = sqliteTable('stock_movements', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parca_id: integer('parca_id').notNull().references(() => parts.id),
  miktar: integer('miktar').notNull(), // + giris/iade, - is_emri
  tur: text('tur', { enum: ['giris', 'is_emri', 'iade', 'duzeltme'] }).notNull(),
  is_emri_id: integer('is_emri_id').references(() => workOrders.id),
  tarih: text('tarih').notNull(),
  kullanici_id: integer('kullanici_id').notNull().references(() => users.id),
  notlar: text('notlar'),
  created_at: text('created_at').notNull()
}, (table) => ({
  parcaIdIdx: index('idx_stock_movements_parca_id').on(table.parca_id),
  isEmriIdIdx: index('idx_stock_movements_is_emri_id').on(table.is_emri_id)
}));

/**
 * Photos (Fotoğraflar)
 */
export const photos = sqliteTable('photos', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  is_emri_id: integer('is_emri_id').notNull().references(() => workOrders.id),
  dosya_yolu: text('dosya_yolu').notNull(),
  dosya_adi: text('dosya_adi').notNull(),
  boyut_bytes: integer('boyut_bytes').notNull(),
  mime_tipi: text('mime_tipi').notNull(),
  created_at: text('created_at').notNull()
}, (table) => ({
  isEmriIdIdx: index('idx_photos_is_emri_id').on(table.is_emri_id)
}));

/**
 * Reminders (Hatırlatıcılar)
 */
export const reminders = sqliteTable('reminders', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tur: text('tur', { enum: ['muayene', 'bakim', 'teslim_hazir'] }).notNull(),
  referans_id: integer('referans_id').notNull(),
  baslik: text('baslik').notNull(),
  mesaj: text('mesaj').notNull(),
  hedef_tarih: text('hedef_tarih'),
  gonderildi_tarihi: text('gonderildi_tarihi'),
  created_at: text('created_at').notNull()
}, (table) => ({
  turIdx: index('idx_reminders_tur').on(table.tur),
  hedefTarihIdx: index('idx_reminders_hedef_tarih').on(table.hedef_tarih)
}));

/**
 * WhatsApp durum bildirimleri (İletişim Merkezi)
 *
 * İş emrinin "Servis Durumu" her değiştiğinde bu tabloya bir kayıt düşer.
 * Hatırlatıcılar sayfası bu kayıtları listeler; her kaydın "WhatsApp Gönder"
 * bağlantısı uluslararası telefon + kurumsal mesajla wa.me açar.
 */
export const whatsappMessages = sqliteTable('whatsapp_messages', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  is_emri_id: integer('is_emri_id').notNull().references(() => workOrders.id),
  durum: text('durum', { enum: ['kabul', 'onarimda', 'teslime_hazir', 'teslim_edildi'] }).notNull(),
  musteri_id: integer('musteri_id').references(() => customers.id),
  musteri_ad: text('musteri_ad').notNull(),
  telefon: text('telefon').notNull(),
  plaka: text('plaka').notNull(),
  mesaj: text('mesaj').notNull(),
  gonderildi_tarihi: text('gonderildi_tarihi'),
  created_at: text('created_at').notNull()
}, (table) => ({
  isEmriIdIdx: index('idx_whatsapp_messages_is_emri_id').on(table.is_emri_id),
  durumIdx: index('idx_whatsapp_messages_durum').on(table.durum),
  createdAtIdx: index('idx_whatsapp_messages_created_at').on(table.created_at)
}));

/**
 * Settings (Ayarlar)
 */
export const settings = sqliteTable('settings', {
  anahtar: text('anahtar').primaryKey(),
  deger: text('deger').notNull(),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
});

/**
 * Expenses (Dükkan Giderleri)
 * Kasa/ciro hesaplarına dokunmaz; yalnızca gider takibi ve net kâr içindir.
 */
export const expenses = sqliteTable('expenses', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  tarih: text('tarih').notNull(), // YYYY-MM-DD (yerel tarih)
  kategori: text('kategori').notNull(),
  aciklama: text('aciklama').notNull(),
  tutar_kurus: integer('tutar_kurus').notNull(),
  kullanici_id: integer('kullanici_id').references(() => users.id),
  created_at: text('created_at').notNull(),
  updated_at: text('updated_at').notNull()
}, (table) => ({
  tarihIdx: index('idx_expenses_tarih').on(table.tarih),
  kategoriIdx: index('idx_expenses_kategori').on(table.kategori)
}));

/**
 * Audit log (Denetim İzi)
 */
export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  kullanici_id: integer('kullanici_id'),
  kullanici_adi: text('kullanici_adi'),
  islem: text('islem').notNull(),
  hedef_tablo: text('hedef_tablo').notNull(),
  hedef_id: integer('hedef_id'),
  eski_deger: text('eski_deger'), // JSON string
  yeni_deger: text('yeni_deger'), // JSON string
  ip_adresi: text('ip_adresi'),
  detay: text('detay'),
  created_at: text('created_at').notNull()
}, (table) => ({
  hedefTabloIdx: index('idx_audit_log_hedef_tablo').on(table.hedef_tablo),
  islemIdx: index('idx_audit_log_islem').on(table.islem),
  createdAtIdx: index('idx_audit_log_created_at').on(table.created_at)
}));
