import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { money, toast, todayISO } from '../services/ui.js';
import { EXPENSE_CATEGORIES, STAFF_EXPENSE_CATEGORIES, OWNER_ONLY_EXPENSE_CATEGORIES } from '@oto-servis/shared';

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

  // Gider formu (ekleme veya düzenleme)
  const [tarih, setTarih] = useState(todayISO());
  const [kategori, setKategori] = useState<string>(categories[0]);
  const [aciklama, setAciklama] = useState('');
  const [tutar, setTutar] = useState('');
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

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

  // Sıfırla / yeni ekleme moduna dön
  const resetForm = () => {
    setEditingId(null);
    setTarih(todayISO());
    setKategori(categories[0]);
    setAciklama('');
    setTutar('');
  };

  // Düzenleme moduna geç: seçili kaydı forma yükle
  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setTarih(String(item.tarih || '').slice(0, 10));
    setKategori(item.kategori);
    setAciklama(item.aciklama || '');
    setTutar(String((item.tutar_kurus / 100).toFixed(2)).replace('.', ','));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
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
      const body = JSON.stringify({
        tarih,
        kategori,
        aciklama: aciklama.trim(),
        tutar_kurus: Math.round(lira * 100)
      });

      const res = editingId
        ? await apiRequest(`/expenses/${editingId}`, { method: 'PUT', body })
        : await apiRequest('/expenses', { method: 'POST', body });

      if (res.success) {
        toast(editingId ? 'Gider güncellendi.' : 'Gider eklendi.');
        resetForm();
        loadExpenses();
      }
    } catch (err: any) {
      toast(err.message || 'Gider kaydedilemedi.');
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
        if (editingId === item.id) resetForm();
        loadExpenses();
      }
    } catch (err: any) {
      toast(err.message || 'Gider silinemedi.');
    }
  };

  // owner her kaydı; staff yalnızca kendi eklediği gündelik kayıtları yönetebilir.
  const canManage = (item: any): boolean => {
    if (isOwner) return true;
    return (
      item.kullanici_id === currentUser?.id &&
      (STAFF_EXPENSE_CATEGORIES as readonly string[]).includes(item.kategori)
    );
  };

  // SAVUNMA KATMANI (çift koruma): Sunucu zaten filtreler; istemci de personel
  // (staff) için yetkisiz/hassas kategorileri asla render etmez.
  const visibleItems = isOwner
    ? items
    : items.filter((it) =>
        (STAFF_EXPENSE_CATEGORIES as readonly string[]).includes(it.kategori)
      );
  const visibleCount = visibleItems.length;
  const visibleTotalKurus = isOwner
    ? summary.expenseTotalKurus
    : visibleItems.reduce((sum, it) => sum + (it.tutar_kurus || 0), 0);

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

      {/* Gider formu (owner tüm kategoriler, staff gündelik kategoriler) */}
      <div className="panel" style={{ marginBottom: '16px' }}>
        <div className="panel-h">
          <h3>{editingId ? 'Gideri Düzenle' : 'Yeni Gider Ekle'}</h3>
        </div>
        <form
          onSubmit={handleSubmit}
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
                {isOwner ? (
                  <>
                    <optgroup label="Günlük Giderler">
                      {STAFF_EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Yöneticiye Özel">
                      {OWNER_ONLY_EXPENSE_CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </optgroup>
                  </>
                ) : (
                  STAFF_EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))
                )}
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

          <div className="row" style={{ justifyContent: 'flex-end', gap: '8px' }}>
            {editingId && (
              <button className="btn" type="button" onClick={resetForm} disabled={saving}>
                Vazgeç
              </button>
            )}
            <button className="btn btn-primary" type="submit" disabled={saving}>
              {saving ? 'Kaydediliyor...' : editingId ? 'Güncelle' : 'Gider Ekle'}
            </button>
          </div>
        </form>
      </div>

      {/* Gider listesi */}
      <div className="panel">
        <div className="panel-h">
          <h3>Gider Listesi</h3>
          <span className="muted">
            {PERIOD_LABEL[period]} · {visibleCount} kayıt
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
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: '24px 16px', textAlign: 'center' }}>
                    Yükleniyor...
                  </td>
                </tr>
              ) : visibleItems.length > 0 ? (
                visibleItems.map((it) => (
                  <tr key={it.id} style={editingId === it.id ? { background: 'var(--bg-2, #f5f5f5)' } : undefined}>
                    <td>{fdateLocal(it.tarih)}</td>
                    <td>{it.kategori}</td>
                    <td>
                      {it.aciklama}
                      {it.kullanici?.full_name ? (
                        <span className="subtxt"> · {it.kullanici.full_name}</span>
                      ) : null}
                    </td>
                    <td className="num">{money(it.tutar_kurus)}</td>
                    <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {canManage(it) && (
                        <>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => handleEdit(it)}
                          >
                            Düzenle
                          </button>
                          <button
                            className="btn btn-ghost btn-sm"
                            type="button"
                            onClick={() => handleDelete(it)}
                          >
                            Sil
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="muted" style={{ padding: '24px 16px', textAlign: 'center' }}>
                    Bu dönemde gider kaydı yok.
                  </td>
                </tr>
              )}
            </tbody>
            {visibleItems.length > 0 && (
              <tfoot>
                <tr>
                  <td colSpan={3} style={{ textAlign: 'right', fontWeight: 600, padding: '10px 16px' }}>
                    Toplam
                  </td>
                  <td className="num" style={{ fontWeight: 600, padding: '10px 16px' }}>
                    {money(visibleTotalKurus)}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
