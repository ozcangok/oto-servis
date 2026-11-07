import React from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CircleDollarSign,
  Package,
  ReceiptText,
  TrendingUp,
  Wrench
} from 'lucide-react';
import type { OfflineAnalysisMetrics } from '../../services/offlineAnalytics.js';
import { money } from '../../services/ui.js';

interface AdminKpiGridProps {
  metrics: OfflineAnalysisMetrics;
  onOpenParts: () => void;
  onOpenAccounts: () => void;
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export const AdminKpiGrid: React.FC<AdminKpiGridProps> = ({ metrics, onOpenParts, onOpenAccounts }) => {
  const inShop = metrics.inShopCount;
  const ready = metrics.readyCount;
  const readyPct = pct(ready, inShop);
  const laborPct = pct(metrics.monthLaborKurus, metrics.monthRevenueKurus);
  const partsPct = pct(metrics.monthPartsKurus, metrics.monthRevenueKurus);
  const trend = metrics.monthTrendPct;

  return (
    <section className="kpi-grid" aria-label="Finansal ve operasyonel özet">
      <article className="kpi kpi-card">
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Aktif Araçlar</span>
          <span className="kpi-card-icon"><Wrench size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{inShop} araç</div>
        <div className="kpi-split" aria-hidden="true">
          <span style={{ width: `${Math.max(0, 100 - readyPct)}%` }} />
          <span className="ready" style={{ width: `${readyPct}%` }} />
        </div>
        <div className="kpi-card-foot">
          <span>{ready} teslime hazır</span>
          <span>{Math.max(0, inShop - ready)} işlemde</span>
        </div>
      </article>

      <article className="kpi kpi-card">
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Aylık Toplam Ciro</span>
          <span className="kpi-card-icon"><TrendingUp size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{money(metrics.monthRevenueKurus)}</div>
        <div className="kpi-card-foot">
          <span className={`trend-chip ${trend === null ? 'flat' : trend >= 0 ? 'up' : 'down'}`}>
            {trend === null ? '—' : trend >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
            {trend === null ? 'Önceki ay verisi yok' : `%${Math.abs(trend)} önceki aya göre`}
          </span>
          <span>KDV dahil</span>
        </div>
      </article>

      <article className="kpi kpi-card">
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">İşçilik / Yedek Parça</span>
          <span className="kpi-card-icon"><CircleDollarSign size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{money(metrics.monthLaborKurus)}</div>
        <div className="kpi-split labor" aria-hidden="true">
          <span style={{ width: `${laborPct}%` }} />
          <span className="parts" style={{ width: `${partsPct}%` }} />
        </div>
        <div className="kpi-card-foot">
          <span><i className="legend-dot labor" /> İşçilik %{laborPct}</span>
          <span><i className="legend-dot parts" /> Parça %{partsPct}</span>
        </div>
      </article>

      <button
        className={`kpi kpi-card kpi-card-button ${metrics.overdueCount > 0 ? 'danger' : ''}`}
        type="button"
        onClick={onOpenAccounts}
      >
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Açık Cari Hesap</span>
          <span className="kpi-card-icon"><Banknote size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{money(metrics.openReceivablesKurus)}</div>
        <div className="kpi-card-foot">
          <span>{metrics.openCustomersCount} müşteri</span>
          {metrics.overdueCount > 0 ? (
            <span className="kpi-alert"><ReceiptText size={13} /> {metrics.overdueCount} gecikmiş</span>
          ) : (
            <span className="kpi-ok">Gecikme yok</span>
          )}
        </div>
      </button>

      <button className="kpi kpi-card kpi-card-button compact" type="button" onClick={onOpenParts}>
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Azalan parça</span>
          <span className="kpi-card-icon"><Package size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{metrics.lowStockCount} kalem</div>
        <div className="kpi-card-foot">
          <span className={metrics.criticalStockCount > 0 ? 'kpi-alert' : 'kpi-ok'}>
            {metrics.criticalStockCount > 0 ? `${metrics.criticalStockCount} kritik seviyede` : 'Stok yeterli'}
          </span>
        </div>
      </button>
    </section>
  );
};
