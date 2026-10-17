import React, { useState, useEffect } from 'react';
import { apiRequest, setAuthToken } from './services/api.js';
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

export function App() {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [activeTab, setActiveTab] = useState<'sorgu' | 'arac' | 'musteri' | 'parca' | 'cari' | 'kasa' | 'gider' | 'hatir'>('sorgu');

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

  const handleLogout = async () => {
    try {
      await apiRequest('/auth/logout', { method: 'POST' });
    } catch {}
    // 1) Kimlik bilgileri
    setAuthToken(null);
    // 2) Yerel hassas veriler (offline kuyruk + hatırlatıcı işaretleri)
    clearOfflineQueue();
    try {
      localStorage.removeItem('oto_sent_reminders');
    } catch {}
    // 3) Tüm ekran state'i (Kasa, Gider, Müşteri, arama, modallar...)
    resetSensitiveState();
    // 4) En son: oturumu kapat → yalnızca izole giriş ekranı render edilir
    setCurrentUser(null);
  };

  // Kasa yalnızca dükkan sahibine (owner) açıktır. Personel (staff) için sekme
  // gizlenir; aktif sekme kasa ise başka bölüme alınır. (Giderler herkese açıktır.)
  const isOwner = currentUser?.role === 'owner';

  useEffect(() => {
    if (currentUser && !isOwner && activeTab === 'kasa') {
      setActiveTab('sorgu');
    }
  }, [currentUser, isOwner, activeTab]);

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
              onClick={() => setActiveTab('sorgu')}
            >
              Araç sorgu
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'arac'}
              onClick={() => setActiveTab('arac')}
            >
              Araçlar
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'musteri'}
              onClick={() => setActiveTab('musteri')}
            >
              Müşteriler
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'parca'}
              onClick={() => setActiveTab('parca')}
            >
              Parça arşivi
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'cari'}
              onClick={() => setActiveTab('cari')}
            >
              Cari hesap
            </button>
            {isOwner && (
              <button
                className="tab"
                role="tab"
                aria-selected={activeTab === 'kasa'}
                onClick={() => setActiveTab('kasa')}
              >
                Kasa
              </button>
            )}
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'gider'}
              onClick={() => setActiveTab('gider')}
            >
              Giderler
            </button>
            <button
              className="tab"
              role="tab"
              aria-selected={activeTab === 'hatir'}
              onClick={() => setActiveTab('hatir')}
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
