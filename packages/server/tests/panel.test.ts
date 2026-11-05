import { describe, it, expect, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import {
  initDatabase,
  getDb,
  whatsappMessages
} from '../src/db/index.js';
import { setupInitialAdmin, createUser, loginUser } from '../src/services/authService.js';
import { buildApp } from '../src/app.js';
import { getPartStock } from '../src/services/stockService.js';

/**
 * Panel entegrasyonu:
 * - Personel yalnızca kendine atanan iş emirlerini görür.
 * - Personel durum güncellemesi yapabilir; teslim ve finansal işlemler yapamaz.
 * - Parça talebi personel tarafından açılır, sahip onaylayınca stoğa girer.
 * - Fatura yalnızca sahip tarafından kesilir; WhatsApp kuyruğuna kayıt düşer.
 */
describe('Panel entegrasyonu: atama, parça talebi ve fatura', () => {
  let app: any;
  let owner: any;
  let ownerToken: string;
  let staffToken: string;
  let staffId: number;
  let customerId: number;
  let vehicleId: number;
  let partId: number;

  const call = (method: string, url: string, token: string, payload?: any) =>
    app.inject({
      method: method as any,
      url,
      headers: { authorization: `Bearer ${token}` },
      ...(payload !== undefined ? { payload } : {})
    });

  beforeEach(async () => {
    initDatabase({ inMemory: true });
    app = await buildApp({ enableRateLimit: false });

    owner = await setupInitialAdmin({
      username: 'panel_owner',
      password: 'Panel!12345',
      full_name: 'Panel Sahip'
    });
    ownerToken = (await loginUser('panel_owner', 'Panel!12345')).token;

    const staff = await createUser(owner as any, {
      username: 'panel_staff',
      password: 'Panel!12345',
      full_name: 'Panel Personel',
      role: 'staff'
    });
    staffId = staff.id;
    staffToken = (await loginUser('panel_staff', 'Panel!12345')).token;

    const customerRes = await call('POST', '/api/customers', ownerToken, {
      ad_soyad: 'Panel Müşteri',
      telefon: '05550001122'
    });
    expect(customerRes.statusCode).toBe(200);
    const customer = JSON.parse(customerRes.body).customer;
    customerId = customer.id;

    const vehicleRes = await call('POST', '/api/vehicles', ownerToken, {
      plaka: '34 PNL 001',
      marka: 'Renault',
      model: 'Clio',
      musteri_id: customerId,
      musteri_ad_soyad: customer.ad_soyad,
      musteri_telefon: customer.telefon
    });
    expect(vehicleRes.statusCode).toBe(200);
    vehicleId = JSON.parse(vehicleRes.body).vehicle.id;

    const partRes = await call('POST', '/api/parts', ownerToken, {
      ad: 'Panel Fren Balatası',
      kod: 'PNL-BALATA',
      alis_kurus: 10000,
      satis_kurus: 15000,
      kritik_stok: 3,
      aktif: true
    });
    expect(partRes.statusCode).toBe(200);
    partId = JSON.parse(partRes.body).part.id;
    await call('POST', `/api/parts/${partId}/stock-movement`, ownerToken, {
      miktar: 5,
      tur: 'giris'
    });
  });

  async function createOrder(assignedTo?: number) {
    const res = await call('POST', '/api/work-orders', ownerToken, {
      arac_id: vehicleId,
      durum: 'kabul',
      sikayet: 'Panel test iş emri',
      kdv_orani: 20,
      kdv_dahil_mi: false,
      ...(assignedTo ? { atanan_kullanici_id: assignedTo } : {}),
      kalemler: [
        {
          tur: 'iscilik',
          ad: 'Panel işçilik',
          adet: 1,
          birim: 'Adet',
          birim_fiyat_kurus: 100000
        }
      ]
    });
    expect(res.statusCode).toBe(200);
    return JSON.parse(res.body).workOrder;
  }

  it('personel yalnızca kendine atanan işi görür ve teslim edemez', async () => {
    const assigned = await createOrder(staffId);
    const other = await createOrder();

    const staffList = await call('GET', '/api/work-orders?limit=100', staffToken);
    expect(staffList.statusCode).toBe(200);
    const staffItems = JSON.parse(staffList.body).items;
    expect(staffItems.map((o: any) => o.id)).toEqual([assigned.id]);
    expect(staffItems.some((o: any) => o.id === other.id)).toBe(false);

    const toWaiting = await call(
      'PUT',
      `/api/work-orders/${assigned.id}/status`,
      staffToken,
      { durum: 'parca_bekliyor' }
    );
    expect(toWaiting.statusCode).toBe(200);

    const toReady = await call(
      'PUT',
      `/api/work-orders/${assigned.id}/status`,
      staffToken,
      { durum: 'teslime_hazir' }
    );
    expect(toReady.statusCode).toBe(200);

    const toDelivered = await call(
      'PUT',
      `/api/work-orders/${assigned.id}/status`,
      staffToken,
      { durum: 'teslim_edildi' }
    );
    expect(toDelivered.statusCode).toBe(403);

    const payment = await call(
      'POST',
      `/api/work-orders/${assigned.id}/payments`,
      staffToken,
      { tutar_kurus: 1000, yontem: 'nakit' }
    );
    expect(payment.statusCode).toBe(403);

    const cash = await call('GET', '/api/cash-desk/summary', staffToken);
    expect(cash.statusCode).toBe(403);
  });

  it('parça talebi sahip onayıyla stoğa girer', async () => {
    const order = await createOrder(staffId);
    const before = getPartStock(partId);

    const create = await call('POST', '/api/part-requests', staffToken, {
      parca_id: partId,
      adet: 2,
      is_emri_id: order.id,
      notlar: 'Acil tedarik'
    });
    expect(create.statusCode).toBe(200);
    const request = JSON.parse(create.body).request;
    expect(request.durum).toBe('bekliyor');

    const staffList = await call('GET', '/api/part-requests', staffToken);
    expect(staffList.statusCode).toBe(200);
    expect(JSON.parse(staffList.body).requests.map((r: any) => r.id)).toContain(request.id);

    const ownerList = await call('GET', '/api/part-requests', ownerToken);
    expect(ownerList.statusCode).toBe(200);
    expect(JSON.parse(ownerList.body).requests.map((r: any) => r.id)).toContain(request.id);

    const approve = await call(
      'PATCH',
      `/api/part-requests/${request.id}/onayla`,
      ownerToken
    );
    expect(approve.statusCode).toBe(200);
    expect(getPartStock(partId)).toBe(before + 2);
  });

  it('fatura yalnızca sahip tarafından kesilir ve WhatsApp kuyruğuna düşer', async () => {
    const order = await createOrder(staffId);

    const staffInvoice = await call('POST', '/api/invoices', staffToken, {
      is_emri_id: order.id
    });
    expect(staffInvoice.statusCode).toBe(403);

    const invoice = await call('POST', '/api/invoices', ownerToken, {
      is_emri_id: order.id,
      notlar: 'Panel test faturası'
    });
    expect(invoice.statusCode).toBe(200);
    const created = JSON.parse(invoice.body).invoice;
    expect(created.fatura_no).toMatch(/^FTR-\d{4}-\d{4}$/);
    expect(created.tutar_kurus).toBeGreaterThan(0);

    const list = await call('GET', `/api/invoices?is_emri_id=${order.id}`, ownerToken);
    expect(list.statusCode).toBe(200);
    expect(JSON.parse(list.body).invoices).toHaveLength(1);

    const duplicate = await call('POST', '/api/invoices', ownerToken, {
      is_emri_id: order.id
    });
    expect(duplicate.statusCode).toBe(409);

    const db = getDb();
    const notifications = db
      .select()
      .from(whatsappMessages)
      .where(
        and(
          eq(whatsappMessages.is_emri_id, order.id),
          eq(whatsappMessages.durum, 'fatura')
        )
      )
      .all();
    expect(notifications).toHaveLength(1);
    expect(notifications[0].mesaj).toContain(created.fatura_no);
    expect(notifications[0].mesaj).toContain('34 PNL 001');
  });
});
