/**
 * Shared Domain Types and Enums for Oto Servis
 */

export type UserRole = 'admin' | 'cashier' | 'mechanic';

export const USER_ROLES: { [K in UserRole]: { label: string; description: string } } = {
  admin: { label: 'Yönetici', description: 'Tüm yetkilere sahiptir' },
  cashier: { label: 'Kasiyer', description: 'İş emri, ödeme, cari ve kasa işlemleri' },
  mechanic: { label: 'Usta', description: 'İş emri ve durum güncelleme, parça ekleme (fiyat/kasa göremez)' }
};

export type WorkOrderStatus = 'kabul' | 'onarimda' | 'teslime_hazir' | 'teslim_edildi';

export const WORK_ORDER_STATUSES: { [K in WorkOrderStatus]: { label: string; color: string } } = {
  kabul: { label: 'Araç Kabul', color: '#3b82f6' },
  onarimda: { label: 'Onarımda', color: '#f59e0b' },
  teslime_hazir: { label: 'Teslime Hazır', color: '#10b981' },
  teslim_edildi: { label: 'Teslim Edildi', color: '#6b7280' }
};

export type LineType = 'parca' | 'iscilik';

export type PaymentMethod = 'nakit' | 'kredi_karti' | 'havale' | 'cek_senet';

export const PAYMENT_METHODS: { [K in PaymentMethod]: string } = {
  nakit: 'Nakit',
  kredi_karti: 'Kredi Kartı',
  havale: 'Havale / EFT',
  cek_senet: 'Çek / Senet'
};

export type StockMovementType = 'giris' | 'is_emri' | 'iade' | 'duzeltme';

export const STOCK_MOVEMENT_TYPES: { [K in StockMovementType]: string } = {
  giris: 'Stok Girişi (Alış/Fatura)',
  is_emri: 'İş Emri Kullanımı',
  iade: 'Müşteri/İş Emri İadesi',
  duzeltme: 'Sayım / Stok Düzeltme'
};

export type AuditAction =
  | 'work_order_create'
  | 'work_order_update'
  | 'work_order_delete'
  | 'work_order_reopen'
  | 'price_change'
  | 'stock_correction'
  | 'discount_change'
  | 'payment_create'
  | 'payment_delete'
  | 'part_create'
  | 'part_update'
  | 'part_delete'
  | 'customer_anonymize'
  | 'customer_delete'
  | 'backup_restore'
  | 'user_login'
  | 'user_create'
  | 'user_delete'
  | 'settings_update';

export interface User {
  id: number;
  username: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Customer {
  id: number;
  ad_soyad: string;
  telefon: string;
  eposta?: string | null;
  vergi_no?: string | null;
  notlar?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface Vehicle {
  id: number;
  musteri_id: number;
  plaka_norm: string;
  plaka_gorunen: string;
  marka: string;
  model: string;
  yil?: number | null;
  sasi_no?: string | null;
  motor_kodu?: string | null;
  muayene_tarihi?: string | null;
  notlar?: string | null;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  // Joins
  musteri?: Customer;
}

export interface WorkOrderLine {
  id?: number;
  is_emri_id?: number;
  tur: LineType;
  parca_id?: number | null;
  ad: string;
  adet: number;
  birim: string; // 'Adet', 'Litre', 'Takım', 'Saat'
  birim_fiyat_kurus: number;
  created_at?: string;
  // Joins
  parca?: Part;
}

export interface WorkOrder {
  id: number;
  arac_id: number;
  tarih: string; // UTC ISO string
  km: number;
  durum: WorkOrderStatus;
  sikayet: string;
  kdv_orani: number; // e.g. 20
  kdv_dahil_mi: boolean;
  iskonto_yuzde: number;
  iskonto_tutar_kurus: number;
  pesin_fiyat_elle_kurus?: number | null;
  sonraki_bakim_tarihi?: string | null;
  sonraki_bakim_km?: number | null;
  kapanis_tarihi?: string | null;
  olusturan_kullanici_id: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
  // Joins & calculations
  arac?: Vehicle;
  musteri?: Customer;
  olusturan?: { id: number; full_name: string; username: string };
  kalemler?: WorkOrderLine[];
  odemeler?: Payment[];
  fotograflar?: Photo[];
  toplam_kurus?: number;
  net_kurus?: number;
  kdv_tutar_kurus?: number;
  brut_kurus?: number;
  pesin_fiyat_kurus?: number;
  odenen_kurus?: number;
  kalan_kurus?: number;
}

export interface Payment {
  id: number;
  is_emri_id: number;
  tarih: string;
  tutar_kurus: number;
  yontem: PaymentMethod;
  kullanici_id: number;
  notlar?: string | null;
  created_at: string;
  // Joins
  kullanici?: { id: number; full_name: string };
  is_emri?: { id: number; arac?: { plaka_gorunen: string }; musteri?: { ad_soyad: string } };
}

export interface Part {
  id: number;
  ad: string;
  kod: string;
  barkod?: string | null;
  uyumlu_arac?: string | null;
  muadil?: string | null;
  birim: string;
  kritik_stok: number;
  alis_kurus: number;
  satis_kurus: number;
  raf?: string | null;
  aktif: boolean;
  stok_miktari?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export interface StockMovement {
  id: number;
  parca_id: number;
  miktar: number; // positive for additions, negative for usages
  tur: StockMovementType;
  is_emri_id?: number | null;
  tarih: string;
  kullanici_id: number;
  notlar?: string | null;
  created_at: string;
  // Joins
  parca?: Part;
  kullanici?: { id: number; full_name: string };
}

export interface Photo {
  id: number;
  is_emri_id: number;
  dosya_yolu: string;
  dosya_adi: string;
  boyut_bytes: number;
  mime_tipi: string;
  created_at: string;
}

export interface Reminder {
  id: number;
  tur: 'muayene' | 'bakim' | 'teslim_hazir';
  referans_id: number; // arac_id or is_emri_id
  baslik: string;
  mesaj: string;
  hedef_tarih?: string | null;
  gonderildi_tarihi?: string | null;
  telefon?: string | null;
  musteri_ad?: string | null;
  plaka?: string | null;
  created_at: string;
}

export interface AuditLog {
  id: number;
  kullanici_id?: number | null;
  kullanici_adi?: string | null;
  islem: AuditAction;
  hedef_tablo: string;
  hedef_id?: number | null;
  eski_deger?: string | null; // JSON stringified
  yeni_deger?: string | null; // JSON stringified
  ip_adresi?: string | null;
  detay?: string | null;
  created_at: string;
}

export interface AppSettings {
  shop_name: string;
  shop_phone: string;
  shop_address: string;
  shop_tax_number?: string;
  shop_tax_office?: string;
  default_kdv_rate: number;
  default_cash_discount_rate: number;
  backup_dir: string;
  lan_sharing_enabled: boolean;
  theme: 'light' | 'dark';
  font_size: 'normal' | 'large';
  allow_negative_stock: boolean;
}
