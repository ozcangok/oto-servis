import React from 'react';
import { CalendarClock, CheckCircle2, ClipboardList, Package, Wrench } from 'lucide-react';
import type { OfflineOrder } from '../../services/offlineAnalytics.js';

interface StaffNotesPanelProps {
  notes: string[];
  orders: OfflineOrder[];
  onOpenOrder?: (id: number) => void;
}

function statusLabel(status?: string | null): string {
  const s = String(status ?? '').toLocaleLowerCase('tr-TR');
  if (s === 'teslime_hazir' || s === 'tamamlandı' || s === 'tamamlandi' || s === 'ready') return 'Teslime hazır';
  if (s === 'parca_bekliyor' || s === 'waiting_parts') return 'Parça bekliyor';
  if (s === 'onarimda' || s === 'onarımda' || s === 'repairing') return 'Onarımda';
  if (s === 'teslim_edildi' || s === 'delivered') return 'Teslim edildi';
  return 'Kabul edildi';
}

export const StaffNotesPanel: React.FC<StaffNotesPanelProps> = ({ notes, orders, onOpenOrder }) => {
  const active = orders
    .filter((o) => !['teslim_edildi', 'delivered'].includes(String(o.durum ?? '').toLocaleLowerCase('tr-TR')))
    .slice(0, 5);

  return (
    <section className="card staff-notes" aria-labelledby="staff-notes-title">
      <div className="staff-notes-head">
        <div>
          <div className="ai-kicker">
            <ClipboardList size={16} strokeWidth={1.9} aria-hidden="true" />
            Operasyon notları
          </div>
          <h2 id="staff-notes-title">Günlük Servis Notları</h2>
        </div>
        <span className="staff-notes-badge">
          <Wrench size={13} strokeWidth={1.9} aria-hidden="true" />
          Teknisyen görünümü
        </span>
      </div>

      <ul className="staff-note-list">
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>

      <div className="staff-notes-sub">
        <div className="ai-section-title">
          <CalendarClock size={15} strokeWidth={1.9} aria-hidden="true" />
          Aktif işler ve teslim takvimi
        </div>
        {active.length > 0 ? (
          <div className="staff-task-list">
            {active.map((order) => (
              <button
                key={String(order.id ?? order.plaka)}
                type="button"
                className="staff-task"
                onClick={() => {
                  if (order.id !== undefined && onOpenOrder) onOpenOrder(Number(order.id));
                }}
              >
                <span className="staff-task-plate">{order.plaka || 'Plaka yok'}</span>
                <span className="staff-task-main">
                  <b>{[order.arac_marka, order.arac_model].filter(Boolean).join(' ') || 'Araç bilgisi yok'}</b>
                  <span>{order.musteri_ad || 'Müşteri belirtilmemiş'}</span>
                </span>
                <span className={`badge ${statusLabel(order.durum) === 'Teslime hazır' ? 'ok' : statusLabel(order.durum) === 'Parça bekliyor' ? 'warn' : 'neu'}`}>
                  {statusLabel(order.durum) === 'Teslime hazır' ? <CheckCircle2 size={12} /> : statusLabel(order.durum) === 'Parça bekliyor' ? <Package size={12} /> : null}
                  {statusLabel(order.durum)}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="staff-notes-empty">Aktif iş yok. Yeni iş emri açıldığında burada görünür.</p>
        )}
      </div>

      <div className="ai-foot">
        <span>Finansal veriler bu görünümde gösterilmez.</span>
      </div>
    </section>
  );
};
