import { dateISO, fdate, money, numfmt, formatPlateDisplay, toast, todayISO } from './ui.js';

/**
 * VIP "YETKİLİ SERVİS" SERVİS İŞ EMRİ / TEKLİF FORMU (A4 PDF)
 *
 * Lüks yetkili servis (Mercedes/BMW) referans şablonu:
 *  - Sol üstte gerçek kurumsal logo + canlı ayarlardan gelen şirket adı
 *  - Sağ üstte sade siyah "İŞ EMRİ / TEKLİF FORMU" başlığı, belge no ve tarih
 *  - Üç sütunlu üst gövde: MÜŞTERİ | ARAÇ | üç görünümlü teknik kroki
 *  - KOD | AÇIKLAMA | TÜR | MİKTAR | BİRİM FİYAT | TUTAR matrisi (yatay çizgiler)
 *  - Sağa hizalı Ara Toplam / KDV / GENEL TOPLAM (siyah blok)
 *  - Garanti beyanı solda + simetrik çift imza/kaşe blokları sağda
 *  - Tüm sayfada %6 opaklık, canlı ayarlardan gelen şirket adı filigranı
 *
 * Tüm şirket kimliği yalnızca `settings` parametresinden gelir; modülde
 * hiçbir sabit adres, telefon, vergi no veya şirket adı yedeği tutulmaz.
 */

/**
 * 3D metalik "Ç" monogramı.
 * Fırçalanmış metal halka + lacivert disk + ışık parlaması; lüks yetkili
 * servis belgelerindeki kurumsal künye hissini verir.
 */
const LOGO_SVG = `
<svg class="stmt-logo" viewBox="0 0 100 100" width="56" height="56" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <defs>
    <linearGradient id="cinarRing" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f8fafc"/>
      <stop offset="22%" stop-color="#cbd5e1"/>
      <stop offset="48%" stop-color="#64748b"/>
      <stop offset="72%" stop-color="#e2e8f0"/>
      <stop offset="100%" stop-color="#94a3b8"/>
    </linearGradient>
    <radialGradient id="cinarDisc" cx="34%" cy="28%" r="78%">
      <stop offset="0%" stop-color="#334155"/>
      <stop offset="52%" stop-color="#0f172a"/>
      <stop offset="100%" stop-color="#020617"/>
    </radialGradient>
    <linearGradient id="cinarShine" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.5"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <circle cx="50" cy="50" r="48" fill="url(#cinarRing)"/>
  <circle cx="50" cy="50" r="42" fill="url(#cinarDisc)"/>
  <circle cx="50" cy="50" r="42" fill="none" stroke="#ffffff" stroke-opacity="0.22" stroke-width="1.5"/>
  <text x="51" y="69" text-anchor="middle" font-family="'Inter','Segoe UI',system-ui,-apple-system,sans-serif" font-size="52" font-weight="700" fill="#020617" opacity="0.55">Ç</text>
  <text x="50" y="68" text-anchor="middle" font-family="'Inter','Segoe UI',system-ui,-apple-system,sans-serif" font-size="52" font-weight="700" fill="#f8fafc">Ç</text>
  <ellipse cx="50" cy="30" rx="34" ry="20" fill="url(#cinarShine)"/>
</svg>`;

/**
 * 3 görünümlü mühendislik krokisi — yazıcı dostu saf beyaz zemin üzerinde
 * koyu slate çizgiler. Üstten, yandan ve önden modern sedan vektörleri.
 *
 * Not: Bu çizimler mürekkep tasarrufu için dolgusuzdur; yalnızca ince
 * kontur çizgileri kullanır. Oranlar gerçek bir sedan siluetine göre
 * (uzun kaput, eğimli ön cam, akıcı tavan, kısa bagaj) kurgulanmıştır.
 */
const BLUEPRINT_PLAN_SVG = `
<svg class="inspect-svg" viewBox="0 0 320 140" width="320" height="140" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#1E293B" stroke-width="1.4" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M36 42 C44 30 58 24 74 22 L126 18 C146 17 174 17 194 18 L246 22 C262 24 276 30 284 42 L296 60 L296 80 L284 98 C276 110 262 116 246 118 L194 122 C174 123 146 123 126 122 L74 118 C58 116 44 110 36 98 L24 80 L24 60 Z"/>
    <rect x="64" y="10" width="34" height="11" rx="5.5"/>
    <rect x="64" y="119" width="34" height="11" rx="5.5"/>
    <rect x="222" y="10" width="34" height="11" rx="5.5"/>
    <rect x="222" y="119" width="34" height="11" rx="5.5"/>
    <path d="M100 22 L90 12 L96 10 L106 20 Z"/>
    <path d="M100 118 L90 128 L96 130 L106 120 Z"/>
    <path d="M30 46 L48 44 L48 54 L30 56 Z"/>
    <path d="M30 94 L48 96 L48 86 L30 84 Z"/>
    <path d="M286 44 L298 46 L298 54 L286 52 Z"/>
    <path d="M286 96 L298 94 L298 86 L286 88 Z"/>
    <rect x="18" y="62" width="10" height="16" rx="2"/>
  </g>
  <g stroke="#334155" stroke-width="1.1" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M100 22 C112 38 112 102 100 118"/>
    <path d="M124 19 L124 121"/>
    <path d="M198 19 L198 121"/>
    <path d="M222 22 C210 38 210 102 222 118"/>
    <rect x="138" y="42" width="46" height="56" rx="6"/>
    <path d="M44 58 C70 54 90 54 98 58"/>
    <path d="M44 82 C70 86 90 86 98 82"/>
    <path d="M250 30 L250 110"/>
    <path d="M138 19 L138 30 M138 110 L138 121"/>
    <path d="M186 19 L186 30 M186 110 L186 121"/>
    <path d="M44 70 L96 70"/>
    <path d="M226 70 L290 70"/>
  </g>
  <g fill="#334155">
    <circle cx="16" cy="16" r="1.4"/><circle cx="304" cy="16" r="1.4"/>
    <circle cx="16" cy="124" r="1.4"/><circle cx="304" cy="124" r="1.4"/>
  </g>
</svg>`;

const BLUEPRINT_SIDE_SVG = `
<svg class="inspect-svg" viewBox="0 0 320 140" width="320" height="140" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#1E293B" stroke-width="1.4" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <circle cx="72" cy="104" r="20"/>
    <circle cx="72" cy="104" r="10"/>
    <circle cx="248" cy="104" r="20"/>
    <circle cx="248" cy="104" r="10"/>
    <path d="M16 96 L16 84 C16 78 20 74 28 72 L92 64 C100 63 106 59 112 53 L134 34 C140 29 148 27 156 27 L194 27 C204 27 212 30 218 36 L244 60 L288 64 C298 65 304 70 304 78 L304 96 L268 96 C268 85 260 78 248 78 C236 78 228 85 228 96 L92 96 C92 85 84 78 72 78 C60 78 52 85 52 96 Z"/>
    <path d="M112 54 L102 50 L100 56 L110 60 Z"/>
    <path d="M20 80 L38 78 L40 86 L22 88 Z"/>
    <path d="M292 70 L302 72 L302 80 L292 78 Z"/>
  </g>
  <g stroke="#334155" stroke-width="1.1" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M118 54 L138 36 L158 36 L158 58 L118 58 Z"/>
    <path d="M164 36 L194 36 L214 58 L164 58 Z"/>
    <path d="M160 58 L160 94 M214 58 L214 94"/>
    <path d="M136 68 L152 68 M172 68 L188 68"/>
    <path d="M34 82 C120 78 220 78 292 82"/>
    <path d="M72 94 L72 114 M62 104 L82 104 M65 97 L79 111 M79 97 L65 111"/>
    <path d="M248 94 L248 114 M238 104 L258 104 M241 97 L255 111 M255 97 L241 111"/>
    <circle cx="280" cy="76" r="3"/>
  </g>
  <g fill="#334155">
    <circle cx="16" cy="16" r="1.4"/><circle cx="304" cy="16" r="1.4"/>
    <circle cx="16" cy="124" r="1.4"/><circle cx="304" cy="124" r="1.4"/>
  </g>
</svg>`;

const BLUEPRINT_FRONT_SVG = `
<svg class="inspect-svg" viewBox="0 0 320 140" width="320" height="140" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <g stroke="#1E293B" stroke-width="1.4" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <ellipse cx="78" cy="114" rx="16" ry="7"/>
    <ellipse cx="242" cy="114" rx="16" ry="7"/>
    <path d="M160 22 C142 22 128 26 120 34 L108 46 C100 56 94 68 92 80 L86 102 C84 110 88 114 96 116 L224 116 C232 114 236 110 234 102 L228 80 C226 68 220 56 212 46 L200 34 C192 26 178 22 160 22 Z"/>
    <path d="M92 52 L74 48 L72 54 L90 58 Z"/>
    <path d="M228 52 L246 48 L248 54 L230 58 Z"/>
    <path d="M90 54 L126 50 L128 64 L92 68 Z"/>
    <path d="M230 54 L194 50 L192 64 L228 68 Z"/>
    <circle cx="104" cy="94" r="4"/>
    <circle cx="216" cy="94" r="4"/>
  </g>
  <g stroke="#334155" stroke-width="1.1" fill="none" stroke-linejoin="round" stroke-linecap="round">
    <path d="M124 34 L196 34 L208 46 L112 46 Z"/>
    <path d="M112 46 C130 42 190 42 208 46"/>
    <rect x="132" y="62" width="56" height="24" rx="4"/>
    <path d="M136 68 L184 68 M136 74 L184 74 M136 80 L184 80"/>
    <path d="M118 92 L202 92 L198 106 L122 106 Z"/>
    <path d="M122 96 L198 96 M122 101 L198 101"/>
    <path d="M120 48 L138 44 M200 48 L182 44"/>
    <path d="M88 86 L232 86"/>
    <rect x="144" y="107" width="32" height="7" rx="1"/>
  </g>
  <g fill="#334155">
    <circle cx="16" cy="16" r="1.4"/><circle cx="304" cy="16" r="1.4"/>
    <circle cx="16" cy="124" r="1.4"/><circle cx="304" cy="124" r="1.4"/>
  </g>
</svg>`;

/** Kullanıcı verisini HTML'e güvenli biçimde basar. */
function esc(s?: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Boş/undefined değerleri atlayarak ilk dolu metni döndürür. */
function pickString(...values: any[]): string {
  for (const value of values) {
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return String(value).trim();
    }
  }
  return '';
}

/** Dosya adı için canlı ayarlardan güvenli, aksansız marka adı üretir. */
function fileBrand(settings: any): string {
  const shopName = pickString(settings.shopName, settings.shop_name);
  const brand = (shopName.split(' - ')[0] || shopName || 'Belge').trim();
  const ascii = brand
    .replace(/ı/g, 'i').replace(/İ/g, 'I')
    .replace(/ş/g, 's').replace(/Ş/g, 'S')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'G')
    .replace(/ü/g, 'u').replace(/Ü/g, 'U')
    .replace(/ö/g, 'o').replace(/Ö/g, 'O')
    .replace(/ç/g, 'c').replace(/Ç/g, 'C');
  return ascii.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'Belge';
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

  // Tüm kurumsal kimlik yalnızca canlı global ayarlardan gelir. PDF modülünde
  // sabit adres/telefon/vergi/şirket adı yedeği YOKTUR. Hem mevcut snake_case
  // AppSettings hem de camelCase profil nesnesi desteklenir.
  const shopName = pickString(settings.shopName, settings.shop_name);
  const companyName = shopName;
  const nameParts = shopName.split(' - ');
  const brandName = (nameParts[0] || shopName).trim();
  const companyTagline = nameParts.length > 1
    ? nameParts.slice(1).join(' - ').trim()
    : pickString(settings.tagline, settings.shop_tagline);
  const shopPhone = pickString(settings.phone, settings.shop_phone);
  const shopAddress = pickString(settings.address, settings.shop_address);
  const shopEmail = pickString(settings.email, settings.shop_email);
  const shopTaxOffice = pickString(settings.taxOffice, settings.shop_tax_office);
  const shopTaxNumber = pickString(settings.taxNumber, settings.shop_tax_number);
  const shopOwner = pickString(settings.ownerName, settings.owner, settings.shop_owner);
  const owner = v?.musteri || {};

  const taxLine = [
    shopTaxOffice ? `Vergi Dairesi: ${shopTaxOffice}` : '',
    shopTaxNumber ? `VKN: ${shopTaxNumber}` : ''
  ].filter(Boolean).join(' · ');
  const contactLine = [
    shopPhone ? `T: ${shopPhone}` : '',
    shopEmail
  ].filter(Boolean).join(' · ');
  const footerLine = [
    shopAddress,
    shopPhone ? `Tel: ${shopPhone}` : ''
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
  const signatureOwner = shopOwner;
  const legalNote = 'Bu belge bilgi amaçlı servis dökümüdür, resmi fatura yerine geçmesi için faturaya dönüştürülmelidir.';
  const warrantyNote = 'Değişen yedek parçalar 1 Yıl / 10.000 KM firmamız ve üretici garantisi altındadır. İşbu evrak hizmet kabul tutanağıdır; servis işlemleriyle ilgili tüm garanti koşulları için servis departmanımızla iletişime geçebilirsiniz.';
  const brandUpper = brandName.toLocaleUpperCase('tr');
  // Filigran her zaman canlı ayarlardaki tam şirket adından (settings.shopName)
  // üretilir; uzun adlarda taşmayı önlemek için punto uzunluğa göre ölçeklenir.
  const watermarkText = shopName.toLocaleUpperCase('tr').trim();
  const watermarkFontSize = Math.max(22, Math.min(62, Math.floor(980 / Math.max(6, watermarkText.length))));
  // Gerçek kurumsal logo. Dosya `public/logo.jpeg` içine konur; Electron
  // derlemesinde göreli yol kullanıldığı için BASE_URL ile birleştirilir.
  const logoUrl = `${import.meta.env.BASE_URL}logo.jpeg`;

  const css = `
    @page{size:A4;margin:0}
    #stmt{width:794px;min-height:1123px;box-sizing:border-box;background:#fff;color:#1E293B;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:11px;line-height:1.45;position:relative;overflow:hidden;padding:0 0 54px 0}
    #stmt *{box-sizing:border-box}

    /* Filigran — %6, ortada, içeriğin arkasında (baskı/HTML için) */
    #stmt .watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-15deg);font-size:62px;letter-spacing:6px;font-weight:700;color:#1E293B;opacity:0.06;pointer-events:none;z-index:-1;white-space:nowrap;mix-blend-mode:multiply}

    /* Başlık — premium kurumsal künye */
    #stmt .header{position:relative;z-index:1;padding:22px 30px 18px;border-bottom:2px solid #1E293B;margin-bottom:16px}
    #stmt .header-top{display:table;width:100%}
    #stmt .header-left{display:table-cell;vertical-align:middle;width:58%}
    #stmt .header-right{display:table-cell;vertical-align:middle;width:42%;text-align:right}
    #stmt .logo-lockup{display:flex;align-items:center;gap:16px;width:100%}
    #stmt .logo-cell{flex:0 0 auto;width:auto}
    #stmt .brand-cell{flex:1 1 auto;padding-left:0}
    #stmt .stmt-logo-img{display:block;height:56px;width:auto;max-width:112px;object-fit:contain}
    #stmt .stmt-logo-fallback{display:none}
    #stmt .logo-company{font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:22px;font-weight:700;color:#1E293B;letter-spacing:.01em;text-transform:uppercase;line-height:1.08}
    #stmt .company-sub{font-size:10px;color:#475569;margin-top:3px;letter-spacing:.02em;font-weight:400}
    #stmt .company-addr{font-size:9.5px;color:#475569;margin-top:3px;font-weight:400}
    #stmt .doc-banner{display:block;width:100%;text-align:right;padding:0}
    #stmt .doc-title{font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:21px;font-weight:700;color:#1E293B;text-transform:uppercase;letter-spacing:.03em;line-height:1.12}
    #stmt .doc-meta{font-size:9px;color:#475569;margin-top:7px;font-weight:400}
    #stmt .doc-meta div{margin-bottom:2px}
    #stmt .doc-meta strong{color:#1E293B;font-weight:700}

    /* Üç sütunlu bilgi ızgarası: Müşteri | Araç | 3 görünümlü kroki */
    #stmt .info-grid{display:table;width:100%;margin-bottom:16px;border-collapse:separate;border-spacing:8px 0}
    #stmt .info-col{display:table-cell;vertical-align:top}
    #stmt .info-col.customer{width:33%}
    #stmt .info-col.vehicle{width:33%}
    #stmt .info-col.blueprint-col{width:34%}
    #stmt .info-box{min-height:215px;border:1px solid #CBD5E1;border-radius:12px;overflow:hidden;background:#F4F6F8}
    #stmt .info-head{background:#E2E8F0;color:#334155;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:9px;font-weight:500;letter-spacing:.05em;text-transform:uppercase;padding:10px 16px;border-bottom:1px solid #CBD5E1}
    #stmt .info-body{padding:16px;font-size:10px;background:#F4F6F8}
    #stmt .info-row{display:table;width:100%;margin-bottom:6px;border-bottom:1px solid #E2E8F0}
    #stmt .info-row:last-child{border-bottom:none}
    #stmt .info-label{display:table-cell;width:42%;font-size:8px;font-weight:500;color:#64748B;text-transform:uppercase;letter-spacing:.05em;padding-top:1px}
    #stmt .info-value{display:table-cell;width:58%;font-size:9.5px;color:#1E293B;font-weight:400}

    /* 3 görünümlü mühendislik krokisi — yazıcı dostu saf beyaz zemin.
       Mürekkep tasarrufu için dolgu/grid yok; yalnızca ince slate konturlar. */
    #stmt .blueprint-box{background:#FFFFFF;border-color:#CBD5E1}
    #stmt .blueprint-box .info-head{background:#FFFFFF;color:#1E293B;border-bottom-color:#CBD5E1}
    #stmt .blueprint-body{padding:10px 8px 8px;background:#FFFFFF}
    #stmt .bp-row{display:table;width:100%;table-layout:fixed;margin-bottom:4px}
    #stmt .bp-cell{display:table-cell;width:50%;text-align:center;vertical-align:top;padding:0 2px}
    #stmt .bp-large{text-align:center}
    #stmt .inspect-svg{display:block;margin:0 auto}
    #stmt .bp-cell .inspect-svg{width:118px;height:54px}
    #stmt .bp-large .inspect-svg{width:238px;height:80px}
    #stmt .inspect-cap{font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:7px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.08em;margin-top:1px}

    /* Ürün/işlem matrisi — yalnızca yatay çizgiler */
    #stmt .items-table{width:100%;border-collapse:collapse;margin-bottom:16px}
    #stmt .items-table th{background:#E2E8F0;color:#334155;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:8.5px;font-weight:500;text-transform:uppercase;letter-spacing:.05em;padding:9px 10px;border-top:1px solid #CBD5E1;border-bottom:1px solid #CBD5E1;text-align:left}
    #stmt .items-table th.num{text-align:right}
    #stmt .items-table td{padding:9px 10px;border-bottom:1px solid #E2E8F0;vertical-align:top;font-size:9.5px;color:#1E293B;font-weight:400}
    #stmt .items-table tbody tr:nth-child(even){background:#F8FAFC}
    #stmt .items-table td.num{text-align:right;font-variant-numeric:tabular-nums}
    #stmt .items-table td.code{font-size:8.5px;color:#475569;font-weight:500;font-variant-numeric:tabular-nums}
    #stmt .rtag{display:inline-block;font-size:7.5px;font-weight:500;padding:1.5px 6px;border-radius:3px;text-transform:uppercase;letter-spacing:.03em;background:#F1F5F9;color:#334155;border:1px solid #E2E8F0}
    #stmt .tag-part{background:#F1F5F9;color:#334155}
    #stmt .tag-labor{background:#F1F5F9;color:#334155}
    #stmt .item{font-weight:400;color:#1E293B}
    #stmt .item-meta{font-size:8px;color:#64748B;margin-top:2px;line-height:1.35}

    /* Finansal toplamlar — sağa hizalı blok */
    #stmt .totals-wrap{display:table;width:100%;margin-bottom:16px}
    #stmt .totals-left{display:table-cell;width:60%;vertical-align:bottom}
    #stmt .totals-summary{display:table-cell;width:40%;vertical-align:bottom}
    #stmt .pay-box{display:block;width:220px;border:1px solid #E2E8F0;border-radius:8px;padding:9px 12px;background:#F8FAFC;text-align:left}
    #stmt .pay-title{font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:7.5px;font-weight:500;color:#64748B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
    #stmt .pay-row{display:table;width:100%;font-size:9px;color:#475569;margin-top:2px}
    #stmt .pay-row span{display:table-cell}
    #stmt .pay-row b{display:table-cell;text-align:right;color:#1E293B;font-weight:700}
    #stmt .total-row{display:table;width:100%;border-bottom:1px solid #E2E8F0}
    #stmt .total-label{display:table-cell;padding:7px 12px;font-size:9.5px;color:#475569;font-weight:400}
    #stmt .total-value{display:table-cell;padding:7px 12px;text-align:right;font-size:10.5px;font-weight:700;color:#1E293B;font-variant-numeric:tabular-nums}
    #stmt .grand-row{background:#0F172A;color:#FFFFFF;border-radius:8px;margin-top:8px;overflow:hidden;box-shadow:0 3px 8px rgba(15,23,42,.18)}
    #stmt .grand-inner{display:table;width:100%}
    #stmt .grand-label{display:table-cell;padding:12px;vertical-align:middle;color:#FFFFFF;font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:9.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:700}
    #stmt .grand-value{display:table-cell;padding:12px;vertical-align:middle;text-align:right;color:#FFFFFF;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}

    /* Alt kısım — garanti metni solda, imza blokları sağda */
    #stmt .footer-grid{display:table;width:100%;margin-top:18px}
    #stmt .warranty-col{display:table-cell;width:42%;vertical-align:top;padding-right:14px}
    #stmt .warranty{font-size:8.5px;color:#475569;line-height:1.55;font-style:italic;font-weight:400}
    #stmt .sig-col{display:table-cell;width:29%;vertical-align:top;padding-left:6px}
    #stmt .sig-col.right{padding-left:6px}
    #stmt .sig-box{border:1px solid #CBD5E1;border-radius:12px;padding:14px;min-height:88px;display:flex;flex-direction:column;justify-content:flex-start;background:#FFFFFF}
    #stmt .sig-label{font-family:"Inter","Segoe UI",system-ui,-apple-system,sans-serif;font-size:8px;font-weight:500;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin-bottom:0;line-height:1.4}
    #stmt .legal{margin-top:16px;padding-top:10px;border-top:1px solid #E2E8F0;text-align:center;font-style:italic;font-size:8.5px;color:#64748B;line-height:1.45;font-weight:400}
    #stmt .page-footer{position:absolute;left:0;right:0;bottom:0;border-top:1px solid #E2E8F0;padding:9px 30px 14px}
    #stmt .pf-inner{display:table;width:100%;font-size:7.5px;color:#64748B;font-weight:400}
    #stmt .pf-left{display:table-cell;font-weight:700;color:#1E293B}
    #stmt .pf-right{display:table-cell;text-align:right}
    @media print{#stmt{width:210mm;min-height:297mm}}
  `;

  return `
    <style>${css}</style>
    <div id="stmt">
      <div class="watermark" style="font-size:${watermarkFontSize}px">${esc(watermarkText)}</div>

      <div class="header">
        <div class="header-top">
          <div class="header-left">
            <div class="logo-lockup">
              <div class="logo-cell">
                <img class="stmt-logo-img" src="${logoUrl}" alt="Logo" onerror="this.style.display='none';this.parentElement.querySelector('.stmt-logo-fallback').style.display='block'" />
                <div class="stmt-logo-fallback">${LOGO_SVG}</div>
              </div>
              <div class="brand-cell">
                ${brandUpper ? `<div class="logo-company">${esc(brandUpper)}</div>` : ''}
                ${companyTagline ? `<div class="company-sub">${esc(companyTagline)}</div>` : ''}
                ${shopAddress ? `<div class="company-addr">${esc(shopAddress)}</div>` : ''}
                ${contactLine ? `<div class="company-addr">${esc(contactLine)}</div>` : ''}
                ${taxLine ? `<div class="company-addr">${esc(taxLine)}</div>` : ''}
              </div>
            </div>
          </div>
          <div class="header-right">
            <div class="doc-banner">
              <div class="doc-title">${esc(docTitle)}</div>
              <div class="doc-meta">
                <div><strong>Belge No:</strong> ${esc(documentNo)}</div>
                <div><strong>Tarih:</strong> ${fdate(today)}</div>
                ${isQuote ? `<div><strong>Geçerlilik:</strong> ${fdate(dueDate)}</div>` : ''}
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
                <div class="bp-cell">${BLUEPRINT_FRONT_SVG}<div class="inspect-cap">Önden Görünüm</div></div>
              </div>
              <div class="bp-large">${BLUEPRINT_SIDE_SVG}<div class="inspect-cap">Yandan Görünüm</div></div>
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
          <div class="grand-row"><div class="grand-inner"><span class="grand-label">KDV DAHİL GENEL TOPLAM:</span><span class="grand-value">${money(grandTotal, false)}</span></div></div>
        </div>
      </div>

      <div class="footer-grid">
        <div class="warranty-col">
          <div class="warranty">${esc(warrantyNote)}</div>
        </div>
        <div class="sig-col left">
          <div class="sig-box">
            <span class="sig-label">Müşteri Teslim Onayı / İmza</span>
          </div>
        </div>
        <div class="sig-col right">
          <div class="sig-box">
            <span class="sig-label">Servis Danışmanı / Kaşe & İmza${signatureOwner ? ` (${esc(signatureOwner)})` : ''}</span>
          </div>
        </div>
      </div>

      <div class="legal">${esc(legalNote)}</div>

      <div class="page-footer">
        <div class="pf-inner">
          <span class="pf-left">${esc(companyName)}</span>
          <span class="pf-right">${esc(footerLine)}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * html2canvas, DOM'a eklenen görsellerin yüklenmesini beklemez. Logo gibi
 * gerçek görsellerin PDF'e girmesi için load/error olaylarını bekleriz.
 * Görsel yoksa `onerror` yedeği devreye girer ve PDF yine eksiksiz üretilir.
 */
async function waitForImages(root: HTMLElement) {
  const imgs = Array.from(root.querySelectorAll('img'));
  await Promise.all(imgs.map((img) => {
    if (img.complete) return Promise.resolve();
    return new Promise<void>((resolve) => {
      img.addEventListener('load', () => resolve(), { once: true });
      img.addEventListener('error', () => resolve(), { once: true });
    });
  }));
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
    fileBrand(settings),
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
      await waitForImages(host);
      try { await (document as any).fonts?.ready; } catch {}

      const stmtEl = host.querySelector('#stmt') as HTMLElement;
      const watermarkEl = stmtEl.querySelector('.watermark') as HTMLElement | null;
      const watermarkText = (watermarkEl?.textContent || '').trim();
      const watermarkFontSize = Math.max(22, Math.min(64, Math.floor(1100 / Math.max(6, watermarkText.length))));
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
        // Metin canlı ayarlardaki marka adından gelir; multiply beyaz zemini
        // hafifçe koyulaştırır, koyu metni bozmaz.
        if (watermarkText) {
          cx.save();
          cx.globalCompositeOperation = 'multiply';
          cx.globalAlpha = 0.06;
          cx.fillStyle = '#1E293B';
          cx.font = `bold ${watermarkFontSize}px sans-serif`;
          (cx as any).letterSpacing = '6px';
          cx.textAlign = 'center';
          cx.textBaseline = 'middle';
          cx.translate(canvas.width / 2, h / 2);
          cx.rotate(-0.25);
          cx.fillText(watermarkText, 0, 0);
          cx.restore();
        }

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
