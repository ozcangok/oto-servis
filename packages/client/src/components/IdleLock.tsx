import React, { useEffect, useRef } from 'react';

/**
 * 3 dakikalık hareketsizlik (idle) güvenlik kilidi.
 *
 * - `mousemove`, `mousedown`, `click`, `keydown`, `wheel`, `touchstart`,
 *   `scroll` olaylarıyla "son hareket" zamanı izlenir.
 * - Tam 3 dakika (180.000 ms) hiçbir hareket olmazsa oturum askıya alınır ve
 *   arka planı okunmaz hale getiren yoğun buzlu cam katmanı indirilir.
 * - Kilit AYRICA elle tetiklenebilir: `App` içindeki "Ekranı kilitle" düğmesi
 *   `locked` durumunu `true` yapar ve aynı katman beklemeden iner.
 * - PIN yoktur: kilitliyken fare hareketi/tıklama kullanıcıyı `onUnlock` ile
 *   oturumu sıfırlanmış (clear token/session) şekilde dışarı çıkarır.
 */

const DEFAULT_IDLE_MS = 180_000;

/**
 * Kilit indikten sonraki "yerleşme" süresi (ms). Kilit yeni inmişken gelen
 * ilk hareket bu süre içindeyse yok sayılır; böylece hem elle kilitleyen
 * tıklamanın sarsıntısı hem de fare kazası katmanı hemen kaldırmaz.
 */
const LOCK_SETTLE_MS = 600;

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
  /** Hareketsizlik sınırı aşıldığında çağrılır. */
  onLock: () => void;
  /** Kilit açıldığında çağrılır (oturum güvenli şekilde kapatılır). */
  onUnlock: () => void;
}

export const IdleLock: React.FC<IdleLockProps> = ({ locked, onLock, onUnlock }) => {
  const unlockRef = useRef(onUnlock);
  const lockRef = useRef(onLock);
  useEffect(() => {
    unlockRef.current = onUnlock;
    lockRef.current = onLock;
  }, [onUnlock, onLock]);

  // Kilit yeni mi indi? (yerleşme koruması + tek seferlik açma)
  const lockedAtRef = useRef(0);
  const openedRef = useRef(false);
  useEffect(() => {
    if (locked) {
      lockedAtRef.current = Date.now();
      openedRef.current = false;
    }
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

  // Kilitliyken: ilk harekette kilidi aç ve oturumu güvenli şekilde kapat.
  // Not: `{ once: true }` KULLANILMAZ; yerleşme süresi içindeki hareketler
  // dinleyiciyi tüketmemeli (aksi halde kilit "takılı" kalabilir).
  useEffect(() => {
    if (!locked) return;

    const unlock = () => {
      if (openedRef.current) return;
      if (Date.now() - lockedAtRef.current < LOCK_SETTLE_MS) return;
      openedRef.current = true;
      unlockRef.current();
    };
    window.addEventListener('mousemove', unlock);
    window.addEventListener('mousedown', unlock);
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('wheel', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });

    return () => {
      window.removeEventListener('mousemove', unlock);
      window.removeEventListener('mousedown', unlock);
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('wheel', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, [locked]);

  if (!locked) return null;

  return (
    <div className="idle-lock" data-testid="idle-lock" role="dialog" aria-modal="true" aria-label="Oturum güvenliğe alındı">
      <div className="idle-lock-inner">
        <div className="holo holo-xl">
          <span className="holo-glow" aria-hidden="true">İyi çalışmalar</span>
          <h1 className="holo-text idle-title" data-testid="idle-title">İyi çalışmalar</h1>
        </div>
        <p className="idle-sub" data-testid="idle-sub">Oturumunuz güvenliğe alındı.</p>
        <p className="idle-hint">Devam etmek için fareyi hareket ettirin</p>
      </div>
    </div>
  );
};
