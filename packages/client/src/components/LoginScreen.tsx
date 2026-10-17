import React from 'react';
import { AuthModal } from './AuthModal.js';

interface LoginScreenProps {
  onSuccess: (user: any) => void;
}

/**
 * İzole giriş ekranı.
 *
 * GÜVENLİK NOTU:
 * - Arka planı tamamen opak (düz renk `var(--bg)`) → arkadaki hiçbir sayfa/rakam görünmez.
 * - Çıkış (logout) yapıldığında App bileşeni uygulama kabuğunu hiç render etmez,
 *   böylece Kasa/Gider/Müşteri verileri DOM'da fiziksel olarak bulunmaz.
 */
export const LoginScreen: React.FC<LoginScreenProps> = ({ onSuccess }) => (
  <div className="login-iso" data-testid="login-screen">
    <div className="login-iso-inner">
      <AuthModal onSuccess={onSuccess} />
    </div>
  </div>
);
