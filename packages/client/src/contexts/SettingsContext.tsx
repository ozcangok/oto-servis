import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { CORPORATE, type AppSettings } from '@oto-servis/shared';
import { apiRequest } from '../services/api.js';

/**
 * Şirket kimliği ve uygulama ayarları için tek istemci kaynağı.
 *
 * Ayarlar SQLite'ta (sunucu) kalıcıdır. Son başarılı profil ayrıca
 * localStorage'da önbelleğe alınır; böylece ağ gecikmesi veya çevrimdışı
 * açılışta sidebar/karşılama bandı eski "Örnek Oto Servis" metnine düşmez.
 */
export interface CompanyProfile {
  name: string;
  owner: string;
  address: string;
  phone: string;
  email: string;
  taxOffice: string;
  taxNo: string;
  workingHours: string;
}

export const DEFAULT_COMPANY_PROFILE: CompanyProfile = {
  name: CORPORATE.legalName,
  owner: CORPORATE.owner,
  address: CORPORATE.address,
  phone: CORPORATE.phone,
  email: CORPORATE.email,
  taxOffice: CORPORATE.taxOffice,
  taxNo: CORPORATE.taxNumber,
  workingHours: CORPORATE.workingHours
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  shop_name: DEFAULT_COMPANY_PROFILE.name,
  shop_phone: DEFAULT_COMPANY_PROFILE.phone,
  shop_address: DEFAULT_COMPANY_PROFILE.address,
  shop_email: DEFAULT_COMPANY_PROFILE.email,
  shop_owner: DEFAULT_COMPANY_PROFILE.owner,
  working_hours: DEFAULT_COMPANY_PROFILE.workingHours,
  shop_tax_number: DEFAULT_COMPANY_PROFILE.taxNo,
  shop_tax_office: DEFAULT_COMPANY_PROFILE.taxOffice,
  default_kdv_rate: 20,
  default_cash_discount_rate: 5,
  backup_dir: '',
  lan_sharing_enabled: false,
  theme: 'dark',
  font_size: 'normal',
  allow_negative_stock: false
};

const CACHE_KEY = 'oto_company_profile_v2';

function profileFromSettings(settings: Partial<AppSettings> | null | undefined): CompanyProfile {
  return {
    name: String(settings?.shop_name || DEFAULT_COMPANY_PROFILE.name),
    owner: String(settings?.shop_owner || DEFAULT_COMPANY_PROFILE.owner),
    address: String(settings?.shop_address || DEFAULT_COMPANY_PROFILE.address),
    phone: String(settings?.shop_phone || DEFAULT_COMPANY_PROFILE.phone),
    email: String(settings?.shop_email || DEFAULT_COMPANY_PROFILE.email),
    taxOffice: String(settings?.shop_tax_office || DEFAULT_COMPANY_PROFILE.taxOffice),
    taxNo: String(settings?.shop_tax_number || DEFAULT_COMPANY_PROFILE.taxNo),
    workingHours: String(settings?.working_hours || DEFAULT_COMPANY_PROFILE.workingHours)
  };
}

function settingsFromProfile(profile: CompanyProfile): AppSettings {
  return {
    ...DEFAULT_APP_SETTINGS,
    shop_name: profile.name,
    shop_owner: profile.owner,
    shop_address: profile.address,
    shop_phone: profile.phone,
    shop_email: profile.email,
    shop_tax_office: profile.taxOffice,
    shop_tax_number: profile.taxNo,
    working_hours: profile.workingHours
  };
}

function readCachedSettings(): AppSettings | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return settingsFromProfile({
      ...DEFAULT_COMPANY_PROFILE,
      ...parsed
    });
  } catch {
    return null;
  }
}

function writeCachedProfile(settings: AppSettings) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(profileFromSettings(settings)));
  } catch {
    /* localStorage kapalıysa yalnızca bellek içi state kullanılır. */
  }
}

interface SettingsContextValue {
  settings: AppSettings;
  companyProfile: CompanyProfile;
  loaded: boolean;
  refresh: () => Promise<AppSettings | null>;
  saveSettings: (patch: Partial<AppSettings>) => Promise<AppSettings>;
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export const SettingsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<AppSettings>(() => readCachedSettings() || DEFAULT_APP_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  const applySettings = useCallback((next: AppSettings) => {
    setSettings(next);
    writeCachedProfile(next);
  }, []);

  const refresh = useCallback(async (): Promise<AppSettings | null> => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings) {
        const next = { ...DEFAULT_APP_SETTINGS, ...res.settings };
        applySettings(next);
        setLoaded(true);
        return next;
      }
    } catch {
      /* Giriş öncesi 401 veya çevrimdışı: önbellek/varsayılan korunur. */
    }
    return null;
  }, [applySettings]);

  const saveSettings = useCallback(async (patch: Partial<AppSettings>): Promise<AppSettings> => {
    const res = await apiRequest('/settings', {
      method: 'PUT',
      body: JSON.stringify(patch)
    });
    if (!res.success || !res.settings) {
      throw new Error(res.error || 'Ayarlar kaydedilemedi.');
    }
    const next = { ...DEFAULT_APP_SETTINGS, ...res.settings };
    applySettings(next);
    setLoaded(true);
    return next;
  }, [applySettings]);

  const companyProfile = useMemo(() => profileFromSettings(settings), [settings]);

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, companyProfile, loaded, refresh, saveSettings }),
    [settings, companyProfile, loaded, refresh, saveSettings]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

export function useSettings(): SettingsContextValue {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings, SettingsProvider içinde kullanılmalıdır.');
  }
  return context;
}
