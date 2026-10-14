import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { PlateBadge } from '../components/PlateInput.js';
import {
  fdate,
  toast,
  waPhone,
  todayISO
} from '../services/ui.js';

export const RemindersScreen: React.FC = () => {
  const [reminders, setReminders] = useState<any[]>([]);
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

  return (
    <div>
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

                if (it.tur === 'teslim_hazir') {
                  badgeCls = 'due-warn';
                  whenText = 'Teslime hazır';
                } else if (it.tur === 'muayene') {
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
