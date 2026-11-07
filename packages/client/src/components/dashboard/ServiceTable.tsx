import React from 'react';
import { ArrowUpRight, Clock3, Wrench } from 'lucide-react';
import type { OfflineOrder } from '../../services/offlineAnalytics.js';
import { money } from '../../services/ui.js';
import { PlateBadge } from '../PlateInput.js';

interface ServiceTableProps {
  orders: OfflineOrder[];
  showFinancials: boolean;
  onSelectVehicle: (plate: string) => void;
  onOpenOrder: (id: number) => void;
  onShowAll?: () => void;
}

interface StatusMeta {
  label: string;
  tone: 'ok' | 'warn' | 'bad' | 'neu';
}

function statusMeta(status?: string | null): StatusMeta {
  const s = String(status ?? '').toLocaleLowerCase('tr-TR');
  if (s === 'teslime_hazir' || s === 'tamamlandı' || s === 'tamamlandi' || s === 'ready') {
    return { label: 'Teslime hazır', tone: 'ok' };
  }
  if (s === 'parca_bekliyor' || s === 'waiting_parts') {
    return { label: 'Parça bekliyor', tone: 'warn' };
  }
  if (s === 'onarimda' || s === 'onarımda' || s === 'repairing') {
    return { label: 'Onarımda', tone: 'warn' };
  }
  if (s === 'teslim_edildi' || s === 'delivered') {
    return { label: 'Teslim edildi', tone: 'ok' };
  }
  if (s === 'iptal' || s === 'cancelled') {
    return { label: 'İptal', tone: 'bad' };
  }
  return { label: 'Kabul edildi', tone: 'neu' };
}

function deliveryEstimate(order: OfflineOrder): string {
  const s = String(order.durum ?? '').toLocaleLowerCase('tr-TR');
  if (s === 'teslim_edildi' || s === 'delivered') return 'Teslim edildi';
  if (s === 'teslime_hazir' || s === 'tamamlandı' || s === 'tamamlandi' || s === 'ready') return 'Bugün';
  if (s === 'parca_bekliyor' || s === 'waiting_parts') return 'Parça sonrası';
  if (s === 'onarimda' || s === 'onarımda' || s === 'repairing') return '1–2 gün';
  return 'Planlanıyor';
}

export const ServiceTable: React.FC<ServiceTableProps> = ({
  orders,
  showFinancials,
  onSelectVehicle,
  onOpenOrder,
  onShowAll
}) => {
  return (
    <section className="card service-table-card" aria-labelledby="service-table-title">
      <div className="service-table-head">
        <div>
          <div className="chart-kicker">
            <Wrench size={15} strokeWidth={1.8} aria-hidden="true" />
            Canlı servis
          </div>
          <h2 id="service-table-title">Serviste olan araçlar</h2>
        </div>
        {onShowAll && (
          <button className="svc-head-link" type="button" onClick={onShowAll}>
            Tümünü gör <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        )}
      </div>

      {orders.length > 0 ? (
        <div className="service-table-scroll">
          <table className="service-table svc">
            <thead>
              <tr>
                <th>Plaka</th>
                <th>Araç / Model</th>
                <th>Müşteri</th>
                <th>Durum</th>
                <th>Teslim</th>
                {showFinancials ? <th className="num">Tutar</th> : <th>Teknisyen</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const status = statusMeta(order.durum);
                return (
                  <tr
                    key={String(order.id ?? order.plaka)}
                    onClick={() => {
                      if (order.id !== undefined) onOpenOrder(Number(order.id));
                      else if (order.plaka) onSelectVehicle(String(order.plaka));
                    }}
                  >
                    <td>
                      <button
                        type="button"
                        className="plate-link"
                        onClick={(event) => {
                          event.stopPropagation();
                          if (order.plaka) onSelectVehicle(String(order.plaka));
                        }}
                      >
                        <PlateBadge plate={order.plaka || '—'} />
                      </button>
                    </td>
                    <td>
                      <div className="service-model">
                        <b>{[order.arac_marka, order.arac_model].filter(Boolean).join(' ') || 'Araç bilgisi yok'}</b>
                        <span>{order.sikayet || 'İşlem notu yok'}</span>
                      </div>
                    </td>
                    <td>
                      <span className="service-customer">{order.musteri_ad || 'Müşteri belirtilmemiş'}</span>
                    </td>
                    <td>
                      <span className={`badge ${status.tone}`}>
                        <span className="dot" aria-hidden="true" />
                        {status.label}
                      </span>
                    </td>
                    <td>
                      <span className="service-delivery">
                        <Clock3 size={14} strokeWidth={1.8} aria-hidden="true" />
                        {deliveryEstimate(order)}
                      </span>
                    </td>
                    {showFinancials ? (
                      <td className="num service-amount">{money(Number(order.brut_tutar_kurus) || 0)}</td>
                    ) : (
                      <td>
                        <span className="service-tech">{order.atanan?.full_name || 'Atanmadı'}</span>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="svc-empty">
          <b>Serviste araç yok</b>
          <span>Yeni bir iş emri açarak başlayın.</span>
        </div>
      )}

      <div className="service-table-foot">
        <span>{orders.length} araç listeleniyor</span>
        <span>Canlı veri · yerel SQLite</span>
      </div>
    </section>
  );
};
