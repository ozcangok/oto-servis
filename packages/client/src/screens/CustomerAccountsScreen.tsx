import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import {
  fdate,
  money,
  numfmt,
  toast,
  PAYMENT_METHODS,
  todayISO
} from '../services/ui.js';
import { formatPlateDisplay, normalizePlate } from '@oto-servis/shared';

interface CustomerAccountsScreenProps {
  onOpenPlate: (plate: string) => void;
}

interface CustomerGroup {
  id: number | string;
  name: string;
  phone: string;
  plates: string[];
  orders: any[];
  balKurus: number;
  totalKurus: number;
}

export const CustomerAccountsScreen: React.FC<CustomerAccountsScreenProps> = ({ onOpenPlate }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [customerGroups, setCustomerGroups] = useState<CustomerGroup[]>([]);

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

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    setLoading(true);
    try {
      // Load customers, vehicles, work orders
      const [custRes, vehRes, ordersRes] = await Promise.all([
        apiRequest('/customers?limit=1000'),
        apiRequest('/vehicles/search?q='),
        apiRequest('/work-orders?limit=1000')
      ]);

      const customers = custRes.success ? custRes.items || [] : [];
      const vehicles = vehRes.success ? vehRes.items || [] : [];
      const orders = ordersRes.success ? ordersRes.items || [] : [];

      // Group by customer
      const map = new Map<string, CustomerGroup>();

      customers.forEach((c: any) => {
        const key = `c:${c.id}`;
        map.set(key, {
          id: c.id,
          name: c.ad_soyad || 'İsimsiz Müşteri',
          phone: c.telefon || '',
          plates: [],
          orders: [],
          balKurus: 0,
          totalKurus: 0
        });
      });

      // Associate vehicle plates
      vehicles.forEach((v: any) => {
        if (v.musteri_id) {
          const key = `c:${v.musteri_id}`;
          const g = map.get(key);
          if (g && v.plaka && !g.plates.includes(v.plaka)) {
            g.plates.push(v.plaka);
          }
        }
      });

      // Associate orders
      orders.forEach((o: any) => {
        const custId = o.musteri_id || o.arac?.musteri_id;
        const key = custId ? `c:${custId}` : `p:${o.plaka}`;

        if (!map.has(key)) {
          map.set(key, {
            id: key,
            name: o.musteri_ad || '(Müşteri belirtilmemiş)',
            phone: '',
            plates: o.plaka ? [o.plaka] : [],
            orders: [],
            balKurus: 0,
            totalKurus: 0
          });
        }

        const g = map.get(key)!;
        if (o.plaka && !g.plates.includes(o.plaka)) {
          g.plates.push(o.plaka);
        }
        g.orders.push(o);
        g.balKurus += Math.max(0, o.kalan_tutar_kurus || 0);
        g.totalKurus += o.brut_tutar_kurus || 0;
      });

      setCustomerGroups(Array.from(map.values()).filter((g) => g.orders.length > 0));
    } catch {
      toast('Cari hesaplar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const q = searchTerm.trim().toLowerCase();
  const qNorm = normalizePlate(q);

  let filtered = customerGroups;
  if (q) {
    filtered = filtered.filter((g) => {
      const matchText = `${g.name} ${g.phone} ${g.plates.join(' ')}`.toLowerCase();
      const matchPlate = qNorm && g.plates.some((p) => normalizePlate(p).includes(qNorm));
      return matchText.includes(q) || matchPlate;
    });
  }

  const debtors = filtered
    .filter((g) => g.balKurus > 0)
    .sort((a, b) => b.balKurus - a.balKurus);

  const clear = filtered
    .filter((g) => g.balKurus <= 0)
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

  const totalOpenKurus = debtors.reduce((acc, g) => acc + g.balKurus, 0);

  const handleOpenPay = (order: any, isCashClose: boolean) => {
    const gross = order.brut_tutar_kurus || 0;
    const cash = order.pesin_fiyat_kurus || gross;
    const paid = order.odenen_tutar_kurus || 0;
    const remaining = isCashClose ? Math.max(0, cash - paid) : Math.max(0, gross - paid);

    setPayModal({
      open: true,
      orderId: order.id,
      isCashClose,
      plate: order.plaka || '',
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
      loadAccounts();
    } catch (err: any) {
      setPayError(err.message || 'Ödeme kaydedilemedi.');
    } finally {
      setPaySaving(false);
    }
  };

  return (
    <div>
      {/* Search Toolbar */}
      <div className="toolbar">
        <input
          id="cq"
          className="grow"
          type="text"
          placeholder="Müşteri adı, telefon veya plaka ara"
          autoComplete="off"
          aria-label="Müşteri ara"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div className="spin" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>⌛</div>
          <div>Cari hesaplar yükleniyor...</div>
        </div>
      )}

      {/* Debtors / Open Accounts */}
      {!loading && (
        <div className="panel">
          <div className="panel-h">
            <h3>Açık hesaplar</h3>
            <span>
              Toplam alacak: <b className="tnum">{money(totalOpenKurus)}</b>
            </span>
          </div>

          {debtors.length > 0 ? (
            debtors.map((g, gIdx) => {
              const openOrders = g.orders.filter((o) => (o.kalan_tutar_kurus || 0) > 0);
              return (
                <div key={gIdx} className="cgroup">
                  <div className="chead">
                    <b>{g.name}</b>
                    {g.phone && <span className="muted">{g.phone}</span>}
                    {g.plates.map((p) => (
                      <button
                        key={p}
                        type="button"
                        className="btn btn-sm"
                        onClick={() => onOpenPlate(p)}
                      >
                        {formatPlateDisplay(p)}
                      </button>
                    ))}
                    <span className="bal">{money(g.balKurus)}</span>
                  </div>

                  <div className="list">
                    {openOrders.map((o) => (
                      <div
                        key={o.id}
                        className="li"
                        style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto auto' }}
                      >
                        <span className="muted tnum">{fdate(o.giris_tarihi || o.created_at)}</span>
                        <span className="what">
                          <b>{formatPlateDisplay(o.plaka)}</b>
                          <span>{o.sikayet || (o.kalemler || []).map((l: any) => l.ad).join(', ') || 'İşlem notu yok'}</span>
                        </span>
                        <span className="num">
                          <span className="muted">Kalan </span>
                          <b>{money(o.kalan_tutar_kurus || 0)}</b>
                        </span>
                        <span className="row">
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => handleOpenPay(o, false)}
                          >
                            Ödeme al
                          </button>
                          <button
                            className="btn btn-sm"
                            type="button"
                            onClick={() => handleOpenPay(o, true)}
                          >
                            Peşin kapat
                          </button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty">
              {q ? 'Eşleşen açık hesap yok.' : 'Açık hesap yok. Tüm iş emirleri ödenmiş.'}
            </div>
          )}
        </div>
      )}

      {/* Closed Accounts */}
      {!loading && clear.length > 0 && (
        <div className="panel sp">
          <div className="panel-h">
            <h3>Hesabı kapalı müşteriler</h3>
            <span className="muted">{clear.length} müşteri</span>
          </div>
          <div className="list">
            {clear.map((g, gIdx) => (
              <div
                key={gIdx}
                className="li"
                style={{ gridTemplateColumns: 'minmax(0,1fr) auto auto' }}
              >
                <span className="what">
                  <b>{g.name}</b>
                  <span>
                    {g.plates.map(formatPlateDisplay).join(', ')}
                    {g.phone ? ` · ${g.phone}` : ''}
                  </span>
                </span>
                <span className="muted li-extra">{g.orders.length} işlem</span>
                <span className="num tnum">{money(g.totalKurus)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PAYMENT MODAL */}
      {payModal.open && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <h2>{payModal.isCashClose ? 'Peşin kapat' : 'Ödeme al'}</h2>
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
                  <label htmlFor="c-pay-amt">Tutar (₺)</label>
                  <input
                    id="c-pay-amt"
                    type="number"
                    step="any"
                    min="0"
                    value={payAmountLira}
                    onChange={(e) => setPayAmountLira(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="c-pay-method">Yöntem</label>
                  <select
                    id="c-pay-method"
                    value={payMethod}
                    onChange={(e) => setPayMethod(e.target.value)}
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>{m}</option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="c-pay-date">Tarih</label>
                  <input
                    id="c-pay-date"
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
    </div>
  );
};
