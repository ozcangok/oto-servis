import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api.js';
import {
  fdate,
  money,
  numfmt,
  toast,
  STAGES,
  PAYMENT_METHODS,
  todayISO
} from '../services/ui.js';
import {
  normalizePlate,
  formatPlateDisplay,
  calculateWorkOrderTotals,
  parseCurrencyToKurus
} from '@oto-servis/shared';

interface WorkOrderScreenProps {
  initialVehicle?: any;
  workOrderId?: number | null;
  initialPlate?: string;
  onClose: () => void;
  onSaved?: (plate: string) => void;
}

interface OrderLineState {
  id?: number;
  kind: 'part' | 'labor';
  partId?: number | null;
  name: string;
  qty: number;
  price: string; // Lira string (e.g. "120.00")
  unit: string;
}

export const WorkOrderScreen: React.FC<WorkOrderScreenProps> = ({
  initialVehicle,
  workOrderId,
  initialPlate = '',
  onClose,
  onSaved
}) => {
  const isEditing = Boolean(workOrderId);

  // Form State
  const [plate, setPlate] = useState(
    initialVehicle?.plaka ? formatPlateDisplay(initialVehicle.plaka) : initialPlate ? formatPlateDisplay(initialPlate) : ''
  );
  const [date, setDate] = useState(todayISO());
  const [km, setKm] = useState<string>('');
  const [stage, setStage] = useState('accepted');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [complaint, setComplaint] = useState('');

  // Vehicle info state (for inline registration if plate not found)
  const [existingVehicle, setExistingVehicle] = useState<any | null>(initialVehicle || null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [newVehicle, setNewVehicle] = useState({
    brand: '',
    model: '',
    year: '',
    customer: '',
    phone: '',
    chassis: '',
    engineCode: '',
    inspectionDate: ''
  });

  // Lines
  const [lines, setLines] = useState<OrderLineState[]>([
    { kind: 'part', partId: null, name: '', qty: 1, price: '', unit: 'adet' }
  ]);

  // Financials
  const [vatRate, setVatRate] = useState<number>(20);
  const [cashDiscRate, setCashDiscRate] = useState<number>(5);
  const [discountPct, setDiscountPct] = useState<string>('');
  const [discountAmt, setDiscountAmt] = useState<string>('');
  const [cashOverride, setCashOverride] = useState<string>('');

  // Next service
  const [nextServiceDate, setNextServiceDate] = useState<string>('');
  const [nextServiceKm, setNextServiceKm] = useState<string>('');

  // Initial payment (for new orders)
  const [firstPay, setFirstPay] = useState<string>('');
  const [firstPayMethod, setFirstPayMethod] = useState<string>('Nakit');

  // Supporting catalog data
  const [catalogParts, setCatalogParts] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  // Synchronous double-submit guard (state updates are async)
  const savingRef = useRef(false);

  useEffect(() => {
    loadCatalog();
    loadSettings();
    if (workOrderId) {
      loadWorkOrder(workOrderId);
    } else if (plate) {
      checkVehicle(plate);
    }
  }, [workOrderId]);

  const loadSettings = async () => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings) {
        if (!isEditing) {
          setVatRate(res.settings.default_kdv_rate ?? 20);
        }
        if (typeof res.settings.default_cash_discount_rate === 'number') {
          setCashDiscRate(res.settings.default_cash_discount_rate);
        }
      }
    } catch {}
  };

  const loadCatalog = async () => {
    try {
      const [partsRes, custRes] = await Promise.all([
        apiRequest('/parts?limit=1000'),
        apiRequest('/customers?limit=1000')
      ]);
      if (partsRes.success) setCatalogParts(partsRes.items || []);
      if (custRes.success) setCustomersList(custRes.items || []);
    } catch {}
  };

  const checkVehicle = async (rawPlate: string) => {
    const norm = normalizePlate(rawPlate);
    if (norm.length < 4) {
      setExistingVehicle(null);
      return;
    }

    try {
      const res = await apiRequest(`/vehicles/by-plate/${norm}`);
      if (res.success && res.vehicle) {
        setExistingVehicle(res);
        if (res.vehicle.kilometre) {
          setKm(String(res.vehicle.kilometre));
        }
      } else {
        setExistingVehicle(null);
      }
    } catch {
      setExistingVehicle(null);
    }
  };

  const loadWorkOrder = async (id: number) => {
    setLoading(true);
    try {
      const res = await apiRequest(`/work-orders/${id}`);
      if (res.success && res.workOrder) {
        const o = res.workOrder;
        setPlate(formatPlateDisplay(o.plaka || o.arac?.plaka || ''));
        setDate(o.giris_tarihi?.split('T')[0] || todayISO());
        setKm(o.km || o.kilometre ? String(o.km || o.kilometre) : '');

        const stageNorm = o.durum === 'kabul' ? 'accepted' : (o.durum === 'onarımda' || o.durum === 'onarimda') ? 'repairing' : (o.durum === 'tamamlandı' || o.durum === 'teslime_hazir') ? 'ready' : 'delivered';
        setStage(stageNorm);
        setComplaint(o.sikayet || '');

        setVatRate(o.kdv_orani ?? 20);
        setDiscountPct(o.iskonto_yuzde ? String(o.iskonto_yuzde) : '');
        setDiscountAmt(o.iskonto_tutar_kurus ? (o.iskonto_tutar_kurus / 100).toFixed(2) : '');
        setCashOverride(o.pesin_fiyat_elle_kurus ? (o.pesin_fiyat_elle_kurus / 100).toFixed(2) : '');

        setNextServiceDate(o.sonraki_bakim_tarihi || '');
        setNextServiceKm(o.sonraki_bakim_km ? String(o.sonraki_bakim_km) : '');

        if (o.kalemler && o.kalemler.length > 0) {
          setLines(
            o.kalemler.map((l: any) => ({
              id: l.id,
              kind: l.tur === 'iscilik' ? 'labor' : 'part',
              partId: l.parca_id || null,
              name: l.ad || '',
              qty: Number(l.adet) || 1,
              price: l.birim_fiyat_kurus ? (l.birim_fiyat_kurus / 100).toFixed(2) : '',
              unit: l.birim || 'adet'
            }))
          );
        }

        if (o.arac) {
          setExistingVehicle({ vehicle: o.arac, customer: o.musteri });
        }
      }
    } catch (err: any) {
      setFormError('İş emri bilgileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handlePlateChange = (val: string) => {
    const norm = normalizePlate(val);
    const disp = norm.length >= 4 ? formatPlateDisplay(norm) : val.toUpperCase();
    setPlate(disp);
    checkVehicle(val);
  };

  // Line item manipulation
  const handleAddLine = (kind: 'part' | 'labor') => {
    setLines((prev) => [
      ...prev,
      { kind, partId: null, name: '', qty: 1, price: '', unit: 'adet' }
    ]);
  };

  const handleRemoveLine = (idx: number) => {
    setLines((prev) => {
      const copy = [...prev];
      copy.splice(idx, 1);
      return copy.length ? copy : [{ kind: 'part', partId: null, name: '', qty: 1, price: '', unit: 'adet' }];
    });
  };

  const handleLineChange = (idx: number, field: keyof OrderLineState, val: any) => {
    setLines((prev) => {
      const copy = [...prev];
      const line = { ...copy[idx], [field]: val };

      // Auto-match part name from catalog
      if (field === 'name' && line.kind === 'part') {
        const found = catalogParts.find(
          (p) => p.ad.toLowerCase() === String(val).toLowerCase() || (p.oem_kodu && p.oem_kodu.toLowerCase() === String(val).toLowerCase())
        );
        if (found) {
          line.partId = found.id;
          line.name = found.ad;
          line.unit = found.birim || 'adet';
          if (!line.price || parseFloat(line.price) <= 0) {
            line.price = ((found.satis_fiyati_kurus || 0) / 100).toFixed(2);
          }
        } else {
          line.partId = null;
        }
      }

      copy[idx] = line;
      return copy;
    });
  };

  const handleBarcodeEnter = (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;

    const p = catalogParts.find(
      (item) => (item.barkod && String(item.barkod).trim() === trimmed) || (item.oem_kodu && item.oem_kodu.trim() === trimmed)
    );

    if (!p) {
      toast(`Barkod stokta bulunamadı: ${trimmed}`);
      return;
    }

    setLines((prev) => {
      const exIdx = prev.findIndex((l) => l.kind === 'part' && l.partId === p.id);
      if (exIdx >= 0) {
        const copy = [...prev];
        copy[exIdx] = { ...copy[exIdx], qty: copy[exIdx].qty + 1 };
        return copy;
      }

      const emptyIdx = prev.findIndex((l) => l.kind === 'part' && !l.name.trim());
      const newLine: OrderLineState = {
        kind: 'part',
        partId: p.id,
        name: p.ad,
        qty: 1,
        price: ((p.satis_fiyati_kurus || 0) / 100).toFixed(2),
        unit: p.birim || 'adet'
      };

      if (emptyIdx >= 0) {
        const copy = [...prev];
        copy[emptyIdx] = newLine;
        return copy;
      }

      return [...prev, newLine];
    });

    setBarcodeInput('');
    toast(`${p.ad} eklendi`);
  };

  // Live Totals Math using calculateWorkOrderTotals
  const workOrderLinesInput = lines.map((l) => ({
    adet: Number(l.qty) || 0,
    birim_fiyat_kuruş: Math.round((parseFloat(l.price.replace(',', '.')) || 0) * 100)
  }));

  const calcResult = calculateWorkOrderTotals({
    lines: workOrderLinesInput,
    kdv_orani: vatRate,
    // Girilen fiyatlar her zaman KDV hariç sayılır
    kdv_dahil_mi: false,
    iskonto_yuzde: parseFloat(discountPct) || 0,
    iskonto_tutar_kurus: Math.round((parseFloat(discountAmt.replace(',', '.')) || 0) * 100),
    pesin_iskonto_yuzde: cashDiscRate,
    pesin_fiyat_elle_kurus: cashOverride ? Math.round((parseFloat(cashOverride.replace(',', '.')) || 0) * 100) : null
  });

  // Save Order
  const handleSave = async () => {
    if (savingRef.current) return;
    const norm = normalizePlate(plate);
    if (norm.length < 4) {
      setFormError('Lütfen geçerli bir plaka girin (örn. 34 ABC 123).');
      return;
    }

    const validLines = lines.filter((l) => l.name.trim());
    if (!validLines.length) {
      setFormError('En az bir parça veya işçilik satırı yazın.');
      return;
    }

    setSaving(true);
    savingRef.current = true;
    setFormError('');

    try {
      // 1. If vehicle not found in database, register vehicle first
      let vehicleId = existingVehicle?.vehicle?.id;
      if (!vehicleId) {
        const vehRes = await apiRequest('/vehicles', {
          method: 'POST',
          body: JSON.stringify({
            ...(selectedCustomerId ? { musteri_id: selectedCustomerId } : {}),
            plaka: norm,
            marka: newVehicle.brand.trim() || 'Belirtilmedi',
            model: newVehicle.model.trim() || 'Belirtilmedi',
            yil: newVehicle.year ? parseInt(newVehicle.year, 10) : null,
            sasi_no: newVehicle.chassis.trim(),
            motor_kodu: newVehicle.engineCode.trim(),
            muayene_tarihi: newVehicle.inspectionDate || null,
            musteri_ad_soyad: newVehicle.customer.trim() || 'Müşteri',
            musteri_telefon: newVehicle.phone.trim()
          })
        });

        if (vehRes.success && vehRes.vehicle) {
          vehicleId = vehRes.vehicle.id;
        } else {
          throw new Error('Yeni araç kaydedilemedi.');
        }
      }

      // Map stage to database status
      const dbStatus = stage === 'accepted' ? 'kabul' : stage === 'repairing' ? 'onarimda' : stage === 'ready' ? 'teslime_hazir' : 'teslim_edildi';

      // 2. Prepare work order body
      const orderBody: any = {
        arac_id: vehicleId,
        plaka: norm,
        giris_tarihi: date || todayISO(),
        km: km ? parseInt(km, 10) : 0,
        kilometre: km ? parseInt(km, 10) : 0,
        durum: dbStatus,
        sikayet: complaint.trim(),
        kdv_orani: vatRate,
        // Girilen fiyatlar her zaman KDV hariç sayılır
        kdv_dahil_mi: false,
        iskonto_yuzde: parseFloat(discountPct) || 0,
        iskonto_tutar_kurus: Math.round((parseFloat(discountAmt.replace(',', '.')) || 0) * 100),
        pesin_iskonto_yuzde: cashDiscRate,
        pesin_fiyat_elle_kurus: cashOverride ? Math.round((parseFloat(cashOverride.replace(',', '.')) || 0) * 100) : null,
        sonraki_bakim_tarihi: nextServiceDate || null,
        sonraki_bakim_km: nextServiceKm ? parseInt(nextServiceKm, 10) : null,
        kalemler: validLines.map((l) => ({
          tur: l.kind === 'labor' ? 'iscilik' : 'parca',
          parca_id: l.partId || null,
          ad: l.name.trim(),
          adet: Number(l.qty) || 1,
          birim: l.unit || 'adet',
          birim_fiyat_kurus: Math.round((parseFloat(l.price.replace(',', '.')) || 0) * 100)
        }))
      };

      let savedOrderId = workOrderId;
      if (isEditing) {
        await apiRequest(`/work-orders/${workOrderId}`, {
          method: 'PUT',
          body: JSON.stringify(orderBody)
        });
      } else {
        const createRes = await apiRequest('/work-orders', {
          method: 'POST',
          body: JSON.stringify(orderBody)
        });
        if (createRes.success && createRes.workOrder) {
          savedOrderId = createRes.workOrder.id;

          // If initial payment was entered
          const firstPayKurus = Math.round((parseFloat(firstPay.replace(',', '.')) || 0) * 100);
          if (firstPayKurus > 0 && savedOrderId) {
            await apiRequest(`/work-orders/${savedOrderId}/payments`, {
              method: 'POST',
              body: JSON.stringify({
                tutar_kurus: firstPayKurus,
                odeme_yontemi: firstPayMethod,
                odeme_tarihi: date
              })
            });
          }
        }
      }

      toast('İş emri kaydedildi');
      if (onSaved) onSaved(norm);
      onClose();
    } catch (err: any) {
      setFormError(err.message || 'İş emri kaydedilirken hata oluştu.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const norm = normalizePlate(plate);
  const isVehicleFound = Boolean(existingVehicle?.vehicle);

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="sheet wide">
        <div className="sheet-head">
          <h2>{isEditing ? 'İş emrini düzenle' : 'Yeni iş emri'}</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        <div className="sheet-body">
          {loading && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--muted)' }}>
              Yükleniyor...
            </div>
          )}

          {/* Top row: Plaka, Tarih, KM */}
          <div className="grid g3">
            <div className="field">
              <label htmlFor="of-plate">Plaka</label>
              <div className="plate-input sm">
                <span className="plate-tr" aria-hidden="true">TR</span>
                <input
                  id="of-plate"
                  type="text"
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder="34 ABC 123"
                  value={plate}
                  readOnly={isEditing}
                  onChange={(e) => handlePlateChange(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="of-date">Tarih</label>
              <input
                id="of-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="of-km">Kilometre</label>
              <input
                id="of-km"
                type="number"
                min="0"
                placeholder="örn. 148500"
                value={km}
                onChange={(e) => setKm(e.target.value)}
              />
            </div>
          </div>

          {/* Vehicle info block */}
          {isVehicleFound ? (
            <div className="vbox found">
              <span className="ttl">
                Kayıtlı araç:{' '}
                {[existingVehicle.vehicle.marka, existingVehicle.vehicle.model].filter(Boolean).join(' ') || 'Marka/Model yok'}{' '}
                {existingVehicle.vehicle.yil ? ` ${existingVehicle.vehicle.yil}` : ''}
              </span>
              <span className="muted">
                {existingVehicle.customer?.ad_soyad || existingVehicle.musteri?.ad_soyad || 'Müşteri belirtilmemiş'}{' '}
                {(existingVehicle.customer?.telefon || existingVehicle.musteri?.telefon) ? ` · ${existingVehicle.customer?.telefon || existingVehicle.musteri?.telefon}` : ''}
              </span>
            </div>
          ) : norm.length >= 4 ? (
            <div className="vbox">
              <span className="ttl">Yeni araç: {formatPlateDisplay(norm)}</span>
              <div className="grid g4">
                <div className="field">
                  <label htmlFor="ofv-brand">Marka</label>
                  <input
                    id="ofv-brand"
                    type="text"
                    placeholder="Renault"
                    value={newVehicle.brand}
                    onChange={(e) => setNewVehicle({ ...newVehicle, brand: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ofv-model">Model</label>
                  <input
                    id="ofv-model"
                    type="text"
                    placeholder="Clio 1.5 dCi"
                    value={newVehicle.model}
                    onChange={(e) => setNewVehicle({ ...newVehicle, model: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ofv-year">Yıl</label>
                  <input
                    id="ofv-year"
                    type="number"
                    placeholder="2018"
                    value={newVehicle.year}
                    onChange={(e) => setNewVehicle({ ...newVehicle, year: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ofv-phone">Telefon</label>
                  <input
                    id="ofv-phone"
                    type="tel"
                    placeholder="05xx xxx xx xx"
                    value={newVehicle.phone}
                    onChange={(e) => {
                      setSelectedCustomerId(null);
                      setNewVehicle({ ...newVehicle, phone: e.target.value });
                    }}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="ofv-customer-select">Kayıtlı müşteri seç (isteğe bağlı)</label>
                <select
                  id="ofv-customer-select"
                  value={selectedCustomerId ? String(selectedCustomerId) : ''}
                  onChange={(e) => {
                    const id = e.target.value ? parseInt(e.target.value, 10) : null;
                    setSelectedCustomerId(id);
                    const found = customersList.find((c) => c.id === id);
                    if (found) {
                      setNewVehicle((prev) => ({
                        ...prev,
                        customer: found.ad_soyad || '',
                        phone: found.telefon || ''
                      }));
                    }
                  }}
                >
                  <option value="">Yeni müşteri (elle yazın)</option>
                  {customersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ad_soyad}{c.telefon ? ` · ${c.telefon}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="ofv-customer">Müşteri adı</label>
                <input
                  id="ofv-customer"
                  type="text"
                  list="custlist"
                  placeholder="Ad Soyad (cari hesap bu isimle tutulur)"
                  value={newVehicle.customer}
                  onChange={(e) => {
                    setSelectedCustomerId(null);
                    setNewVehicle({ ...newVehicle, customer: e.target.value });
                  }}
                />
              </div>

              <div className="grid g3">
                <div className="field">
                  <label htmlFor="ofv-chassis">Şasi no</label>
                  <input
                    id="ofv-chassis"
                    type="text"
                    autoCapitalize="characters"
                    value={newVehicle.chassis}
                    onChange={(e) => setNewVehicle({ ...newVehicle, chassis: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ofv-engine">Motor kodu</label>
                  <input
                    id="ofv-engine"
                    type="text"
                    placeholder="K9K 612"
                    value={newVehicle.engineCode}
                    onChange={(e) => setNewVehicle({ ...newVehicle, engineCode: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ofv-insp">Muayene bitiş tarihi</label>
                  <input
                    id="ofv-insp"
                    type="date"
                    value={newVehicle.inspectionDate}
                    onChange={(e) => setNewVehicle({ ...newVehicle, inspectionDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <p className="muted">
              Plakayı yazın. Kayıtlıysa araç bilgisi gelir, değilse yeni araç olarak eklenir.
            </p>
          )}

          {/* Datalists for autocompletion */}
          <datalist id="partlist">
            {catalogParts.map((p) => (
              <option key={p.id} value={p.ad}>
                Stok {p.stok_miktari} · {money(p.satis_fiyati_kurus || 0)}
              </option>
            ))}
          </datalist>

          <datalist id="custlist">
            {customersList.map((c) => (
              <option key={c.id} value={c.ad_soyad} />
            ))}
          </datalist>

          {/* Stage & Barcode scanner */}
          <div className="grid g2">
            <div className="field">
              <label htmlFor="of-stage">Servis durumu</label>
              <select
                id="of-stage"
                value={stage}
                onChange={(e) => setStage(e.target.value)}
              >
                {STAGES.map((s) => (
                  <option key={s[0]} value={s[0]}>{s[1]}</option>
                ))}
              </select>
            </div>

            <div className="field">
              <label htmlFor="of-barcode">Barkod okut</label>
              <div className="barcode">
                <input
                  id="of-barcode"
                  type="text"
                  autoComplete="off"
                  placeholder="Barkod okutun veya yazıp Enter'a basın"
                  value={barcodeInput}
                  onChange={(e) => setBarcodeInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleBarcodeEnter(barcodeInput);
                    }
                  }}
                />
              </div>
            </div>
          </div>

          {/* Complaint / Note */}
          <div className="field">
            <label htmlFor="of-complaint">Şikayet / yapılan işlem notu</label>
            <textarea
              id="of-complaint"
              rows={2}
              placeholder="Müşterinin şikayeti, yapılan işlemin kısa özeti"
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
            />
          </div>

          {/* Lines Table */}
          <h3>Değişen parça ve işçilik</h3>
          <div id="of-lines">
            {lines.map((l, i) => {
              const isPart = l.kind === 'part';
              const pItem = l.partId ? catalogParts.find((x) => x.id === l.partId) : null;
              const unitPriceNum = parseFloat(l.price.replace(',', '.')) || 0;
              const rowTotal = (l.qty || 0) * unitPriceNum;

              let hintClass = 'hint';
              let hintText = '';
              if (isPart && pItem) {
                const avail = pItem.stok_miktari || 0;
                const after = avail - (l.qty || 0);
                if (l.qty > avail) {
                  hintClass = 'hint warn';
                  hintText = `Stokta ${numfmt(avail)} ${pItem.birim || 'adet'} var, yetersiz.`;
                } else if (pItem.kritik_stok_seviyesi > 0 && after <= pItem.kritik_stok_seviyesi) {
                  hintClass = 'hint warn';
                  hintText = `Stokta ${numfmt(avail)} ${pItem.birim || 'adet'} var. Bu işlemle kritik stoğa düşer.`;
                } else {
                  hintText = `Stokta ${numfmt(avail)} ${pItem.birim || 'adet'} var`;
                }
              }

              return (
                <div key={i} className="lrow">
                  <span className={`kind ${isPart ? 'kind-part' : ''}`}>
                    {isPart ? 'Parça' : 'İşçilik'}
                  </span>

                  <div className="lname">
                    <input
                      type="text"
                      list={isPart ? 'partlist' : undefined}
                      placeholder={isPart ? 'Parça adı veya kodu (stoktan seçilebilir)' : 'Yapılan işlem'}
                      value={l.name}
                      onChange={(e) => handleLineChange(i, 'name', e.target.value)}
                    />
                    {hintText && <div className={hintClass}>{hintText}</div>}
                  </div>

                  <label className="lf">
                    <span>Adet</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      value={l.qty}
                      onChange={(e) => handleLineChange(i, 'qty', parseFloat(e.target.value) || 0)}
                    />
                  </label>

                  <label className="lf">
                    <span>Birim fiyat</span>
                    <input
                      type="number"
                      min="0"
                      step="any"
                      placeholder="0,00"
                      value={l.price}
                      onChange={(e) => handleLineChange(i, 'price', e.target.value)}
                    />
                  </label>

                  <div className="lf ltotal">
                    <span>Tutar</span>
                    <output>{money(rowTotal, false)}</output>
                  </div>

                  <button
                    className="icon-btn"
                    type="button"
                    onClick={() => handleRemoveLine(i)}
                    aria-label="Satırı sil"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>

          {/* Add Line Buttons */}
          <div className="row">
            <button className="btn" type="button" onClick={() => handleAddLine('part')}>
              + Parça
            </button>
            <button className="btn" type="button" onClick={() => handleAddLine('labor')}>
              + İşçilik
            </button>
          </div>

          {/* Financial Adjustments Grid 4 */}
          <div className="grid g4">
            <div className="field">
              <label htmlFor="of-dpct">İskonto (%)</label>
              <input
                id="of-dpct"
                type="number"
                min="0"
                max="100"
                step="any"
                placeholder="0"
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="of-damt">İskonto (₺)</label>
              <input
                id="of-damt"
                type="number"
                min="0"
                step="any"
                placeholder="0,00"
                value={discountAmt}
                onChange={(e) => setDiscountAmt(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="of-vat">KDV oranı (%)</label>
              <input
                id="of-vat"
                type="number"
                min="0"
                step="any"
                value={vatRate}
                onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="field">
              <label htmlFor="of-cash">Peşin fiyat (elle)</label>
              <input
                id="of-cash"
                type="number"
                min="0"
                step="any"
                placeholder="boşsa otomatik"
                value={cashOverride}
                onChange={(e) => setCashOverride(e.target.value)}
              />
            </div>
          </div>

          {/* Totals Box */}
          <div className="totals-box">
            <dl className="totals">
              {calcResult.iskonto_kurus > 0 && (
                <>
                  <dt>Kalemler toplamı (KDV hariç)</dt>
                  <dd>{money(calcResult.toplam_kurus)}</dd>
                  <dt>İskonto</dt>
                  <dd>-{money(calcResult.iskonto_kurus)}</dd>
                </>
              )}
              <dt>Ara toplam (KDV hariç)</dt>
              <dd>{money(calcResult.net_kurus)}</dd>
              <dt>KDV %{numfmt(vatRate)}</dt>
              <dd>{money(calcResult.kdv_tutar_kurus)}</dd>
              <dt className="grand">KDV dahil toplam</dt>
              <dd className="grand">{money(calcResult.brut_kurus)}</dd>
              <dt className="cash">
                Peşin fiyat
                {!cashOverride && cashDiscRate > 0 && <small> (%{cashDiscRate} iskonto)</small>}
              </dt>
              <dd className="cash">{money(calcResult.pesin_fiyat_kurus)}</dd>
            </dl>
          </div>

          {/* Next Service Reminder */}
          <h3>Sonraki bakım (hatırlatıcı için)</h3>
          <div className="grid g2">
            <div className="field">
              <label htmlFor="of-nsd">Bakım tarihi</label>
              <input
                id="of-nsd"
                type="date"
                value={nextServiceDate}
                onChange={(e) => setNextServiceDate(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="of-nsk">Bakım kilometresi</label>
              <input
                id="of-nsk"
                type="number"
                min="0"
                placeholder="örn. 160000"
                value={nextServiceKm}
                onChange={(e) => setNextServiceKm(e.target.value)}
              />
            </div>
          </div>

          {/* Initial Payment for new order */}
          {!isEditing && (
            <div className="grid g2">
              <div className="field">
                <label htmlFor="of-pay">Şimdi alınan ödeme (isteğe bağlı)</label>
                <input
                  id="of-pay"
                  type="number"
                  min="0"
                  step="any"
                  placeholder="0,00"
                  value={firstPay}
                  onChange={(e) => setFirstPay(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="of-method">Ödeme yöntemi</label>
                <select
                  id="of-method"
                  value={firstPayMethod}
                  onChange={(e) => setFirstPayMethod(e.target.value)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {formError && <div className="form-error">{formError}</div>}
        </div>

        <div className="sheet-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Vazgeç
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};
