import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowUpCircle,
  CheckCircle2,
  Download,
  RefreshCw,
  X
} from 'lucide-react';
import { toast } from '../services/ui.js';

/**
 * Masaüstü otomatik güncelleme bildirimi.
 *
 * Akış:
 *  - Ana süreç açılışta ve 4 saatte bir sessizce GitHub Releases'i kontrol eder.
 *  - Yeni sürüm varsa arka planda indirir (`autoDownload`).
 *  - İndirme bitince bu kart "Şimdi Güncelle" düğmesiyle görünür.
 *  - "Daha Sonra" denirse güncelleme, uygulama normal kapanırken kurulur
 *    (`autoInstallOnAppQuit`).
 */
export const UpdateBanner: React.FC = () => {
  const bridge = typeof window !== 'undefined' ? window.otoDesktop : undefined;
  const [status, setStatus] = useState<OtoUpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [manual, setManual] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!bridge?.onUpdateStatus) return;
    let alive = true;

    const initialStatus = bridge.getUpdateStatus?.();
    if (initialStatus) {
      void initialStatus
        .then((initial) => {
          if (alive && initial) setStatus(initial);
        })
        .catch(() => {});
    }

    const off = bridge.onUpdateStatus((next) => {
      if (!alive) return;
      setStatus(next);
      if (next.state === 'downloaded') setDismissed(false);
    });

    const onManual = () => {
      setManual(true);
      setDismissed(false);
    };
    const onShow = () => setDismissed(false);

    window.addEventListener('oto:update-manual', onManual);
    window.addEventListener('oto:update-show', onShow);

    return () => {
      alive = false;
      if (typeof off === 'function') off();
      window.removeEventListener('oto:update-manual', onManual);
      window.removeEventListener('oto:update-show', onShow);
    };
  }, [bridge]);

  // Manuel kontrol sonucu (güncel/hata) çok uzun süre ekranda kalmasın.
  useEffect(() => {
    if (!manual) return;
    const timer = window.setTimeout(() => setManual(false), 30_000);
    return () => window.clearTimeout(timer);
  }, [manual]);

  const handleInstall = useCallback(async () => {
    if (!bridge?.installUpdate) return;
    setBusy(true);
    try {
      const result = await bridge.installUpdate();
      if (!result?.ok) {
        toast(result?.error || 'Güncelleme kurulamadı.');
        setBusy(false);
      }
      // Başarılıysa ana süreç kısa süre içinde uygulamayı yeniden başlatır.
    } catch (err) {
      toast(`Güncelleme kurulamadı: ${String((err as Error)?.message || err)}`);
      setBusy(false);
    }
  }, [bridge]);

  const handleRetry = useCallback(async () => {
    if (!bridge?.checkForUpdates) return;
    setManual(true);
    setDismissed(false);
    setStatus({ state: 'checking' });
    try {
      const result = await bridge.checkForUpdates();
      if (result?.dev) {
        setStatus({ state: 'dev', message: result.message });
      } else if (result?.error) {
        setStatus({ state: 'error', message: result.error });
      }
    } catch (err) {
      setStatus({ state: 'error', message: String((err as Error)?.message || err) });
    }
  }, [bridge]);

  if (!bridge || !status) return null;
  if (status.state === 'installing') return null;

  const version = status.version ? `v${status.version}` : '';
  const current = status.currentVersion ? `v${status.currentVersion}` : '';

  // Sessiz kontrollerde yalnızca gerçek güncelleme akışını göster.
  const isActionable =
    status.state === 'available' ||
    status.state === 'downloading' ||
    status.state === 'downloaded';

  if (!isActionable) {
    if (!manual) return null;

    if (status.state === 'checking') {
      return (
        <div className="update-banner" role="status" aria-live="polite" data-testid="update-banner">
          <div className="update-banner-head">
            <span className="update-banner-icon is-info"><RefreshCw size={18} className="spin" /></span>
            <div>
              <h4>Güncellemeler kontrol ediliyor</h4>
              <p>GitHub Releases üzerinden yeni sürüm aranıyor…</p>
            </div>
          </div>
        </div>
      );
    }

    if (status.state === 'not-available') {
      return (
        <div className="update-banner" role="status" aria-live="polite" data-testid="update-banner">
          <div className="update-banner-head">
            <span className="update-banner-icon is-ok"><CheckCircle2 size={18} /></span>
            <div>
              <h4>Uygulama güncel</h4>
              <p>En son sürümü kullanıyorsunuz{current ? ` (${current})` : ''}.</p>
            </div>
            <button className="update-banner-close" type="button" onClick={() => setManual(false)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
        </div>
      );
    }

    if (status.state === 'dev') {
      return (
        <div className="update-banner" role="status" aria-live="polite" data-testid="update-banner">
          <div className="update-banner-head">
            <span className="update-banner-icon is-info"><RefreshCw size={18} /></span>
            <div>
              <h4>Geliştirme sürümü</h4>
              <p>Otomatik güncelleme yalnızca paketlenmiş masaüstü uygulamasında çalışır.</p>
            </div>
            <button className="update-banner-close" type="button" onClick={() => setManual(false)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
        </div>
      );
    }

    if (status.state === 'error') {
      return (
        <div className="update-banner" role="alert" data-testid="update-banner">
          <div className="update-banner-head">
            <span className="update-banner-icon is-bad"><AlertTriangle size={18} /></span>
            <div>
              <h4>Güncelleme kontrol edilemedi</h4>
              <p>{status.message || 'Bilinmeyen bir hata oluştu.'}</p>
            </div>
            <button className="update-banner-close" type="button" onClick={() => setManual(false)} aria-label="Kapat">
              <X size={16} />
            </button>
          </div>
          <div className="update-banner-actions">
            <button className="btn btn-sm" type="button" onClick={() => setManual(false)}>Kapat</button>
            <button className="btn btn-sm btn-primary" type="button" onClick={handleRetry}>
              <RefreshCw size={14} /> Tekrar Dene
            </button>
          </div>
        </div>
      );
    }

    return null;
  }

  if (status.state === 'downloaded' && !dismissed) {
    return (
      <div className="update-banner is-ready" role="dialog" aria-live="polite" data-testid="update-banner">
        <div className="update-banner-head">
          <span className="update-banner-icon is-ok"><ArrowUpCircle size={20} /></span>
          <div>
            <h4>Yeni sürüm hazır {version && <b>{version}</b>}</h4>
            <p>Güncellemek için uygulama yeniden başlatılacak. Kaydedilmemiş işlemleriniz varsa önce kaydedin.</p>
          </div>
          <button className="update-banner-close" type="button" onClick={() => setDismissed(true)} aria-label="Daha sonra">
            <X size={16} />
          </button>
        </div>
        <div className="update-banner-actions">
          <button className="btn btn-sm" type="button" onClick={() => setDismissed(true)} disabled={busy}>
            Daha Sonra
          </button>
          <button className="btn btn-sm btn-primary" type="button" onClick={handleInstall} disabled={busy}>
            <Download size={14} /> {busy ? 'Hazırlanıyor…' : 'Şimdi Güncelle'}
          </button>
        </div>
      </div>
    );
  }

  if (status.state === 'available' || status.state === 'downloading') {
    const percent = typeof status.percent === 'number' ? status.percent : 0;
    return (
      <div className="update-banner" role="status" aria-live="polite" data-testid="update-banner">
        <div className="update-banner-head">
          <span className="update-banner-icon is-info"><Download size={18} /></span>
          <div>
            <h4>Yeni sürüm indiriliyor {version && <b>{version}</b>}</h4>
            <p>
              {status.state === 'available'
                ? 'Güncelleme arka planda hazırlanıyor…'
                : `Arka planda indiriliyor… ${percent}%`}
            </p>
          </div>
        </div>
        {status.state === 'downloading' && (
          <div
            className="update-banner-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
          >
            <i style={{ width: `${Math.max(2, percent)}%` }} />
          </div>
        )}
      </div>
    );
  }

  return null;
};
