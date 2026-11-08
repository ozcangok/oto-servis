import React, { useState, useCallback, useEffect } from 'react';
import { LogOut, ShieldCheck, Sun, Moon, ChevronDown, Lock, Sparkles, User } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { roleLabel } from '../services/roles.js';

export interface ProfileSwitcherProps {
  theme: 'light' | 'dark';
  setTheme: (theme: 'light' | 'dark') => void;
}

/**
 * Kurumsal yetki geçiş bileşeni.
 *
 * Sol altta kullanıcı profil bölümü; tıklayıca popover açılır.
 * - Operasyonel → Yönetici: "Yönetici Yetkilendirmesi" → şifre modalı → doğrulandıysa anlık geçiş
 * - Yönetici → Operasyonel: "Operasyonel Görünüm" → anlık düşürme, hassas veriler temizlenir
 * - Her iki durumda da sayfa yenilenmez.
 */
export const ProfileSwitcher: React.FC<ProfileSwitcherProps> = ({ theme, setTheme }) => {
  const { currentUser, isOwner, switchToAdmin, switchToStaff, logout } = useAuth();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [passwordModalOpen, setPasswordModalOpen] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);

  const handleSwitchToAdmin = useCallback(async (password: string) => {
    setSwitching(true);
    setSwitchError(null);
    try {
      const ok = await switchToAdmin(password);
      if (ok) {
        setPopoverOpen(false);
        setPasswordModalOpen(false);
      } else {
        setSwitchError('Hatalı yönetici şifresi. Lütfen tekrar deneyin.');
      }
    } catch {
      setSwitchError('Yönetici yetkilendirme işlemi sırasında hata oluştu.');
    } finally {
      setSwitching(false);
    }
  }, [switchToAdmin]);

  const handleSwitchToStaff = useCallback(async () => {
    setSwitching(true);
    setSwitchError(null);
    try {
      const ok = await switchToStaff();
      if (ok) {
        setPopoverOpen(false);
      } else {
        setSwitchError('Operasyonel görünüm geçişi sırasında hata oluştu.');
      }
    } catch {
      setSwitchError('Operasyonel görünüm geçişi sırasında hata oluştu.');
    } finally {
      setSwitching(false);
    }
  }, [switchToStaff]);

  const handleTogglePopover = () => {
    setPopoverOpen((prev) => !prev);
    if (!popoverOpen) setSwitchError(null);
  };

  const handleClickOutside = (event: MouseEvent) => {
    const container = event.target as HTMLElement;
    if (!container.closest('.profile-switcher')) {
      setPopoverOpen(false);
    }
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!currentUser) return null;

  const displayName = currentUser.full_name || currentUser.username || 'Kullanıcı';
  const initial = displayName.toString().trim().charAt(0).toLocaleUpperCase('tr');
  const ownerRole = isOwner ? 'owner' : 'staff';

  return (
    <div className="profile-switcher" onClick={handleTogglePopover} style={{ cursor: 'pointer' }}>
      <div className="sidebar-profile" role="button" aria-label="Kullanıcı profili ve rol geçişi">
        <span className="sidebar-avatar" aria-hidden="true">{initial}</span>
        <span className="sidebar-profile-text">
          <b>{displayName}</b>
          <small>{roleLabel(currentUser)}</small>
        </span>
        <ShieldCheck size={16} strokeWidth={1.8} aria-hidden="true" />
        <ChevronDown size={14} strokeWidth={1.75} aria-hidden="true" />
      </div>

      {popoverOpen && (
        <div className="profile-popover">
          <div className="popover-section">
            <div className="popover-row" onClick={handleTogglePopover} style={{ cursor: 'pointer' }}>
              <User size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Hesabım: {displayName}</span>
            </div>
            <div className="popover-divider" />
            {ownerRole === 'staff' ? (
              <div className="popover-row btn-row" onClick={() => {
                setPopoverOpen(false);
                setPasswordModalOpen(true);
              }} style={{ cursor: 'pointer' }}>
                <Lock size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Yönetici Yetkilendirmesi (Admin Authorization)</span>
              </div>
            ) : (
              <div className="popover-row btn-row warn" onClick={handleSwitchToStaff} style={{ cursor: 'pointer' }}>
                <User size={16} strokeWidth={1.75} aria-hidden="true" />
                <span>Operasyonel Görünüm (Staff Terminal)</span>
              </div>
            )}
            <div className="popover-divider" />
            <div className="popover-row" onClick={() => {
              setPopoverOpen(false);
              setTheme(theme === 'dark' ? 'light' : 'dark');
            }} style={{ cursor: 'pointer' }}>
              {theme === 'dark' ? <Sun size={16} strokeWidth={1.75} aria-hidden="true" /> : <Moon size={16} strokeWidth={1.75} aria-hidden="true" />}
              <span>{theme === 'dark' ? 'Açık Tema' : 'Koyu Tema'}</span>
            </div>
            <div className="popover-divider" />
            <div className="popover-row danger" onClick={() => {
              setPopoverOpen(false);
              logout();
            }} style={{ cursor: 'pointer' }}>
              <LogOut size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>Çıkış Yap</span>
            </div>
          </div>
        </div>
      )}

      {/* Kurumsal yönetici doğrulama modalı (Operasyonel → Yönetici) */}
      {passwordModalOpen && (
        <div className="profile-popover backdrop">
          <div className="popover-section modal-card">
            <div className="modal-header">
              <Lock size={20} strokeWidth={2} aria-hidden="true" />
              <span>Kurumsal Yönetici Doğrulaması</span>
            </div>
            <p className="modal-hint">
              Yetkili servis yönetim paneline geçiş yapmak için yönetici şifrenizi girin.
            </p>
            <div className="modal-field">
              <label>Yönetici Şifresi</label>
              <input
                id="admin-password-input"
                type="password"
                autoComplete="current-password"
                placeholder="Yönetici şifresi"
                className={switchError ? 'input-error' : ''}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const input = e.currentTarget as HTMLInputElement;
                    void handleSwitchToAdmin(input.value || '');
                  }
                }}
              />
            </div>
            {switchError && <div className="modal-error">{switchError}</div>}
            <div className="modal-actions">
              <button className="btn btn-ghost" onClick={() => { setPasswordModalOpen(false); setSwitchError(null); }}>
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  const input = document.getElementById('admin-password-input') as HTMLInputElement | null;
                  void handleSwitchToAdmin(input?.value || '');
                }}
                disabled={switching}
              >
                {switching ? 'Doğrulanıyor...' : 'Yetkilendirmeyi Onayla'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
