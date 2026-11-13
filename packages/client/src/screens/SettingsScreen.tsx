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

  // Personel hesapları (yalnızca yönetici)
  const [users, setUsers] = useState<any[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [newStaffName, setNewStaffName] = useState('');
  const [newStaffUsername, setNewStaffUsername] = useState('');
  const [newStaffPassword, setNewStaffPassword] = useState('');
  const [newStaffPassword2, setNewStaffPassword2] = useState('');
  const [creatingStaff, setCreatingStaff] = useState(false);
  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resettingUserId, setResettingUserId] = useState<number | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<number | null>(null);

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

  // Personel listesini yalnızca yönetici için yükle.
  useEffect(() => {
    if (isPrivileged(currentUser)) {
      void loadUsers();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

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

  const loadUsers = async () => {
    setUsersLoading(true);
    try {
      const res = await apiRequest('/auth/users');
      if (res.success) setUsers(res.users || []);
    } catch (err: any) {
      toast(err.message || 'Kullanıcılar yüklenemedi.');
    } finally {
      setUsersLoading(false);
    }
  };

  const handleCreateStaff = async () => {
    const fullName = newStaffName.trim();
    const username = newStaffUsername.trim();

    if (fullName.length < 2) {
      toast('Ad soyad en az 2 karakter olmalıdır.');
      return;
    }
    if (username.length < 3) {
      toast('Kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }
    if (newStaffPassword.length < 6) {
      toast('Parola en az 6 karakter olmalıdır.');
      return;
    }
    if (newStaffPassword !== newStaffPassword2) {
      toast('Parolalar birbiriyle eşleşmiyor.');
      return;
    }

    setCreatingStaff(true);
    try {
      await apiRequest('/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          username,
          password: newStaffPassword,
          full_name: fullName,
          role: 'staff'
        })
      });
      toast('Personel hesabı oluşturuldu.');
      setNewStaffName('');
      setNewStaffUsername('');
      setNewStaffPassword('');
      setNewStaffPassword2('');
      await loadUsers();
    } catch (err: any) {
      toast(err.message || 'Personel hesabı oluşturulamadı.');
    } finally {
      setCreatingStaff(false);
    }
  };

  const handleResetStaffPassword = async (userId: number) => {
    if (resetPassword.length < 6) {
      toast('Yeni parola en az 6 karakter olmalıdır.');
      return;
    }

    setResettingUserId(userId);
    try {
      await apiRequest(`/auth/users/${userId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: resetPassword })
      });
      toast('Personel parolası güncellendi.');
      setResetUserId(null);
      setResetPassword('');
    } catch (err: any) {
      toast(err.message || 'Parola güncellenemedi.');
    } finally {
      setResettingUserId(null);
    }
  };

  const handleDeleteStaff = async (user: any) => {
    if (user.role === 'owner') return;
    if (
      !window.confirm(
        `${user.full_name} (${user.username}) hesabını silmek istediğinize emin misiniz?`
      )
    ) {
      return;
    }

    setDeletingUserId(user.id);
    try {
      await apiRequest(`/auth/users/${user.id}`, { method: 'DELETE' });
      toast('Personel hesabı silindi.');
      if (resetUserId === user.id) {
        setResetUserId(null);
        setResetPassword('');
      }
      await loadUsers();
    } catch (err: any) {
      toast(err.message || 'Hesap silinemedi.');
    } finally {
      setDeletingUserId(null);
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

          {isPrivileged(currentUser) && (
            <>
              <h3>Personel Hesapları</h3>
              <p className="muted">
                Servis çalışanlarınız için ayrı giriş hesabı oluşturun. Personel hesapları
                yalnızca operasyonel ekranları görür; kasa, gider ve kâr bilgilerine erişemez.
              </p>

              <div
                className="list"
                style={{
                  border: '1px solid var(--divider)',
                  borderRadius: '8px',
                  overflow: 'hidden'
                }}
              >
                {usersLoading ? (
                  <div className="li" style={{ display: 'block' }}>
                    Kullanıcılar yükleniyor…
                  </div>
                ) : users.length === 0 ? (
                  <div className="li" style={{ display: 'block' }}>
                    Henüz kullanıcı yok.
                  </div>
                ) : (
                  users.map((u) => (
                    <div
                      className="li"
                      key={u.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px',
                        flexWrap: 'wrap'
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                        <div className="muted" style={{ fontSize: '0.85rem' }}>
                          {u.username} · {u.role === 'owner' ? 'Patron' : 'Servis Personeli'}
                        </div>
                      </div>
                      {u.role !== 'owner' && (
                        <div className="row" style={{ gap: '6px' }}>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => {
                              setResetUserId(resetUserId === u.id ? null : u.id);
                              setResetPassword('');
                            }}
                          >
                            Parola Sıfırla
                          </button>
                          <button
                            className="btn btn-danger btn-sm"
                            type="button"
                            disabled={deletingUserId === u.id}
                            onClick={() => void handleDeleteStaff(u)}
                          >
                            {deletingUserId === u.id ? 'Siliniyor…' : 'Sil'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {resetUserId !== null && (
                <div className="grid g2" style={{ alignItems: 'end' }}>
                  <div className="field">
                    <label htmlFor="st-reset-password">
                      Yeni parola —{' '}
                      {users.find((u) => u.id === resetUserId)?.full_name || 'Personel'}
                    </label>
                    <input
                      id="st-reset-password"
                      type="password"
                      autoComplete="new-password"
                      value={resetPassword}
                      onChange={(e) => setResetPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                    />
                  </div>
                  <div className="row">
                    <button
                      className="btn btn-primary"
                      type="button"
                      disabled={resettingUserId !== null}
                      onClick={() => void handleResetStaffPassword(resetUserId)}
                    >
                      {resettingUserId !== null ? 'Kaydediliyor…' : 'Parolayı Kaydet'}
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      onClick={() => {
                        setResetUserId(null);
                        setResetPassword('');
                      }}
                    >
                      İptal
                    </button>
                  </div>
                </div>
              )}

              <div
                style={{
                  borderTop: '1px solid var(--divider)',
                  paddingTop: '14px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px'
                }}
              >
                <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>Yeni personel hesabı</div>

                <div className="grid g2">
                  <div className="field">
                    <label htmlFor="st-staff-name">Ad Soyad</label>
                    <input
                      id="st-staff-name"
                      type="text"
                      value={newStaffName}
                      onChange={(e) => setNewStaffName(e.target.value)}
                      placeholder="Örn. Ahmet Yılmaz"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="st-staff-username">Kullanıcı Adı</label>
                    <input
                      id="st-staff-username"
                      type="text"
                      autoComplete="off"
                      value={newStaffUsername}
                      onChange={(e) => setNewStaffUsername(e.target.value)}
                      placeholder="Örn. ahmet"
                    />
                  </div>
                </div>

                <div className="grid g2">
                  <div className="field">
                    <label htmlFor="st-staff-password">Parola</label>
                    <input
                      id="st-staff-password"
                      type="password"
                      autoComplete="new-password"
                      value={newStaffPassword}
                      onChange={(e) => setNewStaffPassword(e.target.value)}
                      placeholder="En az 6 karakter"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="st-staff-password2">Parola (tekrar)</label>
                    <input
                      id="st-staff-password2"
                      type="password"
                      autoComplete="new-password"
                      value={newStaffPassword2}
                      onChange={(e) => setNewStaffPassword2(e.target.value)}
                      placeholder="Parolayı tekrar girin"
                    />
                  </div>
                </div>

                <div className="row">
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={creatingStaff}
                    onClick={() => void handleCreateStaff()}
                  >
                    {creatingStaff ? 'Oluşturuluyor…' : 'Personel Ekle'}
                  </button>
                </div>
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
