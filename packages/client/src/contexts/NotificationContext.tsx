import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react';
import { apiRequest } from '../services/api.js';
import { toast } from '../services/ui.js';
import type { Notification } from '@oto-servis/shared';

export interface NotificationContextValue {
  notifications: Notification[];
  unresolvedCount: number;
  loading: boolean;
  loadNotifications: () => Promise<void>;
  markResolved: (notificationId: string) => Promise<void>;
  markNotifSent: (messageId: number) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue | null>(null);

/**
 * Bildirim durumu için tek istemci kaynağı.
 *
 * - SunucuyaPOST /reminders/:id/resolve ile kalıcı olarak çözümlenir.
 * - Badge değeri çözülmeyenlerin sayısıdır; 0 olduğunda rozet tamamen gizlenir.
 * - Her çözümlemede bir başarı tosti fırlatılır.
 */
export const NotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/reminders/due');
      if (res.success && res.items) {
        const items: Notification[] = res.items.map((it: any) => ({
          id: it.id,
          tur: it.tur,
          baslik: it.baslik,
          mesaj: it.mesaj,
          hedef_tarih: it.hedef_tarih ?? null,
          arac_id: it.arac_id,
          plaka: it.plaka,
          musteri_id: it.musteri_id,
          musteri_ad: it.musteri_ad,
          telefon: it.telefon,
          resolved: false,
          resolved_at: null
        }));
        setNotifications(items);
      }
    } catch {
      /* Sessizce geç; badge 0 olarak kalır. */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  const unresolvedCount = useMemo(() => notifications.filter((n) => !n.resolved).length, [notifications]);

  const markResolved = useCallback(async (notificationId: string) => {
    try {
      const res = await apiRequest(`/reminders/${encodeURIComponent(notificationId)}/resolve`, {
        method: 'POST'
      });
      if (res.success) {
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notificationId ? { ...n, resolved: true, resolved_at: new Date().toISOString() } : n
          )
        );
        toast('Hatırlatıcı çözümlendi');
      }
    } catch {
      toast('Hatırlatıcı çözümlenemedi.');
    }
  }, []);

  const markNotifSent = useCallback(async (messageId: number) => {
    try {
      const res = await apiRequest(`/reminders/messages/${messageId}/sent`, { method: 'POST' });
      if (res.success) {
        toast('Müşteriye iletildi');
        // İletişim merkezi bildirimleri de çözümlü sayılır; listeyi yenile
        void loadNotifications();
      }
    } catch {
      /* wa.me bağlantısı zaten açılmış olur; kayıt hatası sessizce geçer. */
    }
  }, [loadNotifications]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unresolvedCount,
      loading,
      loadNotifications,
      markResolved,
      markNotifSent
    }),
    [notifications, unresolvedCount, loading, loadNotifications, markResolved, markNotifSent]
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};

export function useNotifications(): NotificationContextValue {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotifications, NotificationProvider içinde kullanılmalıdır.');
  }
  return context;
}
