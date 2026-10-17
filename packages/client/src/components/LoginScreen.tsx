import React, { useEffect, useState } from 'react';
import { AuthModal } from './AuthModal.js';

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
 * - Arka planı tamamen opak (düz renk `var(--bg)`) → arkadaki hiçbir sayfa/rakam görünmez.
 * - Çıkış (logout) yapıldığında App bileşeni uygulama kabuğunu hiç render etmez,
 *   böylece Kasa/Gider/Müşteri verileri DOM'da fiziksel olarak bulunmaz.
 */
export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess, notice }) => {
  const [visibleNotice, setVisibleNotice] = useState<string | null>(notice ?? null);

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
