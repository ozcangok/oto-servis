import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { money, toast, todayISO } from '../services/ui.js';
import { EXPENSE_CATEGORIES, STAFF_EXPENSE_CATEGORIES } from '@oto-servis/shared';

type Period = 'today' | 'month' | 'year' | 'all';

const PERIODS: { key: Period; label: string }[] = [
  { key: 'today', label: 'Bugün' },
  { key: 'month', label: 'Bu Ay' },
  { key: 'year', label: 'Bu Yıl' },
  { key: 'all', label: 'Tümü' }
];

const PERIOD_LABEL: Record<Period, string> = {
  today: 'Bugün',
  month: 'Bu Ay',
  year: 'Bu Yıl',
  all: 'Tüm Zamanlar'
};

interface Summary {
  laborIncomeKurus?: number;
  expenseTotalKurus: number;
  netProfitKurus?: number;
  expenseCount: number;
}

interface ExpensesScreenProps {
  currentUser?: any;
}

function fdateLocal(d?: string | null): string {
  if (!d) return '-';
  const p = String(d).split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : String(d);
}

export const ExpensesScreen: React.FC<ExpensesScreenProps> = ({ currentUser }) => {
  // Gelir/kâr özeti ve hassas kategoriler yalnızca dükkan sahibine açıktır.
  const isOwner = currentUser?.role === 'owner';
  const categories = isOwner ? EXPENSE_CATEGORIES : STAFF_EXPENSE_CATEGORIES;

  const [period, setPeriod] = useState<Period>('month');
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary>({
    expenseTotalKurus: 0,
    expenseCount: 0
  });
  const [items, setItems] = useState<any[]>([]);

  // Yeni gider formu
  const [tarih, setTarih] = useState(todayISO());
  const [kategori, setKategori] = useState<string>(categories[0]);
  const [aciklama, setAciklama] = useState('');
  const [tutar, setTutar] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadExpenses();
  }, [period]);

  // Rol değişirse seçili kategori yetki dışında kalabilir; ilk geçerli kategoriye dön.
  useEffect(() => {
    if (!(categories as readonly string[]).includes(kategori)) {
      setKategori(categories[0]);
    }
  }, [isOwner]);

  const loadExpenses = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(`/expenses?period=${period}`);
      if (res.success) {
        setSummary(res.summary || { expenseTotalKurus: 0, expenseCount: 0 });
        setItems(res.items || []);
      }
    } catch (err: any) {
      toast(err.message || 'Giderler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const lira = parseFloat(String(tutar).replace(',', '.'));

    if (!tarih) {
      toast('Lütfen tarih seçin.');
      return;
    }
    if (!aciklama.trim()) {
      toast('Lütfen bir açıklama girin.');
      return;
    }
    if (!isFinite(lira) || lira <= 0) {
      toast('Sıfırdan büyük bir tutar girin.');
      return;
    }

    setSaving(true);
    try {
      const res = await apiRequest('/expenses', {
        method: 'POST',
        body: JSON.stringify({
          tarih,
          kategori,
          aciklama: aciklama.trim(),
          tutar_kurus: Math.round(lira * 100)
        })
      });
      if (res.success) {
        toast('Gider eklendi.');
        setAciklama('');
        setTutar('');
        loadExpenses();
      }
    } catch (err: any) {
      toast(err.message || 'Gider eklenemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: any) => {
    if (!window.confirm(`"${item.aciklama}" (${money(item.tutar_kurus)}) gideri silinsin mi?`)) return;
    try {
      const res = await apiRequest(`/expenses/${item.id}`, { method: 'DELETE' });
      if (res.success) {
        toast('Gider silindi.');
        loadExpenses();
      }
    } catch (err: any) {
      toast(err.message || 'Gider silinemedi.');
    }
  };

  const colCount = isOwner ? 5 : 4;
  const net = summary.netProfitKurus ?? 0;
  const netColor = net >= 0 ? 'var(--good)' : 'var(--bad)';

  return (
    <div>
      {/* Dönem seçici */}
      <div className="toolbar">
        <label className="muted">Dönem</label>
        <div className="seg" role="group" aria-label="Dönem seçimi">
          {PERIODS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={period === p.key}
              onClick={() => setPeriod(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <button className="btn" type="button" onClick={loadExpenses}>
          Yenile
        </button>
      </div>

      {/* 3'lü özet paneli — yalnızca dükkan sahibi (owner) görür */}
      {isOwner && (
        <>
          <div className="gsum">
            <div className="stat">
              <span>Toplam Servis Geliri</span>
              <b>{money(summary.laborIncomeKurus ?? 0)}</b>
            </div>
            <div className="stat">
              <span>Toplam Dükkan Gideri</span>
              <b style={{ color: 'var(--bad)' }}>{money(summary.expenseTotalKurus)}</b>
            </div>
            <div className="stat">
              <span>Net Kâr</span>
              <b style={{ color: netColor }}>{money(net)}</b>
            </div>
          </div>

          <p className="muted" style={{ marginBottom: '16px' }}>
            {PERIOD_LABEL[period]} · Toplam Servis Geliri, Kasa'daki işçilik bedellerinden alınır. Kasa
            toplamları bu modülden etkilenmez.
          </p>
        </>
      )}

      {/* Yeni gider formu (owner ve staff ekleyebilir) */}
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-h">
          <h3>Yeni Gider Ekle</h3>
        </div>
        <form
          onSubmit={handleAdd}
          style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '12px' }}
        >
          <div className="grid g2">
            <div className="field">
              <label htmlFor="gx-tarih">Tarih</label>
              <input
                id="gx-tarih"
                type="date"
                value={tarih}
                onChange={(e) => setTarih(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="gx-kategori">Kategori</label>
              <select
                id="gx-kategori"
                value={kategori}
                onChange={(e) => setKategori(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid g2">
            <div className="field">
              <label htmlFor="gx-aciklama">Açıklama</label>
              <input
                id="gx-aciklama"
                type="text"
                placeholder="Örn. Atölye eldiveni, temizlik malzemesi..."
                value={aciklama}
                onChange={(e) => setAciklama(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="gx-tutar">Tutar (₺)</label>
              <input
                id="gx-tutar"
                type="number"
                min="0"
                step="0.01"
                placeholder="0,00"
                value={tutar}
                onChange={(e) => setTutar(e.target.value)}
              />
            </div>
          </div>

          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Ekleniyor...' : 'Gider Ekle'}
            </button>
          </div>
        </form>
      </div>

      {/* Gider listesi */}
      <div className="panel">
        <div className="panel-h">
          <h3>Gider Listesi</h3>
          <span className="muted">
            {PERIOD_LABEL[period]} · {summary.expenseCount} kayıt
          </span>
        </div>
        <div className="tablewrap">
          <table className="tbl">
            <thead>
              <tr>
                <th>Tarih</th>
                <th>Kategori</th>
                <th>Açıklama</th>
                <th className="num">Tutar</th>
                {isOwner && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={colCount} className="muted" style={{ padding: '24px 16px', textAlign: 'center' }}>
                    Yükleniyor...
                  </td>
                </tr>
              ) : items.length > 0 ? (
                items.map((it) => (
                  <tr key={it.id}>
                    <td>{fdateLocal(it.tarih)}</td>
                    <td>{it.kategori}</td>
                    <td>
                      {it.aciklama}
                      {it.kullanici?.full_name ? (
                        <span className="subtxt"> · {it.kullanici.full_name}</span>
                      ) : null}
                    </td>
                    <td className="num">{money(it.tutar_kurus)}</td>
                    {isOwner && (
                      <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button
                          className="btn btn-ghost btn-sm"
                          type="button"
                          onClick={() => handleDelete(it)}
                        >
                          Sil
                        </button>
                      </td>
                    )}
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={colCount} className="muted" style={{ padding: '24px 16px', textAlign: 'center' }}>
                    Bu dönemde gider kaydı yok.
                  </td>
                </tr>
              )}
            </tbody>
            {items.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600, padding: '10px 16px' }}>
                    Toplam
                  </td>
                  <td className="num" style={{ fontWeight: 600, padding: '10px 16px' }}>
                    {money(summary.expenseTotalKurus)}
                  </td>
                  {isOwner && <td></td>}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
