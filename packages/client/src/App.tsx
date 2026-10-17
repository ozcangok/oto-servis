import React, { useState, useEffect, useRef } from 'react';
import {
  Moon, Sun, LogOut, Search, Car, Users, Package, Wallet, Banknote, Receipt, Bell, Settings, Lock
} from 'lucide-react';
import { apiRequest, setAuthToken, setUnauthorizedHandler } from './services/api.js';
import { LoginScreen } from './components/LoginScreen.js';
import { SplashScreen } from './components/SplashScreen.js';
import { IdleLock } from './components/IdleLock.js';
import { ShutdownScreen } from './components/ShutdownScreen.js';
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
  const [workOrderDate, setWorkOrderDate] = useState<string>('');

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

  // Açılış (splash) ekranı: yalnızca uygulama ilk açılışında gösterilir.
  // Aynı sekmede yeniden yüklemede (sessionStorage) atlanır.
  const [splashDone, setSplashDone] = useState<boolean>(() => {
    try {
      return window.sessionStorage.getItem('oto_splash_seen') === '1';
    } catch {
      return true;
    }
  });

  // Güvenli kapanış (Electron): veda + zorunlu yedekleme ekranı.
  const [shuttingDown, setShuttingDown] = useState(false);

  // Güvenlik bildirimi (hareketsizlik nedeniyle otomatik kapatılan oturum).
  const [securityNotice, setSecurityNotice] = useState<string | null>(null);

  // Güvenlik kilidi: 3 dakikalık hareketsizlik OTOMATİK, "Ekranı kilitle"
  // düğmesi ise ANINDA indirir. Kilit katmanı bu durumdan yönetilir.
  const [locked, setLocked] = useState(false);

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
    setLocked(false); // kilit ekranı (varsa) kalıcı kalmasın
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

  // Güvenli kapanış: masaüstü (Electron) ana süreci pencereyi kapatmadan önce
  // 'app:shutdown-start' gönderir; preload bunu 'oto:shutdown' DOM olayına
  // çevirir. Böylece veda + yedekleme ekranı her ortamda aynı koddan çalışır.
  useEffect(() => {
    const onShutdown = () => setShuttingDown(true);
    window.addEventListener('oto:shutdown', onShutdown);
    const off = window.otoDesktop?.onShutdown?.(onShutdown);
    return () => {
      window.removeEventListener('oto:shutdown', onShutdown);
      if (typeof off === 'function') off();
    };
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

  /** Açılış ekranı bitti: aynı sekmede bir daha gösterilmez. */
  const handleSplashDone = () => {
    try {
      window.sessionStorage.setItem('oto_splash_seen', '1');
    } catch {}
    setSplashDone(true);
  };

  /**
   * Hareketsizlik kilidi açıldı: oturum hem SUNUCUDA hem YERELDE kapatılır
   * (clear token/session), kullanıcı giriş ekranına düşürülür ve sağ üst
   * köşede 4 saniyelik güvenlik bildirimi gösterilir.
   */
  const handleIdleUnlock = () => {
    setSecurityNotice('Güvenliğiniz için oturumunuz otomatik kapatıldı');
    try {
      apiRequest('/auth/logout', { method: 'POST' }).catch(() => {});
    } catch {}
    clearSession();
  };

  /**
   * Elle güvenlik kilidi ("Ekranı kilitle"): 3 dakika beklenmeden buzlu cam
   * katmanı ANINDA iner. Açılma davranışı hareketsizlik kilidiyle birebir
   * aynıdır → oturum güvenle kapanır ve giriş ekranına dönülür.
   */
  const handleLockNow = () => setLocked(true);

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

  const handleNewWorkOrder = (plate?: string, date?: string) => {
    setActiveWorkOrderId(null);
    setWorkOrderPlate(plate || selectedPlate || '');
    setWorkOrderDate(date || '');
    setWorkOrderModalOpen(true);
  };

  const handleOpenWorkOrder = (id: number) => {
    setActiveWorkOrderId(id);
    setWorkOrderPlate('');
    setWorkOrderDate('');
    setWorkOrderModalOpen(true);
  };

  // GÜVENLİK KAPANIŞI: veda + zorunlu yedekleme ekranı her şeyin üzerindedir.
  if (shuttingDown) {
    return <ShutdownScreen />;
  }

  // AÇILIŞ: doğrudan ana ekran gelmez; önce saat/gün duyarlı splash ekranı.
  if (!splashDone) {
    return <SplashScreen onDone={handleSplashDone} />;
  }

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
    return <LoginScreen onSuccess={handleAuthSuccess} notice={securityNotice} />;
  }

  return (
    <React.Fragment key={sessionNonce}>
      {/* Uygulama kabuğu: sol menü + içerik.
          Not: "topbar" sınıfı yalnızca E2E oturum-kabuğu işaretleyicisi olarak korunur. */}
      <div className="app-shell topbar">
        <aside className="sidebar">
          <div className="sidebar-brand">
            <div className="brand-logo" aria-hidden="true">Ç</div>
            <div className="brand-text">
              <div className="brand-name" id="brand" lang="tr">{shopName}</div>
              <div className="brand-sub">Servis yönetimi</div>
            </div>
          </div>

          <nav className="menu" role="tablist" aria-label="Bölümler">
            <div className="menu-group">
              <div className="menu-label">Operasyon</div>
              <a
                className="menu-item"
                href="#/sorgu"
                role="tab"
                aria-selected={activeTab === 'sorgu'}
                aria-current={activeTab === 'sorgu' ? 'page' : undefined}
              >
                <Search size={18} strokeWidth={1.75} aria-hidden="true" />
                Araç sorgu
              </a>
              <a
                className="menu-item"
                href="#/araclar"
                role="tab"
                aria-selected={activeTab === 'arac'}
                aria-current={activeTab === 'arac' ? 'page' : undefined}
              >
                <Car size={18} strokeWidth={1.75} aria-hidden="true" />
                Araçlar
              </a>
              <a
                className="menu-item"
                href="#/musteriler"
                role="tab"
                aria-selected={activeTab === 'musteri'}
                aria-current={activeTab === 'musteri' ? 'page' : undefined}
              >
                <Users size={18} strokeWidth={1.75} aria-hidden="true" />
                Müşteriler
              </a>
              <a
                className="menu-item"
                href="#/parcalar"
                role="tab"
                aria-selected={activeTab === 'parca'}
                aria-current={activeTab === 'parca' ? 'page' : undefined}
              >
                <Package size={18} strokeWidth={1.75} aria-hidden="true" />
                Parça arşivi
              </a>
            </div>

            <div className="menu-group">
              <div className="menu-label">Finans</div>
              <a
                className="menu-item"
                href="#/cari"
                role="tab"
                aria-selected={activeTab === 'cari'}
                aria-current={activeTab === 'cari' ? 'page' : undefined}
              >
                <Wallet size={18} strokeWidth={1.75} aria-hidden="true" />
                Cari hesap
              </a>
              {isOwner && (
                <a
                  className="menu-item"
                  href="#/kasa"
                  role="tab"
                  aria-selected={activeTab === 'kasa'}
                  aria-current={activeTab === 'kasa' ? 'page' : undefined}
                >
                  <Banknote size={18} strokeWidth={1.75} aria-hidden="true" />
                  Kasa
                </a>
              )}
              <a
                className="menu-item"
                href="#/giderler"
                role="tab"
                aria-selected={activeTab === 'gider'}
                aria-current={activeTab === 'gider' ? 'page' : undefined}
              >
                <Receipt size={18} strokeWidth={1.75} aria-hidden="true" />
                Giderler
              </a>
            </div>

            <div className="menu-group">
              <div className="menu-label">Takip</div>
              <a
                className="menu-item"
                href="#/hatirlaticilar"
                role="tab"
                aria-selected={activeTab === 'hatir'}
                aria-current={activeTab === 'hatir' ? 'page' : undefined}
              >
                <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
                Hatırlatıcılar
                {remindersCount > 0 && <span className="cnt">{remindersCount}</span>}
              </a>
              {/* Elle güvenlik kilidi: 3 dakika beklemeden buzlu cam iner.
                  (Sağ üstteki zil ikonunun yanında aynı görevin kısayol ikonu da var.) */}
              <button
                className="menu-item"
                type="button"
                onClick={handleLockNow}
                title="Ekranı kilitle (oturum güvenliğe alınır)"
                data-testid="lock-now-menu"
              >
                <Lock size={18} strokeWidth={1.75} aria-hidden="true" />
                Ekranı kilitle
              </button>
            </div>
          </nav>

          <div className="menu-foot">
            <button className="menu-item" type="button" onClick={() => setShowSettings(true)}>
              <Settings size={18} strokeWidth={1.75} aria-hidden="true" />
              Ayarlar
            </button>
            <button
              className="menu-item"
              type="button"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              title="Açık / Koyu Tema"
              aria-label="Açık / Koyu tema"
            >
              {theme === 'dark'
                ? <Sun size={18} strokeWidth={1.75} aria-hidden="true" />
                : <Moon size={18} strokeWidth={1.75} aria-hidden="true" />}
              {theme === 'dark' ? 'Açık tema' : 'Koyu tema'}
            </button>
            <button className="menu-item" type="button" onClick={handleLogout} title="Çıkış Yap">
              <LogOut size={18} strokeWidth={1.75} aria-hidden="true" />
              Çıkış
            </button>
          </div>
        </aside>

      {/* Main Wrap Container */}
      <main className="wrap">
        {activeTab === 'sorgu' && (
          <VehicleSearchScreen
            initialPlate={selectedPlate}
            onNewWorkOrder={(p) => handleNewWorkOrder(p)}
            onNewWorkOrderForDate={(date) => handleNewWorkOrder(undefined, date)}
            onOpenWorkOrder={(id) => handleOpenWorkOrder(id)}
            onNavigateToParts={() => setActiveTab('parca')}
            onLockScreen={handleLockNow}
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
      </div>

      {/* Full Sheet Work Order Modal */}
      {workOrderModalOpen && (
        <WorkOrderScreen
          workOrderId={activeWorkOrderId}
          initialPlate={workOrderPlate}
          initialDate={workOrderDate}
          onClose={() => {
            setWorkOrderModalOpen(false);
            setActiveWorkOrderId(null);
            setWorkOrderPlate('');
            setWorkOrderDate('');
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

      {/* Hareketsizlik (idle) güvenlik kilidi: 3 dk hareketsizlikte buzlu cam.
          "Ekranı kilitle" düğmesi aynı katmanı anında indirir. */}
      <IdleLock locked={locked} onLock={() => setLocked(true)} onUnlock={handleIdleUnlock} />

      {/* Toast Element */}
      <div id="toast" role="status" aria-live="polite"></div>
    </React.Fragment>
  );
}
