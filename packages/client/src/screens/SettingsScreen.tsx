import React, { useState, useEffect } from 'react';
import { USER_ROLES, type UserRole } from '@oto-servis/shared';
import { apiRequest } from '../services/api.js';
import { toast, todayISO } from '../services/ui.js';

interface SettingsScreenProps {
  onClose: () => void;
  onSettingsSaved?: (newSettings: any) => void;
  currentUser?: any;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose, onSettingsSaved, currentUser }) => {
  const [shopName, setShopName] = useState('GÜVEN OTO');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [vatRate, setVatRate] = useState<number>(20);
  const [cashDiscount, setCashDiscount] = useState<number>(5);
  const [saving, setSaving] = useState(false);

  // LAN / Mobile QR
  const [lanInfo, setLanInfo] = useState<any | null>(null);

  // Personel yönetimi (yalnızca dükkan sahibi)
  const isOwner = currentUser?.role === 'owner';
  const [users, setUsers] = useState<any[]>([]);
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('staff');
  const [addingUser, setAddingUser] = useState(false);
  const [armedUserId, setArmedUserId] = useState<number | null>(null);
  const [resetPwUserId, setResetPwUserId] = useState<number | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');

  useEffect(() => {
    loadSettings();
    loadLanInfo();
  }, []);

  useEffect(() => {
    if (isOwner) loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOwner]);

  const loadUsers = async () => {
    try {
      const res = await apiRequest('/auth/users');
      if (res.success) setUsers(res.users || []);
    } catch {}
  };

  const handleAddUser = async () => {
    if (newFullName.trim().length < 2) {
      toast('Ad soyad gereklidir.');
      return;
    }
    if (newUsername.trim().length < 3) {
      toast('Kullanıcı adı en az 3 karakter olmalıdır.');
      return;
    }
    if (newPassword.length < 6) {
      toast('Parola en az 6 karakter olmalıdır.');
      return;
    }

    setAddingUser(true);
    try {
      const res = await apiRequest('/auth/users', {
        method: 'POST',
        body: JSON.stringify({
          full_name: newFullName.trim(),
          username: newUsername.trim(),
          password: newPassword,
          role: newRole
        })
      });
      if (res.success) {
        toast(`"${newFullName.trim()}" hesabı oluşturuldu`);
        setNewFullName('');
        setNewUsername('');
        setNewPassword('');
        setNewRole('staff');
        await loadUsers();
      }
    } catch (err: any) {
      toast(err.message || 'Hesap oluşturulamadı.');
    } finally {
      setAddingUser(false);
    }
  };

  const handleDeleteUser = async (u: any) => {
    if (armedUserId !== u.id) {
      setArmedUserId(u.id);
      setTimeout(() => setArmedUserId((cur) => (cur === u.id ? null : cur)), 4000);
      return;
    }
    try {
      await apiRequest(`/auth/users/${u.id}`, { method: 'DELETE' });
      toast(`${u.full_name} silindi`);
      setArmedUserId(null);
      await loadUsers();
    } catch (err: any) {
      toast(err.message || 'Kullanıcı silinemedi.');
    }
  };

  const handleResetPassword = async (u: any) => {
    if (resetPwValue.length < 6) {
      toast('Yeni parola en az 6 karakter olmalıdır.');
      return;
    }
    try {
      await apiRequest(`/auth/users/${u.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ new_password: resetPwValue })
      });
      toast(`${u.full_name} için parola güncellendi`);
      setResetPwUserId(null);
      setResetPwValue('');
    } catch (err: any) {
      toast(err.message || 'Parola güncellenemedi.');
    }
  };

  const loadSettings = async () => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings) {
        setShopName(res.settings.shop_name || 'GÜVEN OTO');
        setShopPhone(res.settings.shop_phone || '');
        setShopAddress(res.settings.shop_address || '');
        setVatRate(res.settings.default_kdv_rate ?? 20);
        setCashDiscount(res.settings.default_cash_discount_rate ?? 5);
      }
    } catch {}
  };

  const loadLanInfo = async () => {
    try {
      const res = await apiRequest('/settings/lan-info');
      if (res.success) setLanInfo(res);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        shop_name: shopName.trim() || 'GÜVEN OTO',
        shop_phone: shopPhone.trim(),
        shop_address: shopAddress.trim(),
        default_kdv_rate: Number(vatRate) || 0,
        default_cash_discount_rate: Number(cashDiscount) || 0
      };

      const res = await apiRequest('/settings', {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      if (res.success) {
        toast('Ayarlar kaydedildi');
        if (onSettingsSaved) onSettingsSaved(res.settings);
        onClose();
      }
    } catch (err: any) {
      toast(err.message || 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
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
        settings: { shopName, shopPhone, shopAddress, vatRate, cashDiscount },
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

        <div className="sheet-body">
          <div className="field">
            <label htmlFor="st-name">Dükkan adı</label>
            <input
              id="st-name"
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
            />
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

          {isOwner && (
            <>
              <h3>Personel Yönetimi</h3>
              <p className="muted">
                Dükkan çalışanlarınıza giriş hesabı oluşturun. Personel; araç, müşteri, parça ve cari işlemlerini
                yapabilir; kasa ve hassas gider kayıtlarını göremez.
              </p>

              <div className="list">
                {users.map((u) => (
                  <div
                    key={u.id}
                    data-testid={`kullanici-${u.username}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      flexWrap: 'wrap',
                      gap: '8px',
                      padding: '10px 0',
                      borderTop: '1px solid var(--divider)'
                    }}
                  >
                    <div className="row" style={{ gap: '10px', minWidth: 0 }}>
                      <span className="badge">{USER_ROLES[u.role as UserRole]?.label || u.role}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600 }}>
                          {u.full_name}
                          {u.id === currentUser?.id && <span className="subtxt"> (siz)</span>}
                        </div>
                        <div className="subtxt">{u.username}</div>
                      </div>
                    </div>

                    {resetPwUserId === u.id ? (
                      <div className="row">
                        <input
                          type="password"
                          aria-label={`${u.full_name} için yeni parola`}
                          placeholder="Yeni parola"
                          value={resetPwValue}
                          onChange={(e) => setResetPwValue(e.target.value)}
                          style={{ maxWidth: '180px' }}
                        />
                        <button
                          className="btn btn-sm btn-primary"
                          type="button"
                          onClick={() => handleResetPassword(u)}
                        >
                          Kaydet
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          onClick={() => {
                            setResetPwUserId(null);
                            setResetPwValue('');
                          }}
                        >
                          Vazgeç
                        </button>
                      </div>
                    ) : (
                      <div className="row">
                        <button
                          className="btn btn-sm btn-ghost"
                          type="button"
                          onClick={() => {
                            setResetPwUserId(u.id);
                            setResetPwValue('');
                          }}
                        >
                          Parola sıfırla
                        </button>
                        <button
                          className={`btn btn-sm btn-danger ${armedUserId === u.id ? 'armed' : ''}`}
                          type="button"
                          disabled={u.id === currentUser?.id}
                          title={u.id === currentUser?.id ? 'Kendi hesabınızı silemezsiniz.' : undefined}
                          onClick={() => handleDeleteUser(u)}
                        >
                          {armedUserId === u.id ? 'Emin misin? Tekrar tıkla' : 'Sil'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="nu-name">Ad Soyad</label>
                  <input
                    id="nu-name"
                    type="text"
                    placeholder="Örn. Ali Yılmaz"
                    value={newFullName}
                    onChange={(e) => setNewFullName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="nu-username">Kullanıcı adı</label>
                  <input
                    id="nu-username"
                    type="text"
                    placeholder="En az 3 karakter"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="nu-password">Parola</label>
                  <input
                    id="nu-password"
                    type="password"
                    placeholder="En az 6 karakter"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="nu-role">Rol</label>
                  <select
                    id="nu-role"
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value as UserRole)}
                  >
                    <option value="staff">{USER_ROLES.staff.label}</option>
                    <option value="owner">{USER_ROLES.owner.label}</option>
                  </select>
                </div>
              </div>

              <div className="row" style={{ marginBottom: '8px' }}>
                <button
                  className="btn btn-primary"
                  type="button"
                  disabled={addingUser}
                  onClick={handleAddUser}
                  data-testid="personel-ekle"
                >
                  {addingUser ? 'Ekleniyor...' : 'Personel Ekle'}
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
