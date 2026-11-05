import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CalendarDays,
  Car,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardList,
  CreditCard,
  Gauge,
  PackageSearch,
  Plus,
  Receipt,
  Search,
  Settings,
  Sparkles,
  TrendingUp,
  UserRound,
  Wallet,
  Wrench,
  X
} from 'lucide-react';
import { apiRequest } from '../services/api.js';
import { NewVehicleModal } from '../components/NewVehicleModal.js';
import { formatPlateDisplay, WORK_ORDER_STATUSES, type WorkOrderStatus } from '@oto-servis/shared';

/* -------------------------------------------------------------------------- */
/*  Tipler                                                                     */
/* -------------------------------------------------------------------------- */

interface DashboardUser {
  id: number;
  username: string;
  full_name: string;
  role: 'owner' | 'staff';
}

interface DashboardScreenProps {
  currentUser: DashboardUser;
  shopName: string;
  refreshToken?: number;
  onNewWorkOrder: (plate?: string) => void;
  onOpenWorkOrder: (id: number) => void;
  onNavigate: (tab: 'sorgu' | 'arac' | 'musteri' | 'parca' | 'cari' | 'kasa' | 'gider' | 'hatirlat' | 'panel') => void;
  onOpenSettings: () => void;
  onLockScreen: () => void;
  onLogout: () => void;
  onSwitchUser?: (username: string, password: string) => Promise<void>;
}

interface OrderRow {
  id: number;
  plaka?: string | null;
  musteri_ad?: string | null;
  arac_marka?: string | null;
  arac_model?: string | null;
  durum: WorkOrderStatus;
  giris_tarihi?: string | null;
  brut_tutar_kurus?: number;
  net_tutar_kurus?: number;
  toplam_tutar_kurus?: number;
  kalan_tutar_kurus?: number;
  atanan?: { id: number; full_name: string; username: string } | null;
  olusturan_kullanici_id?: number;
  [key: string]: any;
}

interface PartRow {
  id: number;
  ad: string;
  kod?: string;
  stok_miktari?: number;
  kritik_stok?: number;
  satis_kurus?: number;
  [key: string]: any;
}

interface ExpenseRow {
  id: number;
  tarih: string;
  kategori: string;
  aciklama: string;
  tutar_kurus: number;
}

interface PartRequestRow {
  id: number;
  parca_ad: string;
  adet: number;
  durum: 'bekliyor' | 'onaylandi' | 'reddedildi';
  talep_eden_ad?: string | null;
  plaka?: string | null;
  notlar?: string | null;
  created_at: string;
  [key: string]: any;
}

interface InvoiceRow {
  id: number;
  fatura_no: string;
  tarih: string;
  tutar_kurus: number;
  durum: 'kesildi' | 'iptal';
  plaka?: string | null;
  musteri_ad?: string | null;
  is_emri_id: number;
}

type Aralik = '1H' | '1A' | '3A' | '6A' | '1Y';

/* -------------------------------------------------------------------------- */
/*  Yardımcılar                                                                */
/* -------------------------------------------------------------------------- */

const tl = (deger: number) =>
  new Intl.NumberFormat('tr-TR', {
    style: 'currency',
    currency: 'TRY',
    maximumFractionDigits: 0
  }).format(deger || 0);

const eksenTl = (deger: number) =>
  new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(deger || 0);

const dateKey = (value?: string | null) => (value ? String(value).split('T')[0] : '');

const monthKey = (value?: string | null) => dateKey(value).slice(0, 7);

const orderAmount = (order: OrderRow) =>
  Number(order.brut_tutar_kurus ?? order.toplam_tutar_kurus ?? 0);

const orderRemaining = (order: OrderRow) => Number(order.kalan_tutar_kurus ?? 0);

const statusMeta: Record<
  string,
  { label: string; badge: string; dot: string; select: string }
> = {
  kabul: {
    label: 'Araç Kabul',
    badge: 'border-sky-400/20 bg-sky-500/10 text-sky-300',
    dot: 'bg-sky-400',
    select: 'border-sky-400/20 bg-sky-500/10 text-sky-200'
  },
  onarimda: {
    label: 'Bakımda',
    badge: 'border-amber-400/20 bg-amber-500/10 text-amber-300',
    dot: 'bg-amber-400',
    select: 'border-amber-400/20 bg-amber-500/10 text-amber-200'
  },
  parca_bekliyor: {
    label: 'Parça Bekliyor',
    badge: 'border-orange-400/20 bg-orange-500/10 text-orange-300',
    dot: 'bg-orange-400',
    select: 'border-orange-400/20 bg-orange-500/10 text-orange-200'
  },
  teslime_hazir: {
    label: 'Teslime Hazır',
    badge: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
    select: 'border-emerald-400/20 bg-emerald-500/10 text-emerald-200'
  },
  teslim_edildi: {
    label: 'Teslim Edildi',
    badge: 'border-zinc-400/20 bg-zinc-500/10 text-zinc-300',
    dot: 'bg-zinc-400',
    select: 'border-zinc-400/20 bg-zinc-500/10 text-zinc-200'
  }
};

const staffTransitions: WorkOrderStatus[] = [
  'kabul',
  'onarimda',
  'parca_bekliyor',
  'teslime_hazir'
];

function CamKart({
  children,
  className = '',
  style
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      style={style}
      className={`relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_24px_70px_-30px_rgba(0,0,0,0.85)] backdrop-blur-xl ${className}`}
    >
      <div className="pointer-events-none absolute inset-x-6 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      {children}
    </div>
  );
}

function TrendTooltip(props: any) {
  const { active, payload, label, isOwner } = props;
  if (!active || !payload || payload.length === 0) return null;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#141419]/95 px-4 py-3 shadow-2xl backdrop-blur-xl">
      <p className="mb-2 text-[11px] font-medium text-zinc-400">{label}</p>
      <div className="space-y-1.5">
        {payload.map((item: any) => (
          <div key={item.dataKey} className="flex items-center gap-2 text-[11px]">
            <span className="h-2 w-2 rounded-full" style={{ background: item.stroke }} />
            <span className="text-zinc-400">
              {item.dataKey === 'ciro'
                ? 'Ciro'
                : item.dataKey === 'gider'
                  ? 'Gider'
                  : 'İş emri'}
            </span>
            <span className="ml-auto pl-4 font-semibold tabular-nums text-zinc-100">
              {item.dataKey === 'adet' ? `${item.value} adet` : tl(Number(item.value))}
            </span>
          </div>
        ))}
      </div>
      {!isOwner && <p className="mt-1 text-[9px] text-zinc-600">Finansal veriler gizlidir.</p>}
    </div>
  );
}

function StatusBadge({ durum }: { durum: string }) {
  const meta = statusMeta[durum] || statusMeta.kabul;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium ${meta.badge}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  );
}

function Modal({
  title,
  subtitle,
  onClose,
  children,
  wide
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div
        className={`max-h-[90vh] w-full overflow-y-auto rounded-3xl border border-white/10 bg-[#101014]/95 p-6 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.9)] backdrop-blur-2xl ${
          wide ? 'max-w-2xl' : 'max-w-lg'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-white">{title}</h3>
            {subtitle && <p className="mt-1 text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Kapat"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-zinc-400 transition hover:border-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </div>
    </div>
  );
}

const inputClass =
  'w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-zinc-100 outline-none transition placeholder:text-zinc-600 focus:border-purple-400/40 focus:ring-2 focus:ring-purple-500/20';

const labelClass =
  'mb-1.5 block text-[11px] font-medium uppercase tracking-[0.14em] text-zinc-500';

/* -------------------------------------------------------------------------- */
/*  Panel                                                                      */
/* -------------------------------------------------------------------------- */

export function DashboardScreen({
  currentUser,
  shopName,
  refreshToken = 0,
  onNewWorkOrder,
  onOpenWorkOrder,
  onNavigate,
  onOpenSettings,
  onLockScreen,
  onLogout,
  onSwitchUser
}: DashboardScreenProps) {
  const isOwner = currentUser.role === 'owner';

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [expenseSummary, setExpenseSummary] = useState<any>(null);
  const [cash, setCash] = useState<any>(null);
  const [partRequests, setPartRequests] = useState<PartRequestRow[]>([]);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);

  const [aralik, setAralik] = useState<Aralik>('1A');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [bildirim, setBildirim] = useState<{ tur: 'ok' | 'hata'; metin: string } | null>(null);

  const [switchUser, setSwitchUser] = useState('');
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchBusy, setSwitchBusy] = useState(false);
  const [switchError, setSwitchError] = useState<string | null>(null);

  const doSwitchUser = async () => {
    if (!onSwitchUser) return;
    if (!switchUser.trim() || !switchPassword) {
      setSwitchError('Hesap değiştirmek için kullanıcı adı ve parola gerekli.');
      return;
    }
    setSwitchBusy(true);
    setSwitchError(null);
    try {
      await onSwitchUser(switchUser.trim(), switchPassword);
    } catch (e: any) {
      setSwitchError(e?.message || 'Hesap değiştirilemedi.');
    } finally {
      setSwitchBusy(false);
    }
  };

  const [vehicleModal, setVehicleModal] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<OrderRow | null>(null);
  const [invoiceNote, setInvoiceNote] = useState('');
  const [partModal, setPartModal] = useState<{ orderId?: number } | null>(null);

  const showToast = (tur: 'ok' | 'hata', metin: string) => setBildirim({ tur, metin });

  useEffect(() => {
    if (!bildirim) return;
    const timer = window.setTimeout(() => setBildirim(null), 3600);
    return () => window.clearTimeout(timer);
  }, [bildirim]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const baseRequests: Promise<any>[] = [
        apiRequest('/work-orders?limit=100'),
        apiRequest('/parts?limit=500')
      ];

      if (isOwner) {
        baseRequests.push(
          apiRequest('/auth/users'),
          apiRequest('/expenses?period=year'),
          apiRequest('/expenses?period=month'),
          apiRequest('/cash-desk/summary'),
          apiRequest('/invoices?limit=100'),
          apiRequest('/part-requests?limit=100')
        );
      } else {
        baseRequests.push(apiRequest('/part-requests?limit=50'));
      }

      const responses = await Promise.allSettled(baseRequests);
      const value = (index: number) => {
        const r = responses[index];
        return r.status === 'fulfilled' ? r.value : null;
      };

      const ordersRes = value(0);
      const partsRes = value(1);

      setOrders(ordersRes?.success ? ordersRes.items || [] : []);
      setParts(partsRes?.success ? partsRes.items || [] : []);

      if (isOwner) {
        const usersRes = value(2);
        const expensesYearRes = value(3);
        const expensesMonthRes = value(4);
        const cashRes = value(5);
        const invoicesRes = value(6);
        const requestsRes = value(7);

        setUsers(usersRes?.success ? usersRes.users || [] : []);
        setExpenses(expensesYearRes?.success ? expensesYearRes.items || [] : []);
        setExpenseSummary(expensesMonthRes?.success ? expensesMonthRes.summary || null : null);
        setCash(cashRes?.success ? cashRes.summary || null : null);
        setInvoices(invoicesRes?.success ? invoicesRes.invoices || [] : []);
        setPartRequests(requestsRes?.success ? requestsRes.requests || [] : []);
      } else {
        const requestsRes = value(2);
        setUsers([]);
        setExpenses([]);
        setExpenseSummary(null);
        setCash(null);
        setInvoices([]);
        setPartRequests(requestsRes?.success ? requestsRes.requests || [] : []);
      }
    } catch (err: any) {
      setError(err?.message || 'Panel verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [isOwner]);

  useEffect(() => {
    void load();
  }, [load, refreshToken]);

  const filteredOrders = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return orders;
    return orders.filter((o) =>
      `${o.plaka || ''} ${o.musteri_ad || ''} ${o.arac_marka || ''} ${o.arac_model || ''} ${
        o.atanan?.full_name || ''
      }`
        .toLocaleLowerCase('tr-TR')
        .includes(q)
    );
  }, [orders, query]);

  const activeOrders = useMemo(
    () => orders.filter((o) => ['kabul', 'onarimda', 'parca_bekliyor'].includes(o.durum)),
    [orders]
  );

  const parcaBekleyen = useMemo(
    () => orders.filter((o) => o.durum === 'parca_bekliyor').length,
    [orders]
  );

  const teslimeHazir = useMemo(
    () => orders.filter((o) => o.durum === 'teslime_hazir').length,
    [orders]
  );

  const currentMonth = new Date().toISOString().slice(0, 7);
  const previousMonthDate = new Date();
  previousMonthDate.setMonth(previousMonthDate.getMonth() - 1);
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);

  const monthRevenue = useMemo(
    () =>
      orders
        .filter((o) => monthKey(o.giris_tarihi || o.tarih || o.created_at) === currentMonth)
        .reduce((sum, o) => sum + orderAmount(o), 0),
    [orders, currentMonth]
  );

  const previousMonthRevenue = useMemo(
    () =>
      orders
        .filter((o) => monthKey(o.giris_tarihi || o.tarih || o.created_at) === previousMonth)
        .reduce((sum, o) => sum + orderAmount(o), 0),
    [orders, previousMonth]
  );

  const revenueChange = useMemo(() => {
    if (previousMonthRevenue <= 0) return monthRevenue > 0 ? 100 : 0;
    return ((monthRevenue - previousMonthRevenue) / previousMonthRevenue) * 100;
  }, [monthRevenue, previousMonthRevenue]);

  const completedThisMonth = useMemo(
    () =>
      orders.filter(
        (o) =>
          o.durum === 'teslim_edildi' &&
          monthKey(o.kapanis_tarihi || o.giris_tarihi || o.tarih) === currentMonth
      ).length,
    [orders, currentMonth]
  );

  const receivables = useMemo(
    () => orders.reduce((sum, o) => sum + Math.max(0, orderRemaining(o)), 0),
    [orders]
  );

  const criticalParts = useMemo(
    () =>
      parts.filter(
        (p) => Number(p.stok_miktari || 0) <= Number(p.kritik_stok || 0)
      ),
    [parts]
  );

  const pendingRequests = useMemo(
    () => partRequests.filter((r) => r.durum === 'bekliyor'),
    [partRequests]
  );

  const invoicedOrderIds = useMemo(
    () =>
      new Set(
        invoices
          .filter((i) => i.durum === 'kesildi')
          .map((i) => Number(i.is_emri_id))
      ),
    [invoices]
  );

  const todayInvoices = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return invoices.filter((i) => dateKey(i.tarih) === today && i.durum === 'kesildi');
  }, [invoices]);

  const staffPerformance = useMemo(() => {
    const staff = users.filter((u) => u.role === 'staff');
    return staff
      .map((u) => {
        const own = orders.filter(
          (o) => (o.atanan?.id ?? o.olusturan_kullanici_id) === u.id
        );
        return {
          user: u,
          total: own.length,
          active: own.filter((o) => ['kabul', 'onarimda', 'parca_bekliyor'].includes(o.durum)).length,
          ready: own.filter((o) => o.durum === 'teslime_hazir').length,
          revenue: own.reduce((sum, o) => sum + orderAmount(o), 0)
        };
      })
      .sort((a, b) => b.total - a.total);
  }, [users, orders]);

  const trendData = useMemo(() => {
    const now = new Date();
    const buckets: { key: string; ad: string; ciro: number; gider: number; adet: number }[] = [];

    if (aralik === '1H' || aralik === '1A') {
      const days = aralik === '1H' ? 7 : 30;
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(now.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        const ad =
          aralik === '1H'
            ? d.toLocaleDateString('tr-TR', { weekday: 'short' })
            : `${d.getDate()}`;
        buckets.push({ key, ad, ciro: 0, gider: 0, adet: 0 });
      }
    } else {
      const months = aralik === '3A' ? 3 : aralik === '6A' ? 6 : 12;
      for (let i = months - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        buckets.push({
          key,
          ad: d.toLocaleDateString('tr-TR', { month: 'short' }),
          ciro: 0,
          gider: 0,
          adet: 0
        });
      }
    }

    const map = new Map(buckets.map((b) => [b.key, b]));

    for (const o of orders) {
      const raw = o.giris_tarihi || o.tarih || o.created_at;
      const key = aralik === '1H' || aralik === '1A' ? dateKey(raw) : monthKey(raw);
      const bucket = map.get(key);
      if (bucket) {
        bucket.ciro += orderAmount(o);
        bucket.adet += 1;
      }
    }

    for (const e of expenses) {
      const key = aralik === '1H' || aralik === '1A' ? dateKey(e.tarih) : monthKey(e.tarih);
      const bucket = map.get(key);
      if (bucket) bucket.gider += Number(e.tutar_kurus || 0);
    }

    return buckets;
  }, [orders, expenses, aralik]);

  const trendTotal = useMemo(
    () => trendData.reduce((sum, b) => sum + (isOwner ? b.ciro : b.adet), 0),
    [trendData, isOwner]
  );

  const insights = useMemo(() => {
    const items: { renk: string; metin: string }[] = [];
    if (parcaBekleyen > 0)
      items.push({
        renk: 'bg-amber-400',
        metin: `${parcaBekleyen} araç parça bekliyor; tedarik siparişi planlanabilir.`
      });
    if (criticalParts.length > 0)
      items.push({
        renk: 'bg-fuchsia-400',
        metin: `${criticalParts.length} parça kritik stok seviyesinde veya altında.`
      });
    if (isOwner && receivables > 0)
      items.push({
        renk: 'bg-emerald-400',
        metin: `${tl(receivables)} tahsilat bekliyor; cari takibi önerilir.`
      });
    if (isOwner && revenueChange !== 0)
      items.push({
        renk: revenueChange >= 0 ? 'bg-emerald-400' : 'bg-rose-400',
        metin: `Aylık ciro geçen aya göre %${Math.abs(revenueChange).toFixed(1)} ${
          revenueChange >= 0 ? 'arttı' : 'azaldı'
        }.`
      });
    if (items.length === 0)
      items.push({ renk: 'bg-emerald-400', metin: 'Tüm iş emirleri planlandığı gibi ilerliyor.' });
    return items.slice(0, 3);
  }, [parcaBekleyen, criticalParts, receivables, revenueChange, isOwner]);

  const recommendation = useMemo(() => {
    if (criticalParts.length > 0)
      return 'Kritik stoktaki parçalar için toplu sipariş oluşturun.';
    if (receivables > 0 && isOwner)
      return 'Vadesi geçen carileri arayarak tahsilat akışını hızlandırın.';
    if (parcaBekleyen > 0) return 'Parça bekleyen araçlar için tedarikçi teslim tarihini doğrulayın.';
    return 'Günlük iş planını gözden geçirip teslime hazır araçları bilgilendirin.';
  }, [criticalParts, receivables, parcaBekleyen, isOwner]);

  /* ----------------------------- Eylemler ----------------------------- */

  const updateStatus = async (order: OrderRow, durum: WorkOrderStatus) => {
    if (durum === order.durum) return;
    setBusyId(order.id);
    try {
      const res = await apiRequest(`/work-orders/${order.id}/status`, {
        method: 'PUT',
        body: JSON.stringify({ durum })
      });
      if (res.success) {
        showToast('ok', `${order.plaka || 'İş emri'} · ${statusMeta[durum]?.label || durum} olarak güncellendi.`);
        await load();
      } else {
        showToast('hata', res.error || 'Durum güncellenemedi.');
      }
    } catch (err: any) {
      showToast('hata', err?.message || 'Durum güncellenemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const issueInvoice = async () => {
    if (!invoiceOrder) return;
    setBusyId(invoiceOrder.id);
    try {
      const res = await apiRequest('/invoices', {
        method: 'POST',
        body: JSON.stringify({ is_emri_id: invoiceOrder.id, notlar: invoiceNote.trim() || null })
      });
      if (res.success) {
        showToast('ok', `${res.invoice?.fatura_no || 'Fatura'} oluşturuldu; WhatsApp bildirimi kuyruğa eklendi.`);
        setInvoiceOrder(null);
        setInvoiceNote('');
        await load();
      } else {
        showToast('hata', res.error || 'Fatura kesilemedi.');
      }
    } catch (err: any) {
      showToast('hata', err?.message || 'Fatura kesilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePartRequestSaved = async (message: string) => {
    setPartModal(null);
    showToast('ok', message);
    await load();
  };

  const approveRequest = async (id: number) => {
    setBusyId(id);
    try {
      const res = await apiRequest(`/part-requests/${id}/onayla`, { method: 'PATCH' });
      if (res.success) {
        showToast('ok', 'Parça talebi onaylandı ve stoğa eklendi.');
        await load();
      } else {
        showToast('hata', res.error || 'Talep onaylanamadı.');
      }
    } catch (err: any) {
      showToast('hata', err?.message || 'Talep onaylanamadı.');
    } finally {
      setBusyId(null);
    }
  };

  const rejectRequest = async (id: number) => {
    setBusyId(id);
    try {
      const res = await apiRequest(`/part-requests/${id}/reddet`, { method: 'PATCH' });
      if (res.success) {
        showToast('ok', 'Parça talebi reddedildi.');
        await load();
      } else {
        showToast('hata', res.error || 'Talep reddedilemedi.');
      }
    } catch (err: any) {
      showToast('hata', err?.message || 'Talep reddedilemedi.');
    } finally {
      setBusyId(null);
    }
  };

  const initials = (name: string) =>
    name
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0])
      .join('')
      .toLocaleUpperCase('tr-TR');

  const todayLabel = new Date().toLocaleDateString('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    weekday: 'long'
  });

  const kpis: {
    etiket: string;
    deger: string;
    degisim: string;
    yon: 'up' | 'down';
    alt: string;
    ikon: LucideIcon;
    ikonStil: string;
    ilerleme: number;
  }[] = isOwner
    ? [
        {
          etiket: 'Aylık Servis Cirosu',
          deger: tl(monthRevenue),
          degisim: `%${Math.abs(revenueChange).toFixed(1)}`,
          yon: revenueChange >= 0 ? 'up' : 'down',
          alt: `Geçen ay: ${tl(previousMonthRevenue)}`,
          ikon: Wallet,
          ikonStil: 'from-purple-500/25 to-fuchsia-500/10 text-purple-300',
          ilerleme: Math.min(100, Math.max(4, (monthRevenue / Math.max(1, previousMonthRevenue || monthRevenue)) * 70))
        },
        {
          etiket: 'Servisteki Araçlar',
          deger: String(activeOrders.length),
          degisim: `%${parcaBekleyen > 0 ? Math.round((parcaBekleyen / Math.max(1, activeOrders.length)) * 100) : 0}`,
          yon: 'up',
          alt: `${parcaBekleyen} araç parça bekliyor`,
          ikon: Car,
          ikonStil: 'from-sky-500/25 to-cyan-500/10 text-sky-300',
          ilerleme: Math.min(100, activeOrders.length * 8)
        },
        {
          etiket: 'Bu Ay Tamamlanan',
          deger: String(completedThisMonth),
          degisim: `${teslimeHazir}`,
          yon: 'up',
          alt: `${teslimeHazir} iş teslime hazır`,
          ikon: CheckCircle2,
          ikonStil: 'from-emerald-500/25 to-teal-500/10 text-emerald-300',
          ilerleme: Math.min(100, completedThisMonth * 8)
        },
        {
          etiket: 'Tahsil Edilecek',
          deger: tl(receivables),
          degisim: `${orders.filter((o) => orderRemaining(o) > 0).length}`,
          yon: 'down',
          alt: `${orders.filter((o) => orderRemaining(o) > 0).length} açık cari`,
          ikon: Banknote,
          ikonStil: 'from-amber-500/25 to-orange-500/10 text-amber-300',
          ilerleme: Math.min(100, Math.round((receivables / Math.max(1, monthRevenue || receivables)) * 100))
        }
      ]
    : [
        {
          etiket: 'Bana Atanan İşler',
          deger: String(orders.length),
          degisim: `${activeOrders.length}`,
          yon: 'up',
          alt: `${activeOrders.length} aktif iş`,
          ikon: ClipboardList,
          ikonStil: 'from-purple-500/25 to-fuchsia-500/10 text-purple-300',
          ilerleme: Math.min(100, orders.length * 10)
        },
        {
          etiket: 'Bakımda',
          deger: String(orders.filter((o) => o.durum === 'onarimda').length),
          degisim: `${parcaBekleyen}`,
          yon: 'up',
          alt: `${parcaBekleyen} parça bekliyor`,
          ikon: Wrench,
          ikonStil: 'from-amber-500/25 to-orange-500/10 text-amber-300',
          ilerleme: Math.min(100, orders.filter((o) => o.durum === 'onarimda').length * 14)
        },
        {
          etiket: 'Teslime Hazır',
          deger: String(teslimeHazir),
          degisim: `${orders.filter((o) => o.durum === 'teslime_hazir').length}`,
          yon: 'up',
          alt: 'Teslimata hazır araç',
          ikon: CheckCircle2,
          ikonStil: 'from-emerald-500/25 to-teal-500/10 text-emerald-300',
          ilerleme: Math.min(100, teslimeHazir * 16)
        },
        {
          etiket: 'Kritik Parça',
          deger: String(criticalParts.length),
          degisim: `${pendingRequests.length}`,
          yon: 'down',
          alt: `${pendingRequests.length} bekleyen talep`,
          ikon: PackageSearch,
          ikonStil: 'from-orange-500/25 to-rose-500/10 text-orange-300',
          ilerleme: Math.min(100, criticalParts.length * 12)
        }
      ];

  return (
    <div className="oto-panel relative min-h-[calc(100dvh-1px)] overflow-hidden bg-[#0b0b0e] px-4 pb-14 pt-6 text-zinc-100 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-48 h-[560px] w-[560px] rounded-full bg-purple-600/20 blur-[150px]" />
        <div className="absolute -right-32 top-0 h-[460px] w-[460px] rounded-full bg-pink-600/15 blur-[150px]" />
        <div className="absolute bottom-[-240px] left-1/3 h-[520px] w-[760px] rounded-full bg-indigo-600/10 blur-[170px]" />
        <div
          className="absolute inset-0 opacity-40"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.055) 1px, transparent 1px)',
            backgroundSize: '30px 30px'
          }}
        />
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-500/60 to-transparent" />
      </div>

      <div className="relative mx-auto max-w-[1480px]">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg shadow-purple-900/40 ring-1 ring-inset ring-white/20">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
                {shopName || 'Oto Servis'}
              </p>
              <p className="text-sm font-semibold text-zinc-200">Yönetim Paneli</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="hidden items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 backdrop-blur-xl lg:flex">
              <Search className="h-4 w-4 text-zinc-500" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Araç, plaka veya müşteri ara…"
                className="w-48 bg-transparent text-sm text-zinc-200 outline-none placeholder:text-zinc-500"
              />
            </div>

            {isOwner && (
              <button
                onClick={() => setVehicleModal(true)}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[11px] font-medium text-zinc-300 backdrop-blur-xl transition hover:border-white/20 hover:text-white"
              >
                <Car className="h-3.5 w-3.5" />
                Araç Ekle
              </button>
            )}

            {!isOwner && (
              <button
                onClick={() => setPartModal({})}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-[11px] font-medium text-zinc-300 backdrop-blur-xl transition hover:border-white/20 hover:text-white"
              >
                <PackageSearch className="h-3.5 w-3.5" />
                Parça İste
              </button>
            )}

            {isOwner && (
              <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-1.5">
                <UserRound className="h-3.5 w-3.5 text-zinc-500" />
                <select
                  value={switchUser}
                  onChange={(e) => setSwitchUser(e.target.value)}
                  className="max-w-[140px] bg-transparent text-[11px] text-zinc-200 outline-none"
                  aria-label="Hesap değiştirme"
                >
                  <option value="">Hesap seç…</option>
                  {users
                    .filter((u) => u.role === 'staff')
                    .map((u) => (
                      <option key={u.id} value={u.username}>
                        {u.full_name} (@{u.username})
                      </option>
                    ))}
                </select>
                <input
                  type="password"
                  value={switchPassword}
                  onChange={(e) => setSwitchPassword(e.target.value)}
                  placeholder="Parola"
                  className="w-24 bg-transparent text-[11px] text-zinc-200 outline-none placeholder:text-zinc-500"
                />
                <button
                  type="button"
                  onClick={() => void doSwitchUser()}
                  disabled={switchBusy}
                  className="rounded-lg border border-white/10 bg-white/[0.04] px-2 py-1 text-[10px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white disabled:opacity-50"
                >
                  {switchBusy ? 'Değiştiriliyor…' : 'Değiştir'}
                </button>
                {switchError && <span className="text-[10px] text-rose-300">{switchError}</span>}
              </div>
            )}

            <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] py-1.5 pl-1.5 pr-3 backdrop-blur-xl">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 text-[11px] font-bold text-white">
                {initials(currentUser.full_name || currentUser.username)}
              </div>
              <div className="hidden leading-tight sm:block">
                <p className="text-xs font-semibold text-zinc-100">{currentUser.full_name}</p>
                <p className="text-[10px] text-zinc-500">
                  {isOwner ? 'İşletme Sahibi' : 'Personel'}
                </p>
              </div>
              {/* Çıkış ve ekran kilidi kabukta (kenar çubuğunda) tek yerden
                  yönetilir; panelde yinelenen düğme koymuyoruz. */}
            </div>
          </div>
        </header>

        <section className="mt-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-400 backdrop-blur-xl">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
              </span>
              Servis canlı · {activeOrders.length} araç işlemde
            </div>
            <h1 className="max-w-2xl text-3xl font-semibold tracking-tight text-white sm:text-[40px] sm:leading-[1.08]">
              Hoş Geldiniz,{' '}
              <span className="bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 bg-clip-text text-transparent">
                {currentUser.full_name}
              </span>
            </h1>
            <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-zinc-400">
              {isOwner
                ? `Bugün ${activeOrders.length} araç işlemde, ${teslimeHazir} iş emri teslime hazır. ${tl(receivables)} tahsilat bekliyor.`
                : `Size atanan ${orders.length} iş emrinden ${orders.filter((o) => o.durum === 'onarimda').length} tanesi bakımda, ${teslimeHazir} tanesi teslime hazır.`}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs text-zinc-400 backdrop-blur-xl">
              <CalendarDays className="h-4 w-4 text-purple-400" />
              {todayLabel}
            </div>
            {isOwner ? (
              <button
                onClick={() => onNewWorkOrder()}
                className="group inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-pink-600 px-4 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:shadow-xl hover:shadow-purple-900/60"
              >
                <Plus className="h-4 w-4" />
                Yeni İş Emri
                <ArrowUpRight className="h-3.5 w-3.5 opacity-80 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            ) : (
              <button
                onClick={() => onNavigate('sorgu')}
                className="group inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs font-semibold text-zinc-200 backdrop-blur-xl transition hover:border-white/20 hover:text-white"
              >
                İşlerimi Gör
                <ArrowUpRight className="h-3.5 w-3.5 opacity-80 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
            )}
          </div>
        </section>

        {error && (
          <div className="mt-5 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-xs text-rose-200">
            {error}
          </div>
        )}

        <section className="mt-7 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((istatistik, indeks) => {
            const Ikon = istatistik.ikon;
            const yukari = istatistik.yon === 'up';
            const Ok = yukari ? ArrowUpRight : ArrowDownRight;
            return (
              <CamKart key={istatistik.etiket} className="animate-fade-up p-5" style={{ animationDelay: `${indeks * 70}ms` }}>
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${istatistik.ikonStil} ring-1 ring-inset ring-white/10`}
                  >
                    <Ikon className="h-5 w-5" />
                  </div>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                      yukari
                        ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                        : 'border-rose-400/20 bg-rose-500/10 text-rose-300'
                    }`}
                  >
                    <Ok className="h-3 w-3" />
                    {istatistik.degisim}
                  </span>
                </div>
                <p className="mt-5 text-[10px] font-medium uppercase tracking-[0.18em] text-zinc-500">
                  {istatistik.etiket}
                </p>
                <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-tight text-white tabular-nums">
                  {istatistik.deger}
                </p>
                <div className="mt-5 flex items-center gap-2.5">
                  <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                      style={{ width: `${Math.min(100, Math.max(2, istatistik.ilerleme))}%` }}
                    />
                  </div>
                  <span className="whitespace-nowrap text-[10px] text-zinc-500">{istatistik.alt}</span>
                </div>
              </CamKart>
            );
          })}
        </section>

        <section className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-12">
          {/* İş emirleri */}
          <CamKart className="flex animate-fade-up flex-col p-0 xl:col-span-8 xl:row-span-2" style={{ animationDelay: '300ms' }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-5 py-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  {isOwner ? 'Servisteki Araçlar' : 'Bana Atanan İş Emirleri'}
                </h2>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {loading ? 'Yükleniyor…' : `${filteredOrders.length} kayıt · güncelleme az önce`}
                </p>
              </div>
              <button
                onClick={() => onNavigate('sorgu')}
                className="group inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
              >
                Tümünü gör
                <ChevronRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </button>
            </div>

            <div className="scrollbar-thin min-h-[320px] flex-1 overflow-auto">
              <table className="w-full text-left md:min-w-[640px]">
                <thead className="sticky top-0 z-10 bg-[#121216]/95 backdrop-blur-xl">
                  <tr className="text-[10px] uppercase tracking-[0.16em] text-zinc-500">
                    <th className="px-3 py-3 font-medium sm:px-5">Plaka</th>
                    <th className="hidden px-3 py-3 font-medium sm:table-cell sm:px-5">Araç / Müşteri</th>
                    {isOwner && <th className="hidden px-3 py-3 font-medium md:table-cell md:px-5">Atanan</th>}
                    <th className="px-3 py-3 font-medium sm:px-5">Durum</th>
                    {isOwner && <th className="px-3 py-3 text-right font-medium sm:px-5">Tutar</th>}
                    <th className="px-3 py-3 text-right font-medium sm:px-5">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.length === 0 && !loading && (
                    <tr>
                      <td colSpan={isOwner ? 6 : 4} className="px-5 py-10 text-center text-xs text-zinc-500">
                        {isOwner ? 'Henüz iş emri yok.' : 'Size atanmış iş emri bulunmuyor.'}
                      </td>
                    </tr>
                  )}
                  {filteredOrders.map((order) => {
                    const meta = statusMeta[order.durum] || statusMeta.kabul;
                    const transitions = isOwner
                      ? (Object.keys(statusMeta) as WorkOrderStatus[])
                      : staffTransitions;
                    const invoiced = invoicedOrderIds.has(order.id);
                    return (
                      <tr key={order.id} className="border-t border-white/5 transition hover:bg-white/[0.03]">
                        <td className="px-3 py-3 sm:px-5">
                          <button
                            onClick={() => onOpenWorkOrder(order.id)}
                            className="flex items-center gap-2.5 rounded-lg border-0 bg-transparent p-0 text-left"
                          >
                            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/5 ring-1 ring-inset ring-white/10">
                              <Car className="h-3.5 w-3.5 text-zinc-400" />
                            </div>
                            <div>
                              <p className="font-mono text-[11px] font-semibold tracking-wider text-zinc-100">
                                {formatPlateDisplay(order.plaka || '')}
                              </p>
                              <p className="text-[10px] text-zinc-600">
                                {dateKey(order.giris_tarihi || order.tarih)
                                  ? new Date(order.giris_tarihi || order.tarih || '').toLocaleDateString('tr-TR')
                                  : '—'}{' '}
                                giriş
                              </p>
                            </div>
                          </button>
                        </td>
                        <td className="hidden px-3 py-3 text-[11px] text-zinc-300 sm:table-cell sm:px-5">
                          <p>
                            {[order.arac_marka, order.arac_model].filter(Boolean).join(' ') || 'Araç'}
                          </p>
                          <p className="text-[10px] text-zinc-600">{order.musteri_ad || '—'}</p>
                        </td>
                        {isOwner && (
                          <td className="hidden px-3 py-3 text-[11px] text-zinc-400 md:table-cell md:px-5">
                            {order.atanan?.full_name || 'Atanmadı'}
                          </td>
                        )}
                        <td className="px-3 py-3 sm:px-5">
                          <div className="relative inline-flex items-center">
                            <span
                              className={`pointer-events-none inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[10px] font-medium ${meta.badge}`}
                            >
                              <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
                              {meta.label}
                            </span>
                            <select
                              value={order.durum}
                              disabled={busyId === order.id}
                              onChange={(e) => updateStatus(order, e.target.value as WorkOrderStatus)}
                              aria-label="Durum güncelle"
                              className="absolute inset-0 cursor-pointer opacity-0"
                            >
                              {transitions.map((durum) => (
                                <option key={durum} value={durum} className="bg-[#141419]">
                                  {WORK_ORDER_STATUSES[durum]?.label || durum}
                                </option>
                              ))}
                            </select>
                          </div>
                        </td>
                        {isOwner && (
                          <td className="whitespace-nowrap px-3 py-3 text-right text-[11px] font-semibold tabular-nums text-zinc-200 sm:px-5">
                            {tl(orderAmount(order))}
                          </td>
                        )}
                        <td className="whitespace-nowrap px-3 py-3 text-right sm:px-5">
                          {isOwner ? (
                            invoiced ? (
                              <span className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300">
                                <Receipt className="h-3 w-3" />
                                Faturalandı
                              </span>
                            ) : (
                              <button
                                onClick={() => {
                                  setInvoiceOrder(order);
                                  setInvoiceNote('');
                                }}
                                disabled={busyId === order.id || orderAmount(order) <= 0}
                                className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Receipt className="h-3 w-3" />
                                Fatura Kes
                              </button>
                            )
                          ) : (
                            <button
                              onClick={() => setPartModal({ orderId: order.id })}
                              className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
                            >
                              <PackageSearch className="h-3 w-3" />
                              Parça İste
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CamKart>

          {/* Kasa (owner) / Parça durumu (staff) */}
          <CamKart className="animate-fade-up p-5 xl:col-span-4" style={{ animationDelay: '360ms' }}>
            {isOwner ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Kasa Durumu</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Bugünkü tahsilat dağılımı</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/25 to-teal-500/10 text-emerald-300 ring-1 ring-inset ring-white/10">
                    <Wallet className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-4 text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {tl(Number(cash?.totalCollectedKurus || 0))}
                </p>
                <p className="text-[10px] text-zinc-500">bugünkü toplam tahsilat</p>

                <div className="mt-4 space-y-3">
                  {[
                    { etiket: 'Nakit', deger: Number(cash?.byMethod?.nakit || 0), renk: 'from-emerald-500 to-teal-500', ikon: Banknote },
                    { etiket: 'Kredi Kartı', deger: Number(cash?.byMethod?.kredi_karti || 0), renk: 'from-sky-500 to-cyan-500', ikon: CreditCard },
                    { etiket: 'Havale / EFT', deger: Number(cash?.byMethod?.havale || 0), renk: 'from-purple-500 to-fuchsia-500', ikon: TrendingUp }
                  ].map((satir) => {
                    const Ikon = satir.ikon;
                    const oran = Math.min(
                      100,
                      Math.round((satir.deger / Math.max(1, Number(cash?.totalCollectedKurus || 0))) * 100)
                    );
                    return (
                      <div key={satir.etiket}>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="inline-flex items-center gap-1.5 text-zinc-400">
                            <Ikon className="h-3 w-3" />
                            {satir.etiket}
                          </span>
                          <span className="font-medium tabular-nums text-zinc-200">{tl(satir.deger)}</span>
                        </div>
                        <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/5">
                          <div
                            className={`h-full rounded-full bg-gradient-to-r ${satir.renk}`}
                            style={{ width: `${oran}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Tahsil edilecek</p>
                    <p className="mt-0.5 text-[11px] font-medium text-amber-300">{tl(receivables)}</p>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2">
                    <p className="text-[9px] uppercase tracking-[0.12em] text-zinc-500">Bugün fatura</p>
                    <p className="mt-0.5 text-[11px] font-medium text-emerald-300">
                      {todayInvoices.length} · {tl(todayInvoices.reduce((s, i) => s + i.tutar_kurus, 0))}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => onNavigate('kasa')}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.07]"
                >
                  Kasa raporunu aç
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Parça Durumu</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Kritik stok ve talepler</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/25 to-rose-500/10 text-orange-300 ring-1 ring-inset ring-white/10">
                    <PackageSearch className="h-5 w-5" />
                  </div>
                </div>

                <p className="mt-4 text-2xl font-semibold tracking-tight text-white tabular-nums">
                  {criticalParts.length}
                </p>
                <p className="text-[10px] text-zinc-500">kritik stoktaki parça</p>

                <div className="mt-4 space-y-2">
                  {criticalParts.slice(0, 4).map((part) => (
                    <div
                      key={part.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-2"
                    >
                      <span className="truncate text-[11px] text-zinc-300">{part.ad}</span>
                      <span className="shrink-0 rounded-full border border-orange-400/20 bg-orange-500/10 px-2 py-0.5 text-[10px] font-medium text-orange-300">
                        {part.stok_miktari ?? 0} / {part.kritik_stok ?? 0}
                      </span>
                    </div>
                  ))}
                  {criticalParts.length === 0 && (
                    <p className="rounded-xl border border-white/5 bg-white/[0.02] px-2.5 py-3 text-[11px] text-zinc-500">
                      Kritik stokta parça yok.
                    </p>
                  )}
                </div>

                <button
                  onClick={() => setPartModal({})}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-500 to-rose-500 px-4 py-2.5 text-[11px] font-semibold text-white shadow-lg shadow-orange-900/30 transition hover:shadow-xl"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Yeni Parça Talebi
                </button>

                <div className="mt-3 flex items-center justify-between text-[10px] text-zinc-500">
                  <span>Bekleyen talepler</span>
                  <span className="font-medium text-zinc-300">{pendingRequests.length}</span>
                </div>
              </>
            )}
          </CamKart>

          {/* Grafik */}
          <CamKart className="animate-fade-up p-5 xl:col-span-8" style={{ animationDelay: '420ms' }}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-zinc-100">
                  {isOwner ? 'Servis Performansı & Ciro Trendi' : 'Haftalık İş Yoğunluğu'}
                </h2>
                <div className="mt-2 flex flex-wrap items-baseline gap-2">
                  <span className="text-2xl font-semibold tracking-tight text-white tabular-nums">
                    {isOwner ? tl(trendTotal) : `${trendTotal} iş`}
                  </span>
                  {isOwner && (
                    <span
                      className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${
                        revenueChange >= 0
                          ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                          : 'border-rose-400/20 bg-rose-500/10 text-rose-300'
                      }`}
                    >
                      <TrendingUp className="h-3 w-3" />
                      %{Math.abs(revenueChange).toFixed(1)}
                    </span>
                  )}
                  <span className="text-[10px] text-zinc-500">seçili dönem toplamı</span>
                </div>
              </div>

              <div className="flex rounded-xl border border-white/10 bg-white/[0.03] p-1">
                {(['1H', '1A', '3A', '6A', '1Y'] as Aralik[]).map((secenek) => (
                  <button
                    key={secenek}
                    onClick={() => setAralik(secenek)}
                    className={`rounded-lg border-0 bg-transparent px-2.5 py-1.5 text-[11px] font-medium transition ${
                      aralik === secenek
                        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-900/30'
                        : 'text-zinc-400 hover:text-white'
                    }`}
                  >
                    {secenek}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-5 h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trendData} margin={{ top: 8, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ciroGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a855f7" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="giderGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ec4899" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#ec4899" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="adetGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis
                    dataKey="ad"
                    tickLine={false}
                    axisLine={false}
                    tick={{ fill: '#71717a', fontSize: 11 }}
                    dy={8}
                    minTickGap={20}
                  />
                  {isOwner ? (
                    <>
                      <YAxis
                        yAxisId="ciro"
                        tickLine={false}
                        axisLine={false}
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        tickFormatter={(deger) => eksenTl(Number(deger))}
                        width={58}
                      />
                      <YAxis yAxisId="gider" orientation="right" hide />
                    </>
                  ) : (
                    <YAxis
                      yAxisId="adet"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fill: '#71717a', fontSize: 10 }}
                      width={32}
                      allowDecimals={false}
                    />
                  )}

                  <Tooltip
                    content={<TrendTooltip isOwner={isOwner} />}
                    cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeDasharray: '4 4' }}
                  />

                  {isOwner ? (
                    <>
                      <Area
                        yAxisId="ciro"
                        type="monotone"
                        dataKey="ciro"
                        stroke="#a855f7"
                        strokeWidth={2.5}
                        fill="url(#ciroGrad)"
                        dot={false}
                        activeDot={{ r: 5, fill: '#a855f7', stroke: '#0b0b0e', strokeWidth: 3 }}
                      />
                      <Area
                        yAxisId="gider"
                        type="monotone"
                        dataKey="gider"
                        stroke="#ec4899"
                        strokeWidth={1.8}
                        strokeDasharray="5 5"
                        fill="url(#giderGrad)"
                        dot={false}
                        activeDot={{ r: 4, fill: '#ec4899', stroke: '#0b0b0e', strokeWidth: 2 }}
                      />
                    </>
                  ) : (
                    <Area
                      yAxisId="adet"
                      type="monotone"
                      dataKey="adet"
                      stroke="#38bdf8"
                      strokeWidth={2.5}
                      fill="url(#adetGrad)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#38bdf8', stroke: '#0b0b0e', strokeWidth: 3 }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-3 flex items-center gap-5 text-[10px] text-zinc-500">
              {isOwner ? (
                <>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-4 rounded-full bg-purple-500" />
                    Ciro (₺)
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-1.5 w-4 rounded-full bg-pink-500" />
                    Gider (₺)
                  </span>
                </>
              ) : (
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-1.5 w-4 rounded-full bg-sky-500" />
                  İş emri adedi
                </span>
              )}
            </div>
          </CamKart>

          {/* Akıllı özet */}
          <CamKart className="flex animate-fade-up flex-col p-5 xl:col-span-4" style={{ animationDelay: '480ms' }}>
            <div className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full bg-purple-600/25 blur-3xl" />
            <div className="relative flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-pink-600 shadow-lg shadow-purple-900/40 ring-1 ring-inset ring-white/20">
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-zinc-100">Akıllı Servis Özeti</p>
                  <p className="text-[10px] text-zinc-500">Canlı verilerden · az önce</p>
                </div>
              </div>
              <span className="rounded-full border border-emerald-400/20 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                Aktif
              </span>
            </div>

            <p className="relative mt-4 text-xs leading-relaxed text-zinc-400">
              {isOwner
                ? `Bugün ${activeOrders.length} araç işlemde; ${parcaBekleyen} araç parça bekliyor ve ${criticalParts.length} parça kritik stokta.`
                : `Size atanan ${orders.length} iş emrinden ${teslimeHazir} tanesi teslime hazır. ${criticalParts.length} parça kritik stokta.`}
            </p>

            <div className="relative mt-4 space-y-2.5">
              {insights.map((satir) => (
                <div key={satir.metin} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${satir.renk}`} />
                  <p className="text-[11px] leading-relaxed text-zinc-400">{satir.metin}</p>
                </div>
              ))}
            </div>

            <div className="relative mt-4 rounded-2xl border border-purple-400/15 bg-purple-500/[0.06] px-3.5 py-3">
              <p className="text-[9px] font-medium uppercase tracking-[0.16em] text-purple-300/80">
                Önerilen aksiyon
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-zinc-300">{recommendation}</p>
            </div>

            <div className="relative mt-auto pt-5">
              <div className="flex items-center justify-between text-[10px] text-zinc-500">
                <span>Veri doluluğu</span>
                <span className="font-medium text-zinc-300">%{Math.min(98, 55 + orders.length * 3)}</span>
              </div>
              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500"
                  style={{ width: `${Math.min(98, 55 + orders.length * 3)}%` }}
                />
              </div>
            </div>
          </CamKart>

          {isOwner ? (
            <>
              {/* Personel performansı */}
              <CamKart className="animate-fade-up p-5 xl:col-span-4" style={{ animationDelay: '540ms' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Personel Performansı</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Atanan iş emirlerine göre</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/25 to-cyan-500/10 text-sky-300 ring-1 ring-inset ring-white/10">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-4 space-y-3">
                  {staffPerformance.length === 0 && (
                    <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-4 text-[11px] text-zinc-500">
                      Henüz personel kaydı yok.
                    </p>
                  )}
                  {staffPerformance.slice(0, 4).map((satir) => {
                    const max = Math.max(1, ...staffPerformance.map((s) => s.total));
                    return (
                      <div key={satir.user.id}>
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="truncate text-zinc-300">{satir.user.full_name}</span>
                          <span className="ml-2 shrink-0 tabular-nums text-zinc-500">
                            {satir.total} iş · {satir.active} aktif
                          </span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-sky-500 to-cyan-400"
                            style={{ width: `${Math.max(4, (satir.total / max) * 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                <button
                  onClick={() => onNavigate('musteri')}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.07]"
                >
                  Personel ve cariler
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </CamKart>

              {/* Parça talepleri */}
              <CamKart className="animate-fade-up p-5 xl:col-span-4" style={{ animationDelay: '600ms' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Parça Talepleri</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">
                      {pendingRequests.length} bekleyen talep
                    </p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/25 to-rose-500/10 text-orange-300 ring-1 ring-inset ring-white/10">
                    <PackageSearch className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {pendingRequests.slice(0, 3).map((talep) => (
                    <div
                      key={talep.id}
                      className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-[11px] font-medium text-zinc-200">
                            {talep.parca_ad} · {talep.adet} adet
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-zinc-500">
                            {talep.talep_eden_ad || 'Personel'}
                            {talep.plaka ? ` · ${formatPlateDisplay(talep.plaka)}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            onClick={() => approveRequest(talep.id)}
                            disabled={busyId === talep.id}
                            className="rounded-lg border border-emerald-400/20 bg-emerald-500/10 px-2 py-1 text-[10px] font-medium text-emerald-300 transition hover:bg-emerald-500/20 disabled:opacity-40"
                          >
                            Onayla
                          </button>
                          <button
                            onClick={() => rejectRequest(talep.id)}
                            disabled={busyId === talep.id}
                            className="rounded-lg border border-rose-400/20 bg-rose-500/10 px-2 py-1 text-[10px] font-medium text-rose-300 transition hover:bg-rose-500/20 disabled:opacity-40"
                          >
                            Reddet
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                  {pendingRequests.length === 0 && (
                    <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-4 text-[11px] text-zinc-500">
                      Bekleyen parça talebi yok.
                    </p>
                  )}
                </div>

                <button
                  onClick={() => onNavigate('parca')}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[11px] font-medium text-zinc-200 transition hover:border-white/20 hover:bg-white/[0.07]"
                >
                  Stok yönetimini aç
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </button>
              </CamKart>
            </>
          ) : (
            <>
              {/* Bekleyen talepler (staff) */}
              <CamKart className="animate-fade-up p-5 xl:col-span-4" style={{ animationDelay: '540ms' }}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-sm font-semibold text-zinc-100">Taleplerim</h2>
                    <p className="mt-0.5 text-xs text-zinc-500">Parça taleplerinin durumu</p>
                  </div>
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-purple-500/25 to-fuchsia-500/10 text-purple-300 ring-1 ring-inset ring-white/10">
                    <ClipboardList className="h-5 w-5" />
                  </div>
                </div>

                <div className="mt-4 space-y-2">
                  {partRequests.slice(0, 4).map((talep) => (
                    <div
                      key={talep.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-medium text-zinc-200">
                          {talep.parca_ad} · {talep.adet} adet
                        </p>
                        <p className="mt-0.5 text-[10px] text-zinc-500">
                          {new Date(talep.created_at).toLocaleDateString('tr-TR')}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          talep.durum === 'onaylandi'
                            ? 'border-emerald-400/20 bg-emerald-500/10 text-emerald-300'
                            : talep.durum === 'reddedildi'
                              ? 'border-rose-400/20 bg-rose-500/10 text-rose-300'
                              : 'border-amber-400/20 bg-amber-500/10 text-amber-300'
                        }`}
                      >
                        {talep.durum === 'onaylandi'
                          ? 'Onaylandı'
                          : talep.durum === 'reddedildi'
                            ? 'Reddedildi'
                            : 'Bekliyor'}
                      </span>
                    </div>
                  ))}
                  {partRequests.length === 0 && (
                    <p className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-4 text-[11px] text-zinc-500">
                      Henüz parça talebiniz yok.
                    </p>
                  )}
                </div>
              </CamKart>
            </>
          )}

          {/* Hızlı işlemler */}
          <CamKart className="flex animate-fade-up flex-col p-5 xl:col-span-4" style={{ animationDelay: '660ms' }}>
            <h2 className="text-sm font-semibold text-zinc-100">Hızlı İşlemler</h2>
            <p className="mt-0.5 text-xs text-zinc-500">Günlük akışı hızlandırın</p>

            <button
              onClick={() => (isOwner ? onNewWorkOrder() : setPartModal({}))}
              className={`group mt-4 flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-[13px] font-semibold text-white shadow-lg transition hover:shadow-xl ${
                isOwner
                  ? 'bg-gradient-to-r from-purple-600 to-pink-600 shadow-purple-900/40 hover:shadow-purple-900/60'
                  : 'bg-gradient-to-r from-orange-500 to-rose-500 shadow-orange-900/30'
              }`}
            >
              <span className="flex items-center gap-2">
                {isOwner ? <Plus className="h-4 w-4" /> : <PackageSearch className="h-4 w-4" />}
                {isOwner ? 'Yeni İş Emri Oluştur' : 'Parça Talebi Oluştur'}
              </span>
              <ArrowUpRight className="h-4 w-4 opacity-80 transition group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </button>

            <div className={`mt-3 grid gap-2.5 ${isOwner ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {[
                ...(isOwner
                  ? [
                      { ikon: Car, etiket: 'Araç Ekle', eylem: () => setVehicleModal(true) },
                      { ikon: PackageSearch, etiket: 'Parça / Stok', eylem: () => onNavigate('parca') },
                      { ikon: Search, etiket: 'Araç Sorgu', eylem: () => onNavigate('sorgu') },
                      { ikon: Settings, etiket: 'Ayarlar', eylem: onOpenSettings }
                    ]
                  : [
                      { ikon: ClipboardList, etiket: 'İşlerim', eylem: () => onNavigate('sorgu') },
                      { ikon: PackageSearch, etiket: 'Parçalar', eylem: () => onNavigate('parca') },
                      { ikon: Plus, etiket: 'Yeni Talep', eylem: () => setPartModal({}) }
                    ])
              ].map((eylem) => {
                const Ikon = eylem.ikon;
                return (
                  <button
                    key={eylem.etiket}
                    onClick={eylem.eylem}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5 text-[11px] font-medium text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                  >
                    <Ikon className="h-3.5 w-3.5 text-zinc-400" />
                    {eylem.etiket}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 space-y-2.5">
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-zinc-500">
                Son hareketler
              </p>
              {orders.slice(0, 3).map((order) => (
                <div key={order.id} className="flex items-start gap-2.5">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${statusMeta[order.durum]?.dot || 'bg-zinc-600'}`} />
                  <p className="flex-1 text-[10px] leading-relaxed text-zinc-400">
                    {formatPlateDisplay(order.plaka || '')} · {statusMeta[order.durum]?.label || order.durum}
                  </p>
                  <span className="shrink-0 text-[10px] text-zinc-600">
                    {dateKey(order.giris_tarihi || order.tarih)
                      ? new Date(order.giris_tarihi || order.tarih || '').toLocaleDateString('tr-TR')
                      : '—'}
                  </span>
                </div>
              ))}
              {orders.length === 0 && (
                <p className="text-[10px] text-zinc-600">Henüz hareket yok.</p>
              )}
            </div>

            <div className="mt-auto flex items-center gap-2 rounded-2xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 text-[10px] text-zinc-500">
              <Gauge className="h-3.5 w-3.5 shrink-0 text-amber-400" />
              Aktif iş emri:
              <span className="font-medium text-zinc-300">{activeOrders.length}</span>
              · Teslime hazır:
              <span className="font-medium text-zinc-300">{teslimeHazir}</span>
            </div>
          </CamKart>
        </section>

        <footer className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-white/5 pt-5 text-[10px] text-zinc-600 sm:flex-row">
          <span>
            © {new Date().getFullYear()} {shopName || 'Oto Servis'} · Yönetim Paneli
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Sistem sağlıklı · veriler canlı API'den alınır
          </span>
        </footer>
      </div>

      {/* Araç ekle */}
      <NewVehicleModal
        isOpen={vehicleModal}
        onClose={() => setVehicleModal(false)}
        onSuccess={(vehicle) => {
          setVehicleModal(false);
          showToast('ok', `${formatPlateDisplay(vehicle?.plaka || vehicle?.plaka_gorunen || '')} aracı eklendi.`);
          void load();
        }}
      />

      {/* Fatura */}
      {invoiceOrder && (
        <Modal
          title="Fatura Kes"
          subtitle="Fatura kaydı oluşturulur ve WhatsApp bildirimi kuyruğa eklenir."
          onClose={() => {
            setInvoiceOrder(null);
            setInvoiceNote('');
          }}
        >
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="font-mono text-xs font-semibold tracking-wider text-zinc-100">
                  {formatPlateDisplay(invoiceOrder.plaka || '')}
                </p>
                <p className="mt-0.5 text-[11px] text-zinc-500">
                  {[invoiceOrder.arac_marka, invoiceOrder.arac_model].filter(Boolean).join(' ')} ·{' '}
                  {invoiceOrder.musteri_ad || '—'}
                </p>
              </div>
              <p className="text-lg font-semibold tabular-nums text-white">
                {tl(orderAmount(invoiceOrder))}
              </p>
            </div>
          </div>

          <label className="mt-4 block">
            <span className={labelClass}>Fatura Notu (isteğe bağlı)</span>
            <textarea
              value={invoiceNote}
              onChange={(e) => setInvoiceNote(e.target.value)}
              rows={3}
              placeholder="Ödeme koşulu, açıklama…"
              className={inputClass}
            />
          </label>

          <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => {
                setInvoiceOrder(null);
                setInvoiceNote('');
              }}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
            >
              Vazgeç
            </button>
            <button
              type="button"
              onClick={issueInvoice}
              disabled={busyId === invoiceOrder.id}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-purple-900/40 transition hover:shadow-purple-900/60 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Receipt className="h-3.5 w-3.5" />
              {busyId === invoiceOrder.id ? 'Kesiliyor…' : 'Faturayı Kes'}
            </button>
          </div>
        </Modal>
      )}

      {/* Parça talebi */}
      {partModal && (
        <PartRequestModal
          parts={parts}
          orders={orders.filter((o) => ['kabul', 'onarimda', 'parca_bekliyor'].includes(o.durum))}
          presetOrderId={partModal.orderId}
          onClose={() => setPartModal(null)}
          onSaved={handlePartRequestSaved}
        />
      )}

      {/* Bildirim */}
      {bildirim && (
        <div
          className={`animate-fade-up fixed bottom-6 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-2.5 rounded-2xl border px-4 py-3 text-[11px] text-zinc-100 shadow-2xl backdrop-blur-xl ${
            bildirim.tur === 'ok'
              ? 'border-emerald-400/20 bg-[#101014]/95'
              : 'border-rose-400/20 bg-[#101014]/95'
          }`}
        >
          {bildirim.tur === 'ok' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
          ) : (
            <X className="h-4 w-4 shrink-0 text-rose-400" />
          )}
          {bildirim.metin}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Parça talebi modalı                                                        */
/* -------------------------------------------------------------------------- */

function PartRequestModal({
  parts,
  orders,
  presetOrderId,
  onClose,
  onSaved
}: {
  parts: PartRow[];
  orders: OrderRow[];
  presetOrderId?: number;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [partId, setPartId] = useState<string>(parts.length > 0 ? String(parts[0].id) : '');
  const [manualName, setManualName] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [orderId, setOrderId] = useState<string>(presetOrderId ? String(presetOrderId) : '');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedPart = parts.find((p) => String(p.id) === partId);
  const useManual = partId === '__manual__' || parts.length === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = useManual ? manualName.trim() : selectedPart?.ad || '';
    if (!name) {
      setError('Parça seçin veya parça adı girin.');
      return;
    }
    const adet = Math.max(1, Number(quantity) || 1);

    setSaving(true);
    try {
      const res = await apiRequest('/part-requests', {
        method: 'POST',
        body: JSON.stringify({
          parca_id: useManual ? null : Number(partId),
          parca_ad: name,
          adet,
          is_emri_id: orderId ? Number(orderId) : null,
          notlar: note.trim() || null
        })
      });
      if (res.success) {
        onSaved(`${name} için ${adet} adet parça talebi oluşturuldu.`);
      } else {
        setError(res.error || 'Parça talebi oluşturulamadı.');
      }
    } catch (err: any) {
      setError(err?.message || 'Parça talebi oluşturulamadı.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title="Parça Talebi"
      subtitle="Stokta olmayan veya azalan parçayı dükkan sahibine bildirin."
      onClose={onClose}
    >
      <form onSubmit={submit}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelClass}>Parça</span>
            <div className="relative">
              <select
                value={partId}
                onChange={(e) => setPartId(e.target.value)}
                className={`${inputClass} appearance-none pr-9`}
              >
                {parts.map((part) => (
                  <option key={part.id} value={part.id} className="bg-[#141419]">
                    {part.ad} · stok {part.stok_miktari ?? 0}
                  </option>
                ))}
                <option value="__manual__" className="bg-[#141419]">
                  Listede yok (elle gir)
                </option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            </div>
          </label>

          {useManual && (
            <label className="block sm:col-span-2">
              <span className={labelClass}>Parça Adı</span>
              <input
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Örn. Fren balatası"
                className={inputClass}
              />
            </label>
          )}

          <label className="block">
            <span className={labelClass}>Adet</span>
            <input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className={labelClass}>İş Emri (isteğe bağlı)</span>
            <div className="relative">
              <select
                value={orderId}
                onChange={(e) => setOrderId(e.target.value)}
                className={`${inputClass} appearance-none pr-9`}
              >
                <option value="" className="bg-[#141419]">
                  İş emri seçilmedi
                </option>
                {orders.map((order) => (
                  <option key={order.id} value={order.id} className="bg-[#141419]">
                    {formatPlateDisplay(order.plaka || '')} · {order.musteri_ad || 'Müşteri'}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
            </div>
          </label>

          <label className="block sm:col-span-2">
            <span className={labelClass}>Not</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Tedarikçi, aciliyet vb."
              className={inputClass}
            />
          </label>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-[11px] text-rose-200">
            {error}
          </div>
        )}

        <div className="mt-6 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-2.5 text-xs font-medium text-zinc-300 transition hover:border-white/20 hover:text-white"
          >
            Vazgeç
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-rose-500 px-5 py-2.5 text-xs font-semibold text-white shadow-lg shadow-orange-900/30 transition hover:shadow-xl disabled:cursor-not-allowed disabled:opacity-40"
          >
            <PackageSearch className="h-3.5 w-3.5" />
            {saving ? 'Gönderiliyor…' : 'Talebi Gönder'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default DashboardScreen;
