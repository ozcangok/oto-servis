'use strict';

/**
 * Oto Servis — Dijital Arşiv (ana işlem).
 *
 * Üretilen her PDF döküm ve kaydedilen her iş emri, masaüstündeki
 * "Çınar_Otomotiv_Arsiv" klasörüne aşağıdaki düzenleyle kopyalanır:
 *
 *   Çınar_Otomotiv_Arsiv/
 *     YYYY/
 *       MM/
 *         DD/
 *           Müşteri Adı - Plaka/
 *             dosya.pdf / is-emri-<id>.json
 *
 * Yalnızca paketlenmiş masaüstü (Electron) ortamında dosya sistemiyle
 * çalışır; tarayıcı/E2E ortamında köprü (`window.otoDesktop.archiveSave`)
 * tanımlı olmadığı için işlem sessizce atlanır.
 */

const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const ARCHIVE_ROOT_NAME = 'Çınar_Otomotiv_Arsiv';

/** Arşiv kök klasörü: Masaüstü / Çınar_Otomotiv_Arsiv */
function getArchiveRoot() {
  return path.join(app.getPath('desktop'), ARCHIVE_ROOT_NAME);
}

/** Dosya / klasör adı için güvenli harf-sayı-boşluk-tire filtresi. */
function sanitize(name) {
  return String(name || 'Bilinmeyen')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim() || 'Bilinmeyen';
}

/** ISO tarih string'ini {y, m, d} parçalarına ayırır. */
function isoParts(date) {
  const d = new Date(date || new Date());
  return {
    y: String(d.getFullYear()),
    m: String(d.getMonth() + 1).padStart(2, '0'),
    dd: String(d.getDate()).padStart(2, '0')
  };
}

/**
 * Belgeyi arşive kopyalar.
 *
 * payload:
 *  - type: 'pdf' | 'work-order'
 *  - fileName: diske yazılacak dosya adı
 *  - contentBase64: PDF için base64 içerik (type === 'pdf')
 *  - json: JSON için nesne (type === 'work-order')
 *  - customerName: müşteri adı
 *  - plate: plaka
 *  - date: ISO tarih (varsayılan: şimdi)
 *
 * Döner: { ok: boolean, path?: string, error?: string }
 */
async function saveToArchive(payload = {}) {
  try {
    const {
      type,
      fileName,
      contentBase64,
      json,
      customerName,
      plate,
      date = new Date().toISOString()
    } = payload;

    if (!fileName) throw new Error('Dosya adı zorunludur');

    const { y, m, dd } = isoParts(date);
    const customer = sanitize(customerName);
    const plaka = sanitize(plate);

    // Yıl -> Ay -> Gün / Müşteri - Plaka
    const dir = path.join(getArchiveRoot(), y, m, dd, `${customer} - ${plaka}`);
    fs.mkdirSync(dir, { recursive: true });

    let buffer;
    if (json !== undefined) {
      buffer = Buffer.from(JSON.stringify(json, null, 2), 'utf8');
    } else if (typeof contentBase64 === 'string' && contentBase64.length > 0) {
      buffer = Buffer.from(contentBase64, 'base64');
    } else {
      throw new Error('İçerik (base64 veya json) sağlanmadı.');
    }

    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, buffer);

    return { ok: true, path: filePath, type, fileName };
  } catch (err) {
    const message = String((err && err.message) || err);
    console.error('[ARŞİV] Kayıt hatası:', message);
    return { ok: false, error: message };
  }
}

module.exports = { saveToArchive, getArchiveRoot, ARCHIVE_ROOT_NAME };
