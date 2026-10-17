import React, { useEffect, useRef, useState } from 'react';
import { APP_BRAND_NAME, splashGreeting } from '@oto-servis/shared';

/**
 * Saat/gün duyarlı, dokunulmaz açılış (splash) ekranı.
 *
 * İşleyiş:
 * - Açılışta sistem saati (`new Date()`) okunur ve karşılama metni üretilir.
 * - İlk 7 saniye boyunca ekran GEÇİLEMEZ: `pointer-events:none` ve
 *   hiçbir girdi dinleyicisi bağlanmaz.
 * - 7 saniye dolduğunda altta "Devam etmek için tıklayın veya fareyi hareket
 *   ettirin" yazısı zarifçe belirir (`opacity` geçişi).
 * - Fare hareketi / tıklama / dokunma / tuş anında ekran yumuşakça (fade-out)
 *   kaybolur ve doğrudan giriş ekranına geçilir.
 */

/** Ekranın zorunlu kilit süresi (ms) — üretim değeri. */
const DEFAULT_LOCK_MS = 7000;
/** Fade-out süresi (ms) — CSS `.splash.leaving` geçişiyle eşleşir. */
const FADE_MS = 600;

/**
 * Zorunlu kilit süresi. Üretimde 7 saniyedir; ölçüm/test amacıyla
 * `window.__OTO_SPLASH_LOCK_MS` ile geçersiz kılınabilir.
 */
export function resolveLockMs(): number {
  try {
    const override = Number((window as any).__OTO_SPLASH_LOCK_MS);
    if (Number.isFinite(override) && override >= 500) return override;
  } catch {
    /* yoksay */
  }
  return DEFAULT_LOCK_MS;
}

type Phase = 'locked' | 'ready' | 'leaving';

interface SplashScreenProps {
  onDone: () => void;
  brand?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({ onDone, brand = APP_BRAND_NAME }) => {
  const [phase, setPhase] = useState<Phase>('locked');
  const [lockMs] = useState<number>(() => resolveLockMs());
  // Metin yalnızca bir kez, açılış anındaki sistem saatine göre üretilir.
  const [greeting] = useState<string>(() => splashGreeting(new Date(), brand));
  const leavingRef = useRef(false);

  // Zorunlu kilit süresi → "ready"
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setPhase((prev) => (prev === 'locked' ? 'ready' : prev));
    }, lockMs);
    return () => window.clearTimeout(timer);
  }, [lockMs]);

  // Yalnızca kilit açıldıktan SONRA girdi kabul edilir.
  useEffect(() => {
    if (phase !== 'ready') return;

    const leave = () => {
      if (leavingRef.current) return;
      leavingRef.current = true;
      setPhase('leaving');
      window.setTimeout(onDone, FADE_MS);
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'click', 'touchstart', 'keydown', 'wheel'];
    events.forEach((name) => window.addEventListener(name, leave));
    return () => events.forEach((name) => window.removeEventListener(name, leave));
  }, [phase, onDone]);

  return (
    <div className={`splash ${phase}`} data-testid="splash" data-phase={phase} data-lock-ms={lockMs}>
      <div className="splash-inner">
        <div className="splash-brand" aria-hidden="true">{brand}</div>
        <div className="holo holo-lg">
          <span className="holo-glow" aria-hidden="true">{greeting}</span>
          <h1 className="holo-text splash-text" data-testid="splash-text">{greeting}</h1>
        </div>
        <div className="splash-hint" data-testid="splash-hint">
          Devam etmek için tıklayın veya fareyi hareket ettirin
        </div>
      </div>
    </div>
  );
};
