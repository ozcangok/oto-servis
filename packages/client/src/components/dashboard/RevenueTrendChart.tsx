import React, { useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import { ArrowUpRight, BarChart3, CalendarRange } from 'lucide-react';
import type { OfflineOrder } from '../../services/offlineAnalytics.js';
import { orderDateKey, toDateKey } from '../../services/calendar.js';
import { formatCurrency } from '@oto-servis/shared';

interface RevenueTrendChartProps {
  orders: OfflineOrder[];
}

interface TrendPoint {
  key: string;
  label: string;
  vehicles: number;
  revenue: number;
}

function buildTrend(orders: OfflineOrder[], days: number): TrendPoint[] {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  start.setDate(start.getDate() - (days - 1));

  const bucket = new Map<string, { vehicles: number; revenue: number }>();
  for (const order of orders) {
    const key = orderDateKey(order.giris_tarihi ?? order.tarih);
    if (!key) continue;
    const current = bucket.get(key) ?? { vehicles: 0, revenue: 0 };
    current.vehicles += 1;
    current.revenue += (Number(order.brut_tutar_kurus) || 0) / 100;
    bucket.set(key, current);
  }

  const formatter = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short' });

  return Array.from({ length: days }, (_, i) => {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const key = toDateKey(date);
    const value = bucket.get(key) ?? { vehicles: 0, revenue: 0 };
    return {
      key,
      label: formatter.format(date),
      vehicles: value.vehicles,
      revenue: Math.round(value.revenue * 100) / 100
    };
  });
}

function TrendTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as TrendPoint | undefined;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-title">{label}</div>
      <div className="chart-tooltip-row">
        <span><i className="legend-dot revenue" /> Ciro</span>
        <b>{formatCurrency(Math.round((point?.revenue ?? 0) * 100))}</b>
      </div>
      <div className="chart-tooltip-row">
        <span><i className="legend-dot vehicles" /> Araç kabulü</span>
        <b>{point?.vehicles ?? 0}</b>
      </div>
    </div>
  );
}

export const RevenueTrendChart: React.FC<RevenueTrendChartProps> = ({ orders }) => {
  const [range, setRange] = useState<7 | 30>(30);
  const data = useMemo(() => buildTrend(orders, range), [orders, range]);
  const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
  const totalVehicles = data.reduce((sum, d) => sum + d.vehicles, 0);

  return (
    <section className="card chart-card" aria-labelledby="trend-title">
      <div className="chart-card-head">
        <div>
          <div className="chart-kicker">
            <BarChart3 size={15} strokeWidth={1.8} aria-hidden="true" />
            Finansal nabız
          </div>
          <h2 id="trend-title">Gelir & Araç Kabul Trendi</h2>
          <p className="chart-sub">
            Son {range} günde {totalVehicles} araç kabulü · {formatCurrency(Math.round(totalRevenue * 100))} ciro
          </p>
        </div>
        <div className="chart-range" role="group" aria-label="Trend aralığı">
          <button
            type="button"
            aria-pressed={range === 7}
            onClick={() => setRange(7)}
          >
            7G
          </button>
          <button
            type="button"
            aria-pressed={range === 30}
            onClick={() => setRange(30)}
          >
            30G
          </button>
        </div>
      </div>

      <div className="chart-wrap">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 22, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueStroke" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="#E63946" stopOpacity={0.65} />
                <stop offset="100%" stopColor="#FF7A84" stopOpacity={1} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke="rgba(148,163,184,.12)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#8FA0C0', fontSize: 11 }}
              tickLine={false}
              axisLine={{ stroke: 'rgba(148,163,184,.18)' }}
              minTickGap={18}
            />
            <YAxis
              yAxisId="revenue"
              tick={{ fill: '#8FA0C0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => {
                if (v >= 1000) {
                  const k = v / 1000;
                  return `${Number.isInteger(k) ? k : k.toFixed(1).replace('.', ',')}K`;
                }
                return String(v);
              }}
              width={42}
            />
            <YAxis
              yAxisId="vehicles"
              orientation="right"
              allowDecimals={false}
              tick={{ fill: '#8FA0C0', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              width={28}
            />
            <Tooltip content={<TrendTooltip />} cursor={{ fill: 'rgba(230,57,70,.06)' }} />
            <Legend
              verticalAlign="bottom"
              height={28}
              iconType="circle"
              formatter={(value) => <span className="chart-legend-label">{value}</span>}
            />
            <Bar
              yAxisId="vehicles"
              dataKey="vehicles"
              name="Araç kabulü"
              fill="rgba(122,162,255,.55)"
              radius={[4, 4, 0, 0]}
              maxBarSize={16}
              isAnimationActive={false}
            />
            <Line
              yAxisId="revenue"
              type="monotone"
              dataKey="revenue"
              name="Ciro (₺)"
              stroke="url(#revenueStroke)"
              strokeWidth={2.4}
              dot={false}
              activeDot={{ r: 4, fill: '#E63946', stroke: '#fff', strokeWidth: 2 }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="chart-foot">
        <span><CalendarRange size={14} /> {data[0]?.label} — {data[data.length - 1]?.label}</span>
        <span className="chart-foot-trend">
          <ArrowUpRight size={14} /> Yerel veriden hesaplanır
        </span>
      </div>
    </section>
  );
};
