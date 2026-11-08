import { CORPORATE } from '@oto-servis/shared';
import { dateISO, fdate, money, numfmt, formatPlateDisplay, toast, todayISO } from './ui.js';

/**
 * VIP "YETKİLİ SERVİS" SERVİS İŞ EMRİ / TEKLİF FORMU (A4 PDF)
 *
 * Lüks yetkili servis (Mercedes/BMW) referans şablonu:
 *  - Sol üstte dairesel, metalik kırmızı kurumsal amblem + ÇINAR OTOMOTİV
 *  - Sağ üstte koyu lacivert "İŞ EMRİ / TEKLİF FORMU" bandı, belge no ve tarih
 *  - Üç sütunlu üst gövde: MÜŞTERİ | ARAÇ | vektörel inceleme şeması
 *  - KOD | AÇIKLAMA | TÜR | MİKTAR | BİRİM FİYAT | TUTAR matrisi (yatay çizgiler)
 *  - Sağa hizalı Ara Toplam / KDV / GENEL TOPLAM (lacivert blok)
 *  - Garanti beyanı + simetrik çift imza/kaşe blokları
 *  - Tüm sayfada %6 opaklık "ÇINAR OTOMOTİV" filigranı
 *
 * Tüm şirket kimliği `settings` parametresinden gelir.
 */

/**
 * Dairesel, metalik kırmızı kurumsal amblem.
 * Halka metalik gradyan, iç disk radyal kırmızı gradyan ve cam parlaması
 * ile 3D/parlak bir görünüm verir. Metin içermez.
 */
const LOGO_SVG = `
<svg class="stmt-logo" viewBox="0 0 100 100" width="66" height="66" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <radialGradient id="cinarRed" cx="34%" cy="28%" r="80%">
      <stop offset="0%" stop-color="#ff6b6f"/>
      <stop offset="40%" stop-color="#d42127"/>
      <stop offset="100%" stop-color="#7f0f14"/>
    </radialGradient>
    <linearGradient id="cinarRing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="28%" stop-color="#cbd5e1"/>
      <stop offset="52%" stop-color="#8b98a8"/>
      <stop offset="74%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#aeb9c6"/>
    </linearGradient>
    <linearGradient id="cinarShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.55"/>
      <stop offset="52%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#cinarRing)"/>
  <circle cx="50" cy="50" r="42" fill="url(#cinarRed)"/>
  <path d="M50 18 C41 29 37 42 40 54 C43 64 47 71 52 76 C57 71 61 64 64 54 C67 42 63 29 54 18 C52 24 52 24 50 18 Z" fill="#ffffff" fill-opacity="0.94"/>
  <path d="M52 25 L52 70" stroke="#8f1116" stroke-width="2" stroke-linecap="round"/>
  <path d="M52 40 L44 34 M52 50 L44 44 M52 60 L44 54" stroke="#8f1116" stroke-width="1.4" stroke-linecap="round"/>
  <path d="M52 40 L60 34 M52 50 L60 44 M52 60 L60 54" stroke="#8f1116" stroke-width="1.4" stroke-linecap="round"/>
  <ellipse cx="50" cy="31" rx="33" ry="19" fill="url(#cinarShine)"/>
  <circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff" stroke-opacity="0.30" stroke-width="1.5"/>
</svg>`;

/**
 * Vektörel araç inceleme şeması — üstten görünüm.
 * İnce, koyu-slate çizgiler (stroke #334155, 1px) ile resmi servis ızgarası.
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
 * Vektörel araç inceleme şeması — yandan görünüm.
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
    : 'Özel Servis & Bakım Hizmetleri';
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
    `IS-${new Date().getFullYear()}-${String(orders[0]?.id || 1).padStart(4, '0')}`
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
  let tOdenen = 0;
  let tKalan = 0;
  const itemRows: string[] = [];

  for (const o of orders) {
    tg += (o.brut_tutar_kurus || 0) / 100;
    tnet += (o.net_tutar_kurus || 0) / 100;
    tvat += (o.kdv_tutar_kurus || 0) / 100;
    tOdenen += (o.odenen_tutar_kurus || 0) / 100;
    tKalan += (o.kalan_tutar_kurus || 0) / 100;

    const orderMeta = orders.length > 1
      ? `<div class="item-meta">İş emri #${esc(o.id)} · ${fdate(o.giris_tarihi || o.created_at)}${o.km || o.kilometre ? ` · ${numfmt(o.km || o.kilometre)} km` : ''}</div>`
      : '';
    const lines = Array.isArray(o.kalemler) ? o.kalemler : [];

    if (!lines.length) {
      itemRows.push(`<tr>
        <td class="code">—</td>
        <td><div class="item">Kalem bulunamadı</div>${orderMeta}</td>
        <td><span class="rtag tag-part">Parça</span></td>
        <td class="num">—</td>
        <td class="num">—</td>
        <td class="num amt">—</td>
      </tr>`);
      continue;
    }

    for (let li = 0; li < lines.length; li++) {
      const l = lines[li];
      const isLabor = l.tur === 'iscilik';
      const qty = Number(l.adet) || 1;
      const unit = (l.birim_fiyat_kurus || 0) / 100;
      const rowTotal = qty * unit;
      const birim = l.birim && String(l.birim).toLowerCase() !== 'adet' ? ` ${l.birim}` : '';
      const code = l.parca?.kod || l.kod || l.stok_kodu ||
        `${isLabor ? 'ISC' : 'PRC'}-${String(li + 1).padStart(3, '0')}`;
      itemRows.push(`<tr>
        <td class="code">${esc(code)}</td>
        <td><div class="item">${esc(l.ad) || '—'}</div>${orderMeta}</td>
        <td><span class="rtag ${isLabor ? 'tag-labor' : 'tag-part'}">${isLabor ? 'İşçilik' : 'Parça'}</span></td>
        <td class="num">${numfmt(qty)}${esc(birim)}</td>
        <td class="num">${money(unit, false)}</td>
        <td class="num amt">${money(rowTotal, false)}</td>
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
  const signatureOwner = settings.shop_owner || CORPORATE.owner;
  const legalNote = 'Bu belge bilgi amaçlı servis dökümüdür, resmi fatura yerine geçmesi için faturaya dönüştürülmelidir.';
  const warrantyNote = 'Değişen yedek parçalar 1 Yıl / 10.000 KM firmamız ve üretici garantisi altındadır. Servis işlemleriyle ilgili tüm garanti koşulları için servis departmanımızla iletişime geçebilirsiniz.';
  const brandUpper = brandName.toLocaleUpperCase('tr');

  const css = `
    @page{size:A4;margin:0}
    #stmt{width:794px;min-height:1123px;box-sizing:border-box;background:#fff;color:#111827;font-family:"IBM Plex Sans",Arial,sans-serif;font-size:11px;line-height:1.4;position:relative;overflow:hidden;padding:0 0 54px 0}
    #stmt *{box-sizing:border-box}

    /* Filigran — %6, ortada, içeriğin arkasında (baskı/HTML için) */
    #stmt .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);font-size:62px;letter-spacing:6px;font-weight:900;color:#0f2a5c;opacity:0.06;pointer-events:none;z-index:0;white-space:nowrap;mix-blend-mode:multiply}

    /* Başlık */
    #stmt .header{position:relative;z-index:1;padding:20px 30px 16px;border-bottom:3px solid #0f2a5c;margin-bottom:14px}
    #stmt .header-top{display:table;width:100%}
    #stmt .header-left{display:table-cell;vertical-align:middle;width:58%}
    #stmt .header-right{display:table-cell;vertical-align:middle;width:42%;text-align:right}
    #stmt .logo-lockup{display:table;width:100%}
    #stmt .logo-cell{display:table-cell;width:70px;vertical-align:middle}
    #stmt .brand-cell{display:table-cell;vertical-align:middle;padding-left:12px}
    #stmt .logo-company{font-size:20px;font-weight:900;color:#0f2a5c;letter-spacing:1.2px;text-transform:uppercase;line-height:1.15}
    #stmt .company-sub{font-size:10px;color:#4b5563;margin-top:2px;letter-spacing:.02em}
    #stmt .company-addr{font-size:9.5px;color:#4b5563;margin-top:4px}
    #stmt .doc-banner{display:block;width:100%;background:#0f2a5c;color:#fff;border-radius:6px;padding:12px 16px;text-align:right;border-bottom:3px solid #d42127}
    #stmt .doc-title{font-size:15px;font-weight:900;color:#fff;text-transform:uppercase;letter-spacing:1px;line-height:1.2}
    #stmt .doc-meta{font-size:9px;color:#cbd5e1;margin-top:6px}
    #stmt .doc-meta div{margin-bottom:2px}
    #stmt .doc-meta strong{color:#e2e8f0}

    /* Üç sütunlu bilgi ızgarası: Müşteri | Araç | İnceleme şeması */
    #stmt .info-grid{display:table;width:100%;margin-bottom:14px;border-collapse:separate;border-spacing:8px 0}
    #stmt .info-col{display:table-cell;vertical-align:top}
    #stmt .info-col.customer{width:31%}
    #stmt .info-col.vehicle{width:35%}
    #stmt .info-col.blueprint-col{width:34%}
    #stmt .info-box{min-height:200px;border:1px solid #d1d5db;border-radius:6px;overflow:hidden;background:#F4F6F8}
    #stmt .info-head{background:#e6edf5;color:#1e3a5c;font-size:8.5px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #cfd8e3}
    #stmt .info-body{padding:11px 12px;font-size:10px;background:#F4F6F8}
    #stmt .info-row{display:table;width:100%;margin-bottom:6px;border-bottom:1px solid #e2e8f0}
    #stmt .info-row:last-child{border-bottom:none}
    #stmt .info-label{display:table-cell;width:42%;font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.05em;padding-top:1px}
    #stmt .info-value{display:table-cell;width:58%;font-size:9.5px;color:#0f172a;font-weight:600}
    #stmt .blueprint-box{background:#ffffff}
    #stmt .blueprint-body{padding:8px 8px 6px;background:#ffffff}
    #stmt .blueprint-view{text-align:center;margin-bottom:4px}
    #stmt .blueprint-view:last-child{margin-bottom:0}
    #stmt .inspect-svg{display:block;width:190px;height:65px;margin:0 auto}
    #stmt .inspect-cap{font-size:7px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-top:1px}

    /* Ürün/işlem matrisi — yalnızca yatay çizgiler + zebra satırlar */
    #stmt .items-table{width:100%;border-collapse:collapse;margin-bottom:14px}
    #stmt .items-table th{background:#e6edf5;color:#1e3a5c;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;padding:8px 10px;border-bottom:1px solid #cbd5e1;text-align:left}
    #stmt .items-table th.num{text-align:right}
    #stmt .items-table td{padding:8px 10px;border-bottom:1px solid #e5e7eb;vertical-align:top;font-size:9.5px}
    #stmt .items-table td.num{text-align:right;font-variant-numeric:tabular-nums}
    #stmt .items-table tr:nth-child(even) td{background:#f8fafc}
    #stmt .items-table td.code{font-size:8.5px;color:#64748b;font-weight:700;font-variant-numeric:tabular-nums}
    #stmt .rtag{display:inline-block;font-size:7.5px;font-weight:800;padding:1.5px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.03em}
    #stmt .tag-part{background:#e8eefc;color:#1e3a8a}
    #stmt .tag-labor{background:#e7f6ec;color:#166534}
    #stmt .item{font-weight:600;color:#111827}
    #stmt .item-meta{font-size:8px;color:#6b7280;margin-top:2px;line-height:1.3}

    /* Finansal toplamlar — sağa hizalı blok */
    #stmt .totals-wrap{display:table;width:100%;margin-bottom:14px}
    #stmt .totals-left{display:table-cell;width:56%;vertical-align:bottom}
    #stmt .totals-summary{display:table-cell;width:44%;vertical-align:bottom}
    #stmt .pay-box{display:block;width:220px;border:1px solid #e2e8f0;border-radius:6px;padding:8px 12px;background:#f8fafc;text-align:left}
    #stmt .pay-title{font-size:7.5px;font-weight:800;color:#64748b;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
    #stmt .pay-row{display:table;width:100%;font-size:9px;color:#475569;margin-top:2px}
    #stmt .pay-row span{display:table-cell}
    #stmt .pay-row b{display:table-cell;text-align:right;color:#0f172a}
    #stmt .total-row{display:table;width:100%;border-bottom:1px solid #e5e7eb}
    #stmt .total-label{display:table-cell;padding:6px 12px;font-size:9.5px;color:#4b5563}
    #stmt .total-value{display:table-cell;padding:6px 12px;text-align:right;font-size:10.5px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums}
    #stmt .grand-row{background:#0f2a5c;color:#fff;border-radius:6px;margin-top:6px}
    #stmt .grand-inner{display:table;width:100%}
    #stmt .grand-label{display:table-cell;padding:11px 12px;vertical-align:middle;color:#dbe4f5;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:800}
    #stmt .grand-value{display:table-cell;padding:11px 12px;vertical-align:middle;text-align:right;color:#fff;font-size:16px;font-weight:900;font-variant-numeric:tabular-nums}

    /* Alt kısım */
    #stmt .warranty{font-size:9px;color:#4b5563;margin-bottom:16px;line-height:1.5;font-style:italic}
    #stmt .signature-wrap{display:table;width:100%}
    #stmt .sig-col{display:table-cell;width:50%;vertical-align:top}
    #stmt .sig-col.left{padding-right:6px}
    #stmt .sig-col.right{padding-left:6px}
    #stmt .sig-box{border:1px solid #d1d5db;border-radius:6px;padding:12px;min-height:76px;display:flex;flex-direction:column;justify-content:flex-end}
    #stmt .sig-label{font-size:8px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:.06em;margin-bottom:14px;line-height:1.35}
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
            <div class="logo-lockup">
              <div class="logo-cell">${LOGO_SVG}</div>
              <div class="brand-cell">
                <div class="logo-company">${esc(brandUpper)}</div>
                <div class="company-sub">${esc(companyTagline)}</div>
                <div class="company-addr">${esc(shopAddress)}</div>
                <div class="company-addr">Tel: ${esc(shopPhone)}${shopEmail ? ` · ${esc(shopEmail)}` : ''}</div>
                ${taxLine ? `<div class="company-addr">${esc(taxLine)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="header-right">
            <div class="doc-banner">
              <div class="doc-title">${esc(docTitle)}</div>
              <div class="doc-meta">
                <div><strong>Belge No:</strong> ${esc(documentNo)}</div>
                <div><strong>Belge Tarihi:</strong> ${fdate(today)}</div>
                <div><strong>Vade Tarihi:</strong> ${fdate(dueDate)}</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-col customer">
          <div class="info-box">
            <div class="info-head">MÜŞTERİ BİLGİLERİ</div>
            <div class="info-body">
              <div class="info-row"><span class="info-label">Ad Soyad</span><span class="info-value">${esc(customerName)}</span></div>
              <div class="info-row"><span class="info-label">Telefon</span><span class="info-value">${esc(customerPhone)}</span></div>
              <div class="info-row"><span class="info-label">E-posta</span><span class="info-value">${esc(customerEmail)}</span></div>
              <div class="info-row"><span class="info-label">Şikayet / Talep</span><span class="info-value">${esc(complaint)}</span></div>
            </div>
          </div>
        </div>
        <div class="info-col vehicle">
          <div class="info-box">
            <div class="info-head">ARAÇ BİLGİLERİ</div>
            <div class="info-body">
              <div class="info-row"><span class="info-label">Plaka</span><span class="info-value">${esc(plaka)}</span></div>
              <div class="info-row"><span class="info-label">Marka / Model</span><span class="info-value">${esc(vehicleBrandModel)}</span></div>
              <div class="info-row"><span class="info-label">Model Yılı</span><span class="info-value">${esc(vehicleYear)}</span></div>
              <div class="info-row"><span class="info-label">Şasi No (VIN)</span><span class="info-value">${esc(chassis)}</span></div>
              <div class="info-row"><span class="info-label">Motor No</span><span class="info-value">${esc(engine)}</span></div>
              <div class="info-row"><span class="info-label">Kilometre</span><span class="info-value">${esc(km)}</span></div>
            </div>
          </div>
        </div>
        <div class="info-col blueprint-col">
          <div class="info-box blueprint-box">
            <div class="info-head">ARAÇ İNCELEME ŞEMASI</div>
            <div class="blueprint-body">
              <div class="blueprint-view">${BLUEPRINT_PLAN_SVG}<div class="inspect-cap">Üstten Görünüm</div></div>
              <div class="blueprint-view">${BLUEPRINT_SIDE_SVG}<div class="inspect-cap">Yandan Görünüm</div></div>
            </div>
          </div>
        </div>
      </div>

      <table class="items-table">
        <thead>
          <tr>
            <th style="width:64px">KOD</th>
            <th>AÇIKLAMA / PARÇA / İŞLEM</th>
            <th style="width:66px">TÜR</th>
            <th class="num" style="width:56px">MİKTAR</th>
            <th class="num" style="width:88px">BİRİM FİYAT</th>
            <th class="num" style="width:88px">TUTAR</th>
          </tr>
        </thead>
        <tbody>${itemRows.join('') || '<tr><td colspan="6" class="empty" style="text-align:center;padding:24px">Kalem bulunamadı</td></tr>'}</tbody>
      </table>

      <div class="totals-wrap">
        <div class="totals-left">
          ${(tOdenen > 0 || tKalan > 0) ? `<div class="pay-box">
            <div class="pay-title">Ödeme Durumu</div>
            <div class="pay-row"><span>Ödenen</span><b>${money(tOdenen, false)}</b></div>
            <div class="pay-row"><span>Kalan</span><b>${money(tKalan, false)}</b></div>
          </div>` : ''}
        </div>
        <div class="totals-summary">
          <div class="total-row"><div class="total-inner"><span class="total-label">Ara Toplam (KDV Hariç)</span><span class="total-value">${money(tnet, false)}</span></div></div>
          <div class="total-row"><div class="total-inner"><span class="total-label">KDV (%${numfmt(vatRateLabel)})</span><span class="total-value">${money(vatTotal, false)}</span></div></div>
          <div class="grand-row"><div class="grand-inner"><span class="grand-label">GENEL TOPLAM</span><span class="grand-value">${money(grandTotal, false)}</span></div></div>
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
            <span class="sig-label">Servis Danışmanı / Kaşe & İmza (${esc(signatureOwner)})</span>
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
    `IS-${new Date().getFullYear()}-${String(orders[0]?.id || 1).padStart(4, '0')}`
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
        // böylece tablo satırlarının "arkasında" duruyormuş gibi görünür.
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
