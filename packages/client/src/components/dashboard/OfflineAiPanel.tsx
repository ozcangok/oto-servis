import React from 'react';
import {
  AlertTriangle,
  BrainCircuit,
  Package,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet
} from 'lucide-react';
import type { OfflineAnalysisOutput } from '../../services/offlineAnalytics.js';
import { money } from '../../services/ui.js';

interface OfflineAiPanelProps {
  analysis: OfflineAnalysisOutput;
  onRefresh: () => void;
  refreshing?: boolean;
}

function generatedLabel(iso: string): string {
  try {
    return new Intl.DateTimeFormat('tr-TR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(iso));
  } catch {
    return '—';
  }
}

export const OfflineAiPanel: React.FC<OfflineAiPanelProps> = ({ analysis, onRefresh, refreshing }) => {
  const { metrics } = analysis;
  const maxWorkload = Math.max(1, ...analysis.workload.map((d) => d.count));

  return (
    <section className="card ai-panel" aria-labelledby="ai-title">
      <div className="ai-head">
        <div>
          <div className="ai-kicker">
            <BrainCircuit size={16} strokeWidth={1.9} aria-hidden="true" />
            AI Akıllı Servis Raporu
          </div>
          <h2 id="ai-title">Offline AI Engine</h2>
        </div>
        <span className="ai-live-badge">
          <span className="pulse-dot" aria-hidden="true" />
          Offline AI Engine Active
        </span>
      </div>

      <div className="ai-meta">
        <span>Yerel kural motoru · internet gerekmez</span>
        <span>Son analiz {generatedLabel(analysis.generatedAt)}</span>
      </div>

      <div className="ai-metrics">
        <div>
          <span>Serviste</span>
          <b>{metrics.inShopCount}</b>
        </div>
        <div>
          <span>Teslime hazır</span>
          <b>{metrics.readyCount}</b>
        </div>
        <div>
          <span>Parça bekleyen</span>
          <b>{metrics.pendingPartsCount}</b>
        </div>
        <div>
          <span>Açık cari</span>
          <b>{money(metrics.openReceivablesKurus)}</b>
        </div>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">
          <Sparkles size={15} strokeWidth={1.9} aria-hidden="true" />
          Günlük aksiyon özeti
        </div>
        <ul className="ai-list">
          {analysis.dailyDigest.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">
          <TrendingUp size={15} strokeWidth={1.9} aria-hidden="true" />
          Öngörülen iş yükü
        </div>
        <div className="workload-bars" aria-hidden="true">
          {analysis.workload.map((day) => (
            <div className="workload-day" key={day.dateKey}>
              <span className="workload-count">{day.count}</span>
              <span className="workload-bar">
                <i
                  className={day.count === 0 ? 'zero' : undefined}
                  style={{ height: `${Math.max(8, (day.count / maxWorkload) * 100)}%` }}
                />
              </span>
              <span className="workload-label">{day.label}</span>
            </div>
          ))}
        </div>
        <p className="ai-workload-text">{analysis.predictiveWorkload}</p>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">
          <Package size={15} strokeWidth={1.9} aria-hidden="true" />
          Stok uyarıları
        </div>
        <ul className="ai-list warning">
          {analysis.inventoryWarnings.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="ai-section">
        <div className="ai-section-title">
          <Wallet size={15} strokeWidth={1.9} aria-hidden="true" />
          Finansal riskler
        </div>
        <ul className="ai-list danger">
          {analysis.financialRiskAlerts.map((item) => (
            <li key={item}>
              <AlertTriangle size={13} strokeWidth={1.9} aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </div>

      <div className="ai-foot">
        <span>
          <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
          Deterministik · yerel veri
        </span>
        <button className="btn btn-sm ai-refresh" type="button" onClick={onRefresh} disabled={refreshing}>
          <RefreshCw size={14} className={refreshing ? 'spin' : undefined} aria-hidden="true" />
          {refreshing ? 'Analiz ediliyor' : 'Yenile'}
        </button>
      </div>
    </section>
  );
};
