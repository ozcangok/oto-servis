import React, { useState, useEffect, useRef } from 'react';
import { apiRequest } from '../services/api.js';
import { fdate, toast } from '../services/ui.js';
import { PlateBadge } from '../components/PlateInput.js';
import { normalizePlate } from '@oto-servis/shared';

interface VehiclesScreenProps {
  onNewWorkOrder?: (plate: string) => void;
}

interface VehicleForm {
  id: number | null;
  plaka: string;
  marka: string;
  model: string;
  yil: string;
  sasi_no: string;
  motor_kodu: string;
  muayene_tarihi: string;
  notlar: string;
  musteri_id: number | null;
  musteri_ad: string;
  musteri_telefon: string;
}

const EMPTY_FORM: VehicleForm = {
  id: null,
  plaka: '',
  marka: '',
  model: '',
  yil: '',
  sasi_no: '',
  motor_kodu: '',
  muayene_tarihi: '',
  notlar: '',
  musteri_id: null,
  musteri_ad: '',
  musteri_telefon: ''
};

const PAGE_SIZE = 50;

export const VehiclesScreen: React.FC<VehiclesScreenProps> = ({ onNewWorkOrder }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Customer dropdown data
  const [customersList, setCustomersList] = useState<any[]>([]);

  // Form modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState<VehicleForm>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  // Delete arming button tracker
  const [armedDeleteId, setArmedDeleteId] = useState<number | null>(null);
  // Synchronous double-submit guard (state updates are async)
  const savingRef = useRef(false);

  useEffect(() => {
    loadCustomersList();
  }, []);

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(1);
      setDebouncedSearch(searchTerm.trim());
    }, 400);
    return () => clearTimeout(t);
  }, [searchTerm]);

  useEffect(() => {
    loadVehicles();
  }, [debouncedSearch, page]);

  const loadCustomersList = async () => {
    try {
      const res = await apiRequest('/customers?limit=100');
      if (res.success) setCustomersList(res.items || []);
    } catch {}
  };

  const loadVehicles = async () => {
    setLoading(true);
    try {
      const res = await apiRequest(
        `/vehicles/search?q=${encodeURIComponent(debouncedSearch)}&page=${page}&limit=${PAGE_SIZE}`
      );
      if (res.success) {
        setVehicles(res.items || []);
        setTotal(res.pagination?.total ?? 0);
        setTotalPages(Math.max(1, res.pagination?.totalPages ?? 1));
      }
    } catch {
      toast('Araçlar yüklenemedi.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenNew = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setModalOpen(true);
  };

  const handleOpenEdit = (v: any) => {
    const m = v.musteri || {};
    setForm({
      id: v.id,
      plaka: v.plaka_gorunen || v.plaka || '',
      marka: v.marka || '',
      model: v.model || '',
      yil: v.yil ? String(v.yil) : '',
      sasi_no: v.sasi_no || '',
      motor_kodu: v.motor_kodu || '',
      muayene_tarihi: v.muayene_tarihi || '',
      notlar: v.notlar || '',
      musteri_id: v.musteri_id || null,
      musteri_ad: m.ad_soyad || '',
      musteri_telefon: m.telefon || ''
    });
    setFormError('');
    setModalOpen(true);
  };

  const handleSelectCustomer = (id: number | null) => {
    const found = customersList.find((c) => c.id === id);
    setForm((prev) => ({
      ...prev,
      musteri_id: id,
      musteri_ad: found?.ad_soyad || '',
      musteri_telefon: found?.telefon || ''
    }));
  };

  const handleSave = async () => {
    if (savingRef.current) return;
    const norm = normalizePlate(form.plaka);
    if (!norm) {
      setFormError('Geçerli bir plaka giriniz (örn. 34 ABC 123).');
      return;
    }
    if (!form.marka.trim()) {
      setFormError('Araç markası gereklidir.');
      return;
    }
    if (!form.model.trim()) {
      setFormError('Araç modeli gereklidir.');
      return;
    }
    if (!form.musteri_id && form.musteri_ad.trim().length < 2) {
      setFormError('Kayıtlı müşteri seçin veya müşteri adı soyadı yazın.');
      return;
    }

    savingRef.current = true;
    setSaving(true);
    setFormError('');

    const body: any = {
      plaka: norm,
      marka: form.marka.trim(),
      model: form.model.trim(),
      yil: form.yil ? parseInt(form.yil, 10) : null,
      sasi_no: form.sasi_no.trim() || null,
      motor_kodu: form.motor_kodu.trim() || null,
      muayene_tarihi: form.muayene_tarihi || null,
      notlar: form.notlar.trim() || null
    };

    if (form.musteri_id) {
      body.musteri_id = form.musteri_id;
    } else {
      body.musteri_ad_soyad = form.musteri_ad.trim();
      body.musteri_telefon = form.musteri_telefon.trim();
    }

    try {
      if (form.id) {
        const res = await apiRequest(`/vehicles/${form.id}`, {
          method: 'PUT',
          body: JSON.stringify(body)
        });
        if (!res.success) throw new Error(res.error || 'Araç güncellenemedi.');
        toast('Araç güncellendi');
      } else {
        const res = await apiRequest('/vehicles', {
          method: 'POST',
          body: JSON.stringify(body)
        });
        if (!res.success || !res.vehicle) {
          throw new Error(res.error || 'Araç kaydedilemedi.');
        }
        toast(
          res.message || (res.vehicle?.musteri ? 'Araç ve müşteri kaydedildi' : 'Araç kaydedildi')
        );
      }
      setModalOpen(false);
      setForm(EMPTY_FORM);
      loadCustomersList();
      loadVehicles();
    } catch (err: any) {
      setFormError(err.message || 'Araç kaydedilemedi.');
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
      const res = await apiRequest(`/vehicles/${id}`, { method: 'DELETE' });
      if (res.success) {
        toast('Araç silindi');
        setArmedDeleteId(null);
        loadVehicles();
      }
    } catch (err: any) {
      toast(err.message || 'Araç silinemedi.');
    }
  };

  return (
    <div>
      {/* Search + New Toolbar */}
      <div className="toolbar">
        <input
          id="vq"
          className="grow"
          type="text"
          placeholder="Plaka, müşteri, telefon, şasi veya model ara"
          autoComplete="off"
          aria-label="Araç ara"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        <button className="btn btn-primary" type="button" onClick={handleOpenNew}>
          + Yeni araç
        </button>
      </div>

      {loading && (
        <div className="panel" style={{ padding: '24px', textAlign: 'center', color: 'var(--muted)' }}>
          <div className="spin" style={{ fontSize: '1.4rem', marginBottom: '8px' }}>⌛</div>
          <div>Araçlar getiriliyor...</div>
        </div>
      )}

      {!loading && (
        <div className="panel">
          <div className="panel-h">
            <h3>Kayıtlı araçlar</h3>
            <span className="muted">{total} kayıt</span>
          </div>

          {vehicles.length > 0 ? (
            <div className="list">
              {vehicles.map((v: any) => (
                <div
                  key={v.id}
                  className="li"
                  style={{ gridTemplateColumns: 'auto minmax(0,1fr) auto' }}
                >
                  <PlateBadge plate={v.plaka_gorunen || v.plaka} />
                  <span className="what">
                    <b>{[v.marka, v.model].filter(Boolean).join(' ') || 'Marka / model yok'}</b>
                    <span>
                      {v.musteri?.ad_soyad || 'Müşteri belirtilmemiş'}
                      {v.musteri?.telefon ? ` · ${v.musteri.telefon}` : ''}
                      {v.yil ? ` · ${v.yil}` : ''}
                      {v.muayene_tarihi ? ` · Muayene: ${fdate(v.muayene_tarihi)}` : ''}
                    </span>
                  </span>
                  <span className="row">
                    {onNewWorkOrder && (
                      <button
                        className="btn btn-sm btn-primary"
                        type="button"
                        onClick={() => onNewWorkOrder(v.plaka_norm || v.plaka)}
                      >
                        İş emri aç
                      </button>
                    )}
                    <button
                      className="btn btn-sm"
                      type="button"
                      onClick={() => handleOpenEdit(v)}
                    >
                      Düzenle
                    </button>
                    <button
                      className={`btn btn-sm btn-danger ${armedDeleteId === v.id ? 'armed' : ''}`}
                      type="button"
                      onClick={() => handleDelete(v.id)}
                    >
                      {armedDeleteId === v.id ? 'Emin misin? Tekrar tıkla' : 'Sil'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">
              {debouncedSearch
                ? 'Aramanıza uygun araç bulunamadı.'
                : 'Henüz kayıtlı araç yok. "+ Yeni araç" ile ekleyin.'}
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

      {/* VEHICLE FORM MODAL */}
      {modalOpen && (
        <div className="overlay" role="dialog" aria-modal="true">
          <div className="sheet">
            <div className="sheet-head">
              <h2>{form.id ? 'Aracı düzenle' : 'Yeni araç kaydı'}</h2>
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
              <div className="grid g3">
                <div className="field">
                  <label htmlFor="mv-plate">Plaka *</label>
                  <input
                    id="mv-plate"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    placeholder="34 ABC 123"
                    value={form.plaka}
                    readOnly={Boolean(form.id)}
                    onChange={(e) => setForm({ ...form, plaka: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mv-brand">Marka *</label>
                  <input
                    id="mv-brand"
                    type="text"
                    autoComplete="off"
                    placeholder="Renault"
                    value={form.marka}
                    onChange={(e) => setForm({ ...form, marka: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mv-model">Model *</label>
                  <input
                    id="mv-model"
                    type="text"
                    autoComplete="off"
                    placeholder="Clio 1.5 dCi"
                    value={form.model}
                    onChange={(e) => setForm({ ...form, model: e.target.value })}
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="mv-customer-select">Kayıtlı müşteri seç (isteğe bağlı)</label>
                <select
                  id="mv-customer-select"
                  value={form.musteri_id ? String(form.musteri_id) : ''}
                  onChange={(e) =>
                    handleSelectCustomer(e.target.value ? parseInt(e.target.value, 10) : null)
                  }
                >
                  <option value="">Yeni müşteri (elle yazın)</option>
                  {customersList.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.ad_soyad}{c.telefon ? ` · ${c.telefon}` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="mv-cust">Müşteri adı {form.musteri_id ? '' : '*'}</label>
                  <input
                    id="mv-cust"
                    type="text"
                    autoComplete="off"
                    placeholder="Ad Soyad"
                    value={form.musteri_ad}
                    onChange={(e) =>
                      setForm({ ...form, musteri_ad: e.target.value, musteri_id: null })
                    }
                  />
                </div>
                <div className="field">
                  <label htmlFor="mv-phone">Telefon</label>
                  <input
                    id="mv-phone"
                    type="tel"
                    autoComplete="off"
                    placeholder="05xx xxx xx xx"
                    value={form.musteri_telefon}
                    onChange={(e) =>
                      setForm({ ...form, musteri_telefon: e.target.value, musteri_id: null })
                    }
                  />
                </div>
              </div>

              <div className="grid g3">
                <div className="field">
                  <label htmlFor="mv-year">Yıl</label>
                  <input
                    id="mv-year"
                    type="number"
                    min="1950"
                    max="2100"
                    placeholder="2018"
                    value={form.yil}
                    onChange={(e) => setForm({ ...form, yil: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mv-chassis">Şasi no</label>
                  <input
                    id="mv-chassis"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="characters"
                    value={form.sasi_no}
                    onChange={(e) => setForm({ ...form, sasi_no: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mv-engine">Motor kodu</label>
                  <input
                    id="mv-engine"
                    type="text"
                    autoComplete="off"
                    value={form.motor_kodu}
                    onChange={(e) => setForm({ ...form, motor_kodu: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid g2">
                <div className="field">
                  <label htmlFor="mv-insp">Muayene bitiş tarihi</label>
                  <input
                    id="mv-insp"
                    type="date"
                    value={form.muayene_tarihi}
                    onChange={(e) => setForm({ ...form, muayene_tarihi: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="mv-notes">Araç notu</label>
                  <input
                    id="mv-notes"
                    type="text"
                    autoComplete="off"
                    placeholder="Lastik ölçüsü, dikkat edilecekler"
                    value={form.notlar}
                    onChange={(e) => setForm({ ...form, notlar: e.target.value })}
                  />
                </div>
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
