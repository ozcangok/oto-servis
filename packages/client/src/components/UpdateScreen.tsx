import React from 'react';
import { APP_BRAND_NAME, CORPORATE } from '@oto-servis/shared';

/**
 * Güncelleme kurulum ekranı.
 *
 * Ana süreç `update:status → installing` gönderdiğinde gösterilir; gömülü
 * sunucu durdurulup veritabanı yedeklendikten sonra uygulama `quitAndInstall`
 * ile yeniden başlatılır. Hata olursa ana süreç `error` durumu gönderir ve
 * arayüz normal ekrana döner.
 */
export const UpdateScreen: React.FC = () => (
  <div
    className="shutdown"
    data-testid="update-screen"
    role="dialog"
    aria-modal="true"
    aria-label="Güncelleme yükleniyor"
  >
    <div className="shutdown-inner">
      <div className="splash-brand" aria-hidden="true">{APP_BRAND_NAME}</div>
      <div className="splash-legal" aria-hidden="true">{CORPORATE.legalName}</div>
      <div className="holo holo-md">
        <span className="holo-glow" aria-hidden="true">Güncelleme yükleniyor</span>
        <h1 className="holo-text" data-testid="update-screen-text">Güncelleme yükleniyor</h1>
      </div>

      <div className="shut-status">
        <span className="spin" aria-hidden="true" />
        Yeni sürüm kuruluyor, uygulama yeniden başlatılacak…
      </div>
    </div>
  </div>
);
