import React, { useState } from 'react';
import { APP_BRAND_NAME, farewellGreeting } from '@oto-servis/shared';

/**
 * Güvenli kapanış (veda) ekranı.
 *
 * Electron ana süreci pencereyi kapatmadan (`e.preventDefault()`) önce bu
 * ekranı tetikler: arka planda SQLite veritabanı Belgelerim/CinarOto_Yedekler
 * klasörüne zaman damgasıyla kopyalanır. Ekran ZORUNLU olarak 10 saniye
 * ekranda kalır (ana süreç en az 10 sn sonra `app.quit()` çağırır) — bu yüzden
 * ilerleme çubuğu 10 saniyelik bir animasyondur ve dönen bir gösterge içerir.
 */

/** Zorunlu ekranda kalma süresi (ms). */
const SHUTDOWN_MS = 10_000;

interface ShutdownScreenProps {
  brand?: string;
}

export const ShutdownScreen: React.FC<ShutdownScreenProps> = ({ brand = APP_BRAND_NAME }) => {
  const [message] = useState<string>(() => farewellGreeting(new Date(), brand));

  return (
    <div
      className="shutdown"
      data-testid="shutdown"
      role="dialog"
      aria-modal="true"
      aria-label="Güvenli kapanış"
      data-duration={SHUTDOWN_MS}
    >
      <div className="shutdown-inner">
        <div className="splash-brand" aria-hidden="true">{brand}</div>
        <div className="holo holo-md">
          <span className="holo-glow" aria-hidden="true">{message}</span>
          <h1 className="holo-text shutdown-text" data-testid="shutdown-text">{message}</h1>
        </div>

        <div
          className="shut-bar"
          data-testid="shutdown-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Yedekleme ilerlemesi"
        >
          <i />
        </div>

        <div className="shut-status">
          <span className="spin" aria-hidden="true" />
          Yedek alınıyor, lütfen bekleyin...
        </div>
      </div>
    </div>
  );
};
