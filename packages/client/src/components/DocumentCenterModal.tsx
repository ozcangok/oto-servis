import React, { useEffect, useMemo, useState } from 'react';
import {
  Car,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Printer,
  Search,
  X
} from 'lucide-react';
import { CORPORATE } from '@oto-servis/shared';
import { apiRequest } from '../services/api.js';
import { exportStatementPDF, printStatement, statementHTML } from '../services/pdfExport.js';
import { dateISO, money, toast, waPhone } from '../services/ui.js';
import { useSettings } from '../contexts/SettingsContext.js';
import { PlateBadge } from './PlateInput.js';

interface DocumentCenterModalProps {
  open: boolean;
  onClose: () => void;
}

type DocType = 'statement' | 'quote';

const DOCUMENT_TITLE = 'SERVİS İŞ EMRİ VE TEKLİF FORMU';

export const DocumentCenterModal: React.FC<DocumentCenterModalProps> = ({ open, onClose }) => {
  const { settings, companyProfile } = useSettings();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [selected, setSelected] = useState<any | null>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [selectedOrderId, setSelectedOrderId] = useState<number | null>(null);
  const [docType, setDocType] = useState<DocType>('statement');
  const [loadingVehicle, setLoadingVehicle] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(null);
    setOrders([]);
    setSelectedOrderId(null);
    setDocType('statement');
    setError('');
    void loadVehicles('');
  }, [open]);

  const loadVehicles = async (search: string) => {
    setLoadingResults(true);
    setError('');
    try {
      const res = await apiRequest(`/vehicles/search?q=${encodeURIComponent(search)}&limit=20`);
      setResults(res.success ? res.items || [] : []);
    } catch (err: any) {
      setError(err.message || 'Araçlar yüklenemedi.');
      setResults([]);
    } finally {
      setLoadingResults(false);
    }
  };

  const selectVehicle = async (vehicle: any) => {
    setLoadingVehicle(true);
    setError('');
    try {
      const res = await apiRequest(`/vehicles/by-plate/${encodeURIComponent(vehicle.plaka_norm || vehicle.plaka)}`);
      if (!res.success) throw new Error(res.error || 'Araç bulunamadı.');
      const history = res.history || res.workOrders || [];
      setSelected({ ...res.vehicle, musteri: res.customer || res.vehicle?.musteri });
      setOrders(history);
      setSelectedOrderId(history[0]?.id ?? null);
    } catch (err: any) {
      setError(err.message || 'Araç geçmişi yüklenemedi.');
    } finally {
      setLoadingVehicle(false);
    }
  };

  const selectedOrder = useMemo(
    () => orders.find((order) => Number(order.id) === Number(selectedOrderId)) || null,
    [orders, selectedOrderId]
  );

  const documentOrders = useMemo(() => {
    if (docType === 'quote') return selectedOrder ? [selectedOrder] : [];
    return orders;
  }, [docType, orders, selectedOrder]);

  const itemCount = documentOrders.reduce(
    (sum, order) => sum + (Array.isArray(order.kalemler) ? order.kalemler.length : 0),
    0
  );
  const grandTotal = documentOrders.reduce(
    (sum, order) => sum + (Number(order.brut_tutar_kurus ?? order.brut_kurus) || 0),
    0
  );

  const documentNo = useMemo(() => {
    const year = new Date().getFullYear();
    const baseId = documentOrders[0]?.id || selectedOrderId || 1;
    return `CNR-${year}-${String(baseId).padStart(3, '0')}`;
  }, [documentOrders, selectedOrderId]);

  const dueDate = useMemo(() => {
    const days = docType === 'quote' ? 14 : 30;
    const d = new Date();
    d.setDate(d.getDate() + days);
    return dateISO(d);
  }, [docType]);

  const documentOptions = {
    title: DOCUMENT_TITLE,
    isQuote: docType === 'quote',
    validityDays: 14,
    documentNo,
    dueDate
  };

  const handleExport = async () => {
    if (!selected || documentOrders.length === 0) return;
    setExporting(true);
    try {
      await exportStatementPDF(documentOrders, selected, settings, documentOptions);
    } finally {
      setExporting(false);
    }
  };

  const handlePrint = () => {
    if (!selected || documentOrders.length === 0) return;
    setPrinting(true);
    try {
      printStatement(documentOrders, selected, settings, documentOptions);
      toast('Yazdırma penceresi açıldı');
    } finally {
      window.setTimeout(() => setPrinting(false), 600);
    }
  };

  const handleWhatsApp = () => {
    if (!selected || documentOrders.length === 0) return;
    const phone = waPhone(selected.musteri?.telefon) || waPhone(companyProfile.phone) || CORPORATE.phoneDigits;
    const docLabel = docType === 'quote' ? 'Teklif Formu' : 'Servis Dökümü';
    const text = [
      `Merhaba ${selected.musteri?.ad_soyad || ''},`,
      `${companyProfile.name} tarafından ${selected.plaka || 'aracınız'} için ${docLabel} hazırlandı.`,
      `Belge No: ${documentNo}`,
      `Genel Toplam: ${money(grandTotal)}`,
      `Bilgi için: ${companyProfile.phone}`
    ].join('\n');
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    toast('WhatsApp paylaşımı hazırlandı');
  };

  if (!open) return null;

  return (
    <div className="overlay document-overlay" role="dialog" aria-modal="true" aria-labelledby="document-center-title">
      <div className="sheet wide document-sheet">
        <div className="sheet-head">
          <div>
            <div className="ai-kicker">
              <FileText size={16} strokeWidth={1.9} aria-hidden="true" />
              Kurumsal belge merkezi
            </div>
            <h2 id="document-center-title">Teklif & PDF Döküm</h2>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Kapat">
            <X size={18} strokeWidth={1.8} aria-hidden="true" />
          </button>
        </div>

        <div className="sheet-body document-body">
          <div className="document-search">
            <div className="field grow">
              <label htmlFor="doc-search">Araç ara</label>
              <div className="document-search-row">
                <input
                  id="doc-search"
                  type="text"
                  value={query}
                  placeholder="Plaka, müşteri, marka veya model"
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void loadVehicles(query);
                  }}
                />
                <button className="btn btn-primary" type="button" onClick={() => void loadVehicles(query)}>
                  <Search size={17} strokeWidth={1.9} aria-hidden="true" />
                  Ara
                </button>
              </div>
            </div>
          </div>

          {error && <div className="alert">{error}</div>}

          {!selected ? (
            <div className="document-results">
              {loadingResults ? (
                <div className="document-loading">
                  <Loader2 className="spin" size={20} aria-hidden="true" />
                  Araçlar yükleniyor...
                </div>
              ) : results.length > 0 ? (
                results.map((vehicle) => (
                  <button
                    key={vehicle.id || vehicle.plaka}
                    type="button"
                    className="document-result"
                    onClick={() => void selectVehicle(vehicle)}
                  >
                    <PlateBadge plate={vehicle.plaka || '—'} />
                    <span className="document-result-main">
                      <b>{[vehicle.marka, vehicle.model].filter(Boolean).join(' ') || 'Araç bilgisi yok'}</b>
                      <span>{vehicle.musteri?.ad_soyad || 'Müşteri belirtilmemiş'}</span>
                    </span>
                    <span className="document-result-action">Seç</span>
                  </button>
                ))
              ) : (
                <div className="document-empty">
                  <Car size={28} strokeWidth={1.6} aria-hidden="true" />
                  <b>Araç bulunamadı</b>
                  <span>Plaka veya müşteri adıyla aramayı deneyin.</span>
                </div>
              )}
            </div>
          ) : (
            <>
              <div className="document-selected">
                <div className="document-selected-main">
                  <PlateBadge plate={selected.plaka || '—'} />
                  <div>
                    <b>{[selected.marka, selected.model].filter(Boolean).join(' ') || 'Araç bilgisi yok'}</b>
                    <span>{selected.musteri?.ad_soyad || 'Müşteri belirtilmemiş'}</span>
                  </div>
                </div>
                <button
                  className="btn btn-sm"
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setOrders([]);
                    setSelectedOrderId(null);
                  }}
                >
                  Değiştir
                </button>
              </div>

              {loadingVehicle ? (
                <div className="document-loading">
                  <Loader2 className="spin" size={20} aria-hidden="true" />
                  Araç geçmişi yükleniyor...
                </div>
              ) : (
                <>
                  <div className="document-type" role="group" aria-label="Belge türü">
                    <button
                      type="button"
                      aria-pressed={docType === 'statement'}
                      onClick={() => setDocType('statement')}
                    >
                      <FileText size={16} strokeWidth={1.9} aria-hidden="true" />
                      Servis Dökümü
                    </button>
                    <button
                      type="button"
                      aria-pressed={docType === 'quote'}
                      onClick={() => setDocType('quote')}
                    >
                      <FileText size={16} strokeWidth={1.9} aria-hidden="true" />
                      Teklif Formu
                    </button>
                  </div>

                  {orders.length === 0 ? (
                    <div className="document-empty">
                      <FileText size={28} strokeWidth={1.6} aria-hidden="true" />
                      <b>Bu araç için iş emri yok</b>
                      <span>Önce bir iş emri oluşturun; ardından teklif veya döküm üretebilirsiniz.</span>
                    </div>
                  ) : (
                    <>
                      <div className="field">
                        <label htmlFor="doc-order">Belgeye esas iş emri</label>
                        <select
                          id="doc-order"
                          value={selectedOrderId ?? ''}
                          onChange={(event) => setSelectedOrderId(Number(event.target.value))}
                          disabled={docType === 'statement'}
                        >
                          {orders.map((order) => (
                            <option key={order.id} value={order.id}>
                              {new Date(order.giris_tarihi || order.tarih || order.created_at).toLocaleDateString('tr-TR')} ·{' '}
                              {[order.arac_marka, order.arac_model].filter(Boolean).join(' ') || order.plaka}
                            </option>
                          ))}
                        </select>
                        <span className="hint">
                          {docType === 'statement'
                            ? 'Servis dökümü seçili aracın tüm iş emri geçmişini içerir.'
                            : 'Teklif, seçili iş emrindeki parça ve işçilik kalemlerinden üretilir.'}
                        </span>
                      </div>

                      <div className="document-summary">
                        <div>
                          <span>Belge</span>
                          <b>{docType === 'quote' ? 'Teklif Formu' : 'Servis Dökümü'}</b>
                        </div>
                        <div>
                          <span>İş emri</span>
                          <b>{documentOrders.length}</b>
                        </div>
                        <div>
                          <span>Kalem</span>
                          <b>{itemCount}</b>
                        </div>
                        <div>
                          <span>Belge No</span>
                          <b>{documentNo}</b>
                        </div>
                        <div>
                          <span>Toplam</span>
                          <b>{money(grandTotal)}</b>
                        </div>
                      </div>

                      <div className="document-ready">
                        <CheckCircle2 size={18} strokeWidth={1.9} aria-hidden="true" />
                        Belge A4 kurumsal şablona hazır. PDF indirebilir veya doğrudan yazdırabilirsiniz.
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <div className="sheet-foot document-foot">
          <button className="btn" type="button" onClick={onClose}>
            Kapat
          </button>
          <button
            className="btn"
            type="button"
            onClick={handleWhatsApp}
            disabled={!selected || documentOrders.length === 0}
          >
            <MessageCircle size={17} aria-hidden="true" />
            WhatsApp İle Gönder
          </button>
          <button
            className="btn"
            type="button"
            onClick={handlePrint}
            disabled={!selected || documentOrders.length === 0 || printing}
          >
            {printing ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Printer size={17} aria-hidden="true" />}
            Yazdır
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => void handleExport()}
            disabled={!selected || documentOrders.length === 0 || exporting}
          >
            {exporting ? <Loader2 className="spin" size={17} aria-hidden="true" /> : <Download size={17} aria-hidden="true" />}
            PDF İndir
          </button>
        </div>
      </div>
    </div>
  );
};
