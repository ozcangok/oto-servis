import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { money, numfmt, toast } from '../services/ui.js';

interface PartsScreenProps {
  initialFilter?: 'all' | 'low';
}

const UNITS = ['adet', 'litre', 'takım', 'metre', 'kg'];

export const PartsScreen: React.FC<PartsScreenProps> = ({ initialFilter = 'all' }) => {
  const [parts, setParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<'all' | 'low'>(initialFilter);
  const [searchTerm, setSearchTerm] = useState('');
  const [vatRate, setVatRate] = useState(20);

  // Edit / Add Part Modal State
  const [partModal, setPartModal] = useState<{
    open: boolean;
    id?: number | null;
    name: string;
    code: string;
    barcode: string;
    compat: string;
    alt: string;
    unit: string;
    qty: string;
    min: string;
    buy: string;
    sell: string;
    shelf: string;
    // Düzenlemede boş bırakılan fiyat alanları, mevcut (veritabanındaki) değeri korur.
    origBuy: number;
    origSell: number;
  }>({
    open: false,
    id: null,
    name: '',
    code: '',
    barcode: '',
    compat: '',
    alt: '',
    unit: 'adet',
    qty: '',
    min: '',
    buy: '',
    sell: '',
    shelf: '',
    origBuy: 0,
    origSell: 0
  });
  const [partModalSaving, setPartModalSaving] = useState(false);
  const [partModalError, setPartModalError] = useState('');
  const [armedDeleteId, setArmedDeleteId] = useState<number | null>(null);

  // Stock In Modal State
  const [stockInModal, setStockInModal] = useState<{
    open: boolean;
    id: number | null;
    name: string;
    currentQty: number;
    unit: string;
    addQty: string;
    newBuyPrice: string;
  }>({
    open: false,
    id: null,
    name: '',
    currentQty: 0,
    unit: 'adet',
    addQty: '',
    newBuyPrice: ''
  });
  const [stockInSaving, setStockInSaving] = useState(false);
  const [stockInError, setStockInError] = useState('');

  useEffect(() => {
    loadParts();
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings?.default_kdv_rate) {
        setVatRate(res.settings.default_kdv_rate);
      }
    } catch {}
  };

  const loadParts = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/parts?limit=1000');
      if (res.success) {
        setParts(res.items || []);
      }
    } catch {
      toast('Parçalar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const isLowStock = (p: any) => {
    const qty = Number(p.stok_miktari) || 0;
    const min = Number(p.kritik_stok) || 0;
    return qty <= 0 || (min > 0 && qty <= min);
  };

  // Filter parts list
  const q = searchTerm.trim().toLowerCase();
  let filtered = parts.slice().sort((a, b) => a.ad.localeCompare(b.ad, 'tr'));

  if (filter === 'low') {
    filtered = filtered.filter(isLowStock);
  }

  if (q) {
    filtered = filtered.filter((p) => {
      const allText = [
        p.ad,
        p.kod,
        p.barkod,
        p.muadil,
        p.uyumlu_arac,
        p.raf
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return allText.includes(q);
    });
  }

  // Calculate total purchase value of stock
  let totalStockValueKurus = 0;
  parts.forEach((p) => {
    const qty = Number(p.stok_miktari) || 0;
    const buy = p.alis_kurus || 0;
    totalStockValueKurus += qty * buy;
  });

  const lowStockCount = parts.filter(isLowStock).length;

  const handleOpenAdd = () => {
    setPartModal({
      open: true,
      id: null,
      name: '',
      code: '',
      barcode: '',
      compat: '',
      alt: '',
      unit: 'adet',
      qty: '0',
      min: '2',
      buy: '',
      sell: '',
      shelf: '',
      origBuy: 0,
      origSell: 0
    });
    setPartModalError('');
  };

  const handleOpenEdit = (p: any) => {
    setPartModal({
      open: true,
      id: p.id,
      name: p.ad || '',
      code: p.kod || '',
      barcode: p.barkod || '',
      compat: p.uyumlu_arac || '',
      alt: p.muadil || '',
      unit: p.birim || 'adet',
      qty: String(p.stok_miktari ?? 0),
      min: String(p.kritik_stok ?? 0),
      buy: p.alis_kurus ? (p.alis_kurus / 100).toFixed(2) : '',
      sell: p.satis_kurus ? (p.satis_kurus / 100).toFixed(2) : '',
      shelf: p.raf || '',
      origBuy: p.alis_kurus || 0,
      origSell: p.satis_kurus || 0
    });
    setPartModalError('');
    setArmedDeleteId(null);
  };

  const handleSavePart = async () => {
    const name = partModal.name.trim();
    if (!name) {
      setPartModalError('Parça adı girin.');
      return;
    }

    setPartModalSaving(true);
    setPartModalError('');

    try {
      // Fiyatlar İSTEĞE BAĞLI: boş bırakılırsa düzenlemede mevcut fiyat korunur,
      // yeni parçada 0 kabul edilir. Böylece yalnızca stok güncellenebilir.
      const buyEmpty = partModal.buy.trim() === '';
      const sellEmpty = partModal.sell.trim() === '';
      const buyKurus = buyEmpty
        ? partModal.origBuy
        : Math.round((parseFloat(partModal.buy.replace(',', '.')) || 0) * 100);
      const sellKurus = sellEmpty
        ? partModal.origSell
        : Math.round((parseFloat(partModal.sell.replace(',', '.')) || 0) * 100);
      const qty = parseFloat(partModal.qty.replace(',', '.')) || 0;
      const min = parseFloat(partModal.min.replace(',', '.')) || 0;

      const body = {
        ad: name,
        kod: partModal.code.trim(),
        barkod: partModal.barcode.trim(),
        uyumlu_arac: partModal.compat.trim(),
        muadil: partModal.alt.trim(),
        birim: partModal.unit || 'adet',
        stok_miktari: qty,
        kritik_stok: min,
        alis_kurus: buyKurus,
        satis_kurus: sellKurus,
        raf: partModal.shelf.trim()
      };

      if (partModal.id) {
        await apiRequest(`/parts/${partModal.id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
        toast('Parça kaydedildi');
      } else {
        await apiRequest('/parts', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        toast('Yeni parça eklendi');
      }

      setPartModal((prev) => ({ ...prev, open: false }));
      loadParts();
    } catch (err: any) {
      setPartModalError(err.message || 'Parça kaydedilemedi.');
    } finally {
      setPartModalSaving(false);
    }
  };

  const handleDeletePart = async (id: number) => {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id);
      setTimeout(() => setArmedDeleteId((cur) => (cur === id ? null : cur)), 4000);
      return;
    }

    try {
      await apiRequest(`/parts/${id}`, { method: 'DELETE' });
      toast('Parça silindi');
      setPartModal((prev) => ({ ...prev, open: false }));
      loadParts();
    } catch (err: any) {
      toast(err.message || 'Parça silinemedi.');
    }
  };

  const handleOpenStockIn = (p: any) => {
    setStockInModal({
      open: true,
      id: p.id,
      name: p.ad,
      currentQty: Number(p.stok_miktari) || 0,
      unit: p.birim || 'adet',
      addQty: '',
      newBuyPrice: p.alis_kurus ? (p.alis_kurus / 100).toFixed(2) : ''
    });
    setStockInError('');
  };

  const handleSaveStockIn = async () => {
    const add = parseFloat(stockInModal.addQty.replace(',', '.')) || 0;
    if (add <= 0) {
      setStockInError('Gelen miktarı girin.');
      return;
    }

    setStockInSaving(true);
    setStockInError('');

    try {
      const buyKurus = stockInModal.newBuyPrice
        ? Math.round(parseFloat(stockInModal.newBuyPrice.replace(',', '.')) * 100)
        : undefined;

      await apiRequest(`/parts/${stockInModal.id}/stock-in`, {
        method: 'POST',
        body: JSON.stringify({
          miktar: add,
          yeni_alis_fiyati_kurus: buyKurus
        })
      });

      toast('Stoğa eklendi');
      setStockInModal((prev) => ({ ...prev, open: false }));
      loadParts();
    } catch (err: any) {
      setStockInError(err.message || 'Stok girişi yapılamadı.');
    } finally {
      setStockInSaving(false);
    }
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <input
          id="pq"
          className="grow"
          type="text"
          placeholder="Parça adı, kod, barkod, muadil veya araç ara"
          autoComplete="off"
          aria-label="Parça ara"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <div className="seg" role="group" aria-label="Filtre">
          <button
            type="button"
            aria-pressed={filter === 'all'}
            onClick={() => setFilter('all')}
          >
            Tümü
          </button>
          <button
            type="button"
            aria-pressed={filter === 'low'}
            onClick={() => setFilter('low')}
          >
            Azalanlar
          </button>
        </div>
        <button
          className="btn btn-primary"
          type="button"
          onClick={handleOpenAdd}
        >
          Parça ekle
        </button>
      </div>

      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div className="spin" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>⌛</div>
          <div>Parçalar yükleniyor...</div>
        </div>
      )}

      {!loading && (
        <div className="panel">
          <div className="tablewrap">
            <table className="tbl ptbl">
              <thead>
                <tr>
                  <th>Kod / barkod</th>
                  <th>Parça</th>
                  <th className="num">Stok</th>
                  <th className="num">Alış</th>
                  <th className="num">Satış (KDV hariç)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length > 0 ? (
                  filtered.map((p) => {
                    const buyKurus = p.alis_kurus || 0;
                    const sellKurus = p.satis_kurus || 0;
                    const sellVatKurus = Math.round(sellKurus * (1 + vatRate / 100));
                    const margin = buyKurus > 0 && sellKurus > 0 ? Math.round(((sellKurus - buyKurus) / buyKurus) * 100) : null;
                    const low = isLowStock(p);

                    return (
                      <tr key={p.id}>
                        <td className="code">
                          {p.kod || '-'}
                          {p.barkod && <div className="subtxt">{p.barkod}</div>}
                        </td>
                        <td>
                          <b>{p.ad}</b>
                          {(p.uyumlu_arac || p.raf) && (
                            <div className="subtxt">
                              {p.uyumlu_arac || ''}
                              {p.uyumlu_arac && p.raf ? ' · ' : ''}
                              {p.raf ? `Raf: ${p.raf}` : ''}
                            </div>
                          )}
                          {p.muadil && <div className="subtxt">Muadil: {p.muadil}</div>}
                        </td>
                        <td className="num">
                          {low ? (
                            <span className="pill low">
                              {numfmt(p.stok_miktari)} {p.birim || 'adet'}
                            </span>
                          ) : (
                            `${numfmt(p.stok_miktari)} ${p.birim || 'adet'}`
                          )}
                        </td>
                        <td className="num">{money(buyKurus)}</td>
                        <td className="num">
                          {money(sellKurus)}
                          <div className="subtxt">
                            KDV dahil {money(sellVatKurus)}
                            {margin !== null ? ` · %${margin}` : ''}
                          </div>
                        </td>
                        <td className="num">
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => handleOpenStockIn(p)}
                            style={{ marginRight: '6px' }}
                          >
                            Giriş
                          </button>
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => handleOpenEdit(p)}
                          >
                            Düzenle
                          </button>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan={6} className="muted" style={{ padding: '24px 16px', textAlign: 'center' }}>
                      Eşleşen parça yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="foot-note">
            <span>
              {parts.length} kalem · {lowStockCount} azalan
            </span>
            <span>
              Stoktaki parçaların alış değeri: <b className="tnum">{money(totalStockValueKurus)}</b>
            </span>
          </div>
        </div>
      )}

      {/* PART ADD / EDIT MODAL */}
      {partModal.open && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <h2>{partModal.id ? 'Parçayı düzenle' : 'Yeni parça'}</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setPartModal((p) => ({ ...p, open: false }))}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <div className="grid g2">
                <div className="field">
                  <label htmlFor="pf-name">Parça adı</label>
                  <input
                    id="pf-name"
                    type="text"
                    placeholder="Ön fren balatası"
                    value={partModal.name}
                    onChange={(e) => setPartModal({ ...partModal, name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pf-code">Parça kodu</label>
                  <input
                    id="pf-code"
                    type="text"
                    placeholder="Üretici / OEM kodu"
                    value={partModal.code}
                    onChange={(e) => setPartModal({ ...partModal, code: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="pf-barcode">Barkod</label>
                <input
                  id="pf-barcode"
                  type="text"
                  placeholder="Barkod okuyucuyla okutabilirsiniz"
                  value={partModal.barcode}
                  onChange={(e) => setPartModal({ ...partModal, barcode: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="pf-compat">Uyumlu araç / not</label>
                <input
                  id="pf-compat"
                  type="text"
                  placeholder="Renault Clio 2012-2019"
                  value={partModal.compat}
                  onChange={(e) => setPartModal({ ...partModal, compat: e.target.value })}
                />
              </div>

              <div className="field">
                <label htmlFor="pf-alt">Muadil parçalar</label>
                <input
                  id="pf-alt"
                  type="text"
                  placeholder="Muadil kod / marka, virgülle ayırın (örn. TRW GDB1690, Bosch 0986424789)"
                  value={partModal.alt}
                  onChange={(e) => setPartModal({ ...partModal, alt: e.target.value })}
                />
              </div>

              <div className="grid g3">
                <div className="field">
                  <label htmlFor="pf-qty">Stok adedi</label>
                  <input
                    id="pf-qty"
                    type="number"
                    step="any"
                    value={partModal.qty}
                    onChange={(e) => setPartModal({ ...partModal, qty: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pf-unit">Birim</label>
                  <select
                    id="pf-unit"
                    value={partModal.unit}
                    onChange={(e) => setPartModal({ ...partModal, unit: e.target.value })}
                  >
                    {UNITS.map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="pf-min">Kritik stok</label>
                  <input
                    id="pf-min"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="altına inince uyar"
                    value={partModal.min}
                    onChange={(e) => setPartModal({ ...partModal, min: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid g3">
                <div className="field">
                  <label htmlFor="pf-buy">Alış fiyatı (isteğe bağlı ₺)</label>
                  <input
                    id="pf-buy"
                    type="number"
                    min="0"
                    step="any"
                    value={partModal.buy}
                    onChange={(e) => setPartModal({ ...partModal, buy: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pf-sell">Satış fiyatı (isteğe bağlı ₺)</label>
                  <input
                    id="pf-sell"
                    type="number"
                    min="0"
                    step="any"
                    value={partModal.sell}
                    onChange={(e) => setPartModal({ ...partModal, sell: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="pf-shelf">Raf / yer</label>
                  <input
                    id="pf-shelf"
                    type="text"
                    placeholder="A-3"
                    value={partModal.shelf}
                    onChange={(e) => setPartModal({ ...partModal, shelf: e.target.value })}
                  />
                </div>
              </div>

              {partModalError && <div className="form-error">{partModalError}</div>}
            </div>
            <div className="sheet-foot">
              {partModal.id && (
                <button
                  className={`btn btn-danger ${armedDeleteId === partModal.id ? 'armed' : ''}`}
                  type="button"
                  style={{ marginRight: 'auto' }}
                  onClick={() => handleDeletePart(partModal.id!)}
                >
                  {armedDeleteId === partModal.id ? 'Emin misin? Tekrar tıkla' : 'Parçayı sil'}
                </button>
              )}
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setPartModal((p) => ({ ...p, open: false }))}
              >
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={partModalSaving}
                onClick={handleSavePart}
              >
                {partModalSaving ? 'Kaydediliyor...' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* STOCK IN MODAL */}
      {stockInModal.open && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <h2>Stok girişi</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setStockInModal((p) => ({ ...p, open: false }))}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <p>
                <b>{stockInModal.name}</b>
                <br />
                <span className="muted">
                  Şu an {numfmt(stockInModal.currentQty)} {stockInModal.unit} var
                </span>
              </p>
              <div className="grid g2">
                <div className="field">
                  <label htmlFor="si-qty">Gelen miktar</label>
                  <input
                    id="si-qty"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0"
                    value={stockInModal.addQty}
                    onChange={(e) => setStockInModal({ ...stockInModal, addQty: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="si-buy">Yeni alış fiyatı (isteğe bağlı ₺)</label>
                  <input
                    id="si-buy"
                    type="number"
                    min="0"
                    step="any"
                    placeholder="0,00"
                    value={stockInModal.newBuyPrice}
                    onChange={(e) => setStockInModal({ ...stockInModal, newBuyPrice: e.target.value })}
                  />
                </div>
              </div>
              {stockInError && <div className="form-error">{stockInError}</div>}
            </div>
            <div className="sheet-foot">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setStockInModal((p) => ({ ...p, open: false }))}
              >
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={stockInSaving}
                onClick={handleSaveStockIn}
              >
                {stockInSaving ? 'Ekleniyor...' : 'Stoğa ekle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
