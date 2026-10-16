import React, { useState } from 'react';
import { apiRequest, setAuthToken } from '../services/api.js';

interface RegisterScreenProps {
  onSuccess: (user: any) => void;
  onBackToLogin: () => void;
}

export const RegisterScreen: React.FC<RegisterScreenProps> = ({ onSuccess, onBackToLogin }) => {
  const [step, setStep] = useState<'form' | 'code'>('form');
  const [companyAd, setCompanyAd] = useState('');
  const [eposta, setEposta] = useState('');
  const [telefon, setTelefon] = useState('');
  const [adres, setAdres] = useState('');
  const [adminAd, setAdminAd] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [code, setCode] = useState('');
  const [info, setInfo] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (companyAd.trim().length < 2) {
      setError('Firma adı en az 2 karakter olmalıdır.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(eposta.trim())) {
      setError('Geçerli bir e-posta adresi girin.');
      return;
    }
    if (adminAd.trim().length < 2) {
      setError('Yetkili ad soyadı en az 2 karakter olmalıdır.');
      return;
    }
    if (password.length < 6) {
      setError('Parola en az 6 karakter olmalıdır.');
      return;
    }
    if (password !== passwordAgain) {
      setError('Parolalar eşleşmiyor.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest('/companies/register', {
        method: 'POST',
        body: JSON.stringify({
          company_ad: companyAd.trim(),
          eposta: eposta.trim(),
          telefon: telefon.trim() || null,
          adres: adres.trim() || null,
          admin_ad: adminAd.trim(),
          admin_password: password
        })
      });
      if (res.success && res.pending) {
        setInfo(res.message || 'Doğrulama kodu gönderildi.');
        setError('');
        setCode('');
        setStep('code');
      } else {
        setError(res.error || 'Kayıt oluşturulamadı.');
      }
    } catch (err: any) {
      setError(err.message || 'Kayıt sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!/^\d{6}$/.test(code.trim())) {
      setError('6 haneli doğrulama kodunu girin.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest('/companies/verify', {
        method: 'POST',
        body: JSON.stringify({ eposta: eposta.trim(), kod: code.trim() })
      });
      if (res.success) {
        setAuthToken(res.token);
        onSuccess(res.user);
      } else {
        setError(res.error || 'Doğrulama başarısız.');
      }
    } catch (err: any) {
      setError(err.message || 'Doğrulama sırasında hata oluştu.');
    } finally {
      setSaving(false);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0 || saving) return;
    setError('');
    setSaving(true);
    try {
      const res = await apiRequest('/companies/resend-code', {
        method: 'POST',
        body: JSON.stringify({ eposta: eposta.trim() })
      });
      if (res.success) {
        setInfo(res.message || 'Yeni kod gönderildi.');
        setResendCooldown(30);
        const timer = setInterval(() => {
          setResendCooldown((c) => {
            if (c <= 1) {
              clearInterval(timer);
              return 0;
            }
            return c - 1;
          });
        }, 1000);
      } else {
        setError(res.error || 'Kod gönderilemedi.');
      }
    } catch (err: any) {
      setError(err.message || 'Kod gönderilemedi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="sheet" style={{ maxWidth: '520px', margin: 'auto' }}>
        <div className="sheet-head">
          <div>
            <h2>{step === 'form' ? 'Servis Kaydı Oluştur' : 'E-posta Doğrulama'}</h2>
            <p className="muted" style={{ fontSize: '0.85rem', margin: '4px 0 0' }}>
              {step === 'form'
                ? 'Firmanızı kaydedin, 14 gün ücretsiz deneyin. Kredi kartı gerekmez.'
                : `${eposta} adresine 6 haneli kod gönderildi. Kod 10 dakika geçerlidir.`}
            </p>
          </div>
        </div>

        {step === 'form' ? (
        <form onSubmit={handleSubmit} autoComplete="off">
          <div className="sheet-body">
            <div className="field">
              <label htmlFor="rg-company">Servis / Firma Adı *</label>
              <input
                id="rg-company"
                type="text"
                autoComplete="off"
                value={companyAd}
                onChange={(e) => setCompanyAd(e.target.value)}
                placeholder="Örn: Ahmet Otomotiv"
                autoFocus
              />
            </div>

            <div className="grid g2">
              <div className="field">
                <label htmlFor="rg-email">E-posta *</label>
                <input
                  id="rg-email"
                  type="email"
                  autoComplete="off"
                  value={eposta}
                  onChange={(e) => setEposta(e.target.value)}
                  placeholder="info@ornek.com"
                />
              </div>
              <div className="field">
                <label htmlFor="rg-phone">Telefon</label>
                <input
                  id="rg-phone"
                  type="tel"
                  autoComplete="off"
                  value={telefon}
                  onChange={(e) => setTelefon(e.target.value)}
                  placeholder="05xx xxx xx xx"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="rg-address">Adres</label>
              <input
                id="rg-address"
                type="text"
                autoComplete="off"
                value={adres}
                onChange={(e) => setAdres(e.target.value)}
                placeholder="Sanayi Sitesi No: 12"
              />
            </div>

            <div className="grid g2">
              <div className="field">
                <label htmlFor="rg-admin">Yetkili Ad Soyad *</label>
                <input
                  id="rg-admin"
                  type="text"
                  autoComplete="off"
                  value={adminAd}
                  onChange={(e) => setAdminAd(e.target.value)}
                  placeholder="Adınız Soyadınız"
                />
              </div>
              <div className="field">
                <label htmlFor="rg-pass">Parola *</label>
                <input
                  id="rg-pass"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="En az 6 karakter"
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="rg-pass2">Parola (Tekrar) *</label>
              <input
                id="rg-pass2"
                type="password"
                autoComplete="new-password"
                value={passwordAgain}
                onChange={(e) => setPasswordAgain(e.target.value)}
                placeholder="Parolanızı doğrulayın"
              />
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="sheet-foot" style={{ flexDirection: 'column', gap: '10px', alignItems: 'stretch' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving}
              style={{ width: '100%' }}
            >
              {saving ? 'Doğrulama kodu gönderiliyor...' : 'Devam Et'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={onBackToLogin}
            >
              Zaten hesabım var, giriş yap
            </button>
          </div>
        </form>
        ) : (
        <form onSubmit={handleVerify} autoComplete="off">
          <div className="sheet-body">
            {info && (
              <p className="muted" style={{ fontSize: '0.9rem' }}>{info}</p>
            )}
            <div className="field">
              <label htmlFor="rg-code">6 Haneli Doğrulama Kodu *</label>
              <input
                id="rg-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                autoFocus
                style={{ fontSize: '1.5rem', letterSpacing: '8px', textAlign: 'center' }}
              />
            </div>

            {error && <div className="form-error">{error}</div>}
          </div>

          <div className="sheet-foot" style={{ flexDirection: 'column', gap: '10px', alignItems: 'stretch' }}>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={saving || code.trim().length !== 6}
              style={{ width: '100%' }}
            >
              {saving ? 'Doğrulanıyor...' : 'Doğrula ve Giriş Yap'}
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              disabled={saving || resendCooldown > 0}
              onClick={handleResend}
            >
              {resendCooldown > 0 ? `Tekrar gönder (${resendCooldown} sn)` : 'Kod gelmedi, tekrar gönder'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
};
