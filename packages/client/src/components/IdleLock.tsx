import React, { useEffect, useRef, useState } from 'react';
import { CORPORATE } from '@oto-servis/shared';
import { apiRequest } from '../services/api.js';

/**
 * 3 dakikalık hareketsizlik (idle) güvenlik kilidi.
 *
 * - `mousemove`, `mousedown`, `click`, `keydown`, `wheel`, `touchstart`,
 *   `scroll` olaylarıyla "son hareket" zamanı izlenir.
 * - Tam 3 dakika (180.000 ms) hiçbir hareket olmazsa oturum askıya alınır ve
 *   arka planı okunmaz hale getiren yoğun buzlu cam katmanı indirilir.
 * - Kilit AYRICA elle tetiklenebilir: `App` içindeki "Ekranı kilitle" düğmesi
 *   `locked` durumunu `true` yapar ve aynı katman beklemeden iner.
 * - Kilit, oturumdaki kullanıcının kendi parolasıyla açılır. Yanlış parola
 *   reddedilir; 5 hatalı denemeden sonra oturum güvenli şekilde kapatılır.
 *   Böylece kilitli ekranda fare hareketi/tek tıkla oturum açılmaz.
 */

const DEFAULT_IDLE_MS = 180_000;
const MAX_UNLOCK_ATTEMPTS = 5;

/** Dinlenecek kullanıcı hareketi olayları. */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'click',
  'keydown',
  'wheel',
  'touchstart',
  'scroll'
];

/**
 * Hareketsizlik sınırı. Üretimde 3 dakikadır; ölçüm/test amacıyla
 * `window.__OTO_IDLE_MS` veya `localStorage.oto_idle_ms` ile geçersiz kılınabilir.
 */
export function resolveIdleMs(): number {
  try {
    const override = (window as any).__OTO_IDLE_MS ?? window.localStorage.getItem('oto_idle_ms');
    const value = Number(override);
    if (Number.isFinite(value) && value >= 200) return value;
  } catch {
    /* yoksay */
  }
  return DEFAULT_IDLE_MS;
}

interface IdleLockProps {
  /** Kilit ekranda mı? (Hareketsizlik sayacı veya elle "Ekranı kilitle"). */
  locked: boolean;
  /** Kilitli oturumun kullanıcısı (parola doğrulaması ve isim gösterimi için). */
  currentUser?: any;
  /** Hareketsizlik sınırı aşıldığında çağrılır. */
  onLock: () => void;
  /** Doğru parola girildiğinde çağrılır; oturum açık kalır. */
  onResume: () => void;
  /** Kullanıcı "Oturumu kapat" derse veya 5 hatalı denemede çağrılır. */
  onLogout: () => void;
}

export const IdleLock: React.FC<IdleLockProps> = ({
  locked,
  currentUser,
  onLock,
  onResume,
  onLogout
}) => {
  const lockRef = useRef(onLock);
  useEffect(() => {
    lockRef.current = onLock;
  }, [onLock]);

  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const attemptsRef = useRef(0);

  // Her kilit inisinde formu sıfırla ve parola alanına odaklan.
  useEffect(() => {
    if (!locked) return;
    setPassword('');
    setError('');
    setSubmitting(false);
    attemptsRef.current = 0;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 80);
    return () => window.clearTimeout(timer);
  }, [locked]);

  // Hareketsizlik sayacı (yalnızca kilitli değilken çalışır)
  useEffect(() => {
    if (locked) return;

    const idleMs = resolveIdleMs();
    let timer = window.setTimeout(() => lockRef.current(), idleMs);
    const reset = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => lockRef.current(), idleMs);
    };

    ACTIVITY_EVENTS.forEach((name) => window.addEventListener(name, reset, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      ACTIVITY_EVENTS.forEach((name) => window.removeEventListener(name, reset));
    };
  }, [locked]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting || !password) return;

    setSubmitting(true);
    setError('');

    try {
      const res = await apiRequest('/auth/verify-password', {
        method: 'POST',
        body: JSON.stringify({ password })
      });
      if (!res?.success) {
        throw new Error(res?.error || 'Parola hatalı.');
      }
      attemptsRef.current = 0;
      onResume();
    } catch (err: any) {
      attemptsRef.current += 1;
      if (attemptsRef.current >= MAX_UNLOCK_ATTEMPTS) {
        setError('Çok fazla hatalı deneme. Oturum güvenli şekilde kapatılıyor...');
        window.setTimeout(() => onLogout(), 900);
      } else {
        setError(err?.message || 'Parola hatalı. Lütfen tekrar deneyin.');
        setPassword('');
        inputRef.current?.focus();
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!locked) return null;

  const displayName = String(currentUser?.full_name || currentUser?.username || '').trim();

  return (
    <div
      className="idle-lock"
      data-testid="idle-lock"
      role="dialog"
      aria-modal="true"
      aria-label="Oturum güvenliğe alındı"
    >
      <div className="idle-lock-inner">
        <div className="holo holo-xl">
          <span className="holo-glow" aria-hidden="true">İyi çalışmalar</span>
          <h1 className="holo-text idle-title" data-testid="idle-title">İyi çalışmalar</h1>
        </div>
        <p className="idle-sub" data-testid="idle-sub">Oturumunuz güvenliğe alındı.</p>
        <p className="idle-brand">{CORPORATE.legalName}</p>
        {displayName && <p className="idle-user">{displayName}</p>}

        <form className="idle-lock-form" onSubmit={handleSubmit} data-testid="idle-lock-form">
          <label htmlFor="idle-password">Kilit parolası</label>
          <div className="idle-lock-row">
            <input
              ref={inputRef}
              id="idle-password"
              data-testid="idle-password"
              type="password"
              autoComplete="current-password"
              placeholder="Parolanızı girin"
              value={password}
              disabled={submitting}
              onChange={(event) => {
                setPassword(event.target.value);
                if (error) setError('');
              }}
            />
            <button
              className="btn btn-primary"
              type="submit"
              data-testid="idle-unlock"
              disabled={submitting || !password}
            >
              {submitting ? 'Kontrol ediliyor...' : 'Kilidi Aç'}
            </button>
          </div>
          {error && (
            <div className="idle-error" role="alert" data-testid="idle-error">
              {error}
            </div>
          )}
          <p className="idle-hint">
            Devam etmek için parolanızı girin. 5 hatalı denemede oturum kapatılır.
          </p>
        </form>

        <button
          className="btn btn-ghost idle-logout"
          type="button"
          onClick={onLogout}
          data-testid="idle-logout"
        >
          Oturumu kapat
        </button>
      </div>
    </div>
  );
};
