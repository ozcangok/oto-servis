import React from 'react';
import { CalendarCheck2, CheckCircle2, Package, Wrench } from 'lucide-react';
import type { OfflineAnalysisMetrics } from '../../services/offlineAnalytics.js';

interface StaffKpiGridProps {
  metrics: OfflineAnalysisMetrics;
}

export const StaffKpiGrid: React.FC<StaffKpiGridProps> = ({ metrics }) => {
  return (
    <section className="kpi-grid staff" aria-label="Operasyonel özet">
      <article className="kpi kpi-card">
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Aktif Araçlar</span>
          <span className="kpi-card-icon"><Wrench size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{metrics.inShopCount} araç</div>
        <div className="kpi-card-foot">
          <span>Serviste işlem görüyor</span>
        </div>
      </article>

      <article className="kpi kpi-card">
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Teslime Hazır</span>
          <span className="kpi-card-icon"><CheckCircle2 size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{metrics.readyCount} araç</div>
        <div className="kpi-card-foot">
          <span>Teslim için hazırlanacak</span>
        </div>
      </article>

      <article className="kpi kpi-card">
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Parça Bekleyen</span>
          <span className="kpi-card-icon"><Package size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{metrics.pendingPartsCount} araç</div>
        <div className="kpi-card-foot">
          <span>Parça gelince işleme alınacak</span>
        </div>
      </article>

      <article className="kpi kpi-card">
        <div className="kpi-card-top">
          <span className="kpi-card-label kpi-label">Bugünkü Randevu</span>
          <span className="kpi-card-icon"><CalendarCheck2 size={18} strokeWidth={1.8} aria-hidden="true" /></span>
        </div>
        <div className="kpi-card-value">{metrics.todayAppointments} araç</div>
        <div className="kpi-card-foot">
          <span>Bugün kabul edilecek</span>
        </div>
      </article>
    </section>
  );
};
