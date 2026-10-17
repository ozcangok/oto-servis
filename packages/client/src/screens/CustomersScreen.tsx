import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api.js';
import { Spinner } from '../components/Spinner.js';
import { fdate, toast } from '../services/ui.js';

interface CustomerForm {
  id: number | null;
  ad_soyad: string;
  telefon: string;
  eposta: string;
  vergi_no: string;
  notlar: string;
}

const EMPTY_FORM: CustomerForm = {
  id: null,
  ad_soyad: '',
  telefon: '',
  eposta: '',
  vergi_no: '',
  notlar: ''
};

const PAGE_SIZE = 50;

export const CustomersScreen: React.FC<{ currentUser?: any }> = ({ currentUser }) => {
  // Silme yalnızca dükkan sahibine açıktır (silme, bağlı araç/kasa kayıtlarını etkiler).
  const isOwner = currentUser?.role === 'owner';
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Form modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<CustomerForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete arming button tracker
  const [armedDeleteId, setArmedDeleteId] = useState<number | null>(null);
  // Synchronous double-submit guard (state updates are async)
  const savingRef = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(searchTerm.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    loadCustomers();
  }, [debouncedSearch, page]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(
        `/customers?q=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=${PAGE_SIZE}`
      );
      if (res.success) {
        setCustomers(res.items || []);
        setTotal(res.pagination?.total ?? 0);
        setTotalPages(Math.max(1, res.pagination?.totalPages ?? 1));
      }
    } catch {
      toast('Müşteriler yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (c: any) => {
    setForm({
      id: c.id,
      ad_soyad: c.ad_soyad || '',
      telefon: c.telefon || '',
      eposta: c.eposta || '',
      vergi_no: c.vergi_no || '',
      notlar: c.notlar || ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    if (form.ad_soyad.trim().length < 2) {
      setFormError('Müşteri adı soyadı en az 2 karakter olmalıdır.');
      return;
    }
    if (form.telefon.trim().length < 10) {
      setFormError('Geçerli bir telefon numarası giriniz (en az 10 karakter).');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError('');

    const body = {
      ad_soyad: form.ad_soyad.trim(),
      telefon: form.telefon.trim(),
      eposta: form.eposta.trim() || null,
      vergi_no: form.vergi_no.trim() || null,
      notlar: form.notlar.trim() || null
    };

    try {
      if (form.id) {
        await apiRequest(`/customers/${form.id}`, { method: 'PUT', body: JSON.stringify(body) });
        toast('Müşteri güncellendi');
      } else {
        const res = await apiRequest('/customers', { method: 'POST', body: JSON.stringify(body) });
        if (!res.success || !res.customer) {
          throw new Error(res.error || 'Müşteri kaydedilemedi.');
        }
        toast('Müşteri kaydedildi');
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      loadCustomers();
    } catch (err: any) {
      setFormError(err.message || 'Müşteri kaydedilemedi.');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (armedDeleteId !== id) {
      setArmedDeleteId(id);
      setTimeout(() => setArmedDeleteId((cur) => (cur === id ? null : cur)), 4000);
      return;
    }

    try {
      const res = await apiRequest(`/customers/${id}`, { method: 'DELETE' });
      if (res.success) {
        toast('Müşteri silindi');
        setArmedDeleteId(null);
        loadCustomers();
      }
    } catch (err: any) {
      toast(err.message || 'Müşteri silinemedi.');
    }
  };

  return (
    <div>
      {/* Search + New Toolbar */}
      <div className="toolbar">
        <input
          id="mq"
          className="grow"
          type="text"
          placeholder="Müşteri adı, telefon veya vergi no ara"
          autoComplete="off"
          aria-label="Müşteri ara"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button className="btn btn-primary" type="button" onClick={handleOpenNew}>
          + Yeni müşteri
        </button>
      </div>

      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div style={{ marginBottom: '8px' }}><Spinner size={24} /></div>
          <div>Müşteriler getiriliyor...</div>
        </div>
      )}

      {!loading && (
        <div className="panel">
          <div className="panel-h">
            <h3>Kayıtlı müşteriler</h3>
            <span className="muted">{total} kayıt</span>
          </div>

          {customers.length > 0 ? (
            <div className="list">
              {customers.map((c: any) => (
                <div
                  key={c.id}
                  className="li"
                  style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}
                >
                  <span className="what">
                    <b>{c.ad_soyad}</b>
                    <span>
                      {[c.telefon, c.eposta, c.vergi_no ? `Vergi No: ${c.vergi_no}` : '']
                        .filter(Boolean)
                        .join(' · ')}
                      {c.created_at ? ` · Kayıt: ${fdate(c.created_at)}` : ''}
                    </span>
                  </span>
                  <span className="row">
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => handleOpenEdit(c)}
                    >
                      Düzenle
                    </button>
                    {isOwner && (
                      <button
                        className={`btn btn-sm btn-danger ${armedDeleteId === c.id ? 'armed' : ''}`}
                        type="button"
                        onClick={() => handleDelete(c.id)}
                      >
                        {armedDeleteId === c.id ? 'Emin misin? Tekrar tıkla' : 'Sil'}
                      </button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              {debouncedSearch
                ? 'Aramanıza uygun müşteri bulunamadı.'
                : 'Henüz kayıtlı müşteri yok. "+ Yeni müşteri" ile ekleyin.'}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="row" style={{ justifyContent: 'center', padding: '12px', gap: '12px' }}>
              <button
                className="btn btn-sm"
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                ← Önceki
              </button>
              <span className="muted">
                {page} / {totalPages}
              </span>
              <button
                className="btn btn-sm"
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Sonraki →
              </button>
            </div>
          )}
        </div>
      )}

      {/* CUSTOMER FORM MODAL */}
      {modalOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <h2>{form.id ? 'Müşteriyi düzenle' : 'Yeni müşteri kaydı'}</h2>
              <button
                className="icon-btn"
                type="button"
                onClick={() => setModalOpen(false)}
                aria-label="Kapat"
              >
                ×
              </button>
            </div>
            <div className="sheet-body">
              <div className="grid g2">
                <div className="field">
                  <label htmlFor="mc-name">Ad Soyad *</label>
                  <input
                    id="mc-name"
                    type="text"
                    autoComplete="off"
                    placeholder="Örn: Ahmet Yılmaz"
                    value={form.ad_soyad}
                    onChange={(e) => setForm({ ...form, ad_soyad: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mc-phone">Telefon *</label>
                  <input
                    id="mc-phone"
                    type="tel"
                    autoComplete="off"
                    placeholder="05xx xxx xx xx"
                    value={form.telefon}
                    onChange={(e) => setForm({ ...form, telefon: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="mc-email">E-posta</label>
                  <input
                    id="mc-email"
                    type="email"
                    autoComplete="off"
                    placeholder="musteri@ornek.com"
                    value={form.eposta}
                    onChange={(e) => setForm({ ...form, eposta: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mc-tax">Vergi / TC No</label>
                  <input
                    id="mc-tax"
                    type="text"
                    autoComplete="off"
                    placeholder="Vergi veya TC kimlik no"
                    value={form.vergi_no}
                    onChange={(e) => setForm({ ...form, vergi_no: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="mc-notes">Notlar</label>
                <textarea
                  id="mc-notes"
                  rows={2}
                  placeholder="Müşteriyle ilgili notlar"
                  value={form.notlar}
                  onChange={(e) => setForm({ ...form, notlar: e.target.value })}
                />
              </div>

              {formError && <div className="form-error">{formError}</div>}
            </div>
            <div className="sheet-foot">
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => setModalOpen(false)}
              >
                Vazgeç
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? 'Kaydediliyor...' : form.id ? 'Güncelle' : 'Kaydet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
