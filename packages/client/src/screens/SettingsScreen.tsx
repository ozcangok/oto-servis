import React, { useState, useEffect } from 'react';
import { apiRequest } from '../services/api.js';
import { toast, todayISO } from '../services/ui.js';

interface SettingsScreenProps {
  onClose: () => void;
  onSettingsSaved?: (newSettings: any) => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({ onClose, onSettingsSaved }) => {
  const [shopName, setShopName] = useState('GÜVEN OTO');
  const [shopPhone, setShopPhone] = useState('');
  const [shopAddress, setShopAddress] = useState('');
  const [vatRate, setVatRate] = useState<number>(20);
  const [cashDiscount, setCashDiscount] = useState<number>(5);
  const [saving, setSaving] = useState(false);

  // LAN / Mobile QR
  const [lanInfo, setLanInfo] = useState<any | null>(null);

  useEffect(() => {
    loadSettings();
    loadLanInfo();
  }, []);

  const loadSettings = async () => {
    try {
      const res = await apiRequest('/settings');
      if (res.success && res.settings) {
        setShopName(res.settings.shop_name || 'GÜVEN OTO');
        setShopPhone(res.settings.shop_phone || '');
        setShopAddress(res.settings.shop_address || '');
        setVatRate(res.settings.default_kdv_rate ?? 20);
        setCashDiscount(res.settings.default_cash_discount_rate ?? 5);
      }
    } catch {}
  };

  const loadLanInfo = async () => {
    try {
      const res = await apiRequest('/settings/lan-info');
      if (res.success) setLanInfo(res);
    } catch {}
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const body = {
        shop_name: shopName.trim() || 'GÜVEN OTO',
        shop_phone: shopPhone.trim(),
        shop_address: shopAddress.trim(),
        default_kdv_rate: Number(vatRate) || 0,
        default_cash_discount_rate: Number(cashDiscount) || 0
      };

      const res = await apiRequest('/settings', {
        method: 'PUT',
        body: JSON.stringify(body)
      });

      if (res.success) {
        toast('Ayarlar kaydedildi');
        if (onSettingsSaved) onSettingsSaved(res.settings);
        onClose();
      }
    } catch (err: any) {
      toast(err.message || 'Ayarlar kaydedilemedi.');
    } finally {
      setSaving(false);
    }
  };

  const handleBackupNow = async () => {
    toast('Yedek alınıyor...');
    try {
      const res = await apiRequest('/backup/now', { method: 'POST' });
      if (res.success) {
        toast('Yedek başarıyla alındı');
      }
    } catch (e: any) {
      toast(e.message || 'Yedekleme başarısız oldu.');
    }
  };

  const handleDownloadJSON = async () => {
    toast('Kayıtlar toplanıyor...');
    try {
      const [veh, cust, ord, prt] = await Promise.all([
        apiRequest('/vehicles/search?q='),
        apiRequest('/customers?limit=1000'),
        apiRequest('/work-orders?limit=1000'),
        apiRequest('/parts?limit=1000')
      ]);

      const backupData = {
        exportedAt: new Date().toISOString(),
        settings: { shopName, shopPhone, shopAddress, vatRate, cashDiscount },
        vehicles: veh.items || [],
        customers: cust.items || [],
        orders: ord.items || [],
        parts: prt.items || []
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `servis-defteri-yedek-${todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Yedek hazır (JSON)');
    } catch {
      toast('Yedek indirilemedi.');
    }
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true">
      <div className="sheet">
        <div className="sheet-head">
          <h2>Ayarlar</h2>
          <button className="icon-btn" type="button" onClick={onClose} aria-label="Kapat">
            ×
          </button>
        </div>

        <div className="sheet-body">
          <div className="field">
            <label htmlFor="st-name">Dükkan adı</label>
            <input
              id="st-name"
              type="text"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
            />
          </div>

          <div className="grid g2">
            <div className="field">
              <label htmlFor="st-phone">Dükkan telefonu</label>
              <input
                id="st-phone"
                type="tel"
                placeholder="Mesajlarda ve dökümde görünür"
                value={shopPhone}
                onChange={(e) => setShopPhone(e.target.value)}
              />
            </div>

            <div className="field">
              <label htmlFor="st-addr">Adres</label>
              <input
                id="st-addr"
                type="text"
                value={shopAddress}
                onChange={(e) => setShopAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="grid g2">
            <div className="field">
              <label htmlFor="st-vat">Varsayılan KDV oranı (%)</label>
              <input
                id="st-vat"
                type="number"
                min="0"
                step="any"
                value={vatRate}
                onChange={(e) => setVatRate(parseFloat(e.target.value) || 0)}
              />
            </div>

            <div className="field">
              <label htmlFor="st-cash">Peşin iskonto (%)</label>
              <input
                id="st-cash"
                type="number"
                min="0"
                max="100"
                step="any"
                value={cashDiscount}
                onChange={(e) => setCashDiscount(parseFloat(e.target.value) || 0)}
              />
            </div>
          </div>

          <p className="muted">
            Peşin fiyat, KDV dahil toplamdan bu iskonto düşülerek hesaplanır. Her iş emrinde peşin fiyatı elle de girebilirsiniz.
          </p>

          <h3>Yedek & Veri İndirme</h3>
          <div className="row">
            <button className="btn" type="button" onClick={handleDownloadJSON}>
              Tüm kayıtları indir (JSON)
            </button>
            <button className="btn" type="button" onClick={handleBackupNow}>
              Sunucu Veritabanı Yedeği Al
            </button>
          </div>

          {lanInfo?.qrDataUrl && (
            <>
              <h3>Telefonda Kullan (Aynı Wi-Fi)</h3>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap' }}>
                <img
                  src={lanInfo.qrDataUrl}
                  alt="Wi-Fi QR Kod"
                  style={{ width: '130px', height: '130px', borderRadius: '6px', border: '1px solid var(--line)' }}
                />
                <div style={{ fontSize: '0.9rem' }}>
                  <b>Telefon kamerasından okutun</b>
                  <p className="muted" style={{ marginTop: '4px' }}>
                    {lanInfo.mobileUrl}
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="sheet-foot">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Kapat
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={saving}
            onClick={handleSave}
          >
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </div>
      </div>
    </div>
  );
};
