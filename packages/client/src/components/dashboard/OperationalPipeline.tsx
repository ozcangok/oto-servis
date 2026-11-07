import React from 'react';
import { ClipboardCheck, Package, UserRound, Wrench } from 'lucide-react';
import type { OfflineOrder } from '../../services/offlineAnalytics.js';

interface OperationalPipelineProps {
  orders: OfflineOrder[];
  onOpenOrder: (id: number) => void;
}

type StageKey = 'kabul' | 'onarimda' | 'parca_bekliyor' | 'teslime_hazir';

const STAGE_META: Array<{ key: StageKey; label: string; hint: string; className: string }> = [
  { key: 'kabul', label: 'Araç Kabul', hint: 'Yeni gelenler', className: 'accepted' },
  { key: 'onarimda', label: 'Onarımda', hint: 'İşlem görenler', className: 'repairing' },
  { key: 'parca_bekliyor', label: 'Parça Bekliyor', hint: 'Tedarik bekleyenler', className: 'parts' },
  { key: 'teslime_hazir', label: 'Teslime Hazır', hint: 'Teslim edilecekler', className: 'ready' }
];

function normalizeStage(status?: string | null): StageKey {
  const s = String(status ?? '').toLocaleLowerCase('tr-TR');
  if (s === 'onarimda' || s === 'onarımda' || s === 'repairing') return 'onarimda';
  if (s === 'parca_bekliyor' || s === 'waiting_parts') return 'parca_bekliyor';
  if (s === 'teslime_hazir' || s === 'tamamlandı' || s === 'tamamlandi' || s === 'ready') return 'teslime_hazir';
  return 'kabul';
}

export const OperationalPipeline: React.FC<OperationalPipelineProps> = ({ orders, onOpenOrder }) => {
  const active = orders.filter(
    (o) => !['teslim_edildi', 'delivered', 'iptal', 'cancelled'].includes(String(o.durum ?? '').toLocaleLowerCase('tr-TR'))
  );

  const counts = STAGE_META.reduce<Record<StageKey, number>>((acc, stage) => {
    acc[stage.key] = active.filter((o) => normalizeStage(o.durum) === stage.key).length;
    return acc;
  }, { kabul: 0, onarimda: 0, parca_bekliyor: 0, teslime_hazir: 0 });

  const assigned = active.filter((o) => o.atanan?.full_name).slice(0, 6);
  const unassigned = active.filter((o) => !o.atanan?.full_name);

  return (
    <section className="card pipeline-card" aria-labelledby="pipeline-title">
      <div className="pipeline-head">
        <div>
          <div className="ai-kicker">
            <ClipboardCheck size={16} strokeWidth={1.9} aria-hidden="true" />
            Operasyon akışı
          </div>
          <h2 id="pipeline-title">Aktif İş Emri Durumu</h2>
        </div>
        <span className="pipeline-total">{active.length} aktif iş</span>
      </div>

      <div className="pipeline-stages">
        {STAGE_META.map((stage) => (
          <div className={`pipeline-stage ${stage.className}`} key={stage.key}>
            <span className="pipeline-stage-icon">
              {stage.key === 'parca_bekliyor' ? (
                <Package size={16} strokeWidth={1.9} aria-hidden="true" />
              ) : stage.key === 'teslime_hazir' ? (
                <ClipboardCheck size={16} strokeWidth={1.9} aria-hidden="true" />
              ) : (
                <Wrench size={16} strokeWidth={1.9} aria-hidden="true" />
              )}
            </span>
            <span className="pipeline-stage-label">{stage.label}</span>
            <b>{counts[stage.key]}</b>
            <span className="pipeline-stage-hint">{stage.hint}</span>
          </div>
        ))}
      </div>

      <div className="pipeline-assigned">
        <div className="ai-section-title">
          <UserRound size={15} strokeWidth={1.9} aria-hidden="true" />
          Atanan teknisyen görevleri
        </div>
        {assigned.length > 0 ? (
          <div className="pipeline-task-list">
            {assigned.map((order) => (
              <button
                key={String(order.id ?? order.plaka)}
                type="button"
                className="pipeline-task"
                onClick={() => order.id !== undefined && onOpenOrder(Number(order.id))}
              >
                <span className="pipeline-task-plate">{order.plaka || 'Plaka yok'}</span>
                <span className="pipeline-task-main">
                  <b>{order.atanan?.full_name}</b>
                  <span>
                    {[order.arac_marka, order.arac_model].filter(Boolean).join(' ') || 'Araç bilgisi yok'}
                    {order.musteri_ad ? ` · ${order.musteri_ad}` : ''}
                  </span>
                </span>
                <span className={`badge ${normalizeStage(order.durum) === 'teslime_hazir' ? 'ok' : normalizeStage(order.durum) === 'parca_bekliyor' ? 'warn' : 'neu'}`}>
                  {STAGE_META.find((s) => s.key === normalizeStage(order.durum))?.label}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="staff-notes-empty">Atanmış teknisyen görevi yok.</p>
        )}
        {unassigned.length > 0 && (
          <p className="pipeline-unassigned">
            {unassigned.length} aktif işte teknisyen ataması yok. Dükkan sahibi iş emrinden atama yapabilir.
          </p>
        )}
      </div>
    </section>
  );
};
