import { fdate, money, numfmt, formatPlateDisplay, toast } from './ui.js';

/**
 * KURUMSAL SERVİS DÖKÜMÜ (PDF)
 *
 * Yetkili servis standardında, yazdırılabilir/resmi bir servis formu üretir:
 *  - Sol üstte logo + dükkan adı/adres/iletişim, sağ üstte "SERVİS DÖKÜMÜ" başlığı,
 *    belge tarihi ve plaka.
 *  - Müşteri ve araç bilgileri yan yana, ince kenarlıklı bilgi kartlarında.
 *  - TÜR / PARÇA-İŞLEM / ADET / TUTAR tablosu; açık gri kurumsal başlık satırı,
 *    tutarlar sağa hizalı (muhasebe standardı).
 *  - Toplamlar (Ara Toplam, KDV, KDV Dahil, Peşin, Ödenen, Kalan) sağ altta
 *    çerçeveli bir özet panelinde.
 *  - Ortalanmış, italik resmi yasal uyarı altbilgisi.
 *
 * NOT: Logo, ŞEFFAF arka planlı sade amblemdir (kırmızı yaprak + lacivert
 * piston). Beyaz kağıtta net görünür. Gerçek kurumsal görsel hazır olduğunda
 * `LOGO_SVG` tek yerden değiştirilerek güncellenebilir.
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

const STAGE_TXT: Record<string, string> = {
  kabul: 'Kabul Edildi',
  onarimda: 'Onarımda',
  'onarımda': 'Onarımda',
  teslime_hazir: 'Teslime Hazır',
  'tamamlandı': 'Teslime Hazır',
  teslim_edildi: 'Teslim Edildi',
  accepted: 'Kabul Edildi',
  repairing: 'Onarımda',
  ready: 'Teslime Hazır',
  delivered: 'Teslim Edildi'
};

/** Kullanıcı verisini HTML'e güvenli biçimde basar (düzeni bozmasın). */
function esc(s?: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Bilgi kartı içindeki tek bir alan: üstte küçük etiket, altta değer. */
function field(label: string, value?: any): string {
  const txt = value === null || value === undefined || value === '' ? '—' : esc(value);
  return `<div class="fld"><span>${esc(label)}</span><b>${txt}</b></div>`;
}

export function statementHTML(orders: any[], v: any, settings: any = {}) {
  const shopName = String(settings.shop_name || 'Çınar Otomotiv').toLocaleUpperCase('tr');
  const shopPhone = settings.shop_phone || '';
  const shopAddress = settings.shop_address || '';
  const shopTaxOffice = settings.shop_tax_office || '';
  const shopTaxNumber = settings.shop_tax_number || '';
  const owner = v?.musteri || {};

  const taxLine = [
    shopTaxOffice ? `Vergi Dairesi: ${shopTaxOffice}` : '',
    shopTaxNumber ? `VKN: ${shopTaxNumber}` : ''
  ].filter(Boolean).join(' · ');

  const today = new Date().toISOString();
  const plaka = formatPlateDisplay(v?.plaka || v?.id || '-');
  const lastKm = orders.length ? orders[0].km || orders[0].kilometre : null;

  let tg = 0, tc = 0, tp = 0, tr = 0;

  const blocks = orders.map((o) => {
    const gross = (o.brut_tutar_kurus || 0) / 100;
    const cash = (o.pesin_fiyat_kurus || o.brut_tutar_kurus || 0) / 100;
    const paid = (o.odenen_tutar_kurus || 0) / 100;
    const remaining = (o.kalan_tutar_kurus || 0) / 100;
    const net = (o.net_tutar_kurus || 0) / 100;
    const vat = (o.kdv_tutar_kurus || 0) / 100;
    const disc = (o.iskonto_tutar_kurus || 0) / 100;
    const vr = o.kdv_orani ?? 20;

    tg += gross; tc += cash; tp += paid; tr += remaining;

    const rows = (o.kalemler || []).map((l: any) => {
      const isLabor = l.tur === 'iscilik';
      const qty = Number(l.adet) || 1;
      const unit = (l.birim_fiyat_kurus || 0) / 100;
      const rowTotal = qty * unit;
      const birim = l.birim && String(l.birim).toLowerCase() !== 'adet' ? ' ' + l.birim : '';
      const sub = qty > 1
        ? `<div class="sub">Birim: ${money(unit, false)}${birim ? ' / ' + esc(l.birim) : ''}</div>`
        : '';
      return `<tr>
        <td><span class="rtag ${isLabor ? 'tag-labor' : 'tag-part'}">${isLabor ? 'İşçilik' : 'Parça'}</span></td>
        <td><div class="item">${esc(l.ad) || '—'}</div>${sub}</td>
        <td class="r">${numfmt(qty)}${birim}</td>
        <td class="r amt">${money(rowTotal, false)}</td>
      </tr>`;
    }).join('');

    const stageLabel = STAGE_TXT[o.durum] || esc(o.durum) || 'Teslim Edildi';
    const km = o.km || o.kilometre;

    const pays = (o.odemeler || []).length
      ? `<div class="pays">Ödeme geçmişi: ${o.odemeler
          .map((p: any) => `${fdate(p.odeme_tarihi || p.created_at)} · ${esc(p.odeme_yontemi || 'Nakit')} · ${money((p.tutar_kurus || 0) / 100, false)}`)
          .join(' &nbsp;|&nbsp; ')}</div>`
      : '';

    return `<div class="ord">
      <div class="ord-h">
        <div class="ord-h-l">
          <span class="ord-date">${fdate(o.giris_tarihi || o.created_at)}</span>
          ${km ? `<span class="ord-dot">•</span><span>${numfmt(km)} km</span>` : ''}
        </div>
        <span class="ord-stage">${stageLabel}</span>
      </div>
      ${o.sikayet ? `<div class="ord-cmp"><span>Şikayet / Talep</span>${esc(o.sikayet)}</div>` : ''}
      <table class="lt">
        <thead>
          <tr>
            <th class="c-tur">Tür</th>
            <th>Parça / İşlem</th>
            <th class="r c-adet">Adet</th>
            <th class="r">Tutar</th>
          </tr>
        </thead>
        <tbody>${rows || '<tr><td colspan="4" class="empty">Kalem bulunamadı</td></tr>'}</tbody>
      </table>
      <div class="totwrap">
        <div class="totpanel">
          ${disc > 0 ? `<div class="trow"><span>İskonto</span><b>−${money(disc, false)}</b></div>` : ''}
          <div class="trow"><span>Ara Toplam (KDV hariç)</span><b>${money(net, false)}</b></div>
          <div class="trow"><span>KDV %${numfmt(vr)}</span><b>${money(vat, false)}</b></div>
          <div class="trow grand"><span>KDV Dahil Toplam</span><b>${money(gross, false)}</b></div>
          <div class="trow cash"><span>Peşin Fiyat</span><b>${money(cash, false)}</b></div>
          ${paid > 0 ? `<div class="trow"><span>Ödenen</span><b>${money(paid, false)}</b></div>` : ''}
          ${remaining > 0 ? `<div class="trow kalan"><span>Kalan</span><b>${money(remaining, false)}</b></div>` : ''}
        </div>
      </div>
      ${pays}
    </div>`;
  }).join('');

  const grand = orders.length > 1 ? `
    <div class="grand">
      <div><span>KDV Dahil Toplam</span><b>${money(tg, false)}</b></div>
      <div><span>Peşin Fiyat</span><b>${money(tc, false)}</b></div>
      <div><span>Ödenen</span><b>${money(tp, false)}</b></div>
      <div><span>Kalan</span><b>${money(tr, false)}</b></div>
    </div>` : '';

  const css = `
    #stmt{width:794px;box-sizing:border-box;background:#fff;color:#1b2430;font-family:"IBM Plex Sans",Arial,sans-serif;font-size:12.5px;line-height:1.45;padding-bottom:6px}
    #stmt *{box-sizing:border-box}
    #stmt .hd{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:26px 40px 20px;border-bottom:3px solid #0f2a5c}
    #stmt .hd-l{display:flex;align-items:center;gap:14px;min-width:0}
    #stmt .stmt-logo{display:block;flex:none}
    #stmt .hd-name{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;font-size:30px;letter-spacing:.04em;line-height:1;color:#0f2a5c}
    #stmt .hd-line{color:#5d6b7e;font-size:11px;margin-top:3px;letter-spacing:.01em}
    #stmt .hd-r{text-align:right;flex:none}
    #stmt .hd-doc{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;font-size:26px;letter-spacing:.14em;color:#0f2a5c;line-height:1}
    #stmt .hd-meta{margin-top:10px;display:inline-block}
    #stmt .hd-meta .mr{display:flex;justify-content:flex-end;align-items:center;gap:10px;font-size:11.5px;padding:2px 0}
    #stmt .hd-meta .mr span{color:#7b8697}
    #stmt .hd-meta .mr b{color:#1b2430}
    #stmt .pl{display:inline-block;border:1.5px solid #10151c;border-radius:4px;padding:1px 7px;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;font-size:15px;letter-spacing:.06em}
    #stmt .bd{padding:20px 40px 26px}
    #stmt .cards{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px}
    #stmt .card{border:1px solid #dbe1ea;border-radius:8px;overflow:hidden}
    #stmt .card-t{background:#f3f6fa;border-bottom:1px solid #dbe1ea;padding:8px 14px;font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#3f4c60}
    #stmt .card-g{display:grid;grid-template-columns:1fr 1fr;gap:10px 16px;padding:12px 14px}
    #stmt .fld{min-width:0}
    #stmt .fld span{display:block;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#8a95a5;margin-bottom:2px}
    #stmt .fld b{display:block;font-size:12.5px;color:#1b2430;font-weight:600;word-break:break-word}
    #stmt .ord{margin-bottom:22px;break-inside:avoid}
    #stmt .ord-h{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid #0f2a5c;padding-bottom:6px;margin-bottom:8px}
    #stmt .ord-h-l{display:flex;align-items:center;gap:8px;font-size:12.5px}
    #stmt .ord-date{font-weight:700}
    #stmt .ord-dot{color:#b7c0cd}
    #stmt .ord-stage{background:#eef3ff;color:#1740b0;border:1px solid #cfdcfb;border-radius:999px;padding:3px 12px;font-size:11px;font-weight:700}
    #stmt .ord-cmp{margin:0 0 10px;font-size:12px;color:#2b3748}
    #stmt .ord-cmp span{display:block;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;color:#8a95a5;margin-bottom:1px}
    #stmt table{width:100%;border-collapse:collapse}
    #stmt .lt thead th{background:#eef1f5;color:#46536a;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-align:left;padding:9px 12px;border-bottom:1px solid #d7dde6}
    #stmt .lt tbody td{padding:9px 12px;border-bottom:1px solid #e8ecf2;vertical-align:top}
    #stmt .lt tbody tr:last-child td{border-bottom:1px solid #d7dde6}
    #stmt .c-tur{width:96px}
    #stmt .c-adet{width:84px}
    #stmt .r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
    #stmt .amt{font-weight:600}
    #stmt .item{font-weight:500}
    #stmt .sub{color:#8a95a5;font-size:10.5px;margin-top:1px}
    #stmt .rtag{display:inline-block;font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;letter-spacing:.02em}
    #stmt .tag-part{background:#eef3ff;color:#1740b0}
    #stmt .tag-labor{background:#eafaf0;color:#12683c}
    #stmt .empty{color:#8a95a5;text-align:center;padding:14px}
    #stmt .totwrap{display:flex;justify-content:flex-end;margin-top:12px}
    #stmt .totpanel{width:330px;border:1px solid #d7dde6;border-radius:8px;overflow:hidden}
    #stmt .trow{display:flex;justify-content:space-between;gap:14px;padding:6px 14px;font-size:12px}
    #stmt .trow + .trow{border-top:1px solid #eef1f5}
    #stmt .trow span{color:#5d6b7e}
    #stmt .trow b{font-variant-numeric:tabular-nums}
    #stmt .trow.grand{background:#0f2a5c;border-top:none}
    #stmt .trow.grand span{color:#d7e0f2}
    #stmt .trow.grand b{color:#fff;font-size:14px}
    #stmt .trow.cash{background:#eef3ff}
    #stmt .trow.cash span,#stmt .trow.cash b{color:#1740b0;font-weight:700}
    #stmt .trow.kalan span,#stmt .trow.kalan b{color:#b42318;font-weight:700}
    #stmt .pays{margin-top:8px;color:#5d6b7e;font-size:11px;text-align:right}
    #stmt .grand{display:flex;justify-content:space-between;gap:12px;background:#0f2a5c;color:#fff;border-radius:8px;padding:12px 16px;margin-top:14px}
    #stmt .grand span{display:block;font-size:9.5px;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
    #stmt .grand b{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:20px}
    #stmt .ftr{margin-top:22px;padding-top:10px;border-top:1px solid #d7dde6;text-align:center;font-style:italic;font-size:10.5px;color:#7b8697}
  `;

  return `
    <style>${css}</style>
    <div id="stmt">
      <header class="hd">
        <div class="hd-l">
          ${LOGO_SVG}
          <div class="hd-brand">
            <div class="hd-name">${esc(shopName)}</div>
            ${shopAddress ? `<div class="hd-line">${esc(shopAddress)}</div>` : ''}
            ${shopPhone ? `<div class="hd-line">Tel: ${esc(shopPhone)}</div>` : ''}
            ${taxLine ? `<div class="hd-line">${esc(taxLine)}</div>` : ''}
          </div>
        </div>
        <div class="hd-r">
          <div class="hd-doc">SERVİS DÖKÜMÜ</div>
          <div class="hd-meta">
            <div class="mr"><span>Belge Tarihi</span><b>${fdate(today)}</b></div>
            <div class="mr"><span>Plaka</span><b class="pl">${esc(plaka)}</b></div>
          </div>
        </div>
      </header>

      <div class="bd">
        <section class="cards">
          <div class="card">
            <div class="card-t">Müşteri Bilgileri</div>
            <div class="card-g">
              ${field('Ad Soyad', owner.ad_soyad || owner.name)}
              ${field('Telefon', owner.telefon || owner.phone)}
              ${field('E-posta', owner.eposta || owner.email)}
              ${field('Vergi No', owner.vergi_no)}
            </div>
          </div>
          <div class="card">
            <div class="card-t">Araç Bilgileri</div>
            <div class="card-g">
              ${field('Plaka', plaka)}
              ${field('Marka / Model', [v?.marka || v?.brand, v?.model].filter(Boolean).join(' '))}
              ${field('Model Yılı', v?.yil || v?.year)}
              ${field('Şasi No', v?.sasi_no)}
              ${field('Motor No', v?.motor_kodu)}
              ${field('Kilometre', lastKm ? `${numfmt(lastKm)} km` : '')}
            </div>
          </div>
        </section>

        ${blocks}
        ${grand}

        <footer class="ftr">
          Bu belge bilgi amaçlı servis dökümüdür, mali fatura yerine geçmez.
        </footer>
      </div>
    </div>
  `;
}

export async function exportStatementPDF(orders: any[], vehicle: any, settings: any = {}) {
  if (!orders || !orders.length || !vehicle) return;

  const win = window as any;
  const plate = vehicle.plaka || vehicle.id || '';
  const baseName = `Servis-Dokumu-${String(plate).replace(/\s+/g, '')}-${new Date().toISOString().split('T')[0]}`;

  toast('Döküm hazırlanıyor...');

  // Check if html2canvas and jspdf exist
  if (win.html2canvas && win.jspdf) {
    const host = document.createElement('div');
    host.id = 'stmt-host';
    host.style.cssText = 'position:fixed;left:-12000px;top:0;width:794px;background:#fff;z-index:9999;';
    host.innerHTML = statementHTML(orders, vehicle, settings);
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
      const pageH = Math.floor(ph / k);

      let y = 0;
      let first = true;

      while (y < canvas.height) {
        const h = Math.min(pageH, canvas.height - y);
        const c = document.createElement('canvas');
        c.width = canvas.width;
        c.height = h;
        const cx = c.getContext('2d')!;
        cx.fillStyle = '#fff';
        cx.fillRect(0, 0, c.width, c.height);
        cx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

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
    const htmlContent = `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Servis Dökümü - ${formatPlateDisplay(plate)}</title></head><body style="margin:0;background:#eee">${statementHTML(orders, vehicle, settings)}</body></html>`;
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
