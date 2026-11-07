import React, { useMemo } from 'react';
import {
  Bell,
  CalendarDays,
  Lock,
  Package,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Wrench
} from 'lucide-react';
import { dayNameTr, dayPart } from '@oto-servis/shared';
import { useSettings } from '../../contexts/SettingsContext.js';

interface WelcomeBannerProps {
  user?: any;
  isPrivileged?: boolean;
  inShopCount: number;
  readyCount: number;
  pendingPartsCount: number;
  todayAppointments: number;
  onNewWorkOrder: () => void;
  onFocusSearch: () => void;
  onLockScreen?: () => void;
}

function greetingFor(date: Date): string {
  const part = dayPart(date);
  if (part === 'morning') return 'Günaydın';
  if (part === 'afternoon') return 'İyi Günler';
  return 'İyi Akşamlar';
}

function displayName(user?: any): string {
  const raw = String(user?.full_name || user?.name || user?.username || 'Değerli Kullanıcı');
  return raw.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim() || 'Değerli Kullanıcı';
}

function longDateTR(date: Date): string {
  const day = new Intl.DateTimeFormat('tr-TR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(date);
  return `${day} · ${dayNameTr(date)}`;
}

export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({
  user,
  isPrivileged = false,
  inShopCount,
  readyCount,
  pendingPartsCount,
  todayAppointments,
  onNewWorkOrder,
  onFocusSearch,
  onLockScreen
}) => {
  const { companyProfile } = useSettings();
  const now = useMemo(() => new Date(), []);
  const privilegedFirstName =
    String(user?.full_name || companyProfile.owner).trim().split(/\s+/)[0] || 'Sezer';
  const greeting = isPrivileged
    ? `İyi Çalışmalar, ${privilegedFirstName} Bey`
    : `${greetingFor(now)}, ${displayName(user)}`;

  return (
    <section className="welcome-banner" aria-labelledby="welcome-title">
      <div className="welcome-glow" aria-hidden="true" />
      <div className="welcome-main">
        <div className="welcome-topline">
          <span className="welcome-shop">
            <span className="welcome-shop-mark" aria-hidden="true">
              <Wrench size={14} strokeWidth={2.2} />
            </span>
            {companyProfile.name}
          </span>
          <span className="welcome-date">
            <CalendarDays size={14} strokeWidth={1.8} aria-hidden="true" />
            {longDateTR(now)}
          </span>
        </div>

        <h1 className="welcome-title" id="welcome-title">
          {greeting}
        </h1>
        <p className="welcome-copy">
          {isPrivileged
            ? 'Servisin nabzı tek ekranda. AI destekli yerel analiz, açık iş emirleri ve günlük yoğunluk özeti hazır.'
            : 'Aktif araçlar, iş akışı ve günlük servis notları tek ekranda. Bu görünümde finansal veriler yer almaz.'}
        </p>

        <div className="welcome-status-row" aria-label="Canlı servis durumu">
          <span className="welcome-status live">
            <span className="pulse-dot" aria-hidden="true" />
            Servis canlı
          </span>
          <span className="welcome-status">
            <Wrench size={14} strokeWidth={1.8} aria-hidden="true" />
            {inShopCount} araç takipte
          </span>
          <span className="welcome-status">
            <ShieldCheck size={14} strokeWidth={1.8} aria-hidden="true" />
            {readyCount} teslime hazır
          </span>
          <span className="welcome-status warn">
            <Package size={14} strokeWidth={1.8} aria-hidden="true" />
            {pendingPartsCount} parça bekliyor
          </span>
          <span className="welcome-status">
            <CalendarDays size={14} strokeWidth={1.8} aria-hidden="true" />
            Bugün {todayAppointments} kabul
          </span>
        </div>

        <div className="welcome-actions hero-actions">
          <button className="btn btn-primary" type="button" onClick={onNewWorkOrder}>
            <Plus size={18} strokeWidth={1.9} aria-hidden="true" />
            Yeni iş emri
          </button>
          <button className="btn welcome-search-btn" type="button" onClick={onFocusSearch}>
            <Search size={18} strokeWidth={1.9} aria-hidden="true" />
            Plaka ara
          </button>
          <a
            className="icon-btn bare welcome-reminders"
            href="#/hatirlaticilar"
            title="Hatırlatıcılar"
            aria-label="Hatırlatıcılar"
          >
            <Bell size={18} strokeWidth={1.8} aria-hidden="true" />
          </a>
          {onLockScreen && (
            <button
              className="icon-btn bare welcome-lock"
              type="button"
              onClick={onLockScreen}
              title="Ekranı kilitle"
              aria-label="Ekranı kilitle"
              data-testid="lock-now"
            >
              <Lock size={18} strokeWidth={1.8} aria-hidden="true" />
            </button>
          )}
          {isPrivileged ? (
            <span className="welcome-ai-chip">
              <Sparkles size={14} strokeWidth={1.9} aria-hidden="true" />
              Offline AI
            </span>
          ) : (
            <span className="welcome-ai-chip staff">
              <ShieldCheck size={14} strokeWidth={1.9} aria-hidden="true" />
              Operasyon modu
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
