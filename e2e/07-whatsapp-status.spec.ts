import { test, expect } from '@playwright/test';
import {
  OWNER,
  login,
  apiLogin,
  apiJson,
  createCustomer,
  createVehicle,
  createWorkOrder,
  setWorkOrderStatus,
  getWhatsAppMessages,
  messagesForPlate,
  uniqPlate
} from './helpers.js';

/**
 * KATEGORİ 6b — İLETİŞİM MERKEZİ (WhatsApp durum bildirimleri)
 *
 * İş emrinin "Servis Durumu" her değiştiğinde Hatırlatıcılar (İletişim
 * Merkezi) veritabanına; doğru müşteri telefonu, doğru plaka ve o aşamaya ait
 * doğru kurumsal mesaj metniyle yeni bir kayıt düşmelidir. Kaydın "WhatsApp
 * Gönder" bağlantısı da uluslararası numara + doğru mesajla wa.me açmalıdır.
 */

const MUSTERI = 'E2E Bildirim Müşteri';
const TELEFON = '0555 111 22 33'; // wa.me için uluslararası: 905551112233
const INTL = '905551112233';

/** Beklenen kurumsal mesajlar (istekte birebir verilen şablonlar). */
const TEMPLATES: Record<string, string> = {
  kabul:
    'Sayın {musteri}, {plaka} plakalı aracınız servisimize kabul edilmiştir. Aracınızın ilk kontrolleri yapılarak onarım/bakım süreci planlanacaktır. Bizi tercih ettiğiniz için teşekkür ederiz. - Çınar Otomotiv',
  onarimda:
    'Sayın {musteri}, {plaka} plakalı aracınızın bakım ve onarım işlemleri uzman teknisyenlerimiz tarafından başlatılmıştır. Süreç tamamlandığında tarafınıza bilgi verilecektir. - Çınar Otomotiv',
  teslime_hazir:
    'Sayın {musteri}, {plaka} plakalı aracınızın servis işlemleri ve son kalite kontrolleri başarıyla tamamlanmıştır. Aracınız teslime hazırdır, dilediğiniz zaman servisimizden teslim alabilirsiniz. - Çınar Otomotiv',
  teslim_edildi:
    'Sayın {musteri}, {plaka} plakalı aracınızın teslimatı gerçekleştirilmiştir. Çınar Otomotiv olarak size hizmet vermekten memnuniyet duyduk. Güvenli ve keyifli sürüşler dileriz.'
};

function expectedMessage(durum: string, plaka: string): string {
  return TEMPLATES[durum].replace(/\{musteri\}/g, MUSTERI).replace(/\{plaka\}/g, plaka);
}

test.describe('6b) İletişim merkezi — WhatsApp durum bildirimleri', () => {
  test('her servis durumu değişiminde doğru telefon/plaka/mesajla kayıt oluşur', async ({ request }) => {
    const token = await apiLogin(request, OWNER);

    const cust = await createCustomer(request, token, { ad_soyad: MUSTERI, telefon: TELEFON });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });
    const plaka = veh.plaka_gorunen; // görünen plaka (ör. "99 TST 4712")

    // 1) İş emri 'kabul' durumuyla açılır -> 1 bildirim
    const order = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka,
      durum: 'kabul',
      kalemler: [
        { tur: 'iscilik', ad: 'E2E bildirim işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 10000 }
      ]
    });
    expect(order.status, JSON.stringify(order.body)).toBe(200);
    const orderId = order.body.workOrder.id;

    let msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(1);
    expect(msgs[0].durum).toBe('kabul');
    expect(msgs[0].telefon).toBe(TELEFON);
    expect(msgs[0].mesaj).toBe(expectedMessage('kabul', plaka));

    // 2) onarimda -> yeni kayıt
    expect((await setWorkOrderStatus(request, token, orderId, 'onarimda')).status).toBe(200);
    msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(2);
    expect(msgs[0].durum).toBe('onarimda');
    expect(msgs[0].telefon).toBe(TELEFON);
    expect(msgs[0].mesaj).toBe(expectedMessage('onarimda', plaka));

    // 3) teslime_hazir -> yeni kayıt
    expect((await setWorkOrderStatus(request, token, orderId, 'teslime_hazir')).status).toBe(200);
    msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(3);
    expect(msgs[0].durum).toBe('teslime_hazir');
    expect(msgs[0].mesaj).toBe(expectedMessage('teslime_hazir', plaka));

    // 4) teslim_edildi -> yeni kayıt
    expect((await setWorkOrderStatus(request, token, orderId, 'teslim_edildi')).status).toBe(200);
    msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(4);
    expect(msgs[0].durum).toBe('teslim_edildi');
    expect(msgs[0].mesaj).toBe(expectedMessage('teslim_edildi', plaka));

    // 5) Aynı durum tekrar ayarlanırsa YENİ kayıt oluşmamalı (mükerrer engeli)
    expect((await setWorkOrderStatus(request, token, orderId, 'teslim_edildi')).status).toBe(200);
    msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(4);
  });

  test('gönderim kaydı "gönderildi" olarak işaretlenebilir', async ({ request }) => {
    const token = await apiLogin(request, OWNER);

    const cust = await createCustomer(request, token, { ad_soyad: MUSTERI, telefon: TELEFON });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });
    const plaka = veh.plaka_gorunen;

    const order = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka,
      durum: 'kabul',
      kalemler: [
        { tur: 'iscilik', ad: 'E2E işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 10000 }
      ]
    });
    expect(order.status).toBe(200);

    const msgs = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(msgs.length).toBe(1);
    expect(msgs[0].gonderildi_tarihi).toBeFalsy();

    const sent = await apiJson(request, 'POST', `/api/reminders/messages/${msgs[0].id}/sent`, token);
    expect(sent.status, JSON.stringify(sent.body)).toBe(200);

    const after = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(after[0].gonderildi_tarihi).toBeTruthy();
  });

  test('Hatırlatıcılar sayfası doğru telefon ve mesajla "WhatsApp Gönder" bağlantısı üretir', async ({ page, request }) => {
    const token = await apiLogin(request, OWNER);

    const cust = await createCustomer(request, token, { ad_soyad: MUSTERI, telefon: TELEFON });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });
    const plaka = veh.plaka_gorunen;

    const order = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka,
      durum: 'kabul',
      kalemler: [
        { tur: 'iscilik', ad: 'E2E işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 10000 }
      ]
    });
    expect(order.status).toBe(200);
    expect((await setWorkOrderStatus(request, token, order.body.workOrder.id, 'onarimda')).status).toBe(200);

    await login(page, OWNER);
    await page.getByRole('tab', { name: 'Hatırlatıcılar' }).click();

    const panel = page.getByTestId('status-notifications');
    await expect(panel).toBeVisible();

    const card = panel.locator('[data-testid="status-notification"]', { hasText: plaka }).first();
    await expect(card).toBeVisible();
    // En yeni kayıt "Onarımda" olmalı
    await expect(card).toContainText('Onarımda');

    const link = card.getByTestId('wa-send');
    await expect(link).toBeVisible();
    await expect(link).toHaveText('WhatsApp Gönder');

    const href = await link.getAttribute('href');
    expect(href).toBeTruthy();
    expect(href!.startsWith(`https://wa.me/${INTL}?text=`)).toBe(true);

    const text = decodeURIComponent(href!.split('text=')[1] || '');
    expect(text).toBe(expectedMessage('onarimda', plaka));
  });

  test('müşteri adı/telefonu ve plaka sonradan değişince hatırlatıcı kaydı güncellenir', async ({ request }) => {
    const token = await apiLogin(request, OWNER);

    const cust = await createCustomer(request, token, { ad_soyad: 'Eski İsim', telefon: '0555 000 11 22' });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });
    const plaka = veh.plaka_gorunen;

    const order = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka,
      durum: 'kabul',
      kalemler: [
        { tur: 'iscilik', ad: 'E2E işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 10000 }
      ]
    });
    expect(order.status, JSON.stringify(order.body)).toBe(200);

    const before = messagesForPlate(await getWhatsAppMessages(request, token), plaka);
    expect(before.length).toBe(1);
    const recId = before[0].id;
    expect(before[0].musteri_ad).toBe('Eski İsim');
    expect(before[0].mesaj).toContain('Eski İsim');

    // Müşteri adı + telefonu güncelle
    const updCust = await apiJson(request, 'PUT', `/api/customers/${cust.id}`, token, {
      ad_soyad: 'Yeni İsim',
      telefon: '0555 999 88 77'
    });
    expect(updCust.status, JSON.stringify(updCust.body)).toBe(200);

    // Araç plakasını güncelle
    const newPlate = uniqPlate();
    const updVeh = await apiJson(request, 'PUT', `/api/vehicles/${veh.id}`, token, { plaka: newPlate });
    expect(updVeh.status, JSON.stringify(updVeh.body)).toBe(200);
    const newDisplay = updVeh.body.vehicle.plaka_gorunen;

    // Hatırlatıcı kaydı; GÜNCEL ad, telefon, plaka ve yeniden üretilmiş mesajla dönmeli
    const rec = (await getWhatsAppMessages(request, token)).find((m) => m.id === recId);
    expect(rec).toBeTruthy();
    expect(rec.musteri_ad).toBe('Yeni İsim');
    expect(rec.telefon).toBe('0555 999 88 77');
    expect(rec.plaka).toBe(newDisplay);

    const beklenen = TEMPLATES.kabul
      .replace(/\{musteri\}/g, 'Yeni İsim')
      .replace(/\{plaka\}/g, newDisplay);
    expect(rec.mesaj).toBe(beklenen);
    expect(rec.mesaj).not.toContain('Eski İsim');
  });

  test('Teslime hazır aşaması "Müşteri hatırlatıcıları" listesinde tekrarlanmaz; mesaj yalnızca kurumsal şablonla servis durumu bildiriminde yer alır', async ({ request }) => {
    const token = await apiLogin(request, OWNER);
    const adSoyad = 'E2E Teslim Müşteri';

    const cust = await createCustomer(request, token, { ad_soyad: adSoyad, telefon: '0555 444 55 66' });
    const plate = uniqPlate();
    const veh = await createVehicle(request, token, { plaka: plate, musteri_id: cust.id });
    const plaka = veh.plaka_gorunen;

    const order = await createWorkOrder(request, token, {
      arac_id: veh.id,
      plaka,
      durum: 'kabul',
      kalemler: [
        { tur: 'iscilik', ad: 'E2E işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: 10000 }
      ]
    });
    const orderId = order.body.workOrder.id;
    const st = await setWorkOrderStatus(request, token, orderId, 'teslime_hazir');
    expect(st.status, JSON.stringify(st.body)).toBe(200);

    // "Müşteri hatırlatıcıları" (due) listesinde artık teslim_hazir kaydı OLMAMALI (tekrar önlendi)
    const due = await apiJson(request, 'GET', '/api/reminders/due', token);
    expect(due.status, JSON.stringify(due.body)).toBe(200);
    const tekrar = (due.body.items as any[]).find((r) => r.tur === 'teslim_hazir' && r.plaka === plaka);
    expect(tekrar, 'teslim_hazir artık due listesinde olmamalı').toBeFalsy();

    // Mesaj yalnızca servis durumu bildiriminde, kurumsal şablonla birebir yer almalı
    const bildirim = messagesForPlate(await getWhatsAppMessages(request, token), plaka).find(
      (m) => m.durum === 'teslime_hazir'
    );
    expect(bildirim).toBeTruthy();
    const beklenen = TEMPLATES.teslime_hazir
      .replace(/\{musteri\}/g, adSoyad)
      .replace(/\{plaka\}/g, plaka);
    expect(bildirim.mesaj).toBe(beklenen);
  });
});
