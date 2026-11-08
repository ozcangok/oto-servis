import { CORPORATE } from '@oto-servis/shared';
import { dateISO, fdate, money, numfmt, formatPlateDisplay, toast, todayISO } from './ui.js';

/**
 * VIP "YETKİLİ SERVİS" SERVİS İŞ EMRİ / TEKLİF FORMU (A4 PDF)
 *
 * Lüks yetkili servis (Mercedes/BMW) referans şablonu:
 *  - Sol üstte dairesel, metalik kırmızı kurumsal amblem + ÇINAR OTOMOTİV
 *  - Sağ üstte sade siyah "İŞ EMRİ / TEKLİF FORMU" başlığı, belge no ve tarih
 *  - Üç sütunlu üst gövde: MÜŞTERİ | ARAÇ | üç görünümlü teknik kroki
 *  - KOD | AÇIKLAMA | TÜR | MİKTAR | BİRİM FİYAT | TUTAR matrisi (yatay çizgiler)
 *  - Sağa hizalı Ara Toplam / KDV / GENEL TOPLAM (siyah blok)
 *  - Garanti beyanı solda + simetrik çift imza/kaşe blokları sağda
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
 * Referans şablondaki teknik kroki dili: ince siyah çizgiler, beyaz gövde,
 * gri detay çizgileri ve köşe ölçü noktaları. Üç ayrı görünüm kullanılır.
 */
const BLUEPRINT_PLAN_SVG = `
<svg class="inspect-svg" viewBox="0 0 300 110" width="300" height="110" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#111827" stroke-width="0.9" fill="#ffffff" stroke-linejoin="round" stroke-linecap="round">
    <path d="M46 55 C46 41 52 28 64 24 L178 24 C196 24 214 29 230 35 C244 40 256 46 264 50 C270 52 274 53 274 55 C274 57 270 58 264 60 C256 64 244 70 230 75 C214 81 196 86 178 86 L64 86 C52 82 46 69 46 55 Z"/>
    <rect x="62" y="18" width="26" height="9" rx="4.5"/>
    <rect x="62" y="83" width="26" height="9" rx="4.5"/>
    <rect x="188" y="18" width="26" height="9" rx="4.5"/>
    <rect x="188" y="83" width="26" height="9" rx="4.5"/>
    <path d="M196 26 C210 38 210 72 196 84" fill="none" stroke="#6b7280"/>
    <path d="M116 26 C102 38 102 72 116 84" fill="none" stroke="#6b7280"/>
    <path d="M124 26 L188 26 L196 36 L196 74 L188 84 L124 84 L116 74 L116 36 Z" fill="none" stroke="#6b7280"/>
    <path d="M192 18 L202 15 L204 20 L194 22 Z"/>
    <path d="M192 92 L202 95 L204 90 L194 88 Z"/>
    <path d="M212 28 L252 38 M212 82 L252 72" fill="none" stroke="#d1d5db"/>
    <path d="M76 28 L76 82" fill="none" stroke="#d1d5db"/>
    <path d="M258 40 L270 44 M258 70 L270 66" fill="none" stroke="#9ca3af"/>
    <path d="M266 55 L278 55" fill="none" stroke="#9ca3af"/>
    <path d="M50 41 L60 44 M50 69 L60 66" fill="none" stroke="#9ca3af"/>
  </g>
  <g fill="#111827">
    <circle cx="18" cy="16" r="1.4"/><circle cx="282" cy="16" r="1.4"/>
    <circle cx="18" cy="94" r="1.4"/><circle cx="282" cy="94" r="1.4"/>
  </g>
</svg>`;

const BLUEPRINT_SIDE_SVG = `
<svg class="inspect-svg" viewBox="0 0 300 110" width="300" height="110" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#111827" stroke-width="0.9" fill="#ffffff" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="90" cy="88" r="17"/>
    <circle cx="90" cy="88" r="8" fill="none"/>
    <circle cx="230" cy="88" r="17"/>
    <circle cx="230" cy="88" r="8" fill="none"/>
    <path d="M18 88 L18 76 C18 68 24 64 34 62 L68 56 L100 36 C106 32 114 30 122 30 L184 30 C194 30 202 34 208 40 L238 62 L276 65 C290 67 294 74 294 82 L294 88 L246 88 C246 77 238 71 230 71 C222 71 214 77 214 88 L106 88 C106 77 98 71 90 71 C82 71 74 77 74 88 Z"/>
    <path d="M104 38 L142 38 L142 58 L104 58 Z" fill="none" stroke="#6b7280"/>
    <path d="M148 38 L184 38 L206 58 L148 58 Z" fill="none" stroke="#6b7280"/>
    <path d="M142 58 L142 86 M206 58 L206 86" fill="none" stroke="#9ca3af"/>
    <path d="M120 64 L132 64 M160 64 L172 64" fill="none" stroke="#9ca3af"/>
    <path d="M104 42 L98 40 L96 45 L102 47 Z"/>
    <path d="M282 70 L292 72" fill="none" stroke="#9ca3af"/>
    <path d="M20 70 L32 72" fill="none" stroke="#9ca3af"/>
    <path d="M38 62 L70 56" fill="none" stroke="#d1d5db"/>
    <path d="M240 62 L276 65" fill="none" stroke="#d1d5db"/>
  </g>
  <g fill="#111827">
    <circle cx="18" cy="16" r="1.4"/><circle cx="282" cy="16" r="1.4"/>
    <circle cx="18" cy="100" r="1.4"/><circle cx="282" cy="100" r="1.4"/>
  </g>
</svg>`;

const BLUEPRINT_PLAN_LARGE_SVG = `
<svg class="inspect-svg" viewBox="0 0 300 110" width="300" height="110" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#111827" stroke-width="0.9" fill="#ffffff" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="52" cy="94" rx="12" ry="8"/>
    <ellipse cx="248" cy="94" rx="12" ry="8"/>
    <path d="M100 16 C126 12 174 12 200 16 L232 34 L250 52 L262 78 C265 88 259 94 249 94 L51 94 C41 94 35 88 38 78 L50 52 L68 34 Z"/>
    <path d="M84 42 L216 42 L202 26 L98 26 Z" fill="none" stroke="#6b7280"/>
    <path d="M98 26 C120 22 180 22 202 26" fill="none" stroke="#6b7280"/>
    <path d="M68 34 L84 42 M232 34 L216 42" fill="none" stroke="#6b7280"/>
    <path d="M66 50 L234 50" fill="none" stroke="#d1d5db"/>
    <rect x="112" y="60" width="76" height="20" rx="4"/>
    <path d="M116 65 L184 65 M116 70 L184 70 M116 75 L184 75" fill="none" stroke="#9ca3af"/>
    <path d="M60 56 L104 60 L102 74 L58 70 Z"/>
    <path d="M240 56 L196 60 L198 74 L242 70 Z"/>
    <path d="M44 82 L256 82 L252 92 L48 92 Z"/>
    <rect x="132" y="84" width="36" height="7" rx="1" fill="none" stroke="#9ca3af"/>
    <circle cx="60" cy="87" r="3"/>
    <circle cx="240" cy="87" r="3"/>
    <path d="M66 46 L48 42 L46 49 L60 53 Z"/>
    <path d="M234 46 L252 42 L254 49 L240 53 Z"/>
    <path d="M150 50 L150 58" fill="none" stroke="#d1d5db"/>
    <path d="M118 44 L140 40 M182 40 L204 44" fill="none" stroke="#9ca3af"/>
  </g>
  <g fill="#111827">
    <circle cx="14" cy="12" r="1.4"/><circle cx="286" cy="12" r="1.4"/>
    <circle cx="14" cy="100" r="1.4"/><circle cx="286" cy="100" r="1.4"/>
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
    #stmt .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);font-size:62px;letter-spacing:6px;font-weight:900;color:#111827;opacity:0.06;pointer-events:none;z-index:0;white-space:nowrap;mix-blend-mode:multiply}

    /* Başlık — referans: sade, siyah, kondanse tipografi */
    #stmt .header{position:relative;z-index:1;padding:20px 30px 16px;border-bottom:2px solid #111827;margin-bottom:14px}
    #stmt .header-top{display:table;width:100%}
    #stmt .header-left{display:table-cell;vertical-align:middle;width:58%}
    #stmt .header-right{display:table-cell;vertical-align:middle;width:42%;text-align:right}
    #stmt .logo-lockup{display:table;width:100%}
    #stmt .logo-cell{display:table-cell;width:70px;vertical-align:middle}
    #stmt .brand-cell{display:table-cell;vertical-align:middle;padding-left:12px}
    #stmt .logo-company{font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:23px;font-weight:700;color:#111827;letter-spacing:.01em;text-transform:uppercase;line-height:1.05}
    #stmt .company-sub{font-size:10px;color:#4b5563;margin-top:2px;letter-spacing:.02em}
    #stmt .company-addr{font-size:9.5px;color:#4b5563;margin-top:3px}
    #stmt .doc-banner{display:block;width:100%;text-align:right;padding:0}
    #stmt .doc-title{font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:21px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:.03em;line-height:1.1}
    #stmt .doc-meta{font-size:9px;color:#374151;margin-top:6px}
    #stmt .doc-meta div{margin-bottom:2px}
    #stmt .doc-meta strong{color:#111827;font-weight:700}

    /* Üç sütunlu bilgi ızgarası: Müşteri | Araç | İnceleme şeması */
    #stmt .info-grid{display:table;width:100%;margin-bottom:14px;border-collapse:separate;border-spacing:8px 0}
    #stmt .info-col{display:table-cell;vertical-align:top}
    #stmt .info-col.customer{width:31%}
    #stmt .info-col.vehicle{width:35%}
    #stmt .info-col.blueprint-col{width:34%}
    #stmt .info-box{min-height:215px;border:1px solid #c9d0d8;border-radius:5px;overflow:hidden;background:#F4F6F8}
    #stmt .info-head{background:#E9EDF2;color:#111827;font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:8px 12px;border-bottom:1px solid #c9d0d8}
    #stmt .info-body{padding:11px 12px;font-size:10px;background:#F4F6F8}
    #stmt .info-row{display:table;width:100%;margin-bottom:6px;border-bottom:1px solid #e2e8f0}
    #stmt .info-row:last-child{border-bottom:none}
    #stmt .info-label{display:table-cell;width:42%;font-size:8px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.05em;padding-top:1px}
    #stmt .info-value{display:table-cell;width:58%;font-size:9.5px;color:#111827;font-weight:600}
    #stmt .blueprint-box{background:#ffffff}
    #stmt .blueprint-body{padding:10px 8px 8px;background:#ffffff}
    #stmt .bp-row{display:table;width:100%;table-layout:fixed;margin-bottom:2px}
    #stmt .bp-cell{display:table-cell;width:50%;text-align:center;vertical-align:top;padding:0 2px}
    #stmt .bp-large{text-align:center;margin-top:2px}
    #stmt .inspect-svg{display:block;margin:0 auto}
    #stmt .bp-cell .inspect-svg{width:125px;height:58px}
    #stmt .bp-large .inspect-svg{width:245px;height:82px}
    #stmt .inspect-cap{font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:7px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-top:1px}

    /* Ürün/işlem matrisi — yalnızca yatay çizgiler */
    #stmt .items-table{width:100%;border-collapse:collapse;margin-bottom:14px}
    #stmt .items-table th{background:#F4F6F8;color:#111827;font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:8.5px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;padding:8px 10px;border-top:1px solid #111827;border-bottom:1px solid #111827;text-align:left}
    #stmt .items-table th.num{text-align:right}
    #stmt .items-table td{padding:8px 10px;border-bottom:1px solid #d1d5db;vertical-align:top;font-size:9.5px}
    #stmt .items-table td.num{text-align:right;font-variant-numeric:tabular-nums}
    #stmt .items-table td.code{font-size:8.5px;color:#4b5563;font-weight:700;font-variant-numeric:tabular-nums}
    #stmt .rtag{display:inline-block;font-size:7.5px;font-weight:700;padding:1.5px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.03em;background:#f3f4f6;color:#111827;border:1px solid #e5e7eb}
    #stmt .tag-part{background:#f3f4f6;color:#111827}
    #stmt .tag-labor{background:#f3f4f6;color:#111827}
    #stmt .item{font-weight:600;color:#111827}
    #stmt .item-meta{font-size:8px;color:#6b7280;margin-top:2px;line-height:1.3}

    /* Finansal toplamlar — sağa hizalı blok */
    #stmt .totals-wrap{display:table;width:100%;margin-bottom:14px}
    #stmt .totals-left{display:table-cell;width:60%;vertical-align:bottom}
    #stmt .totals-summary{display:table-cell;width:40%;vertical-align:bottom}
    #stmt .pay-box{display:block;width:220px;border:1px solid #e5e7eb;border-radius:5px;padding:8px 12px;background:#f9fafb;text-align:left}
    #stmt .pay-title{font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:7.5px;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:.08em;margin-bottom:4px}
    #stmt .pay-row{display:table;width:100%;font-size:9px;color:#4b5563;margin-top:2px}
    #stmt .pay-row span{display:table-cell}
    #stmt .pay-row b{display:table-cell;text-align:right;color:#111827}
    #stmt .total-row{display:table;width:100%;border-bottom:1px solid #e5e7eb}
    #stmt .total-label{display:table-cell;padding:6px 12px;font-size:9.5px;color:#374151}
    #stmt .total-value{display:table-cell;padding:6px 12px;text-align:right;font-size:10.5px;font-weight:700;color:#111827;font-variant-numeric:tabular-nums}
    #stmt .grand-row{background:#111827;color:#fff;border-radius:4px;margin-top:6px}
    #stmt .grand-inner{display:table;width:100%}
    #stmt .grand-label{display:table-cell;padding:11px 12px;vertical-align:middle;color:#e5e7eb;font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:9.5px;text-transform:uppercase;letter-spacing:.06em;font-weight:700}
    #stmt .grand-value{display:table-cell;padding:11px 12px;vertical-align:middle;text-align:right;color:#fff;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}

    /* Alt kısım — garanti metni solda, imza blokları sağda */
    #stmt .footer-grid{display:table;width:100%;margin-top:16px}
    #stmt .warranty-col{display:table-cell;width:42%;vertical-align:top;padding-right:14px}
    #stmt .warranty{font-size:8.5px;color:#4b5563;line-height:1.5;font-style:italic}
    #stmt .sig-col{display:table-cell;width:29%;vertical-align:top;padding-left:6px}
    #stmt .sig-col.right{padding-left:12px}
    #stmt .sig-box{border:1px solid #c9d0d8;border-radius:4px;padding:10px;min-height:72px;display:flex;flex-direction:column;justify-content:flex-end}
    #stmt .sig-label{font-family:"IBM Plex Sans Condensed","Arial Narrow",sans-serif;font-size:8px;font-weight:700;color:#4b5563;text-transform:uppercase;letter-spacing:.05em;margin-bottom:14px;line-height:1.35}
    #stmt .sig-line{flex:1;border-bottom:1px dashed #9ca3af;margin-bottom:6px}
    #stmt .sig-name{font-size:9.5px;color:#111827;font-weight:600}
    #stmt .legal{margin-top:14px;padding-top:10px;border-top:1px solid #e5e7eb;text-align:center;font-style:italic;font-size:8.5px;color:#6b7280;line-height:1.4}
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
              <div class="bp-row">
                <div class="bp-cell">${BLUEPRINT_PLAN_SVG}<div class="inspect-cap">Üstten Görünüm</div></div>
                <div class="bp-cell">${BLUEPRINT_SIDE_SVG}<div class="inspect-cap">Yandan Görünüm</div></div>
              </div>
              <div class="bp-large">${BLUEPRINT_PLAN_LARGE_SVG}<div class="inspect-cap">Detaylı Görünüm</div></div>
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
          <div class="total-row"><div class="total-inner"><span class="total-label">Ara Toplam:</span><span class="total-value">${money(tnet, false)}</span></div></div>
          <div class="total-row"><div class="total-inner"><span class="total-label">%${numfmt(vatRateLabel)} KDV:</span><span class="total-value">${money(vatTotal, false)}</span></div></div>
          <div class="grand-row"><div class="grand-inner"><span class="grand-label">GENEL TOPLAM:</span><span class="grand-value">${money(grandTotal, false)}</span></div></div>
        </div>
      </div>

      <div class="footer-grid">
        <div class="warranty-col">
          <div class="warranty">${esc(warrantyNote)}</div>
        </div>
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
        cx.fillStyle = '#111827';
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
