import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api.js';
import { isPrivileged } from '../services/roles.js';
import { toast, todayISO } from '../services/ui.js';
import { DEFAULT_COMPANY_PROFILE, useSettings } from '../contexts/SettingsContext.js';

interface SettingsScreenProps {
  onClose: () => void;
  currentUser?: any;
  onUserUpdated?: (user: any) => void;
  onSettingsSaved?: (newSettings: any) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onClose,
  currentUser,
  onUserUpdated,
  onSettingsSaved
}) => {
  const { settings, companyProfile, loaded, refresh, saveSettings } = useSettings();
  const [shopName, setShopName] = useState<string>(companyProfile.name);
  const [shopPhone, setShopPhone] = useState<string>(companyProfile.phone);
  const [shopAddress, setShopAddress] = useState<string>(companyProfile.address);
  const [shopOwner, setShopOwner] = useState<string>(companyProfile.owner);
  const [shopEmail, setShopEmail] = useState<string>(companyProfile.email);
  const [workingHours, setWorkingHours] = useState<string>(companyProfile.workingHours);
  const [shopTaxOffice, setShopTaxOffice] = useState<string>(companyProfile.taxOffice);
  const [shopTaxNumber, setShopTaxNumber] = useState<string>(companyProfile.taxNo);
  const [vatRate, setVatRate] = useState<number>(settings.default_kdv_rate ?? 20);
  const [cashDiscount, setCashDiscount] = useState<number>(settings.default_cash_discount_rate ?? 5);
  const [saving, setSaving] = useState(false);
  const dirtyRef = useRef(false);

  // Hesap güvenliği (yalnızca yönetici)
  const [currentPassword, setCurrentPassword] = useState('');
  const [newUsername, setNewUsername] = useState<string>(currentUser?.username || '');
  const [newPassword, setNewPassword] = useState('');
  const [newPassword2, setNewPassword2] = useState('');
  const [savingCredentials, setSavingCredentials] = useState(false);

  // LAN / Mobile QR
  const [lanInfo, setLanInfo] = useState<any | null>(null);

  useEffect(() => {
    loadLanInfo();
    if (!loaded) void refresh();
  }, []);

  // Global kaynak güncellendiğinde (ör. başka bir pencerede kayıt) formu tazele.
  // Kullanıcı henüz yazmaya başlamadıysa gelen değerler formu ezebilir; yazmaya
  // başladıysa hiçbir zaman ezilmez. Eski sürümdeki yarış hatası burada kapanır.
  useEffect(() => {
    if (dirtyRef.current) return;
    setShopName(companyProfile.name);
    setShopPhone(companyProfile.phone);
    setShopAddress(companyProfile.address);
    setShopOwner(companyProfile.owner);
    setShopEmail(companyProfile.email);
    setWorkingHours(companyProfile.workingHours);
    setShopTaxOffice(companyProfile.taxOffice);
    setShopTaxNumber(companyProfile.taxNo);
    setVatRate(settings.default_kdv_rate ?? 20);
    setCashDiscount(settings.default_cash_discount_rate ?? 5);
  }, [
    companyProfile,
    settings.default_kdv_rate,
    settings.default_cash_discount_rate
  ]);

  useEffect(() => {
    setNewUsername(currentUser?.username || '');
  }, [currentUser?.username]);

  const loadLanInfo = async () => {
    try {
      const res = await apiRequest('/settings/lan-info');
      if (res.success) setLanInfo(res);
    } catch {}
  };

  const handleSave = async () => {
    const taxNo = shopTaxNumber.trim();
    if (taxNo && !/^\d{10,11}$/.test(taxNo)) {
      toast('Vergi no 10 (VKN) veya 11 (TCKN) haneli olmalıdır.');
      return;
    }
    setSaving(true);
    try {
      const body = {
        shop_name: shopName.trim() || DEFAULT_COMPANY_PROFILE.name,
        shop_phone: shopPhone.trim() || DEFAULT_COMPANY_PROFILE.phone,
        shop_address: shopAddress.trim() || DEFAULT_COMPANY_PROFILE.address,
        shop_owner: shopOwner.trim() || DEFAULT_COMPANY_PROFILE.owner,
        shop_email: shopEmail.trim() || DEFAULT_COMPANY_PROFILE.email,
        working_hours: workingHours.trim() || DEFAULT_COMPANY_PROFILE.workingHours,
        shop_tax_office: shopTaxOffice.trim() || DEFAULT_COMPANY_PROFILE.taxOffice,
        shop_tax_number: shopTaxNumber.trim() || DEFAULT_COMPANY_PROFILE.taxNo,
        default_kdv_rate: Number(vatRate) || 0,
        default_cash_discount_rate: Number(cashDiscount) || 0
      };

      const updated = await saveSettings(body);
      dirtyRef.current = false;
      toast('Ayarlar kaydedildi; sidebar ve PDF anında güncellendi.');
      if (onSettingsSaved) onSettingsSaved(updated);
      onClose();
    } catch (err: any) {
      toast(err.message || 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!isPrivileged(currentUser)) {
      toast('Bu işlem için patron yetkisi gereklidir.');
      return;
    }
    if (!currentPassword.trim()) {
      toast('Mevcut parolanızı girin.');
      return;
    }
    if (!newUsername.trim()) {
      toast('Kullanıcı adı boş olamaz.');
      return;
    }
    if (newPassword && newPassword.length < 6) {
      toast('Yeni parola en az 6 karakter olmalıdır.');
      return;
    }
    if (newPassword !== newPassword2) {
      toast('Yeni parola ve tekrarı aynı olmalıdır.');
      return;
    }
    if (!newPassword && newUsername.trim() === String(currentUser?.username || '')) {
      toast('Değiştirilecek bir hesap bilgisi girin.');
      return;
    }

    setSavingCredentials(true);
    try {
      const res = await apiRequest('/auth/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          current_password: currentPassword,
          username: newUsername.trim() || undefined,
          new_password: newPassword || undefined
        })
      });

      if (res.success) {
        toast('Hesap bilgileri güncellendi.');
        setCurrentPassword('');
        setNewPassword('');
        setNewPassword2('');
        if (res.user) {
          setNewUsername(res.user.username || '');
          onUserUpdated?.(res.user);
        }
      }
    } catch (err: any) {
      toast(err.message || 'Hesap bilgileri güncellenemedi.');
    } finally {
      setSavingCredentials(false);
    }
  };

  const handleBackupNow = async () => {
    toast('Yedek alınıyor...');
    try {
      const res = await apiRequest('/backup/now', { method: 'POST' });
      if (res.success) {
        toast('Yedek başarıyla alındı');
      }
    } catch (e: any) {
      toast(e.message || 'Yedekleme başarısız oldu.');
    }
  };

  const handleDownloadJSON = async () => {
    toast('Kayıtlar toplanıyor...');
    try {
      const [veh, cust, ord, prt] = await Promise.all([
        apiRequest('/vehicles/search?q='),
        apiRequest('/customers?limit=1000'),
        apiRequest('/work-orders?limit=1000'),
        apiRequest('/parts?limit=1000')
      ]);

      const backupData = {
        exportedAt: new Date().toISOString(),
        settings: {
          shopName,
          shopPhone,
          shopAddress,
          shopOwner,
          shopEmail,
          workingHours,
          shopTaxOffice,
          shopTaxNumber,
          vatRate,
          cashDiscount
        },
        vehicles: veh.items || [],
        customers: cust.items || [],
        orders: ord.items || [],
        parts: prt.items || []
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `servis-defteri-yedek-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Yedek hazır (JSON)');
    } catch {
      toast('Yedek indirilemedi.');
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Ayarlar</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        <div className="sheet-body" onInput={() => { dirtyRef.current = true; }}>
          <div className="field">
            <label htmlFor="st-name">Firma adı / ticari unvan</label>
            <input
              id="st-name"
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
            />
          </div>

          <div className="grid g2">
            <div className="field">
              <label htmlFor="st-owner">Yetkili / dükkan sahibi</label>
              <input
                id="st-owner"
                type="text"
                value={shopOwner}
                onChange={(e) => setShopOwner(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="st-email">E-posta</label>
              <input
                id="st-email"
                type="email"
                value={shopEmail}
                onChange={(e) => setShopEmail(e.target.value)}
              />
            </div>
          </div>

          <div className="grid g2">
            <div className="field">
              <label htmlFor="st-phone">Dükkan telefonu</label>
              <input
                id="st-phone"
                type="tel"
                placeholder="Mesajlarda ve dökümde görünür"
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="st-addr">Adres</label>
              <input
                id="st-addr"
                type="text"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="st-hours">Çalışma saatleri</label>
            <input
              id="st-hours"
              type="text"
              value={workingHours}
              onChange={(e) => setWorkingHours(e.target.value)}
            />
          </div>

          <div className="grid g2">
            <div className="field">
              <label htmlFor="st-tax-office">Vergi dairesi</label>
              <input
                id="st-tax-office"
                type="text"
                placeholder="Örn. Marmara V.D."
                value={shopTaxOffice}
                onChange={(e) => setShopTaxOffice(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="st-tax-number">Vergi no (VKN / TCKN)</label>
              <input
                id="st-tax-number"
                type="text"
                inputMode="numeric"
                placeholder="10 veya 11 haneli numara"
                value={shopTaxNumber}
                onChange={(e) => setShopTaxNumber(e.target.value.replace(/\D/g, ''))}
                maxLength={11}
              />
            </div>
          </div>

          <p className="muted">
            Dükkan adı, yetkili, adres, telefon, e-posta, çalışma saatleri, vergi dairesi ve vergi
            no; indirilen servis dökümü ve teklif (PDF) belgelerinin kurumsal başlığında otomatik
            olarak görünür.
          </p>

          <div className="grid g2">
            <div className="field">
              <label htmlFor="st-vat">Varsayılan KDV oranı (%)</label>
              <input
                id="st-vat"
                type="number"
                min="0"
                step="any"
                value={vatRate}
                onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="field">
              <label htmlFor="st-cash">Peşin iskonto (%)</label>
              <input
                id="st-cash"
                type="number"
                min="0"
                max="100"
                step="any"
                value={cashDiscount}
                onChange={(e) => setCashDiscount(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <p className="muted">
            Peşin fiyat, KDV dahil toplamdan bu iskonto düşülerek hesaplanır. Her iş emrinde peşin fiyatı elle de girebilirsiniz.
          </p>

          {isPrivileged(currentUser) && (
            <>
              <h3>Hesap Güvenliği</h3>
              <p className="muted">
                Yönetici hesabının kullanıcı adı ve parolası yalnızca burada değiştirilebilir.
                Değişiklik için mevcut parolanızı doğrulamanız gerekir. Personel hesapları bu
                bölümü göremez ve yönetici bilgilerini değiştiremez.
              </p>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="st-current-password">Mevcut parola</label>
                  <input
                    id="st-current-password"
                    type="password"
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Mevcut yönetici parolası"
                  />
                </div>

                <div className="field">
                  <label htmlFor="st-new-username">Kullanıcı adı</label>
                  <input
                    id="st-new-username"
                    type="text"
                    autoComplete="username"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="sezer çınar"
                  />
                </div>
              </div>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="st-new-password">Yeni parola</label>
                  <input
                    id="st-new-password"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="En az 6 karakter"
                  />
                </div>

                <div className="field">
                  <label htmlFor="st-new-password2">Yeni parola (tekrar)</label>
                  <input
                    id="st-new-password2"
                    type="password"
                    autoComplete="new-password"
                    value={newPassword2}
                    onChange={(e) => setNewPassword2(e.target.value)}
                    placeholder="Yeni parolayı tekrar girin"
                  />
                </div>
              </div>

              <div className="row">
                <button
                  className="btn"
                  type="button"
                  onClick={handleSaveCredentials}
                  disabled={savingCredentials}
                >
                  {savingCredentials ? 'Güncelleniyor...' : 'Hesap Bilgilerini Güncelle'}
                </button>
              </div>
            </>
          )}

          <h3>Yedek & Veri İndirme</h3>
          <div className="row">
            <button className="btn" type="button" onClick={handleDownloadJSON}>
              Tüm kayıtları indir (JSON)
            </button>
            <button className="btn" type="button" onClick={handleBackupNow}>
              Sunucu Veritabanı Yedeği Al
            </button>
          </div>

          {lanInfo?.qrDataUrl && (
            <>
              <h3>Telefonda Kullan (Aynı Wi-Fi)</h3>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <img
                  src={lanInfo.qrDataUrl}
                  alt="Wi-Fi QR Kod"
                  style={{ width: '130px', height: '130px', borderRadius: '6px', border: '1px solid var(--line)' }}
                />
                <div style={{ fontSize: '0.9rem' }}>
                  <b>Telefon kamerasından okutun</b>
                  <p className="muted" style={{ marginTop: '4px' }}>
                    {lanInfo.mobileUrl}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sheet-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Kapat
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};
