import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { Spinner } from '../components/Spinner.js';
import {
  fdate,
  money,
  numfmt,
  toast,
  todayISO
} from '../services/ui.js';
import { formatPlateDisplay } from '@oto-servis/shared';

export const CashDeskScreen: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [loading, setLoading] = useState(false);

  // Kasa Data
  const [summaryData, setSummaryData] = useState<{
    nakitKurus: number;
    krediKartiKurus: number;
    havaleKurus: number;
    laborKurus: number;
    totalKurus: number;
    openedOrdersCount: number;
    openedOrdersGrossKurus: number;
    openedOrdersRemainingKurus: number;
    payments: any[];
  }>({
    nakitKurus: 0,
    krediKartiKurus: 0,
    havaleKurus: 0,
    laborKurus: 0,
    totalKurus: 0,
    openedOrdersCount: 0,
    openedOrdersGrossKurus: 0,
    openedOrdersRemainingKurus: 0,
    payments: []
  });

  useEffect(() => {
    loadCashData(selectedDate);
  }, [selectedDate]);

  const loadCashData = async (dateStr: string) => {
    setLoading(true);
    try {
      // 1. Fetch cash desk summary endpoint
      const res = await apiRequest(`/cash-desk/summary?date=${dateStr}`);
      if (res.success && res.summary) {
        const s = res.summary;
        const nakit = s.nakit_kurus || s.by_method?.nakit || 0;
        const kart = s.kart_kurus || s.by_method?.kredi_karti || s.by_method?.kart || 0;
        const havale = s.havale_kurus || s.by_method?.havale_eft || s.by_method?.havale || 0;
        const labor = s.periodLaborKurus ?? s.totalLaborKurus ?? 0;
        const total = nakit + kart + havale;

        // Fetch opened orders on this date
        const ordersRes = await apiRequest(`/work-orders?limit=1000`);
        const allOrders = ordersRes.success ? ordersRes.items || [] : [];
        const opened = allOrders.filter((o: any) => {
          const d = o.giris_tarihi?.split('T')[0] || o.created_at?.split('T')[0];
          return d === dateStr;
        });

        let grossOpened = 0;
        let restOpened = 0;
        opened.forEach((o: any) => {
          grossOpened += o.brut_tutar_kurus || 0;
          restOpened += Math.max(0, o.kalan_tutar_kurus || 0);
        });

        // Transactions list
        const pays = (s.payments || s.transactions || []).map((t: any) => ({
          plate: t.plaka || '',
          customerName: t.musteri_ad || '',
          method: t.odeme_yontemi || t.method || 'Nakit',
          amountKurus: t.tutar_kurus || t.amount || 0
        }));

        setSummaryData({
          nakitKurus: nakit,
          krediKartiKurus: kart,
          havaleKurus: havale,
          laborKurus: labor,
          totalKurus: total,
          openedOrdersCount: opened.length,
          openedOrdersGrossKurus: grossOpened,
          openedOrdersRemainingKurus: restOpened,
          payments: pays
        });
      }
    } catch {
      toast('Kasa verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadCSV = () => {
    if (!summaryData.payments.length) {
      toast('Bu tarihte tahsilat kaydı yok.');
      return;
    }

    const rows = [
      ['Tarih', 'Plaka', 'Müşteri', 'Yöntem', 'Tutar (TL)']
    ];

    summaryData.payments.forEach((p) => {
      rows.push([
        fdate(selectedDate),
        formatPlateDisplay(p.plate),
        `"${p.customerName || ''}"`,
        p.method,
        (p.amountKurus / 100).toFixed(2).replace('.', ',')
      ]);
    });

    rows.push([]);
    rows.push(['Toplam Tahsilat', '', '', '', (summaryData.totalKurus / 100).toFixed(2).replace('.', ',')]);
    rows.push(['Toplam İşçilik Bedeli', '', '', '', (summaryData.laborKurus / 100).toFixed(2).replace('.', ',')]);

    const csvContent = '\uFEFF' + rows.map((r) => r.join(';')).join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `kasa-${selectedDate}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast('Kasa raporu hazır (CSV)');
  };

  return (
    <div>
      {/* Toolbar */}
      <div className="toolbar">
        <label htmlFor="kasa-date" className="muted">
          Gün sonu raporu
        </label>
        <input
          id="kasa-date"
          type="date"
          aria-label="Rapor tarihi"
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value || todayISO())}
        />
        <button
          className="btn"
          type="button"
          onClick={() => setSelectedDate(todayISO())}
        >
          Bugün
        </button>
        <button
          className="btn"
          type="button"
          onClick={handleDownloadCSV}
        >
          CSV indir
        </button>
      </div>

      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ marginBottom: '8px' }}><Spinner size={24} /></div>
          <div>Kasa verileri yükleniyor...</div>
        </div>
      )}

      {!loading && (
        <div className="panel">
          <div className="panel-h">
            <h3>{fdate(selectedDate)} kasa özeti</h3>
          </div>

          <div className="kasa-sum">
            <div className="stat">
              <span>Nakit</span>
              <b>{money(summaryData.nakitKurus)}</b>
            </div>
            <div className="stat">
              <span>Kredi kartı</span>
              <b>{money(summaryData.krediKartiKurus)}</b>
            </div>
            <div className="stat">
              <span>Havale / EFT</span>
              <b>{money(summaryData.havaleKurus)}</b>
            </div>
            <div className="stat" style={{ borderLeft: '1px solid var(--line)' }}>
              <span>Toplam İşçilik Bedeli</span>
              <b>{money(summaryData.laborKurus)}</b>
            </div>
            <div className="stat kasa-total">
              <span>Toplam tahsilat</span>
              <b>{money(summaryData.totalKurus)}</b>
            </div>
          </div>

          <div className="tablewrap">
            <table className="tbl" style={{ minWidth: '480px' }}>
              <thead>
                <tr>
                  <th>Plaka</th>
                  <th>Müşteri</th>
                  <th>Yöntem</th>
                  <th className="num">Tutar</th>
                </tr>
              </thead>
              <tbody>
                {summaryData.payments.length > 0 ? (
                  summaryData.payments.map((p, idx) => (
                    <tr key={idx}>
                      <td>{formatPlateDisplay(p.plate)}</td>
                      <td>{p.customerName || '-'}</td>
                      <td>{p.method}</td>
                      <td className="num">{money(p.amountKurus)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={4} className="muted" style={{ padding: '24px 16px', textAlign: 'center' }}>
                      Bu tarihte tahsilat yok.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="foot-note">
            <span>
              Bu gün açılan iş emri: <b>{summaryData.openedOrdersCount}</b>
            </span>
            <span>
              KDV dahil toplam: <b className="tnum">{money(summaryData.openedOrdersGrossKurus)}</b> · Açık kalan: <b className="tnum">{money(summaryData.openedOrdersRemainingKurus)}</b>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
