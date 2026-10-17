import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { PlateInput, PlateBadge } from '../components/PlateInput.js';
import { exportStatementPDF } from '../services/pdfExport.js';
import {
  fdate,
  money,
  numfmt,
  toast,
  STAGES,
  STAGE_TXT,
  STATUS_TXT,
  PAYMENT_METHODS,
  todayISO
} from '../services/ui.js';
import { normalizePlate, formatPlateDisplay } from '@oto-servis/shared';

interface VehicleSearchScreenProps {
  onNewWorkOrder: (plateOrVehicle?: any) => void;
  onOpenWorkOrder: (orderId: number) => void;
  onNavigateToParts?: () => void;
  initialPlate?: string;
}

export const VehicleSearchScreen: React.FC<VehicleSearchScreenProps> = ({
  onNewWorkOrder,
  onOpenWorkOrder,
  onNavigateToParts,
  initialPlate = ''
}) => {
  const [searchTerm, setSearchTerm] = useState(initialPlate);
  const [loading, setLoading] = useState(false);
  const [vehicleData, setVehicleData] = useState<any | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [unregisteredPlate, setUnregisteredPlate] = useState<string | null>(null);

  // Dashboard Data
  const [dashboardStats, setDashboardStats] = useState({
    inShopCount: 0,
    monthTotalKurus: 0,
    monthLaborKurus: 0,
    openCariKurus: 0,
    lowPartsCount: 0
  });
  const [inShopOrders, setInShopOrders] = useState<any[]>([]);
  const [recentOrders, setRecentOrders] = useState<any[]>([]);
  const [lowStockParts, setLowStockParts] = useState<any[]>([]);
  const [settings, setSettings] = useState<any>({});

  // Payment Modal State
  const [payModal, setPayModal] = useState<{
    open: boolean;
    orderId: number | null;
    isCashClose: boolean;
    plate: string;
    grossKurus: number;
    cashKurus: number;
    paidKurus: number;
    remainingKurus: number;
  }>({
    open: false,
    orderId: null,
    isCashClose: false,
    plate: '',
    grossKurus: 0,
    cashKurus: 0,
    paidKurus: 0,
    remainingKurus: 0
  });
  const [payAmountLira, setPayAmountLira] = useState('');
  const [payMethod, setPayMethod] = useState('Nakit');
  const [payDate, setPayDate] = useState(todayISO());
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');

  // Vehicle Edit Modal State
  const [editVehicleModal, setEditVehicleModal] = useState<{
    open: boolean;
    plate: string;
    brand: string;
    model: string;
    year: string;
    chassis: string;
    engineCode: string;
    inspectionDate: string;
    customerName: string;
    customerPhone: string;
    note: string;
  }>({
    open: false,
    plate: '',
    brand: '',
    model: '',
    year: '',
    chassis: '',
    engineCode: '',
    inspectionDate: '',
    customerName: '',
    customerPhone: '',
    note: ''
  });
  const [editVehicleSaving, setEditVehicleSaving] = useState(false);

  // Delete arming button tracker
  const [armedDeleteId, setArmedDeleteId] = useState<number | null>(null);

  useEffect(() => {
    loadDashboardData();
    loadSettings();
  }, []);

  useEffect(() => {
    if (initialPlate) {
      setSearchTerm(initialPlate);
      handleSearch(initialPlate);
    }
  }, [initialPlate]);

  const loadSettings = async () => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings) setSettings(res.settings);
    } catch {}
  };

  const loadDashboardData = async () => {
    try {
      // 1. Fetch work orders
      const ordersRes = await apiRequest('/work-orders?limit=100');
      const allOrders = ordersRes.success ? ordersRes.items || [] : [];

      // 2. Fetch parts for low stock count
      const partsRes = await apiRequest('/parts?limit=500');
      const allParts = partsRes.success ? partsRes.items || [] : [];
      const lowParts = allParts.filter((p: any) => (p.stok_miktari || 0) <= (p.kritik_stok || 0));
      setLowStockParts(lowParts);

      // Calculations for stats
      const inShop = allOrders.filter((o: any) => o.durum !== 'teslim_edildi');
      setInShopOrders(inShop);
      setRecentOrders(allOrders.slice(0, 8));

      const thisMonth = new Date().toISOString().slice(0, 7);
      let monthGross = 0;
      let monthLabor = 0;
      let totalOpen = 0;

      allOrders.forEach((o: any) => {
        const orderDate = String(o.giris_tarihi || o.created_at || '');
        if (orderDate.startsWith(thisMonth)) {
          monthGross += o.brut_tutar_kurus || 0;
          monthLabor += o.iscilik_toplam_kurus || 0;
        }
        totalOpen += Math.max(0, o.kalan_tutar_kurus || 0);
      });

      setDashboardStats({
        inShopCount: inShop.length,
        monthTotalKurus: monthGross,
        monthLaborKurus: monthLabor,
        openCariKurus: totalOpen,
        lowPartsCount: lowParts.length
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleSearch = async (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) {
      setVehicleData(null);
      setSearchResults([]);
      setUnregisteredPlate(null);
      loadDashboardData();
      return;
    }

    setLoading(true);
    setUnregisteredPlate(null);
    const norm = normalizePlate(trimmed);

    try {
      // Try exact plate search first
      if (norm.length >= 4) {
        const res = await apiRequest(`/vehicles/by-plate/${norm}`);
        if (res.success && res.vehicle) {
          setVehicleData(res);
          setSearchResults([]);
          setLoading(false);
          return;
        }
      }
    } catch {}

    // Fallback to fuzzy search (by plate, customer name, phone, etc.)
    try {
      const searchRes = await apiRequest(`/vehicles/search?q=${encodeURIComponent(trimmed)}`);
      if (searchRes.success && searchRes.items?.length > 0) {
        if (searchRes.items.length === 1 && normalizePlate(searchRes.items[0].plaka_norm) === norm) {
          const exactRes = await apiRequest(`/vehicles/by-plate/${searchRes.items[0].plaka_norm}`);
          setVehicleData(exactRes);
          setSearchResults([]);
        } else {
          setVehicleData(null);
          setSearchResults(searchRes.items);
        }
      } else {
        setVehicleData(null);
        setSearchResults([]);
        if (norm.length >= 4) {
          setUnregisteredPlate(norm);
        }
      }
    } catch (err: any) {
      toast('Arama yapılırken hata oluştu');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectVehicle = async (plakaNorm: string) => {
    setLoading(true);
    setSearchTerm(formatPlateDisplay(plakaNorm));
    try {
      const res = await apiRequest(`/vehicles/by-plate/${plakaNorm}`);
      if (res.success && res.vehicle) {
        setVehicleData(res);
        setSearchResults([]);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err: any) {
      toast('Araç bilgileri getirilemedi');
    } finally {
      setLoading(false);
    }
  };

  const handleStageChange = async (orderId: number, newStage: string) => {
    try {
      const res = await apiRequest(`/work-orders/${orderId}/status`, {
        method: 'PUT',
        body: JSON.stringify({ durum: newStage })
      });
      if (res.success) {
        toast('Durum güncellendi');
        if (newStage === 'teslime_hazir' || newStage === 'tamamlandı' || newStage === 'ready') {
          setTimeout(() => toast('Teslime hazır. Müşteriyi Hatırlatıcılar sekmesinden bilgilendirebilirsiniz.'), 1500);
        }
        if (vehicleData) {
          handleSelectVehicle(vehicleData.vehicle.plaka_norm || vehicleData.vehicle.plaka);
        } else {
          loadDashboardData();
        }
      }
    } catch (e: any) {
      toast(e.message || 'Durum güncellenemedi');
    }
  };

  const handleOpenPayModal = (order: any, isCashClose: boolean) => {
    const gross = order.brut_tutar_kurus || 0;
    const cash = order.pesin_fiyat_kurus || gross;
    const paid = order.odenen_tutar_kurus || 0;
    const remaining = isCashClose ? Math.max(0, cash - paid) : Math.max(0, gross - paid);

    setPayModal({
      open: true,
      orderId: order.id,
      isCashClose,
      plate: order.plaka || vehicleData?.vehicle?.plaka || '',
      grossKurus: gross,
      cashKurus: cash,
      paidKurus: paid,
      remainingKurus: remaining
    });
    setPayAmountLira((remaining / 100).toFixed(2));
    setPayMethod('Nakit');
    setPayDate(todayISO());
    setPayError('');
  };

  const handleSavePayment = async () => {
    const amtKurus = Math.round((parseFloat(payAmountLira.replace(',', '.')) || 0) * 100);
    if (!payModal.isCashClose && amtKurus <= 0) {
      setPayError('Lütfen geçerli bir tutar girin.');
      return;
    }

    setPaySaving(true);
    setPayError('');

    try {
      if (amtKurus > 0) {
        await apiRequest(`/work-orders/${payModal.orderId}/payments`, {
          method: 'POST',
          body: JSON.stringify({
            tutar_kurus: amtKurus,
            odeme_yontemi: payMethod,
            odeme_tarihi: payDate
          })
        });
      }

      if (payModal.isCashClose) {
        await apiRequest(`/work-orders/${payModal.orderId}/status`, {
          method: 'PUT',
          body: JSON.stringify({ durum: 'teslim_edildi', kapanis_tarihi: payDate })
        });
      }

      toast(payModal.isCashClose ? 'Kayıt peşin kapatıldı' : 'Ödeme kaydedildi');
      setPayModal((prev) => ({ ...prev, open: false }));

      if (vehicleData) {
        handleSelectVehicle(vehicleData.vehicle.plaka_norm || vehicleData.vehicle.plaka);
      } else {
        loadDashboardData();
      }
    } catch (err: any) {
      setPayError(err.message || 'Ödeme kaydedilemedi.');
    } finally {
      setPaySaving(false);
    }
  };

  const handleDeleteOrder = async (orderId: number) => {
    if (armedDeleteId !== orderId) {
      setArmedDeleteId(orderId);
      setTimeout(() => setArmedDeleteId((cur) => (cur === orderId ? null : cur)), 4000);
      return;
    }

    try {
      const res = await apiRequest(`/work-orders/${orderId}`, { method: 'DELETE' });
      if (res.success) {
        toast('İş emri silindi, parçalar stoğa döndü');
        setArmedDeleteId(null);
        if (vehicleData) {
          handleSelectVehicle(vehicleData.vehicle.plaka_norm || vehicleData.vehicle.plaka);
        } else {
          loadDashboardData();
        }
      }
    } catch (err: any) {
      toast(err.message || 'İş emri silinemedi.');
    }
  };

  const handleOpenEditVehicleModal = () => {
    if (!vehicleData?.vehicle) return;
    const v = vehicleData.vehicle;
    const c = vehicleData.customer || vehicleData.musteri || {};
    setEditVehicleModal({
      open: true,
      plate: v.plaka || v.plaka_norm,
      brand: v.marka || '',
      model: v.model || '',
      year: v.yil ? String(v.yil) : '',
      chassis: v.sasi_no || '',
      engineCode: v.motor_kodu || '',
      inspectionDate: v.muayene_tarihi || '',
      customerName: c.ad_soyad || '',
      customerPhone: c.telefon || '',
      note: v.notlar || ''
    });
  };

  const handleSaveVehicleEdit = async () => {
    setEditVehicleSaving(true);
    try {
      await apiRequest(`/vehicles/${vehicleData.vehicle.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          plaka: editVehicleModal.plate,
          marka: editVehicleModal.brand.trim(),
          model: editVehicleModal.model.trim(),
          yil: editVehicleModal.year ? parseInt(editVehicleModal.year, 10) : null,
          sasi_no: editVehicleModal.chassis.trim(),
          motor_kodu: editVehicleModal.engineCode.trim(),
          muayene_tarihi: editVehicleModal.inspectionDate || null,
          notlar: editVehicleModal.note.trim(),
          musteri_ad_soyad: editVehicleModal.customerName.trim(),
          musteri_telefon: editVehicleModal.customerPhone.trim()
        })
      });
      toast('Araç bilgisi kaydedildi');
      setEditVehicleModal((prev) => ({ ...prev, open: false }));
      handleSelectVehicle(vehicleData.vehicle.plaka_norm || vehicleData.vehicle.plaka);
    } catch (err: any) {
      toast(err.message || 'Araç bilgisi güncellenemedi.');
    } finally {
      setEditVehicleSaving(false);
    }
  };

  const v = vehicleData?.vehicle;
  const c = vehicleData?.customer || vehicleData?.musteri;
  const orders = vehicleData?.history || vehicleData?.gecmis_is_emirleri || [];

  let totalGross = 0;
  let totalCash = 0;
  let totalPaid = 0;
  let totalRemaining = 0;

  orders.forEach((o: any) => {
    totalGross += o.brut_tutar_kurus || 0;
    totalCash += o.pesin_fiyat_kurus || o.brut_tutar_kurus || 0;
    totalPaid += o.odenen_tutar_kurus || 0;
    totalRemaining += Math.max(0, o.kalan_tutar_kurus || 0);
  });

  const lastKm = orders.reduce((max: number, o: any) => Math.max(max, o.km || o.kilometre || 0), 0);

  return (
    <div>
      {/* Critical Stock Alert banner if low parts exist */}
      {lowStockParts.length > 0 && !searchTerm && (
        <div className="alert" role="alert">
          <b>Kritik stok:</b>
          <span>
            {lowStockParts.slice(0, 4).map((p: any) => p.ad).join(', ')}
            {lowStockParts.length > 4 ? ` ve ${lowStockParts.length - 4} parça daha` : ''}
          </span>
          {onNavigateToParts && (
            <button className="btn btn-sm" type="button" onClick={onNavigateToParts}>
              Azalanları göster
            </button>
          )}
        </div>
      )}

      {/* Plate Search Row */}
      <div className="searchrow">
        <PlateInput
          value={searchTerm}
          onChange={(val) => {
            setSearchTerm(val);
            handleSearch(val);
          }}
          onSearch={handleSearch}
          placeholder="34 ABC 123"
        />
        <span className="hint">
          Plakayı yazın; araç, müşteri ve tüm işlem geçmişi gelir. Müşteri adıyla da arayabilirsiniz.
        </span>
      </div>

      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div className="spin" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>⌛</div>
          <div>Kayıtlar getiriliyor...</div>
        </div>
      )}

      {/* DASHBOARD VIEW (when query is empty) */}
      {!searchTerm && !loading && (
        <div>
          <div className="stats">
            <div className="stat">
              <span>Serviste</span>
              <b>{dashboardStats.inShopCount} araç</b>
            </div>
            <div className="stat">
              <span>Bu ay (KDV dahil)</span>
              <b>{money(dashboardStats.monthTotalKurus)}</b>
            </div>
            <div className="stat">
              <span>Bu ay toplam işçilik bedeli</span>
              <b>{money(dashboardStats.monthLaborKurus)}</b>
            </div>
            <div className="stat">
              <span>Açık cari</span>
              <b>{money(dashboardStats.openCariKurus)}</b>
            </div>
            <div className="stat">
              <span>Azalan parça</span>
              <b>{dashboardStats.lowPartsCount} kalem</b>
            </div>
          </div>

          {inShopOrders.length > 0 && (
            <div className="panel" style={{ marginBottom: '16px' }}>
              <div className="panel-h">
                <h3>Serviste olan araçlar</h3>
                <span className="muted">Durumu kartından değiştirebilirsiniz</span>
              </div>
              <div className="list">
                {inShopOrders.map((o: any) => {
                  const stage = o.durum || 'kabul';
                  const stageNorm = stage === 'kabul' ? 'accepted' : (stage === 'onarımda' || stage === 'onarimda') ? 'repairing' : (stage === 'tamamlandı' || stage === 'teslime_hazir') ? 'ready' : 'delivered';
                  return (
                    <button
                      key={o.id}
                      type="button"
                      className="li"
                      onClick={() => handleSelectVehicle(o.plaka)}
                    >
                      <PlateBadge plate={o.plaka} />
                      <span className="what">
                        <b>{[o.arac_marka, o.arac_model].filter(Boolean).join(' ') || fdate(o.giris_tarihi)}</b>
                        <span>{o.musteri_ad || 'Müşteri belirtilmemiş'} · {o.sikayet || 'İşlem notu yok'}</span>
                      </span>
                      <span className="muted li-extra">{fdate(o.giris_tarihi)}</span>
                      <span className={`pill st-${stageNorm}`}>{STAGE_TXT[stageNorm] || o.durum}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="two">
            <div className="panel">
              <div className="panel-h">
                <h3>Son iş emirleri</h3>
              </div>
              <div className="list">
                {recentOrders.length > 0 ? (
                  recentOrders.map((o: any) => {
                    const status = o.kalan_tutar_kurus <= 0 ? 'paid' : (o.odenen_tutar_kurus > 0 ? 'partial' : 'open');
                    return (
                      <button
                        key={o.id}
                        type="button"
                        className="li"
                        onClick={() => handleSelectVehicle(o.plaka)}
                      >
                        <PlateBadge plate={o.plaka} />
                        <span className="what">
                          <b>{[o.arac_marka, o.arac_model].filter(Boolean).join(' ') || fdate(o.giris_tarihi)}</b>
                          <span>{fdate(o.giris_tarihi)} · {o.sikayet || 'Kalem yok'}</span>
                        </span>
                        <span className="num li-extra">{money(o.brut_tutar_kurus || 0)}</span>
                        <span className={`pill ${status}`}>{STATUS_TXT[status]}</span>
                      </button>
                    );
                  })
                ) : (
                  <div className="empty">İş emri yok.</div>
                )}
              </div>
            </div>

            <div className="panel">
              <div className="panel-h">
                <h3>Azalan parçalar</h3>
              </div>
              <div className="list">
                {lowStockParts.length > 0 ? (
                  lowStockParts.slice(0, 8).map((p: any) => (
                    <div key={p.id} className="li" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                      <span className="what">
                        <b>{p.ad}</b>
                        <span>{p.kod || ''}</span>
                      </span>
                      <span className="pill low">{numfmt(p.stok_miktari)} {p.birim || 'adet'}</span>
                    </div>
                  ))
                ) : (
                  <div className="empty">Stoğu azalan parça yok.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MULTIPLE MATCHES VIEW */}
      {searchResults.length > 0 && !loading && (
        <div className="panel">
          <div className="panel-h">
            <h3>Eşleşen araçlar</h3>
            <span className="muted">{searchResults.length} kayıt</span>
          </div>
          <div className="list">
            {searchResults.map((it: any) => (
              <button
                key={it.id || it.plaka}
                type="button"
                className="li"
                onClick={() => handleSelectVehicle(it.plaka_norm || it.plaka)}
              >
                <PlateBadge plate={it.plaka} />
                <span className="what">
                  <b>{[it.marka, it.model].filter(Boolean).join(' ') || 'Marka / model yok'}</b>
                  <span>{it.musteri_ad || it.ad_soyad || 'Müşteri belirtilmemiş'}</span>
                </span>
                <span className="muted li-extra">
                  {it.son_islem_tarihi ? `Son işlem ${fdate(it.son_islem_tarihi)}` : 'İşlem yok'}
                </span>
                <span className="muted">{it.islem_sayisi || 0} işlem</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* UNREGISTERED PLATE VIEW */}
      {unregisteredPlate && !vehicleData && !loading && (
        <div className="panel">
          <div className="empty">
            <b>{formatPlateDisplay(unregisteredPlate)} kayıtlı değil</b>
            Bu plakayla geçmiş işlem bulunamadı.
            <br />
            <button
              className="btn btn-primary"
              type="button"
              style={{ marginTop: '12px' }}
              onClick={() => onNewWorkOrder(unregisteredPlate)}
            >
              Bu plaka için iş emri aç
            </button>
          </div>
        </div>
      )}

      {/* EXACT VEHICLE VIEW */}
      {v && !loading && (
        <div>
          <section className="vhead">
            <div>
              <PlateBadge plate={v.plaka} big />
            </div>
            <div className="vinfo">
              <h2>
                {[v.marka, v.model].filter(Boolean).join(' ') || 'Marka / model girilmemiş'}
                {v.yil ? <span className="muted"> {v.yil}</span> : ''}
              </h2>
              <p>
                {c?.ad_soyad || 'Müşteri belirtilmemiş'}
                {c?.telefon ? <span className="muted"> · {c.telefon}</span> : ''}
              </p>
              <p className="meta">
                {orders.length} işlem · {lastKm > 0 ? `${numfmt(lastKm)} km (son kayıt)` : 'km kaydı yok'}
              </p>
              {(v.sasi_no || v.motor_kodu || v.muayene_tarihi) && (
                <p className="meta">
                  {[
                    v.sasi_no ? `Şasi: ${v.sasi_no}` : '',
                    v.motor_kodu ? `Motor: ${v.motor_kodu}` : '',
                    v.muayene_tarihi ? `Muayene: ${fdate(v.muayene_tarihi)}` : ''
                  ].filter(Boolean).join(' · ')}
                </p>
              )}
              {v.notlar && <p className="note">{v.notlar}</p>}
            </div>
            <div className="vact">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => onNewWorkOrder(v.plaka)}
              >
                Yeni iş emri
              </button>
              <button
                className="btn"
                type="button"
                onClick={handleOpenEditVehicleModal}
              >
                Araç bilgisi
              </button>
              {orders.length > 0 && (
                <button
                  className="btn"
                  type="button"
                  onClick={() => exportStatementPDF(orders, v, settings)}
                >
                  Tüm geçmiş (PDF)
                </button>
              )}
            </div>
          </section>

          {orders.length === 0 ? (
            <div className="panel sp">
              <div className="empty">Bu araç için henüz iş emri yok.</div>
            </div>
          ) : (
            <div className="orders">
              {orders.map((o: any) => {
                const stage = o.durum || 'kabul';
                const stageNorm = stage === 'kabul' ? 'accepted' : (stage === 'onarımda' || stage === 'onarimda') ? 'repairing' : (stage === 'tamamlandı' || stage === 'teslime_hazir') ? 'ready' : 'delivered';
                const status = o.kalan_tutar_kurus <= 0 ? 'paid' : (o.odenen_tutar_kurus > 0 ? 'partial' : 'open');
                const priceIncludesVat = Boolean(o.kdv_dahil_mi);
                const priceNote = priceIncludesVat ? 'KDV dahil' : 'KDV hariç';

                const gross = (o.brut_tutar_kurus || 0) / 100;
                const cash = (o.pesin_fiyat_kurus || o.brut_tutar_kurus || 0) / 100;
                const paid = (o.odenen_tutar_kurus || 0) / 100;
                const remaining = (o.kalan_tutar_kurus || 0) / 100;
                const net = (o.net_tutar_kurus || 0) / 100;
                const vat = (o.kdv_tutar_kurus || 0) / 100;
                const disc = (o.iskonto_tutar_kurus || 0) / 100;
                const itemsTotal = (o.toplam_tutar_kurus || (net + disc) * 100) / 100;

                return (
                  <article key={o.id} className="order">
                    <div className="order-head">
                      <span className="order-date">{fdate(o.giris_tarihi || o.created_at)}</span>
                      <span className="order-km">
                        {o.km || o.kilometre ? `${numfmt(o.km || o.kilometre)} km` : 'km girilmemiş'}
                      </span>
                      <select
                        className={`stage-sel st-${stageNorm}`}
                        value={stageNorm}
                        onChange={(e) => {
                          const val = e.target.value;
                          const dbStage = val === 'accepted' ? 'kabul' : val === 'repairing' ? 'onarimda' : val === 'ready' ? 'teslime_hazir' : 'teslim_edildi';
                          handleStageChange(o.id, dbStage);
                        }}
                        aria-label="Servis durumu"
                      >
                        {STAGES.map((s) => (
                          <option key={s[0]} value={s[0]}>{s[1]}</option>
                        ))}
                      </select>
                      <span className={`pill ${status} sp-auto`}>{STATUS_TXT[status]}</span>
                    </div>

                    {o.sikayet && (
                      <div className="order-note">
                        <small>Şikayet / yapılan işlem</small>
                        {o.sikayet}
                      </div>
                    )}

                    <div className="tablewrap">
                      <table className="tbl">
                        <thead>
                          <tr>
                            <th></th>
                            <th>Değişen parça / işlem</th>
                            <th className="num">Adet</th>
                            <th className="num">Birim ({priceNote})</th>
                            <th className="num">Tutar</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(o.kalemler || []).length > 0 ? (
                            o.kalemler.map((l: any, idx: number) => {
                              const isLabor = l.tur === 'iscilik';
                              const qty = Number(l.adet) || 1;
                              const unitPrice = (l.birim_fiyat_kurus || 0) / 100;
                              const rowTotal = qty * unitPrice;
                              return (
                                <tr key={idx}>
                                  <td>
                                    <span className={`kind ${isLabor ? '' : 'kind-part'}`}>
                                      {isLabor ? 'İşçilik' : 'Parça'}
                                    </span>
                                  </td>
                                  <td>{l.ad}</td>
                                  <td className="num">
                                    {numfmt(qty)} {l.birim && l.birim !== 'adet' ? l.birim : ''}
                                  </td>
                                  <td className="num">{money(unitPrice, false)}</td>
                                  <td className="num">{money(rowTotal, false)}</td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr>
                              <td colSpan={5} className="muted" style={{ padding: '16px' }}>
                                Kalem yok
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>

                    {/* Payments list note */}
                    {(o.odemeler || []).length > 0 && (
                      <div className="order-note">
                        <small>Ödemeler</small>
                        {o.odemeler.map((p: any, pIdx: number) => (
                          <span key={pIdx}>
                            {fdate(p.odeme_tarihi || p.created_at)} · {p.odeme_yontemi || 'Nakit'} · {money((p.tutar_kurus || 0) / 100, false)}
                            <br />
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Next service note */}
                    {(o.sonraki_bakim_tarihi || o.sonraki_bakim_km) && (
                      <div className="order-note">
                        <small>Sonraki bakım</small>
                        {[
                          o.sonraki_bakim_tarihi ? fdate(o.sonraki_bakim_tarihi) : '',
                          o.sonraki_bakim_km ? `${numfmt(o.sonraki_bakim_km)} km` : ''
                        ].filter(Boolean).join(' / ')}
                      </div>
                    )}

                    <div className="order-foot">
                      <div className="order-actions">
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => onOpenWorkOrder(o.id)}
                        >
                          Düzenle
                        </button>
                        {status !== 'paid' && (
                          <>
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => handleOpenPayModal(o, false)}
                            >
                              Ödeme ekle
                            </button>
                            <button
                              className="btn btn-sm"
                              type="button"
                              onClick={() => handleOpenPayModal(o, true)}
                            >
                              Peşin kapat
                            </button>
                          </>
                        )}
                        <button
                          className="btn btn-sm"
                          type="button"
                          onClick={() => exportStatementPDF([o], v, settings)}
                        >
                          PDF döküm
                        </button>
                        <button
                          className={`btn btn-sm btn-danger ${armedDeleteId === o.id ? 'armed' : ''}`}
                          type="button"
                          onClick={() => handleDeleteOrder(o.id)}
                        >
                          {armedDeleteId === o.id ? 'Emin misin? Tekrar tıkla' : 'Sil'}
                        </button>
                      </div>

                      <dl className="totals">
                        {disc > 0 && (
                          <>
                            <dt>Kalemler toplamı ({priceNote})</dt>
                            <dd>{money(itemsTotal, false)}</dd>
                            <dt>İskonto</dt>
                            <dd>-{money(disc, false)}</dd>
                          </>
                        )}
                        <dt>Ara toplam (KDV hariç)</dt>
                        <dd>{money(net, false)}</dd>
                        <dt>KDV %{numfmt(o.kdv_orani ?? 20)}</dt>
                        <dd>{money(vat, false)}</dd>
                        <dt className="grand">KDV dahil toplam</dt>
                        <dd className="grand">{money(gross, false)}</dd>
                        <dt className="cash">Peşin fiyat</dt>
                        <dd className="cash">{money(cash, false)}</dd>
                        {paid > 0 && (
                          <>
                            <dt>Ödenen</dt>
                            <dd>{money(paid, false)}</dd>
                          </>
                        )}
                        {remaining > 0 && (
                          <>
                            <dt className="rest">Kalan</dt>
                            <dd className="rest">{money(remaining, false)}</dd>
                          </>
                        )}
                      </dl>
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          {/* Sticky Bottom Summary Bar */}
          {orders.length > 0 && (
            <div className="sumbar" aria-label="Toplamlar">
              <div className="ttl">
                Toplam
                <span className="lab">{orders.length} işlem</span>
              </div>
              <div>
                <span className="lab">KDV dahil toplam</span>
                <span className="val">{money(totalGross)}</span>
              </div>
              <div>
                <span className="lab">Peşin fiyat</span>
                <span className="val">{money(totalCash)}</span>
              </div>
              <div>
                <span className="lab">Ödenen</span>
                <span className="val">{money(totalPaid)}</span>
              </div>
              <div>
                <span className="lab">Kalan</span>
                <span className="val">{money(totalRemaining)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* QUICK PAYMENT / CASH CLOSE MODAL */}
      {payModal.open && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <h2>{payModal.isCashClose ? 'Peşin kapat' : 'Ödeme ekle'}</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setPayModal((p) => ({ ...p, open: false }))}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <p>
                <b>{formatPlateDisplay(payModal.plate)}</b>
                <br />
                <span className="muted">
                  KDV dahil {money(payModal.grossKurus)} · Peşin {money(payModal.cashKurus)} · Ödenen {money(payModal.paidKurus)} · Kalan {money(payModal.remainingKurus)}
                </span>
              </p>
              {payModal.isCashClose && (
                <p className="muted">
                  Peşin fiyat üzerinden kalan tutar tahsil edilir ve kayıt ödendi olarak kapanır.
                </p>
              )}
              <div className="grid g3">
                <div className="field">
                  <label htmlFor="py-amt">Tutar (₺)</label>
                  <input
                    id="py-amt"
                    type="number"
                    step="any"
                    min="0"
                    value={payAmountLira}
                    onChange={(e) => setPayAmountLira(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="py-method">Yöntem</label>
                  <select
                    id="py-method"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="py-date">Tarih</label>
                  <input
                    id="py-date"
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                  />
                </div>
              </div>
              {payError && <div className="form-error">{payError}</div>}
            </div>
            <div className="sheet-foot">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setPayModal((p) => ({ ...p, open: false }))}
              >
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={paySaving}
                onClick={handleSavePayment}
              >
                {paySaving ? 'Kaydediliyor...' : payModal.isCashClose ? 'Tahsil et ve kapat' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VEHICLE EDIT MODAL */}
      {editVehicleModal.open && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <h2>Araç bilgisi</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setEditVehicleModal((p) => ({ ...p, open: false }))}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <div className="field">
                <label>Plaka</label>
                <PlateBadge plate={editVehicleModal.plate} />
              </div>
              <div className="grid g3">
                <div className="field">
                  <label htmlFor="ev-brand">Marka</label>
                  <input
                    id="ev-brand"
                    type="text"
                    value={editVehicleModal.brand}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, brand: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ev-model">Model</label>
                  <input
                    id="ev-model"
                    type="text"
                    value={editVehicleModal.model}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, model: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ev-year">Yıl</label>
                  <input
                    id="ev-year"
                    type="number"
                    value={editVehicleModal.year}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, year: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid g3">
                <div className="field">
                  <label htmlFor="ev-chassis">Şasi no</label>
                  <input
                    id="ev-chassis"
                    type="text"
                    autoCapitalize="characters"
                    value={editVehicleModal.chassis}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, chassis: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ev-engine">Motor kodu</label>
                  <input
                    id="ev-engine"
                    type="text"
                    value={editVehicleModal.engineCode}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, engineCode: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ev-insp">Muayene bitiş tarihi</label>
                  <input
                    id="ev-insp"
                    type="date"
                    value={editVehicleModal.inspectionDate}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, inspectionDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="ev-cust">Müşteri adı</label>
                  <input
                    id="ev-cust"
                    type="text"
                    value={editVehicleModal.customerName}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, customerName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ev-phone">Telefon</label>
                  <input
                    id="ev-phone"
                    type="tel"
                    placeholder="05xx xxx xx xx"
                    value={editVehicleModal.customerPhone}
                    onChange={(e) => setEditVehicleModal({ ...editVehicleModal, customerPhone: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="ev-note">Araç notu</label>
                <textarea
                  id="ev-note"
                  rows={2}
                  placeholder="Lastik ölçüsü, dikkat edilecekler"
                  value={editVehicleModal.note}
                  onChange={(e) => setEditVehicleModal({ ...editVehicleModal, note: e.target.value })}
                />
              </div>
            </div>
            <div className="sheet-foot">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setEditVehicleModal((p) => ({ ...p, open: false }))}
              >
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={editVehicleSaving}
                onClick={handleSaveVehicleEdit}
              >
                {editVehicleSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
