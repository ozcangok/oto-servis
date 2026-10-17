import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { PlateBadge } from '../components/PlateInput.js';
import { STATUS_NOTIFICATION_LABELS } from '@oto-servis/shared';
import {
  fdate,
  toast,
  waPhone,
  todayISO
} from '../services/ui.js';

export const RemindersScreen: React.FC = () => {
  const [reminders, setReminders] = useState<any[]>([]);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [sentMap, setSentMap] = useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem('oto_sent_reminders') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    loadReminders();
    loadNotifs();
  }, []);

  const loadReminders = async () => {
    setLoading(true);
    try {
      const res = await apiRequest('/reminders/due');
      if (res.success && res.items) {
        setReminders(res.items);
        const map: Record<string, string> = {};
        res.items.forEach((it: any) => {
          map[it.id] = it.mesaj;
        });
        setMessages((prev) => ({ ...map, ...prev }));
      }
    } catch {
      toast('Hatırlatıcılar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  // İletişim merkezi: servis durumu değişimlerinde oluşan WhatsApp kayıtları
  const loadNotifs = async () => {
    try {
      const res = await apiRequest('/reminders/messages');
      if (res.success && res.items) {
        setNotifs(res.items);
      }
    } catch {
      /* Sessizce geç; ana hatırlatıcı listesi zaten hata gösterir. */
    }
  };

  const handleMessageChange = (id: string, text: string) => {
    setMessages((prev) => ({ ...prev, [id]: text }));
  };

  const handleCopySMS = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast('Mesaj kopyalandı');
    } catch {
      toast('Panoya kopyalanamadı.');
    }
  };

  const handleMarkSent = (id: string) => {
    const today = todayISO();
    const updated = { ...sentMap, [id]: today };
    setSentMap(updated);
    localStorage.setItem('oto_sent_reminders', JSON.stringify(updated));
    toast('Gönderildi olarak işaretlendi');
  };

  // WhatsApp butonuna basıldığında ilgili gönderim kaydını "gönderildi" işaretle
  const handleNotifSent = async (id: number) => {
    try {
      await apiRequest(`/reminders/messages/${id}/sent`, { method: 'POST' });
      setNotifs((prev) =>
        prev.map((n) => (n.id === id ? { ...n, gonderildi_tarihi: new Date().toISOString() } : n))
      );
    } catch {
      /* Kayıt işaretlenemese bile wa.me bağlantısı açılmış olur. */
    }
  };

  return (
    <div>
      {/* ------------------- İletişim Merkezi: servis durumu bildirimleri ------------------- */}
      <div className="panel" data-testid="status-notifications">
        <div className="panel-h">
          <h3>Servis durumu bildirimleri</h3>
          <span className="muted">
            İş emrinin durumu her değiştiğinde otomatik oluşur. "WhatsApp Gönder"e basınca
            müşterinin numarasına kurumsal mesaj hazır olarak açılır.
          </span>
        </div>

        <div className="list">
          {notifs.length > 0 ? (
            notifs.map((n) => {
              const phone = waPhone(n.telefon);
              const isSent = Boolean(n.gonderildi_tarihi);
              const label = STATUS_NOTIFICATION_LABELS[n.durum as keyof typeof STATUS_NOTIFICATION_LABELS] || n.durum;

              return (
                <div key={n.id} className="rem" data-testid="status-notification">
                  <div className="rem-top">
                    <PlateBadge plate={n.plaka} />
                    <span className="ttl">{label}</span>
                    <span className={`pill ${isSent ? 'due-ok' : 'due-warn'}`}>
                      {isSent ? `Gönderildi ${fdate(n.gonderildi_tarihi)}` : 'Gönderim bekliyor'}
                    </span>
                    <span className="muted">
                      {n.musteri_ad || 'Müşteri belirtilmemiş'}
                      {n.telefon ? ` · ${n.telefon}` : ''}
                    </span>
                  </div>

                  <textarea
                    rows={3}
                    value={n.mesaj}
                    readOnly
                    aria-label="WhatsApp mesaj metni"
                  />

                  <div className="rem-act">
                    {phone ? (
                      <a
                        className="btn btn-sm btn-primary"
                        data-testid="wa-send"
                        href={`https://wa.me/${phone}?text=${encodeURIComponent(n.mesaj)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => handleNotifSent(n.id)}
                      >
                        WhatsApp Gönder
                      </a>
                    ) : (
                      <span className="muted" style={{ fontSize: '0.85rem' }}>
                        Telefon kayıtlı değil
                      </span>
                    )}

                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => handleCopySMS(n.mesaj)}
                    >
                      Mesajı kopyala
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="empty">
              <b>Henüz servis durumu bildirimi yok</b>
              Bir iş emrinin servis durumu değiştiğinde müşteriye gönderilecek WhatsApp
              mesajı burada otomatik olarak hazırlanır.
            </div>
          )}
        </div>
      </div>

      {/* ----------------------------- Yaklaşan müşteri hatırlatıcıları ----------------------------- */}
      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div className="spin" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>⌛</div>
          <div>Hatırlatıcılar yükleniyor...</div>
        </div>
      )}

      {!loading && (
        <div className="panel">
          <div className="panel-h">
            <h3>Müşteri hatırlatıcıları</h3>
            <span className="muted">
              Mesajlar hazır gelir; WhatsApp'a tıklayınca açılır, siz gönderirsiniz.
            </span>
          </div>

          <div className="list">
            {reminders.length > 0 ? (
              reminders.map((it) => {
                const isSent = Boolean(sentMap[it.id]);
                const sentDate = sentMap[it.id];
                const msgText = messages[it.id] ?? it.mesaj;
                const phone = waPhone(it.telefon);

                let badgeCls = 'due-ok';
                let whenText = it.hedef_tarih ? fdate(it.hedef_tarih) : 'İşlem bekliyor';

                if (it.tur === 'muayene') {
                  badgeCls = 'due-bad';
                  whenText = it.hedef_tarih ? `Muayene: ${fdate(it.hedef_tarih)}` : 'Muayene zamanı';
                }

                if (isSent) {
                  badgeCls = 'due-ok';
                  whenText = `Gönderildi ${fdate(sentDate)}`;
                }

                return (
                  <div key={it.id} className="rem">
                    <div className="rem-top">
                      <PlateBadge plate={it.plaka} />
                      <span className="ttl">{it.baslik}</span>
                      <span className={`pill ${badgeCls}`}>{whenText}</span>
                      <span className="muted">
                        {it.musteri_ad || 'Müşteri belirtilmemiş'}
                        {it.telefon ? ` · ${it.telefon}` : ''}
                      </span>
                    </div>

                    <textarea
                      rows={3}
                      value={msgText}
                      onChange={(e) => handleMessageChange(it.id, e.target.value)}
                      aria-label="Mesaj metni"
                    />

                    <div className="rem-act">
                      {phone ? (
                        <a
                          className="btn btn-sm btn-primary"
                          href={`https://wa.me/${phone}?text=${encodeURIComponent(msgText)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          WhatsApp ile gönder
                        </a>
                      ) : (
                        <span className="muted" style={{ fontSize: '0.85rem' }}>
                          Telefon kayıtlı değil
                        </span>
                      )}

                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => handleCopySMS(msgText)}
                      >
                        SMS için kopyala
                      </button>

                      <button
                        className="btn btn-sm"
                        type="button"
                        onClick={() => handleMarkSent(it.id)}
                      >
                        {isSent ? 'Yeniden gönderildi say' : 'Gönderildi say'}
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="empty">
                <b>Bekleyen hatırlatma yok</b>
                Teslime hazır araçlar, 30 gün içinde bakımı veya muayenesi gelen araçlar burada çıkar.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
