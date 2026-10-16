import React, { useState, useEffect } from 'react';
import { apiRequest, setAuthToken } from '../services/api.js';

interface AuthModalProps {
  onSuccess: (user: any) => void;
  onSwitchToRegister?: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ onSuccess, onSwitchToRegister }) => {
  const [isSetup, setIsSetup] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  // Tarayıcı otomatik-doldurmayı engellemek için: kutular dokunulana kadar salt-okunur
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    checkSetupStatus();
  }, []);

  const checkSetupStatus = async () => {
    try {
      const res = await apiRequest('/auth/setup-status');
      if (res.needed) {
        setIsSetup(true);
        setUsername('admin');
        setPassword('');
        setFullName('Servis Yöneticisi');
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isSetup) {
        const res = await apiRequest('/auth/setup', {
          method: 'POST',
          body: JSON.stringify({
            username,
            password,
            full_name: fullName
          })
        });
        if (res.success) {
          setAuthToken(res.token);
          onSuccess(res.user);
        }
      } else {
        const res = await apiRequest('/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            identifier: username,
            password
          })
        });
        if (res.success) {
          setAuthToken(res.token);
          onSuccess(res.user);
        } else {
          setError(res.error || 'Giriş yapılamadı.');
        }
      }
    } catch (err: any) {
      setError(err.message || 'Giriş sırasında hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="sheet" style={{ maxWidth: '420px', margin: 'auto' }}>
        <div className="sheet-head">
          <h2>{isSetup ? 'İlk Kurulum & Yönetici Şifresi' : 'Servis Girişi'}</h2>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="sheet-body">
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              {isSetup
                ? 'Sistemi ilk kez başlattığınız için lütfen yönetici parolasını belirleyin.'
                : 'Devam etmek için kullanıcı adı ve parolanızı girin.'}
            </p>

            {isSetup && (
              <div className="field">
                <label htmlFor="auth-fullname">Ad Soyad</label>
                <input
                  id="auth-fullname"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ahmet Usta"
                />
              </div>
            )}

            <div className="field">
              <label htmlFor="auth-username">E-posta</label>
              <input
                id="auth-username"
                type="text"
                required
                autoComplete="off"
                readOnly={!unlocked}
                onFocus={() => setUnlocked(true)}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ornek@firmaniz.com"
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="auth-password">Parola</label>
              <input
                id="auth-password"
                type="password"
                required
                autoComplete="new-password"
                readOnly={!unlocked}
                onFocus={() => setUnlocked(true)}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="sheet-foot" style={{ flexDirection: 'column', gap: '10px', alignItems: 'stretch' }}>
            <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: '100%' }}>
              {loading ? 'İşleniyor...' : isSetup ? 'Kurulumu Tamamla' : 'Giriş Yap'}
            </button>
            {!isSetup && onSwitchToRegister && (
              <button
                className="btn btn-ghost"
                type="button"
                onClick={onSwitchToRegister}
              >
                Hesabınız yok mu? Kayıt olun
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
