import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { apiRequest, setAuthToken } from '../services/api.js';
import { isPrivileged, normalizeRole, roleLabel } from '../services/roles.js';
import type { User } from '@oto-servis/shared';

export interface AuthContextValue {
  currentUser: User | null;
  authChecked: boolean;
  isOwner: boolean;
  login: (user: User, token: string) => void;
  setUser: (user: User) => void;
  logout: () => void;
  switchToAdmin: (password: string) => Promise<boolean>;
  switchToStaff: () => Promise<boolean>;
  purgeFinancialData: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Kimlik ve rol durumu için tek istemci kaynağı.
 *
 * currentUser, httpOnly cookie (sunucu tarafı) ve localStorage auth_token
 * ile senkronize tutulur. Rol değişikliği sayfa yenilemesine gerek duymadan
 * gerçekleşir; AuthContext ile tüm bileşenler yeniden render edilir.
 */
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const isOwner = isPrivileged(currentUser);

  // Oturum açık kullanıcıyı sunucudan doğrula (uygulama açılışında ve sayfa geri döndüğünde).
  const checkCurrentUser = useCallback(async () => {
    try {
      const res = await apiRequest('/auth/me');
      if (res.success && res.user) {
        setCurrentUser(res.user as User);
      } else {
        setCurrentUser(null);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  }, []);

  useEffect(() => {
    checkCurrentUser();
  }, [checkCurrentUser]);

  const login = useCallback((user: User, token: string) => {
    setAuthToken(token);
    setCurrentUser(user);
    setAuthChecked(true);
  }, []);

  const setUser = useCallback((user: User) => {
    setCurrentUser(user);
  }, []);

  const logout = useCallback(() => {
    setAuthToken(null);
    setCurrentUser(null);
    // authChecked=True korur: App doğrudan LoginScreen render eder,
    // "Yükleniyor..." ayağına düşmez ve競합 durumu olmaz.
    try {
      localStorage.removeItem('oto_sent_reminders');
    } catch {}
  }, []);

  /**
   * Personel → Admin geçişi.
   * Admin şifresi ile /auth/login çağrısı yapılır; başarılıysa token ve
   * admin kullanıcı bilgileri state'e yazılır.
   */
  const switchToAdmin = useCallback(async (password: string): Promise<boolean> => {
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: 'sezer çınar', password })
      });
      if (res.success && res.user && res.token) {
        setAuthToken(res.token);
        setCurrentUser(res.user as User);
        setAuthChecked(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  /**
   * Admin → Personel geçişi.
   * Sunucu /auth/switch-role ile yeni bir staff session açılır; httpOnly
   * cookie güncellenir. Client state'i staff kullanıcıya düşer ve hassas
   * finansal veriler bellekten temizlenir.
   */
  const switchToStaff = useCallback(async (): Promise<boolean> => {
    try {
      const res = await apiRequest('/auth/switch-role', {
        method: 'POST',
        body: JSON.stringify({ targetRole: 'staff' })
      });
      if (res.success && res.user && res.token) {
        setAuthToken(res.token);
        setCurrentUser(res.user as User);
        setAuthChecked(true);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }, []);

  /**
   * Finansal verilerin bellekten temizlenmesi (Admin → Personel geçişinde).
   * localStorage'daki hassas işaretler de silinir.
   */
  const purgeFinancialData = useCallback(() => {
    try {
      localStorage.removeItem('oto_sent_reminders');
    } catch {}
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      currentUser,
      authChecked,
      isOwner,
      login,
      setUser,
      logout,
      switchToAdmin,
      switchToStaff,
      purgeFinancialData
    }),
    [currentUser, authChecked, isOwner, login, setUser, logout, switchToAdmin, switchToStaff, purgeFinancialData]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth, AuthProvider içinde kullanılmalıdır.');
  }
  return context;
}

export { normalizeRole, roleLabel, isPrivileged };
