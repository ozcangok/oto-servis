import { eq } from 'drizzle-orm';
import { getDb, settings } from '../db/index.js';
import type { AppSettings } from '@oto-servis/shared';

const DEFAULT_SETTINGS: AppSettings = {
  shop_name: 'Örnek Oto Servis & Bakım',
  shop_phone: '0532 000 00 00',
  shop_address: 'Oto Sanayi Sitesi B Blok No: 12',
  shop_tax_number: '1234567890',
  shop_tax_office: 'Marmara V.D.',
  default_kdv_rate: 20,
  default_cash_discount_rate: 5,
  backup_dir: '',
  lan_sharing_enabled: false,
  theme: 'light',
  font_size: 'normal',
  allow_negative_stock: false
};

export async function getSettings(): Promise<AppSettings> {
  const db = getDb();
  const rows = db.select().from(settings).all();
  const map: Record<string, any> = {};

  for (const r of rows) {
    try {
      map[r.anahtar] = JSON.parse(r.deger);
    } catch {
      map[r.anahtar] = r.deger;
    }
  }

  return {
    shop_name: map.shop_name ?? DEFAULT_SETTINGS.shop_name,
    shop_phone: map.shop_phone ?? DEFAULT_SETTINGS.shop_phone,
    shop_address: map.shop_address ?? DEFAULT_SETTINGS.shop_address,
    shop_tax_number: map.shop_tax_number ?? DEFAULT_SETTINGS.shop_tax_number,
    shop_tax_office: map.shop_tax_office ?? DEFAULT_SETTINGS.shop_tax_office,
    default_kdv_rate: typeof map.default_kdv_rate === 'number' ? map.default_kdv_rate : DEFAULT_SETTINGS.default_kdv_rate,
    default_cash_discount_rate: typeof map.default_cash_discount_rate === 'number' ? map.default_cash_discount_rate : DEFAULT_SETTINGS.default_cash_discount_rate,
    backup_dir: map.backup_dir ?? DEFAULT_SETTINGS.backup_dir,
    lan_sharing_enabled: Boolean(map.lan_sharing_enabled ?? DEFAULT_SETTINGS.lan_sharing_enabled),
    theme: map.theme === 'dark' ? 'dark' : 'light',
    font_size: map.font_size === 'large' ? 'large' : 'normal',
    allow_negative_stock: Boolean(map.allow_negative_stock ?? DEFAULT_SETTINGS.allow_negative_stock)
  };
}

export async function updateSettings(newSettings: Partial<AppSettings>): Promise<AppSettings> {
  const db = getDb();
  const now = new Date().toISOString();

  for (const [key, value] of Object.entries(newSettings)) {
    if (value !== undefined) {
      const valStr = JSON.stringify(value);
      const existing = db.select().from(settings).where(eq(settings.anahtar, key)).get();
      if (existing) {
        db.update(settings).set({ deger: valStr, updated_at: now }).where(eq(settings.anahtar, key)).run();
      } else {
        db.insert(settings).values({ anahtar: key, deger: valStr, created_at: now, updated_at: now }).run();
      }
    }
  }

  return getSettings();
}
