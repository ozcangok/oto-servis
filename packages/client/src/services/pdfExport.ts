import { CORPORATE } from '@oto-servis/shared';
import { dateISO, fdate, money, numfmt, formatPlateDisplay, toast, todayISO } from './ui.js';

/**
 * KURUMSAL SERVİS İŞ EMRİ / TEKLİF FORMU (A4 PDF)
 *
 * Baskı kalitesinde, tek sayfaya oturan kurumsal belge:
 *  - Sol üstte belge başlığı + belge no/tarih/vade; sağ üstte logo, kısa marka
 *    adı ve Ayarlar'dan gelen gerçek adres/telefon/vergi bilgileri.
 *  - Müşteri ve araç bilgileri, açık gri başlıklı iki sütunlu matris.
 *  - Tür / Açıklama / Miktar / Birim Fiyat / Tutar sütunlu, çizgili ve satır
 *    araları tonlanmış finansal tablo.
 *  - Sağa hizalı Ara Toplam / KDV / KDV Dahil Genel Toplam özeti.
 *  - Çift imza/kaşe kutusu ve ortalanmış resmi yasal uyarı.
 *
 * Tüm şirket kimliği `settings` parametresinden (global SettingsContext)
 * gelir; bu dosyada sabit adres/telefon/şirket adı kullanılmaz.
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

/** Kurumsal arka filigran SVG'i (PDF sayfalarının arkasında, saydam). */
const WATERMARK_SVG = `
<svg class="pdf-watermark" viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle"
        font-family="'IBM Plex Sans', Arial, sans-serif" font-size="42" font-weight="900"
        fill="#0f2a5c" opacity="0.06" letter-spacing="4px">
    ÇINAR OTOMOTİV
  </text>
</svg>`;

/** Kullanıcı verisini HTML'e güvenli biçimde basar (düzeni bozmasın). */
function esc(s?: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Bilgi matrisi içindeki tek bir alan: üstte küçük etiket, altta değer. */
function field(label: string, value?: any): string {
  const txt = value === null || value === undefined || value === '' ? '—' : esc(value);
  return `<div class="info-cell"><label>${esc(label)}</label><b>${txt}</b></div>`;
}

export interface StatementOptions {
  /** Belge başlığı (varsayılan: SERVİS İŞ EMRİ VE TEKLİF FORMU). */
  title?: string;
  /** Teklif modunda geçerlilik süresi (gün). */
  validityDays?: number;
  /** Teklif modunda vade/geçerlilik bilgisini ve dosya adını değiştirir. */
  isQuote?: boolean;
  /** Kurumsal belge numarası (örn. CNR-2026-001). */
  documentNo?: string;
  /** Ödeme vade tarihi (ISO tarih). */
  dueDate?: string | Date;
}

export function statementHTML(orders: any[], v: any, settings: any = {}, options: StatementOptions = {}) {
  const docTitle = String(options.title || 'SERVİS İŞ EMRİ VE TEKLİF FORMU').toLocaleUpperCase('tr');
  const isQuote = Boolean(options.isQuote);
  const validityDays = options.validityDays ?? 14;

  // Tüm kurumsal kimlik — adres, telefon, vergi bilgileri, yetkili — global
  // ayar kaynağından gelir. Burada "Örnek Oto Servis" gibi sabit bir metin yoktur.
  const companyName = String(settings.shop_name || CORPORATE.legalName).trim();
  const brandName = companyName.includes(' - ')
    ? companyName.split(' - ')[0].trim()
    : companyName;
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
  const signatureOwner = settings.shop_owner || CORPORATE.owner;
  const legalNote = 'Bu belge bilgi amaçlı servis dökümüdür, resmi fatura yerine geçmesi için faturaya dönüştürülmelidir.';

  const css = `
    @page{size:A4;margin:0}
    #stmt{width:794px;min-height:1123px;box-sizing:border-box;background:#fff;color:#111827;font-family:"IBM Plex Sans",Arial,sans-serif;font-size:11.5px;line-height:1.4;display:flex;flex-direction:column;color-scheme:light;position:relative;overflow:hidden}
    #stmt *{box-sizing:border-box}
    #stmt .hd{display:grid;grid-template-columns:1.15fr .85fr;gap:24px;padding:26px 38px 18px;border-bottom:3px solid #0f2a5c}
    #stmt .hd-l{min-width:0;display:flex;flex-direction:column;justify-content:center}
    #stmt .doc-title{font-size:22px;font-weight:800;letter-spacing:.025em;line-height:1.12;color:#0f2a5c;text-transform:uppercase}
    #stmt .doc-meta{margin-top:14px;display:flex;flex-direction:column;gap:4px}
    #stmt .meta-row{display:flex;gap:8px;font-size:10.5px;color:#4b5563}
    #stmt .meta-row span{width:76px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;font-size:8.5px;font-weight:700;padding-top:1px}
    #stmt .meta-row b{color:#111827;font-weight:600}
    #stmt .hd-r{text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:3px;min-width:0}
    #stmt .brand-lockup{display:flex;align-items:center;justify-content:flex-end;gap:10px;margin-bottom:3px}
    #stmt .stmt-logo{display:block;flex:none}
    #stmt .brand-name{font-size:20px;font-weight:800;color:#0f2a5c;letter-spacing:.02em;line-height:1.1}
    #stmt .brand-legal{font-size:9px;color:#6b7280;max-width:320px;line-height:1.35}
    #stmt .brand-line{font-size:9.5px;color:#4b5563;line-height:1.45;max-width:340px}
    #stmt .bd{padding:16px 38px 22px;display:flex;flex-direction:column;flex:1}
    #stmt .matrix{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px}
    #stmt .info-box{border:1px solid #d1d5db;border-radius:6px;overflow:hidden;background:#fff}
    #stmt .info-head{background:#f3f4f6;border-bottom:1px solid #d1d5db;padding:7px 12px;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#374151}
    #stmt .info-grid{display:grid;grid-template-columns:1fr 1fr}
    #stmt .info-cell{padding:7px 12px;border-bottom:1px solid #e5e7eb;min-width:0}
    #stmt .info-cell.span2{grid-column:span 2}
    #stmt .info-cell label{display:block;font-size:8px;letter-spacing:.06em;text-transform:uppercase;color:#6b7280;margin-bottom:2px;font-weight:700}
    #stmt .info-cell b{display:block;font-size:10.5px;color:#111827;font-weight:600;line-height:1.35;word-break:break-word}
    #stmt .info-cell b.muted-val{font-weight:500;color:#4b5563}
    #stmt .items{width:100%;border-collapse:collapse;border:1px solid #d1d5db;margin-top:2px}
    #stmt .items thead th{background:#f3f4f6;color:#374151;font-size:8.5px;font-weight:800;letter-spacing:.07em;text-transform:uppercase;text-align:left;padding:8px 10px;border:1px solid #d1d5db}
    #stmt .items tbody td{padding:8px 10px;border:1px solid #e5e7eb;vertical-align:top;font-size:10.5px}
    #stmt .items tbody tr:nth-child(even){background:#f9fafb}
    #stmt .c-tur{width:72px}
    #stmt .c-qty{width:64px}
    #stmt .c-unit{width:98px}
    #stmt .c-total{width:104px}
    #stmt .r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    #stmt .amt{font-weight:700;color:#111827}
    #stmt .item{font-weight:600;color:#111827}
    #stmt .item-meta{font-size:8.5px;color:#6b7280;margin-top:2px;line-height:1.3}
    #stmt .rtag{display:inline-block;font-size:8px;font-weight:800;padding:2px 7px;border-radius:3px;letter-spacing:.03em;text-transform:uppercase}
    #stmt .tag-part{background:#e8eefc;color:#1e3a8a}
    #stmt .tag-labor{background:#e7f6ec;color:#166534}
    #stmt .empty{text-align:center;color:#6b7280;padding:14px}
    #stmt .summary-wrap{display:flex;justify-content:flex-end;margin-top:12px}
    #stmt .summary{width:300px;border:1px solid #d1d5db;border-radius:6px;overflow:hidden}
    #stmt .srow{display:flex;justify-content:space-between;gap:14px;padding:6px 12px;font-size:10.5px;border-bottom:1px solid #e5e7eb}
    #stmt .srow:last-child{border-bottom:none}
    #stmt .srow span{color:#4b5563}
    #stmt .srow b{font-variant-numeric:tabular-nums;font-weight:600;color:#111827}
    #stmt .srow.grand{background:#0f2a5c;padding:9px 12px}
    #stmt .srow.grand span{color:#dbe4f5;font-weight:700;font-size:9px;text-transform:uppercase;letter-spacing:.05em}
    #stmt .srow.grand b{color:#fff;font-size:15px;font-weight:800}
    #stmt .ftr{margin-top:auto;padding-top:18px}
    #stmt .sign{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:8px}
    #stmt .sign-box{border:1px solid #d1d5db;border-radius:6px;padding:10px 12px;min-height:70px;display:flex;flex-direction:column;justify-content:flex-end}
    #stmt .sign-box span{font-size:8px;letter-spacing:.07em;text-transform:uppercase;color:#6b7280;font-weight:700}
    #stmt .sign-line{flex:1;border-bottom:1px dashed #9ca3af;margin:12px 0 5px;min-height:18px}
    #stmt .sign-box b{font-size:10.5px;color:#111827}
    #stmt .legal{margin-top:12px;padding-top:8px;border-top:1px solid #e5e7eb;text-align:center;font-style:italic;font-size:9px;color:#6b7280;line-height:1.4}
    #stmt .pdf-watermark{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-14deg);font-size:72px;font-weight:900;color:#0f2a5c;opacity:0.06;pointer-events:none;z-index:0;white-space:nowrap;mix-blend-mode:multiply}
    @media print{#stmt{width:210mm;min-height:297mm}}
  `;

  return `
    <style>${css}</style>
    <div id="stmt">
      <div class="pdf-watermark">${esc('ÇINAR OTOMOTİV')}</div>
      <header class="hd">
        <div class="hd-l">
          <div class="doc-title">${esc(docTitle)}</div>
          <div class="doc-meta">
            <div class="meta-row"><span>Belge Tarihi</span><b>${fdate(today)}</b></div>
            <div class="meta-row"><span>Belge No</span><b>${esc(documentNo)}</b></div>
            <div class="meta-row"><span>Vade Tarihi</span><b>${fdate(dueDate)}</b></div>
            ${isQuote ? `<div class="meta-row"><span>Geçerlilik</span><b>${validityDays} gün</b></div>` : ''}
          </div>
        </div>
        <div class="hd-r">
          <div class="brand-lockup">
            ${LOGO_SVG}
            <div class="brand-name">${esc(brandName)}</div>
          </div>
          ${companyName !== brandName ? `<div class="brand-legal">${esc(companyName)}</div>` : ''}
          ${shopAddress ? `<div class="brand-line">${esc(shopAddress)}</div>` : ''}
          ${shopPhone ? `<div class="brand-line">Tel: ${esc(shopPhone)}${shopEmail ? ` · ${esc(shopEmail)}` : ''}</div>` : (shopEmail ? `<div class="brand-line">${esc(shopEmail)}</div>` : '')}
          ${taxLine ? `<div class="brand-line">${esc(taxLine)}</div>` : ''}
        </div>
      </header>

      <div class="bd">
        <section class="matrix" aria-label="Müşteri ve araç bilgileri">
          <div class="info-box">
            <div class="info-head">Müşteri Bilgileri</div>
            <div class="info-grid">
              ${field('Ad Soyad', customerName)}
              ${field('Telefon', customerPhone)}
              <div class="info-cell span2"><label>E-posta</label><b>${esc(customerEmail)}</b></div>
              <div class="info-cell span2"><label>Şikayet / Talep</label><b class="muted-val">${esc(complaint)}</b></div>
            </div>
          </div>
          <div class="info-box">
            <div class="info-head">Araç Bilgileri</div>
            <div class="info-grid">
              ${field('Plaka', plaka)}
              ${field('Marka / Model', vehicleBrandModel)}
              ${field('Model Yılı', vehicleYear)}
              ${field('Şasi No', chassis)}
              ${field('Motor No', engine)}
              ${field('Kilometre', km)}
            </div>
          </div>
        </section>

        <table class="items">
          <thead>
            <tr>
              <th class="c-tur">Tür</th>
              <th>Açıklama</th>
              <th class="r c-qty">Miktar</th>
              <th class="r c-unit">Birim Fiyat</th>
              <th class="r c-total">Tutar</th>
            </tr>
          </thead>
          <tbody>${itemRows.join('') || '<tr><td colspan="5" class="empty">Kalem bulunamadı</td></tr>'}</tbody>
        </table>

        <div class="summary-wrap">
          <div class="summary">
            <div class="srow"><span>Ara Toplam (KDV Hariç)</span><b>${money(tnet, false)}</b></div>
            <div class="srow"><span>KDV (%${numfmt(vatRateLabel)})</span><b>${money(vatTotal, false)}</b></div>
            <div class="srow grand"><span>KDV Dahil Genel Toplam</span><b>${money(grandTotal, false)}</b></div>
          </div>
        </div>

        <footer class="ftr">
          <div class="sign">
            <div class="sign-box">
              <span>Müşteri Onayı / İmza</span>
              <div class="sign-line"></div>
              <b>${esc(customerName)}</b>
            </div>
            <div class="sign-box">
              <span>Yetkili Servis Kaşe / İmza</span>
              <div class="sign-line"></div>
              <b>${esc(signatureOwner)} - ${esc(brandName)}</b>
            </div>
          </div>
          <div class="legal">${esc(legalNote)}</div>
        </footer>
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

  // Check if html2canvas and jspdf exist
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
      // Math.ceil + küçük tolerans: 1123px'lik A4 tuvalinin yuvarlama artığı
      // (1-2 px) yüzünden boş ikinci sayfa oluşmasını engeller.
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

        // Kurumsal filigran her sayfada ortada, saydam
        cx.save();
        cx.globalAlpha = 0.06;
        cx.fillStyle = '#0f2a5c';
        cx.font = 'bold 64px sans-serif';
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

  // Fallback: download HTML printable
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

/**
 * Belgeyi yazdırma penceresinde açar. PDF kütüphanesi beklemeden çalışır.
 * (Yazdırma penceresi kullanıcı tarafından iptal edilebilir.)
 */
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
