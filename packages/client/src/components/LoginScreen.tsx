import React, { useEffect, useState } from 'react';
import { AuthModal } from './AuthModal.js';
import { APP_BRAND_NAME, splashGreeting } from '@oto-servis/shared';

interface LoginScreenProps {
  onSuccess: (user: any) => void;
  /**
   * Güvenlik bildirimi (örn. hareketsizlik nedeniyle otomatik kapatılan oturum).
   * Ekranın sağ üst köşesinde 4 saniyelik zarif bir toast olarak gösterilir.
   */
  notice?: string | null;
}

/** Bildirimin ekranda kalma süresi (ms). */
const NOTICE_MS = 4000;

/**
 * İzole giriş ekranı.
 *
 * GÜVENLİK NOTU:
 * - Arka planı tamamen opak → arkadaki hiçbir sayfa/rakam görünmez.
 *   (Holografik zemin dekoratiftir ve yalnızca sistem saatinden üretilen
 *   karşılama metnini gösterir; App bileşeni çıkışta uygulama kabuğunu hiç
 *   render etmez, böylece Kasa/Gider/Müşteri verisi DOM'da fiziksel olarak
 *   bulunmaz.)
 */
export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess, notice }) => {
  const [visibleNotice, setVisibleNotice] = useState<string | null>(notice ?? null);
  // Holografik karşılama metni: yalnızca sistem saatine bağlı, veri içermez.
  const [greeting] = useState<string>(() => splashGreeting(new Date(), APP_BRAND_NAME));

  useEffect(() => {
    if (!notice) {
      setVisibleNotice(null);
      return;
    }
    setVisibleNotice(notice);
    const timer = window.setTimeout(() => setVisibleNotice(null), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice]);

  return (
    <div className="login-iso" data-testid="login-screen">
      {/* Holografik zemin: açılış (splash) ekranıyla birebir aynı görünüm.
          Yalnızca dekorasyon; giriş kartının arkasında kalır ve tıklamayı
          engellemez (pointer-events:none). */}
      <div className="login-holo" aria-hidden="true">
        <div className="login-holo-brand">{APP_BRAND_NAME}</div>
        <div className="holo holo-lg">
          <span className="holo-glow">{greeting}</span>
          <h1 className="holo-text">{greeting}</h1>
        </div>
      </div>
      <div className="login-iso-inner">
        <AuthModal onSuccess={onSuccess} />
      </div>
      {visibleNotice && (
        <div className="login-notice" role="status" aria-live="polite" data-testid="login-notice">
          {visibleNotice}
        </div>
      )}
    </div>
  );
};
