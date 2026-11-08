import { CORPORATE } from '@oto-servis/shared';
import { dateISO, fdate, money, numfmt, formatPlateDisplay, toast, todayISO } from './ui.js';

/**
 * KURUMSAL "YETKİLİ SERVİS" SERVİS İŞ EMRİ / TEKLİF FORMU (A4 PDF)
 *
 * Mercedes/BMW standartında lüks yetkili servis şablonu:
 *  - Sol üstte kurumsal logo + firma bilgileri (adres, telefon, e-posta, vergi)
 *  - Sağ üstte "İŞ EMRİ / TEKLİF FORMU" başlığı, belge no ve tarih
 *  - Müşteri ve araç bilgileri #F4F6F8 tonlu panellerde
 *  - CSS ile çizilmiş araç görünümü (blueprint)
 *  - Tek satırlı çerçeveli finansal tablo, dark navy genel toplam rozeti
 *  - Garanti beyanı ve çift imza/kaşe blokları
 *  - Tüm sayfada %6 opaklık "ÇINAR OTOMOTİV" arka filigranı
 *
 * Tüm şirket kimliği `settings` parametresinden gelir.
 */
const LOGO_SVG = `
<svg class="stmt-logo" viewBox="0 0 96 96" width="56" height="56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <path d="M33 14 C23 28 18 44 22 58 C25 68 30 75 36 78 C42 75 47 68 50 58 C54 44 49 28 39 14 C37 20 35 20 33 14 Z" fill="#d42127"/>
  <path d="M36 25 L36 74" stroke="#a3171c" stroke-width="2" stroke-linecap="round" fill="none"/>
  <g fill="#0f2a5c">
    <rect x="58" y="25" width="27" height="21" rx="4"/>
    <rect x="65.5" y="46" width="12" height="21"/>
    <rect x="57" y="67" width="29" height="15" rx="4"/>
  </g>
</svg>`;

/**
 * Kurumsal araç inceleme şeması — üstten görünüm.
 * İnce, koyu-slate vektör çizgiler (stroke #334155, 1px) ile resmi servis
 * kontrol ızgarası görünümü. Metin içermez; html2canvas güvenle render eder.
 */
const BLUEPRINT_PLAN_SVG = `
<svg class="inspect-svg" viewBox="0 0 300 110" width="300" height="110" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#e2e8f0" stroke-width="0.75" fill="none">
    <line x1="0" y1="55" x2="300" y2="55" stroke-dasharray="3 4"/>
    <line x1="150" y1="0" x2="150" y2="110" stroke-dasharray="3 4"/>
  </g>
  <g stroke="#334155" stroke-width="1" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M 60 55 C 60 42 66 34 80 31 L 206 31 C 236 33 266 42 276 55 C 266 68 236 77 206 79 L 80 79 C 66 76 60 68 60 55 Z" fill="#ffffff"/>
    <path d="M 222 33 C 232 44 232 66 222 77" stroke="#94a3b8"/>
    <path d="M 118 33 C 108 44 108 66 118 77" stroke="#94a3b8"/>
    <path d="M 118 33 L 222 33" stroke="#cbd5e1"/>
    <path d="M 118 77 L 222 77" stroke="#cbd5e1"/>
    <rect x="150" y="43" width="40" height="24" rx="3" stroke="#cbd5e1"/>
    <rect x="222" y="25" width="14" height="6" rx="2"/>
    <rect x="222" y="79" width="14" height="6" rx="2"/>
  </g>
</svg>`;

/**
 * Kurumsal araç inceleme şeması — yandan görünüm.
 * Modern sedan silueti; tekerlek boşlukları gövde dolgusundan oyulmuştur.
 */
const BLUEPRINT_SIDE_SVG = `
<svg class="inspect-svg" viewBox="0 0 300 110" width="300" height="110" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#e2e8f0" stroke-width="0.75" fill="none">
    <line x1="0" y1="86" x2="300" y2="86" stroke-dasharray="3 4"/>
    <line x1="150" y1="0" x2="150" y2="110" stroke-dasharray="3 4"/>
  </g>
  <g stroke="#334155" stroke-width="1" fill="#ffffff">
    <circle cx="92" cy="86" r="15"/>
    <circle cx="92" cy="86" r="6"/>
    <circle cx="226" cy="86" r="15"/>
    <circle cx="226" cy="86" r="6"/>
  </g>
  <g stroke="#334155" stroke-width="1" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M 22 86 L 22 74 Q 22 66 34 64 L 70 59 L 104 38 Q 110 33 120 33 L 190 33 Q 200 33 206 40 L 238 62 L 278 66 Q 292 68 292 78 L 292 86 L 242 86 C 242 76 234 70 226 70 C 218 70 210 76 210 86 L 108 86 C 108 76 100 70 92 70 C 84 70 76 76 76 86 Z" fill="#ffffff"/>
    <path d="M 110 39 L 146 39 L 146 58 L 110 58 Z" stroke="#94a3b8"/>
    <path d="M 152 39 L 188 39 L 208 58 L 152 58 Z" stroke="#94a3b8"/>
    <path d="M 146 58 L 146 84" stroke="#94a3b8"/>
    <path d="M 208 58 L 208 84" stroke="#94a3b8"/>
    <path d="M 124 64 L 136 64" stroke="#94a3b8"/>
    <path d="M 164 64 L 176 64" stroke="#94a3b8"/>
  </g>
</svg>`;

/** Kullanıcı verisini HTML'e güvenli biçimde basar. */
function esc(s?: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export interface StatementOptions {
  title?: string;
  validityDays?: number;
  isQuote?: boolean;
  documentNo?: string;
  dueDate?: string | Date;
}

export function statementHTML(orders: any[], v: any, settings: any = {}, options: StatementOptions = {}) {
  const docTitle = String(options.title || 'İŞ EMRİ / TEKLİF FORMU').toLocaleUpperCase('tr');
  const isQuote = Boolean(options.isQuote);
  const validityDays = options.validityDays ?? 14;

  // Tüm kurumsal kimlik — global ayar kaynağından gelir.
  const companyName = String(settings.shop_name || CORPORATE.legalName).trim();
  const nameParts = companyName.split(' - ');
  const brandName = (nameParts[0] || companyName).trim();
  const companyTagline = nameParts.length > 1
    ? nameParts.slice(1).join(' - ').trim()
    : '';
  const shopPhone = String(settings.shop_phone || CORPORATE.phone).trim();
  const shopAddress = String(settings.shop_address || CORPORATE.address).trim();
  const shopEmail = String(settings.shop_email || CORPORATE.email).trim();
  const shopTaxOffice = String(settings.shop_tax_office || CORPORATE.taxOffice).trim();
  const shopTaxNumber = String(settings.shop_tax_number || CORPORATE.taxNumber).trim();
  const owner = v?.musteri || {};

  const taxLine = [
    shopTaxOffice ? `Vergi Dairesi: ${shopTaxOffice}` : '',
    shopTaxNumber ? `VKN: ${shopTaxNumber}` : ''
  ].filter(Boolean).join(' · ');

  const today = todayISO();
  const plaka = formatPlateDisplay(v?.plaka || v?.id || '-');
  const lastKm = orders.length ? orders[0].km || orders[0].kilometre : null;
  const documentNo = String(
    options.documentNo ||
    `CNR-${new Date().getFullYear()}-${String(orders[0]?.id || 1).padStart(3, '0')}`
  );
  const dueDateFallback = new Date();
  dueDateFallback.setDate(dueDateFallback.getDate() + (isQuote ? validityDays : 30));
  const dueDate = options.dueDate
    ? (typeof options.dueDate === 'string' ? options.dueDate : dateISO(options.dueDate))
    : dateISO(dueDateFallback);

  // Finansal hesaplamalar
  let tg = 0;
  let tnet = 0;
  let tvat = 0;
  const itemRows: string[] = [];

  for (const o of orders) {
    tg += (o.brut_tutar_kurus || 0) / 100;
    tnet += (o.net_tutar_kurus || 0) / 100;
    tvat += (o.kdv_tutar_kurus || 0) / 100;

    const orderMeta = orders.length > 1
      ? `<div class="item-meta">İş emri #${esc(o.id)} · ${fdate(o.giris_tarihi || o.created_at)}${o.km || o.kilometre ? ` · ${numfmt(o.km || o.kilometre)} km` : ''}</div>`
      : '';
    const lines = Array.isArray(o.kalemler) ? o.kalemler : [];

    if (!lines.length) {
      itemRows.push(`<tr>
        <td><span class="rtag tag-part">Parça</span></td>
        <td><div class="item">Kalem bulunamadı</div>${orderMeta}</td>
        <td class="r">—</td>
        <td class="r">—</td>
        <td class="r amt">—</td>
      </tr>`);
      continue;
    }

    for (const l of lines) {
      const isLabor = l.tur === 'iscilik';
      const qty = Number(l.adet) || 1;
      const unit = (l.birim_fiyat_kurus || 0) / 100;
      const rowTotal = qty * unit;
      const birim = l.birim && String(l.birim).toLowerCase() !== 'adet' ? ` ${l.birim}` : '';
      itemRows.push(`<tr>
        <td><span class="rtag ${isLabor ? 'tag-labor' : 'tag-part'}">${isLabor ? 'İşçilik' : 'Parça'}</span></td>
        <td><div class="item">${esc(l.ad) || '—'}</div>${orderMeta}</td>
        <td class="r">${numfmt(qty)}${esc(birim)}</td>
        <td class="r">${money(unit, false)}</td>
        <td class="r amt">${money(rowTotal, false)}</td>
      </tr>`);
    }
  }

  const vatTotal = tvat || Math.max(0, tg - tnet);
  const grandTotal = tg || (tnet + vatTotal);
  const vatRateLabel = Number(settings.default_kdv_rate ?? 20);
  const customerName = owner.ad_soyad || owner.name || '—';
  const customerPhone = owner.telefon || owner.phone || '—';
  const customerEmail = owner.eposta || owner.email || '—';
  const complaint = orders.map((o) => o.sikayet).filter(Boolean).join(' · ') || '—';
  const vehicleBrandModel = [v?.marka || v?.brand, v?.model].filter(Boolean).join(' ') || '—';
  const vehicleYear = v?.yil || v?.year || '—';
  const chassis = v?.sasi_no || v?.vin || '—';
  const engine = v?.motor_kodu || v?.motor_no || '—';
  const km = lastKm ? `${numfmt(lastKm)} km` : '—';
  const intakeDate = orders[0]?.giris_tarihi || orders[0]?.created_at || null;
  const signatureOwner = settings.shop_owner || CORPORATE.owner;
  const legalNote = 'Bu belge bilgi amaçlı servis dökümüdür, resmi fatura yerine geçmesi için faturaya dönüştürülmelidir.';
  const warrantyNote = 'Değişen yedek parçalar 1 Yıl / 10.000 KM firmamız ve üretici garantisi altındadır. Servis işlemleriyle ilgili tüm garanti koşulları için servis departmanımızla iletişime geçebilirsiniz.';

  const css = `
    @page{size:A4;margin:0}
    #stmt{width:794px;min-height:1123px;box-sizing:border-box;background:#fff;color:#111827;font-family:"IBM Plex Sans",Arial,sans-serif;font-size:11px;line-height:1.4;position:relative;overflow:hidden;padding:0 0 54px 0}
    #stmt *{box-sizing:border-box}
    /* Arka filigran — tüm sayfalar için ortada, saydam, içeriğin arkasında */
    #stmt .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);font-size:62px;letter-spacing:6px;font-weight:900;color:#0f2a5c;opacity:0.06;pointer-events:none;z-index:0;white-space:nowrap;mix-blend-mode:multiply}

    /* Başlık */
    #stmt .header{position:relative;z-index:1;padding:20px 30px;border-bottom:3px solid #0f2a5c;margin-bottom:16px}
    #stmt .header-top{display:table;width:100%}
    #stmt .header-left{display:table-cell;vertical-align:middle;width:60%}
    #stmt .header-right{display:table-cell;vertical-align:middle;text-align:right;width:40%}
    #stmt .logo-company{font-size:17px;font-weight:900;color:#0f2a5c;letter-spacing:.5px}
    #stmt .company-sub{font-size:10px;color:#4b5563;margin-top:2px}
    #stmt .company-addr{font-size:9.5px;color:#4b5563;margin-top:3px}
    #stmt .doc-title{font-size:16px;font-weight:900;color:#0f2a5c;text-transform:uppercase;letter-spacing:1px}
    #stmt .doc-meta{font-size:9.5px;color:#4b5563;margin-top:5px}
    #stmt .doc-meta div{margin-bottom:1px}

    /* Bilgi Izgarası */
    #stmt .info-grid{display:table;width:100%;margin-bottom:14px;border-collapse:separate;border-spacing:8px 0}
    #stmt .info-col{display:table-cell;width:50%;vertical-align:top}
    #stmt .info-box{height:100%;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;background:#fff}
    #stmt .info-head{background:#F4F6F8;color:#374151;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #d1d5db}
    #stmt .info-body{padding:12px;font-size:10px}
    #stmt .info-row{display:table;width:100%;margin-bottom:6px;border-bottom:1px solid #f1f5f9}
    #stmt .info-row:last-child{border-bottom:none}
    #stmt .info-label{display:table-cell;width:42%;font-size:8.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;padding-top:1px}
    #stmt .info-value{display:table-cell;width:58%;font-size:10px;color:#111827;font-weight:600}

    /* Profesyonel araç inceleme şeması (SVG) */
    #stmt .inspect-panel{border:1px solid #d1d5db;border-radius:6px;overflow:hidden;background:#fff;margin-bottom:14px}
    #stmt .inspect-head{background:#F4F6F8;color:#374151;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #d1d5db}
    #stmt .inspect-table{width:100%;border-collapse:collapse}
    #stmt .inspect-cell{width:50%;vertical-align:middle;text-align:center;padding:8px 10px 5px}
    #stmt .inspect-cell + .inspect-cell{border-left:1px solid #e5e7eb}
    #stmt .inspect-svg{display:block;width:300px;height:110px;margin:0 auto}
    #stmt .inspect-cap{font-size:7.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-top:3px}

    /* Finansal tablo — sadece yatay çerçeveler */
    #stmt .items-table{width:100%;border-collapse:collapse;margin-bottom:14px}
    #stmt .items-table th{background:#F4F6F8;color:#374151;font-size:8.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;padding:7px 10px;border:1px solid #d1d5db;border-top:none;border-bottom:none;text-align:left}
    #stmt .items-table th.num{text-align:right}
    #stmt .items-table td{padding:8px 10px;border:1px solid #e5e7eb;vertical-align:top;font-size:10px;border-top:none}
    #stmt .items-table td.num{text-align:right;font-variant-numeric:tabular-nums}
    #stmt .items-table tr{border-bottom:none}
    #stmt .items-table tr:nth-child(even) td{background:#f9fafb}
    #stmt .rtag{display:inline-block;font-size:7.5px;font-weight:800;padding:1.5px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.03em}
    #stmt .tag-part{background:#e8eefc;color:#1e3a8a}
    #stmt .tag-labor{background:#e7f6ec;color:#166534}
    #stmt .item{font-weight:600;color:#111827}
    #stmt .item-meta{font-size:8px;color:#6b7280;margin-top:2px;line-height:1.3}

    /* Toplamlar — tam genişlik, simetrik satırlar */
    #stmt .totals-wrap{width:100%;margin-bottom:14px}
    #stmt .totals-summary{display:block;width:100%}
    #stmt .total-row{border-bottom:1px solid #e5e7eb}
    #stmt .total-inner{display:table;width:100%}
    #stmt .total-label{display:table-cell;padding:6px 12px;font-size:9.5px;color:#4b5563}
    #stmt .total-value{display:table-cell;padding:6px 12px;text-align:right;font-size:10.5px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums}
    #stmt .grand-row{background:#0f2a5c;color:#fff;border-radius:6px;margin-top:6px}
    #stmt .grand-inner{display:table;width:100%}
    #stmt .grand-label{display:table-cell;padding:10px 12px;vertical-align:middle;color:#dbe4f5;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:800}
    #stmt .grand-value{display:table-cell;padding:10px 12px;vertical-align:middle;text-align:right;color:#fff;font-size:16px;font-weight:900;font-variant-numeric:tabular-nums}

    /* Alt kısım */
    #stmt .warranty{font-size:9px;color:#4b5563;margin-bottom:14px;line-height:1.5;font-style:italic}
    #stmt .signature-wrap{display:table;width:100%}
    #stmt .sig-col{display:table-cell;width:50%;vertical-align:top}
    #stmt .sig-col.left{padding-right:6px}
    #stmt .sig-col.right{padding-left:6px}
    #stmt .sig-box{border:1px solid #d1d5db;border-radius:6px;padding:12px;min-height:72px;display:flex;flex-direction:column;justify-content:flex-end}
    #stmt .sig-label{font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.07em;margin-bottom:12px}
    #stmt .sig-line{flex:1;border-bottom:1px dashed #9ca3af;margin-bottom:7px}
    #stmt .sig-name{font-size:10px;color:#111827;font-weight:600}
    #stmt .legal{margin-top:20px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-style:italic;font-size:9px;color:#6b7280;line-height:1.4}
    #stmt .page-footer{position:absolute;left:0;right:0;bottom:0;border-top:1px solid #e5e7eb;padding:9px 30px 14px}
    #stmt .pf-inner{display:table;width:100%;font-size:7.5px;color:#6b7280}
    #stmt .pf-left{display:table-cell;font-weight:700;color:#374151}
    #stmt .pf-right{display:table-cell;text-align:right}
    @media print{#stmt{width:210mm;min-height:297mm}}
  `;

  return `
    <style>${css}</style>
    <div id="stmt">
      <div class="watermark">ÇINAR OTOMOTİV</div>

      <div class="header">
        <div class="header-top">
          <div class="header-left">
            <div class="logo-lockup" style="display:table;width:100%">
              <div style="display:table-cell;width:56px;height:56px">${LOGO_SVG}</div>
              <div style="display:table-cell;vertical-align:middle;padding-left:12px">
                <div class="logo-company">${esc(brandName)}</div>
                ${companyTagline ? `<div class="company-sub">${esc(companyTagline)}</div>` : ''}
                <div class="company-addr">${esc(shopAddress)}</div>
                <div class="company-addr">Tel: ${esc(shopPhone)}${shopEmail ? ` · ${esc(shopEmail)}` : ''}</div>
                ${taxLine ? `<div class="company-addr">${esc(taxLine)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="header-right">
            <div class="doc-title">${esc(docTitle)}</div>
            <div class="doc-meta">
              <div><strong>Belge No:</strong> ${esc(documentNo)}</div>
              <div><strong>Belge Tarihi:</strong> ${fdate(today)}</div>
              <div><strong>Vade Tarihi:</strong> ${fdate(dueDate)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-col">
          <div class="info-box">
            <div class="info-head">MÜŞTERİ BİLGİLERİ</div>
            <div class="info-body">
              <div class="info-row"><span class="info-label">Ad Soyad</span><span class="info-value">${esc(customerName)}</span></div>
              <div class="info-row"><span class="info-label">Telefon</span><span class="info-value">${esc(customerPhone)}</span></div>
              <div class="info-row"><span class="info-label">E-posta</span><span class="info-value">${esc(customerEmail)}</span></div>
              <div class="info-row"><span class="info-label">Şikayet / Talep</span><span class="info-value">${esc(complaint)}</span></div>
              <div class="info-row"><span class="info-label">Servis Danışmanı</span><span class="info-value">${esc(signatureOwner)}</span></div>
              <div class="info-row"><span class="info-label">Kabul Tarihi</span><span class="info-value">${intakeDate ? fdate(intakeDate) : '—'}</span></div>
            </div>
          </div>
        </div>
        <div class="info-col">
          <div class="info-box">
            <div class="info-head">ARAÇ BİLGİLERİ</div>
            <div class="info-body">
              <div class="info-row"><span class="info-label">Plaka</span><span class="info-value">${esc(plaka)}</span></div>
              <div class="info-row"><span class="info-label">Marka / Model</span><span class="info-value">${esc(vehicleBrandModel)}</span></div>
              <div class="info-row"><span class="info-label">Model Yılı</span><span class="info-value">${esc(vehicleYear)}</span></div>
              <div class="info-row"><span class="info-label">Şasi No</span><span class="info-value">${esc(chassis)}</span></div>
              <div class="info-row"><span class="info-label">Motor No</span><span class="info-value">${esc(engine)}</span></div>
              <div class="info-row"><span class="info-label">Kilometre</span><span class="info-value">${esc(km)}</span></div>
            </div>
          </div>
        </div>
      </div>

      <div class="inspect-panel">
        <div class="inspect-head">ARAÇ İNCELEME ŞEMASI</div>
        <table class="inspect-table"><tr>
          <td class="inspect-cell">${BLUEPRINT_PLAN_SVG}<div class="inspect-cap">Üstten Görünüm</div></td>
          <td class="inspect-cell">${BLUEPRINT_SIDE_SVG}<div class="inspect-cap">Yandan Görünüm</div></td>
        </tr></table>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width:80px">Tür</th>
            <th>Açıklama</th>
            <th class="num" style="width:80px">Miktar</th>
            <th class="num" style="width:110px">Birim Fiyat</th>
            <th class="num" style="width:110px">Tutar</th>
          </tr>
        </thead>
        <tbody>${itemRows.join('') || '<tr><td colspan="5" class="empty" style="text-align:center;padding:24px">Kalem bulunamadı</td></tr>'}</tbody>
      </table>

      <div class="totals-wrap">
        <div class="totals-summary">
          <div class="total-row"><div class="total-inner"><span class="total-label">Ara Toplam (KDV Hariç)</span><span class="total-value">${money(tnet, false)}</span></div></div>
          <div class="total-row"><div class="total-inner"><span class="total-label">KDV (%${numfmt(vatRateLabel)})</span><span class="total-value">${money(vatTotal, false)}</span></div></div>
          <div class="grand-row"><div class="grand-inner"><span class="grand-label">KDV DAHİL GENEL TOPLAM</span><span class="grand-value">${money(grandTotal, false)}</span></div></div>
        </div>
      </div>

      <div class="warranty">${esc(warrantyNote)}</div>

      <div class="signature-wrap">
        <div class="sig-col left">
          <div class="sig-box">
            <span class="sig-label">Müşteri Teslim Onayı / İmza</span>
            <div class="sig-line"></div>
            <span class="sig-name">${esc(customerName)}</span>
          </div>
        </div>
        <div class="sig-col right">
          <div class="sig-box">
            <span class="sig-label">Servis Danışmanı / Kaşe & İmza</span>
            <div class="sig-line"></div>
            <span class="sig-name">${esc(signatureOwner)} - ${esc(brandName)}</span>
          </div>
        </div>
      </div>

      <div class="legal">${esc(legalNote)}</div>

      <div class="page-footer">
        <div class="pf-inner">
          <span class="pf-left">${esc(companyName)}</span>
          <span class="pf-right">${esc(shopAddress)} · Tel: ${esc(shopPhone)}</span>
        </div>
      </div>
    </div>
  `;
}

export async function exportStatementPDF(
  orders: any[],
  vehicle: any,
  settings: any = {},
  options: StatementOptions = {}
) {
  if (!orders || !orders.length || !vehicle) return;

  const win = window as any;
  const plate = vehicle.plaka || vehicle.id || '';
  const documentNo = String(
    options.documentNo ||
    `CNR-${new Date().getFullYear()}-${String(orders[0]?.id || 1).padStart(3, '0')}`
  );
  const baseName = [
    'Cinar-Otomotiv',
    options.isQuote ? 'Teklif' : 'Servis-Is-Emri',
    documentNo,
    String(plate).replace(/\s+/g, '')
  ].join('-');

  toast('Döküm hazırlanıyor...');

  if (win.html2canvas && win.jspdf) {
    const host = document.createElement('div');
    host.id = 'stmt-host';
    host.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;background:#fff;z-index:9999;';
    host.innerHTML = statementHTML(orders, vehicle, settings, options);
    document.body.appendChild(host);

    try {
      try { await (document as any).fonts?.ready; } catch {}

      const stmtEl = host.querySelector('#stmt') as HTMLElement;
      const canvas = await win.html2canvas(stmtEl, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
        ignoreElements: (el: Element) => el.classList?.contains('watermark'),
        onclone: (doc: Document) => {
          const h = doc.getElementById('stmt-host');
          if (h) {
            h.style.left = '0';
            h.style.position = 'absolute';
          }
        }
      });

      const pdf = new win.jspdf.jsPDF({ unit: 'pt', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const k = pw / canvas.width;
      const pageH = Math.ceil(ph / k);

      let y = 0;
      let first = true;

      while (y < canvas.height) {
        const remaining = canvas.height - y;
        if (remaining <= 2) break;
        const h = Math.min(pageH, remaining);
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = h;
        const cx = c.getContext('2d')!;
        cx.fillStyle = '#fff';
        cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

        // Kurumsal filigran — her sayfada ortada, tek katman, %6 opaklık.
        // multiply: beyaz zemini hafifçe koyulaştırır, koyu metni bozmaz;
        // böylece metnin "arkasında" duruyormuş gibi görünür.
        cx.save();
        cx.globalCompositeOperation = 'multiply';
        cx.globalAlpha = 0.06;
        cx.fillStyle = '#0f2a5c';
        cx.font = 'bold 64px sans-serif';
        (cx as any).letterSpacing = '6px';
        cx.textAlign = 'center';
        cx.textBaseline = 'middle';
        cx.translate(canvas.width / 2, h / 2);
        cx.rotate(-0.25);
        cx.fillText('ÇINAR OTOMOTİV', 0, 0);
        cx.restore();

        if (!first) pdf.addPage();
        pdf.addImage(c.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, pw, h * k);
        first = false;
        y += h;
      }

      pdf.save(`${baseName}.pdf`);
      toast('PDF döküm hazır');
      return;
    } catch (err) {
      console.error('PDF error', err);
    } finally {
      host.remove();
    }
  }

  // Fallback: indirilebilir HTML yazdırma
  try {
    const htmlContent = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${options.title || 'Servis İş Emri ve Teklif Formu'} - ${formatPlateDisplay(plate)}</title></head><body style="margin:0;background:#eee">${statementHTML(orders, vehicle, settings, options)}</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${baseName}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast('HTML döküm indirildi');
  } catch (e) {
    toast('Döküm oluşturulamadı.');
  }
}

export function printStatement(
  orders: any[],
  vehicle: any,
  settings: any = {},
  options: StatementOptions = {}
) {
  if (!orders || !orders.length || !vehicle) return;
  const win = window.open('', '_blank', 'width=920,height=1200');
  if (!win) {
    toast('Yazdırma penceresi engellendi. Lütfen açılır pencerelere izin verin.');
    return;
  }
  const html = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${options.title || 'Servis İş Emri ve Teklif Formu'}</title><style>@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}#stmt{margin:0 auto}</style></head><body>${statementHTML(orders, vehicle, settings, options)}</body></html>`;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  window.setTimeout(() => {
    try {
      win.print();
    } catch {
      /* kullanıcı iptal etti */
    }
  }, 350);
}
