import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { normalizePlate, formatPlateDisplay } from '@oto-servis/shared';
import { PlateInput } from './PlateInput.js';
import { X, Car, User, Phone, Calendar, Save, AlertCircle } from 'lucide-react';

interface NewVehicleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (vehicle: any) => void;
  initialPlate?: string;
}

const COMMON_MAKES = [
  'Renault', 'Fiat', 'Ford', 'Volkswagen', 'Toyota',
  'Opel', 'Hyundai', 'Peugeot', 'Honda', 'BMW',
  'Mercedes-Benz', 'Audi', 'Nissan', 'Citroen', 'Dacia', 'Skoda'
];

export const NewVehicleModal: React.FC<NewVehicleModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialPlate = ''
}) => {
  const [plaka, setPlaka] = useState(initialPlate);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [vin, setVin] = useState('');
  const [engineCode, setEngineCode] = useState('');
  const [inspectionDate, setInspectionDate] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPlate) {
      setPlaka(initialPlate);
    }
  }, [initialPlate]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const norm = normalizePlate(plaka);
    if (!norm) {
      setError('Lütfen geçerli bir araç plakası giriniz.');
      return;
    }
    if (!customerName.trim()) {
      setError('Lütfen araç sahibi müşteri adını ve soyadını giriniz.');
      return;
    }
    if (!make.trim()) {
      setError('Lütfen araç markasını belirtiniz.');
      return;
    }
    if (!model.trim()) {
      setError('Lütfen araç modelini belirtiniz.');
      return;
    }

    setLoading(true);

    try {
      const res = await apiRequest('/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          plaka: norm,
          musteri_ad_soyad: customerName.trim(),
          musteri_telefon: customerPhone.trim() || '0500 000 00 00',
          musteri_eposta: customerEmail.trim() || null,
          marka: make.trim(),
          model: model.trim(),
          yil: year ? parseInt(year, 10) : null,
          sasi_no: vin.trim() || null,
          motor_kodu: engineCode.trim() || null,
          muayene_tarihi: inspectionDate || null,
          notlar: notes.trim() || null
        })
      });

      if (res.success && res.vehicle) {
        onSuccess(res.vehicle);
        onClose();
      } else {
        setError(res.error || 'Araç kaydedilemedi.');
      }
    } catch (err: any) {
      setError(err.message || 'Araç kaydedilirken bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
        backdropFilter: 'blur(6px)'
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: '100%',
          maxWidth: '650px',
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: '0',
          overflow: 'hidden',
          boxShadow: 'var(--shadow-lg)'
        }}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: '1.25rem 1.5rem',
            borderBottom: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--bg-surface-elevated)'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: 'var(--radius-md)',
                background: 'linear-gradient(135deg, var(--accent-primary), #1d4ed8)',
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Car size={20} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', fontWeight: 700 }}>
                Yeni Araç ve Müşteri Kaydı
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                Aracı ve araç sahibini sisteme kaydederek hemen iş emrine bağlayın
              </p>
            </div>
          </div>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={onClose}
            title="Kapat"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflowY: 'auto' }}>
          <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            {error && (
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.15)',
                  border: '1px solid var(--accent-danger)',
                  color: '#f87171',
                  padding: '0.75rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <AlertCircle size={18} />
                <span>{error}</span>
              </div>
            )}

            {/* License Plate */}
            <div className="form-group">
              <label className="form-label" style={{ fontWeight: 700 }}>
                Araç Plakası <span style={{ color: 'var(--accent-danger)' }}>*</span>
              </label>
              <PlateInput
                value={plaka}
                onChange={setPlaka}
                placeholder="34 ABC 123"
                autoFocus
              />
            </div>

            {/* Customer Info Section */}
            <div
              style={{
                padding: '1rem',
                background: 'var(--bg-surface-elevated)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem' }}>
                <User size={18} color="var(--accent-primary)" />
                <span>Müşteri (Araç Sahibi) Bilgileri</span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">
                    Müşteri Adı Soyadı <span style={{ color: 'var(--accent-danger)' }}>*</span>
                  </label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Örn: Ahmet Yılmaz"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Telefon Numarası <span style={{ color: 'var(--accent-danger)' }}>*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    className="form-input"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="0532 111 22 33"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">E-Posta Adresi (İsteğe Bağlı):</label>
                <input
                  type="email"
                  className="form-input"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                  placeholder="musteri@example.com"
                />
              </div>
            </div>

            {/* Vehicle Details Section */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 120px', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">
                  Marka <span style={{ color: 'var(--accent-danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  list="common-makes"
                  className="form-input"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="Örn: Renault"
                />
                <datalist id="common-makes">
                  {COMMON_MAKES.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>

              <div className="form-group">
                <label className="form-label">
                  Model <span style={{ color: 'var(--accent-danger)' }}>*</span>
                </label>
                <input
                  type="text"
                  required
                  className="form-input"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Örn: Megane 1.5 dCi"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Yıl:</label>
                <input
                  type="number"
                  className="form-input"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                  min="1970"
                  max="2030"
                  placeholder="2020"
                />
              </div>
            </div>

            {/* Secondary Vehicle Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Şasi No (VIN):</label>
                <input
                  type="text"
                  className="form-input"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="VF1RFB001..."
                  maxLength={17}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Motor Kodu:</label>
                <input
                  type="text"
                  className="form-input"
                  value={engineCode}
                  onChange={(e) => setEngineCode(e.target.value.toUpperCase())}
                  placeholder="K9K 656"
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div className="form-group">
                <label className="form-label">Araç Muayene Tarihi:</label>
                <input
                  type="date"
                  className="form-input"
                  value={inspectionDate}
                  onChange={(e) => setInspectionDate(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Özel Notlar:</label>
                <input
                  type="text"
                  className="form-input"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Örn: Ruhsat torpidoda"
                />
              </div>
            </div>
          </div>

          {/* Modal Footer */}
          <div
            style={{
              padding: '1rem 1.5rem',
              borderTop: '1px solid var(--border-color)',
              background: 'var(--bg-surface-elevated)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: '0.75rem'
            }}
          >
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
              disabled={loading}
            >
              İptal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ minWidth: '160px' }}
            >
              <Save size={18} />
              {loading ? 'Kaydediliyor...' : 'Kaydet ve Seç'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
