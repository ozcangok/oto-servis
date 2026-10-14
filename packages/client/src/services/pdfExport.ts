import { fdate, money, numfmt, formatPlateDisplay, toast } from './ui.js';

export function statementHTML(orders: any[], v: any, settings: any = {}) {
  const shopName = (settings.shop_name || 'GÜVEN OTO').toUpperCase();
  const shopPhone = settings.shop_phone || '';
  const shopAddress = settings.shop_address || '';
  const owner = v.musteri || {};

  let tg = 0, tc = 0, tp = 0, tr = 0;

  const STAGE_TXT: Record<string, string> = {
    kabul: 'Kabul edildi',
    onarımda: 'Onarımda',
    tamamlandı: 'Teslime hazır',
    teslim_edildi: 'Teslim edildi',
    accepted: 'Kabul edildi',
    repairing: 'Onarımda',
    ready: 'Teslime hazır',
    delivered: 'Teslim edildi'
  };

  const blocks = orders.map((o) => {
    const gross = (o.brut_tutar_kurus || 0) / 100;
    const cash = (o.pesin_fiyat_kurus || o.brut_tutar_kurus || 0) / 100;
    const paid = (o.odenen_tutar_kurus || 0) / 100;
    const remaining = (o.kalan_tutar_kurus || 0) / 100;
    const net = (o.net_tutar_kurus || 0) / 100;
    const vat = (o.kdv_tutar_kurus || 0) / 100;
    const disc = (o.iskonto_tutar_kurus || 0) / 100;
    const vr = o.kdv_orani ?? 20;

    tg += gross;
    tc += cash;
    tp += paid;
    tr += remaining;

    const rows = (o.kalemler || []).map((l: any) => {
      const isLabor = l.tur === 'iscilik';
      const qty = Number(l.adet) || 1;
      const unitPrice = (l.birim_fiyat_kurus || 0) / 100;
      const rowTotal = qty * unitPrice;
      return `<tr><td>${isLabor ? 'İşçilik' : 'Parça'}</td><td>${l.ad || ''}</td><td class="r">${numfmt(qty)} ${l.birim && l.birim !== 'adet' ? l.birim : ''}</td><td class="r">${money(unitPrice, false)}</td><td class="r">${money(rowTotal, false)}</td></tr>`;
    }).join('');

    const tt = `
      ${disc > 0 ? `<tr><td>İskonto</td><td class="r">-${money(disc, false)}</td></tr>` : ''}
      <tr><td>Ara toplam (KDV hariç)</td><td class="r">${money(net, false)}</td></tr>
      <tr><td>KDV %${numfmt(vr)}</td><td class="r">${money(vat, false)}</td></tr>
      <tr class="g"><td>KDV dahil toplam</td><td class="r">${money(gross, false)}</td></tr>
      <tr class="c"><td>Peşin fiyat</td><td class="r">${money(cash, false)}</td></tr>
      ${paid > 0 ? `<tr><td>Ödenen</td><td class="r">${money(paid, false)}</td></tr>` : ''}
      ${remaining > 0 ? `<tr class="k"><td>Kalan</td><td class="r">${money(remaining, false)}</td></tr>` : ''}
    `;

    const pays = (o.odemeler || []).length
      ? `<div class="pays">Ödemeler: ${o.odemeler.map((p: any) => `${fdate(p.odeme_tarihi || p.created_at)} ${p.odeme_yontemi || 'Nakit'} ${money((p.tutar_kurus || 0) / 100, false)}`).join(' · ')}</div>`
      : '';

    const stageLabel = STAGE_TXT[o.durum] || o.durum || 'Teslim edildi';

    return `
      <div class="ord">
        <div class="oh">
          <b>${fdate(o.giris_tarihi || o.created_at)}</b>
          <span>${o.km || o.kilometre ? `${numfmt(o.km || o.kilometre)} km` : ''}</span>
          <span>${stageLabel}</span>
        </div>
        ${o.sikayet ? `<div class="cmp">${o.sikayet}</div>` : ''}
        <table class="lt">
          <thead>
            <tr><th>Tür</th><th>Parça / işlem</th><th class="r">Adet</th><th class="r">Birim</th><th class="r">Tutar</th></tr>
          </thead>
          <tbody>${rows || '<tr><td colspan="5">Kalem bulunamadı</td></tr>'}</tbody>
        </table>
        <table class="tt"><tbody>${tt}</tbody></table>
        ${pays}
      </div>
    `;
  }).join('');

  const grand = orders.length > 1 ? `
    <div class="grand">
      <div><span>KDV dahil toplam</span><b>${money(tg, false)}</b></div>
      <div><span>Peşin fiyat</span><b>${money(tc, false)}</b></div>
      <div><span>Ödenen</span><b>${money(tp, false)}</b></div>
      <div><span>Kalan</span><b>${money(tr, false)}</b></div>
    </div>
  ` : '';

  const css = `
    #stmt{width:794px;box-sizing:border-box;background:#fff;color:#16202e;font-family:"IBM Plex Sans",Arial,sans-serif;font-size:12.5px;line-height:1.45;padding-bottom:20px}
    #stmt *{box-sizing:border-box}
    #stmt .hd{background:#0f2a5c;color:#fff;padding:26px 40px;display:flex;justify-content:space-between;align-items:flex-end}
    #stmt .hd h1{margin:0;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:38px;letter-spacing:.06em;font-weight:700;line-height:1}
    #stmt .hd .t{text-align:right;font-size:12px;opacity:.9}
    #stmt .hd .t b{display:block;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:22px;letter-spacing:.08em}
    #stmt .bd{padding:22px 40px 28px}
    #stmt .vb{display:flex;gap:28px;justify-content:space-between;border:1px solid #cfd7e3;border-radius:6px;padding:12px 16px;margin-bottom:18px}
    #stmt .vb div{min-width:0}
    #stmt .vb small{display:block;color:#5d6b7e;font-size:10px;letter-spacing:.06em;text-transform:uppercase}
    #stmt .pl{display:inline-block;border:2px solid #10151c;border-radius:4px;padding:2px 8px;font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-weight:700;font-size:20px;letter-spacing:.07em}
    #stmt .ord{margin-bottom:20px}
    #stmt .oh{display:flex;gap:18px;align-items:baseline;border-bottom:2px solid #0f2a5c;padding-bottom:4px;margin-bottom:6px}
    #stmt .oh b{font-size:15px}
    #stmt .oh span{color:#5d6b7e}
    #stmt .cmp{margin:0 0 6px;color:#2b3748}
    #stmt table{width:100%;border-collapse:collapse}
    #stmt .lt th{font-size:10px;letter-spacing:.05em;text-transform:uppercase;color:#5d6b7e;text-align:left;padding:4px 6px;border-bottom:1px solid #cfd7e3}
    #stmt .lt td{padding:5px 6px;border-bottom:1px solid #e6ebf2;vertical-align:top}
    #stmt .r{text-align:right;white-space:nowrap}
    #stmt .tt{width:300px;margin:8px 0 0 auto}
    #stmt .tt td{padding:3px 6px}
    #stmt .tt .g td{font-weight:700;font-size:13.5px;border-top:1px solid #16202e}
    #stmt .tt .c td{background:#e2eaff;color:#1740b0;font-weight:700}
    #stmt .tt .k td{color:#b42318;font-weight:700}
    #stmt .pays{margin-top:6px;color:#5d6b7e;font-size:11.5px}
    #stmt .grand{display:flex;justify-content:space-between;gap:12px;background:#0f2a5c;color:#fff;border-radius:6px;padding:12px 16px;margin-top:6px}
    #stmt .grand span{display:block;font-size:10px;letter-spacing:.06em;text-transform:uppercase;opacity:.8}
    #stmt .grand b{font-family:"Barlow Condensed","Arial Narrow",sans-serif;font-size:22px;letter-spacing:.02em}
    #stmt .ft{margin-top:18px;padding-top:8px;border-top:1px solid #cfd7e3;color:#5d6b7e;font-size:10.5px}
  `;

  return `
    <style>${css}</style>
    <div id="stmt">
      <div class="hd">
        <h1>${shopName}</h1>
        <div class="t">
          <b>SERVİS DÖKÜMÜ</b>
          ${fdate(new Date().toISOString())}
        </div>
      </div>
      <div class="bd">
        <div class="vb">
          <div>
            <small>Plaka</small>
            <span class="pl">${formatPlateDisplay(v.plaka || v.id)}</span>
          </div>
          <div>
            <small>Araç</small>
            ${[v.marka || v.brand, v.model, v.yil || v.year].filter(Boolean).join(' ') || '-'}<br>
            <span style="color:#5d6b7e">${[v.sasi_no ? `Şasi: ${v.sasi_no}` : '', v.motor_kodu ? `Motor: ${v.motor_kodu}` : ''].filter(Boolean).join(' · ')}</span>
          </div>
          <div>
            <small>Müşteri</small>
            ${owner.ad_soyad || owner.name || '-'}<br>
            <span style="color:#5d6b7e">${owner.telefon || owner.phone || ''}</span>
          </div>
        </div>
        ${blocks}
        ${grand}
        <div class="ft">
          ${[shopName, shopAddress, shopPhone].filter(Boolean).join(' · ')}<br>
          Bu belge bilgi amaçlı servis dökümüdür, fatura yerine geçmez.
        </div>
      </div>
    </div>
  `;
}

export async function exportStatementPDF(orders: any[], vehicle: any, settings: any = {}) {
  if (!orders || !orders.length || !vehicle) return;

  const win = window as any;
  const plate = vehicle.plaka || vehicle.id || '';
  const baseName = `servis-dokumu-${plate}-${new Date().toISOString().split('T')[0]}`;

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
