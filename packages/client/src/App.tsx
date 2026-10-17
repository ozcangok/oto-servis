import React, { useState, useEffect, useRef } from 'react';
import { apiRequest, setAuthToken, setUnauthorizedHandler } from './services/api.js';
import { LoginScreen } from './components/LoginScreen.js';
import { clearOfflineQueue } from './services/offlineQueue.js';
import { VehicleSearchScreen } from './screens/VehicleSearchScreen.js';
import { CustomersScreen } from './screens/CustomersScreen.js';
import { VehiclesScreen } from './screens/VehiclesScreen.js';
import { WorkOrderScreen } from './screens/WorkOrderScreen.js';
import { PartsScreen } from './screens/PartsScreen.js';
import { CustomerAccountsScreen } from './screens/CustomerAccountsScreen.js';
import { CashDeskScreen } from './screens/CashDeskScreen.js';
import { ExpensesScreen } from './screens/ExpensesScreen.js';
import { RemindersScreen } from './screens/RemindersScreen.js';
import { SettingsScreen } from './screens/SettingsScreen.js';

type TabKey = 'sorgu' | 'arac' | 'musteri' | 'parca' | 'cari' | 'kasa' | 'gider' | 'hatir';

// Sekme <-> adres (hash) eşlemesi. Rol koruması bu rotalarda uygulanır.
const TAB_TO_HASH: Record<TabKey, string> = {
  sorgu: 'sorgu',
  arac: 'araclar',
  musteri: 'musteriler',
  parca: 'parcalar',
  cari: 'cari',
  kasa: 'kasa',
  gider: 'giderler',
  hatir: 'hatirlaticilar'
};

const HASH_TO_TAB: Record<string, TabKey> = {
  sorgu: 'sorgu',
  araclar: 'arac',
  musteriler: 'musteri',
  parcalar: 'parca',
  cari: 'cari',
  kasa: 'kasa',
  giderler: 'gider',
  hatirlaticilar: 'hatir'
};

/** Adres çubuğundaki rotayı okur (yalnızca hash: #/kasa vb.). */
function readRoute(): string {
  return window.location.hash.replace(/^#\/?/, '').toLowerCase();
}

/** `/kasa` gibi yol tabanlı adresleri `#/kasa` biçimine normalleştirir. */
function normalizePathRoute() {
  const p = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
  if (p && p !== 'index.html' && (p === 'ayarlar' || p === 'login' || p in HASH_TO_TAB)) {
    window.history.replaceState(null, '', `/#/${p}`);
  }
}

export function App() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>('sorgu');

  // Work order sheet modal state
  const [workOrderModalOpen, setWorkOrderModalOpen] = useState(false);
  const [activeWorkOrderId, setActiveWorkOrderId] = useState<number | null>(null);
  const [workOrderPlate, setWorkOrderPlate] = useState<string>('');

  // Search screen active plate
  const [selectedPlate, setSelectedPlate] = useState<string>('');

  // Settings modal state
  const [showSettings, setShowSettings] = useState(false);
  const [shopName, setShopName] = useState('GÜVEN OTO');

  // Reminders badge counter
  const [remindersCount, setRemindersCount] = useState(0);

  // Appearance
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    return (localStorage.getItem('oto_theme') as 'light' | 'dark') || 'light';
  });

  // Oturum kimliği: her giriş/çıkışta uygulama kabuğunu sıfırdan mount eder
  // (önceki kullanıcının ekran state'i asla yeni oturuma taşınmaz).
  const [sessionNonce, setSessionNonce] = useState(0);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('oto_theme', theme);
  }, [theme]);

  useEffect(() => {
    checkCurrentUser();
    loadSettings();
    loadRemindersBadge();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+N: new work order
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleNewWorkOrder();
      }
      // Escape: close modal
      if (e.key === 'Escape') {
        if (workOrderModalOpen) {
          setWorkOrderModalOpen(false);
          setActiveWorkOrderId(null);
        } else if (showSettings) {
          setShowSettings(false);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [workOrderModalOpen, showSettings]);

  const checkCurrentUser = async () => {
    try {
      const res = await apiRequest('/auth/me');
      if (res.success && res.user) {
        setCurrentUser(res.user);
      }
    } catch {
      setCurrentUser(null);
    } finally {
      setAuthChecked(true);
    }
  };

  const loadSettings = async () => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings?.shop_name) {
        setShopName(res.settings.shop_name);
      }
    } catch {}
  };

  const loadRemindersBadge = async () => {
    try {
      const res = await apiRequest('/reminders/due');
      if (res.success) {
        setRemindersCount(res.count || 0);
      }
    } catch {}
  };

  const handleAuthSuccess = (user: any) => {
    setCurrentUser(user);
    loadRemindersBadge();
    loadSettings();
  };

  /**
   * Çıkışta tarayıcı hafızasındaki TÜM hassas durumu sıfırlar.
   * Kasa/Gider/Müşteri verileri ekran bileşenlerinin state'inde tutulur; oturum
   * kapandığında uygulama kabuğu hiç render edilmediği için bu veriler DOM'dan
   * ve bellekten tamamen silinir. Ayrıca token, offline kuyruk ve hatırlatıcı
   * işaretleri burada açıkça temizlenir.
   */
  const resetSensitiveState = () => {
    setActiveTab('sorgu');
    setWorkOrderModalOpen(false);
    setActiveWorkOrderId(null);
    setWorkOrderPlate('');
    setSelectedPlate('');
    setShowSettings(false);
    setRemindersCount(0);
    setSessionNonce((n) => n + 1); // uygulama kabuğunu sıfırdan mount et
  };

  // Kasa yalnızca dükkan sahibine (owner) açıktır. Personel (staff) için sekme
  // gizlenir; aktif sekme kasa ise başka bölüme alınır. (Giderler herkese açıktır.)
  const isOwner = currentUser?.role === 'owner';

  /**
   * Oturumu YEREL olarak kapatır. Hassas tüm veri/state silinir.
   * Hem kullanıcı "çıkış" butonunda hem de sunucu 401 döndüğünde (oturum süresi
   * dolduğunda) çağrılır.
   */
  const clearSession = () => {
    setAuthToken(null); // 1) Kimlik bilgileri
    clearOfflineQueue(); // 2) Yerel hassas veriler (offline kuyruk)
    try {
      localStorage.removeItem('oto_sent_reminders');
    } catch {}
    resetSensitiveState(); // 3) Tüm ekran state'i (Kasa/Gider/Müşteri...)
    setCurrentUser(null); // 4) Oturumu kapat → yalnızca izole giriş ekranı
  };

  const clearSessionRef = useRef(clearSession);
  const currentUserRef = useRef<any | null>(currentUser);
  useEffect(() => {
    clearSessionRef.current = clearSession;
    currentUserRef.current = currentUser;
  });

  // Oturum süresi dolduğunda (sunucu 401) anında ve güvenli şekilde dışarı at.
  // Yalnızca gerçekten oturum açıkken uygulanır.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      if (currentUserRef.current) clearSessionRef.current();
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {}
    clearSession();
    // Tarayıcının "Geri" tuşuyla korumalı sayfaya dönüşünü engelle: geçmişe
    // izole bir 'login' kaydı ekle. Geri basılırsa oturum kapalı olduğundan
    // yalnızca opak giriş ekranı görünür.
    try {
      window.history.pushState(null, '', '#/login');
    } catch {}
  };

  /** Sekme değiştirir ve adres çubuğunu günceller (geri tuşu uyumlu). */
  const navigate = (tab: TabKey) => {
    setActiveTab(tab);
    const h = '#/' + TAB_TO_HASH[tab];
    if (window.location.hash !== h) {
      window.history.pushState(null, '', h);
    }
  };

  // Rota → sekme eşlemesi + ROL KORUMASI. Personel (staff) `/kasa` veya
  // `/ayarlar` adreslerine doğrudan girse bile sayfa render edilmez; ana sayfaya
  // yönlendirilir. Sekme değişikliğinde bu etki tetiklenmez (yalnızca oturum/rol
  // ve tarayıcı geri-ileri olaylarında çalışır).
  useEffect(() => {
    if (!authChecked) return;

    const applyRoute = () => {
      if (!currentUser) return; // Oturum yok: her rotada izole giriş ekranı geçerli.
      normalizePathRoute();
      const name = readRoute();

      if (name === 'ayarlar') {
        if (isOwner) {
          setShowSettings(true);
        } else {
          window.history.replaceState(null, '', '#/sorgu');
          setActiveTab('sorgu');
        }
        return;
      }
      if (name === 'kasa' && !isOwner) {
        window.history.replaceState(null, '', '#/sorgu');
        setActiveTab('sorgu');
        return;
      }
      if (name === 'login') {
        window.history.replaceState(null, '', '#/' + TAB_TO_HASH[activeTab]);
        return;
      }
      const tab = HASH_TO_TAB[name];
      if (tab) setActiveTab(tab);
    };

    applyRoute();
    window.addEventListener('popstate', applyRoute);
    window.addEventListener('hashchange', applyRoute);
    return () => {
      window.removeEventListener('popstate', applyRoute);
      window.removeEventListener('hashchange', applyRoute);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authChecked, currentUser, isOwner]);

  // Sekme → rota senkronu (programatik geçişlerde adres çubuğu güncellenir).
  useEffect(() => {
    if (!currentUser || showSettings) return;
    if (readRoute() !== TAB_TO_HASH[activeTab]) {
      window.history.replaceState(null, '', '#/' + TAB_TO_HASH[activeTab]);
    }
  }, [activeTab, currentUser, showSettings]);

  // bfcache / geri-ileri: sayfa yeniden gösterildiğinde oturumu yeniden doğrula
  // ki tarayıcı belleğinden eski (hassas) içerik geri gelmesin.
  useEffect(() => {
    const onPageShow = () => {
      checkCurrentUser();
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNewWorkOrder = (plate?: string) => {
    setActiveWorkOrderId(null);
    setWorkOrderPlate(plate || selectedPlate || '');
    setWorkOrderModalOpen(true);
  };

  const handleOpenWorkOrder = (id: number) => {
    setActiveWorkOrderId(id);
    setWorkOrderPlate('');
    setWorkOrderModalOpen(true);
  };

  if (!authChecked) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        Yükleniyor...
      </div>
    );
  }

  // GÜVENLİK: Oturum yoksa YALNIZCA izole, opak giriş ekranı render edilir.
  // Uygulama kabuğu (Kasa/Gider/Müşteri vb.) hiç oluşturulmaz; böylece arka
  // planda hiçbir hassas veri veya rakam kalmaz.
  if (!currentUser) {
    return <LoginScreen onSuccess={handleAuthSuccess} />;
  }

  const shopNameUpper = (shopName || 'GÜVEN OTO').toUpperCase();

  return (
    <React.Fragment key={sessionNonce}>
      {/* Background Watermark */}
      <div className="wm" aria-hidden="true">
        <div className="wm-in">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="wm-row">
              {Array.from({ length: 8 }).map((_, j) => (
                <span key={j}>{shopNameUpper}</span>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Sticky Top Bar */}
      <header className="topbar">
        <div className="topbar-in">
          <h1 className="brand" id="brand" lang="tr">
            {shopName}
          </h1>

          <div className="top-actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => handleNewWorkOrder()}
            >
              Yeni iş emri
            </button>
            <button
              className="btn btn-ghost"
              type="button"
              onClick={() => setShowSettings(true)}
            >
              Ayarlar
            </button>
            <button
              className="icon-btn"
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Açık / Koyu Tema"
            >
              {theme === 'dark' ? '☀️' : '🌙'}
            </button>
            {currentUser && (
              <button
                className="icon-btn"
                type="button"
                onClick={handleLogout}
                title="Çıkış Yap"
              >
                🚪
              </button>
            )}
          </div>

          <nav className="tabs" role="tablist" aria-label="Bölümler">
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'sorgu'}
              onClick={() => navigate('sorgu')}
            >
              Araç sorgu
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'arac'}
              onClick={() => navigate('arac')}
            >
              Araçlar
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'musteri'}
              onClick={() => navigate('musteri')}
            >
              Müşteriler
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'parca'}
              onClick={() => navigate('parca')}
            >
              Parça arşivi
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'cari'}
              onClick={() => navigate('cari')}
            >
              Cari hesap
            </button>
            {isOwner && (
              <button
                className="tab"
                role="tab"
                aria-selected={activeTab === 'kasa'}
                onClick={() => navigate('kasa')}
              >
                Kasa
              </button>
            )}
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'gider'}
              onClick={() => navigate('gider')}
            >
              Giderler
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'hatir'}
              onClick={() => navigate('hatir')}
            >
              Hatırlatıcılar
              {remindersCount > 0 && <span className="cnt">{remindersCount}</span>}
            </button>
          </nav>
        </div>
      </header>

      {/* Main Wrap Container */}
      <main className="wrap">
        {activeTab === 'sorgu' && (
          <VehicleSearchScreen
            initialPlate={selectedPlate}
            onNewWorkOrder={(p) => handleNewWorkOrder(p)}
            onOpenWorkOrder={(id) => handleOpenWorkOrder(id)}
            onNavigateToParts={() => setActiveTab('parca')}
          />
        )}

        {activeTab === 'arac' && (
          <VehiclesScreen onNewWorkOrder={(p) => handleNewWorkOrder(p)} />
        )}

        {activeTab === 'musteri' && <CustomersScreen />}

        {activeTab === 'parca' && <PartsScreen />}

        {activeTab === 'cari' && (
          <CustomerAccountsScreen
            onOpenPlate={(p) => {
              setSelectedPlate(p);
              setActiveTab('sorgu');
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {isOwner && activeTab === 'kasa' && <CashDeskScreen />}

        {activeTab === 'gider' && <ExpensesScreen currentUser={currentUser} />}

        {activeTab === 'hatir' && <RemindersScreen />}
      </main>

      {/* Full Sheet Work Order Modal */}
      {workOrderModalOpen && (
        <WorkOrderScreen
          workOrderId={activeWorkOrderId}
          initialPlate={workOrderPlate}
          onClose={() => {
            setWorkOrderModalOpen(false);
            setActiveWorkOrderId(null);
            setWorkOrderPlate('');
          }}
          onSaved={(savedPlate) => {
            setSelectedPlate(savedPlate);
            setActiveTab('sorgu');
            loadRemindersBadge();
          }}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsScreen
          onClose={() => setShowSettings(false)}
          onSettingsSaved={(newSettings) => {
            if (newSettings?.shop_name) {
              setShopName(newSettings.shop_name);
            }
          }}
        />
      )}

      {/* Toast Element */}
      <div id="toast" role="status" aria-live="polite"></div>
    </React.Fragment>
  );
}
