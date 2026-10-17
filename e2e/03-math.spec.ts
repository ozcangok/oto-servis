import { test, expect } from '@playwright/test';
import {
  OWNER,
  apiLogin,
  apiJson,
  createExpense,
  createVehicle,
  createWorkOrder,
  uniqPlate,
  todayOnly,
  dateOnly,
  pad2,
  isoAtNoon
} from './helpers.js';

/**
 * KATEGORİ 3 — İLERİ SEVİYE KASA VE NET KÂR MATEMATİĞİ
 *
 * Gider güncellemesi net kârı kuruşu kuruşuna değiştirmeli; dönem filtreleri
 * (Bugün / Bu Ay / Bu Yıl / Tümü) yalnızca o döneme ait gelir ve giderleri
 * hesaba katmalı.
 */
test.describe('3) Kasa ve net kâr matematiği', () => {
  test('gider tutarı güncellenince net kâr kuruşu kuruşuna yeniden hesaplanır', async ({ request }) => {
    const token = await apiLogin(request, OWNER);
    const t = todayOnly();

    const base = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;

    const created = await createExpense(request, token, {
      tarih: t,
      kategori: 'Sarf Malzeme',
      aciklama: 'E2E net kâr testi',
      tutar_kurus: 20000
    });
    expect(created.status).toBe(200);
    const id = created.body.expense.id;

    // Ekleme: gider +20.000, net kâr -20.000
    const afterAdd = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    expect(afterAdd.expenseTotalKurus).toBe(base.expenseTotalKurus + 20000);
    expect(afterAdd.netProfitKurus).toBe(base.netProfitKurus - 20000);
    expect(afterAdd.laborIncomeKurus).toBe(base.laborIncomeKurus);

    // Güncelleme (200 -> 500 TL): net kâr yeniden hesaplanır
    const upd = await apiJson(request, 'PUT', `/api/expenses/${id}`, token, {
      tarih: t,
      kategori: 'Sarf Malzeme',
      aciklama: 'E2E net kâr testi',
      tutar_kurus: 50000
    });
    expect(upd.status).toBe(200);

    const afterUpdate = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    expect(afterUpdate.expenseTotalKurus).toBe(base.expenseTotalKurus + 50000);
    expect(afterUpdate.netProfitKurus).toBe(base.netProfitKurus - 50000);

    // Silme: başlangıç değerlerine dön
    const del = await apiJson(request, 'DELETE', `/api/expenses/${id}`, token);
    expect(del.status).toBe(200);

    const afterDelete = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    expect(afterDelete.expenseTotalKurus).toBe(base.expenseTotalKurus);
    expect(afterDelete.netProfitKurus).toBe(base.netProfitKurus);
  });

  test('dönem filtreleri yalnızca o dönemin giderlerini içerir', async ({ request }) => {
    const token = await apiLogin(request, OWNER);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();

    const todayStr = dateOnly(now);
    const monthFirst = `${y}-${pad2(m + 1)}-01`;
    const monthLast = dateOnly(new Date(y, m + 1, 0));
    const yearFirst = `${y}-01-01`;
    const yearLast = `${y}-12-31`;

    const created = [
      { date: todayStr, amt: 10000 },
      { date: monthFirst, amt: 20000 },
      { date: `${y}-01-01`, amt: 40000 },
      { date: `${y - 1}-12-31`, amt: 80000 }
    ];

    const sumIf = (pred: (d: string) => boolean) =>
      created.filter((c) => pred(c.date)).reduce((s, c) => s + c.amt, 0);

    const expToday = sumIf((d) => d === todayStr);
    const expMonth = sumIf((d) => d >= monthFirst && d <= monthLast);
    const expYear = sumIf((d) => d >= yearFirst && d <= yearLast);
    const expAll = sumIf(() => true);

    const baseAll = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    const baseToday = (await apiJson(request, 'GET', '/api/expenses?period=today', token)).body.summary;
    const baseMonth = (await apiJson(request, 'GET', '/api/expenses?period=month', token)).body.summary;
    const baseYear = (await apiJson(request, 'GET', '/api/expenses?period=year', token)).body.summary;

    const ids: number[] = [];
    for (const c of created) {
      const r = await createExpense(request, token, {
        tarih: c.date,
        kategori: 'Sarf Malzeme',
        aciklama: `E2E dönem ${c.date}`,
        tutar_kurus: c.amt
      });
      expect(r.status).toBe(200);
      ids.push(r.body.expense.id);
    }

    const afterAll = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    const afterToday = (await apiJson(request, 'GET', '/api/expenses?period=today', token)).body.summary;
    const afterMonth = (await apiJson(request, 'GET', '/api/expenses?period=month', token)).body.summary;
    const afterYear = (await apiJson(request, 'GET', '/api/expenses?period=year', token)).body.summary;

    expect(afterAll.expenseTotalKurus).toBe(baseAll.expenseTotalKurus + expAll);
    expect(afterToday.expenseTotalKurus).toBe(baseToday.expenseTotalKurus + expToday);
    expect(afterMonth.expenseTotalKurus).toBe(baseMonth.expenseTotalKurus + expMonth);
    expect(afterYear.expenseTotalKurus).toBe(baseYear.expenseTotalKurus + expYear);

    // Net kâr = servis geliri - gider; gider arttıkça net kâr aynı oranda azalır
    expect(afterToday.netProfitKurus).toBe(baseToday.netProfitKurus - expToday);
    expect(afterMonth.netProfitKurus).toBe(baseMonth.netProfitKurus - expMonth);

    // Temizlik
    for (const id of ids) {
      await apiJson(request, 'DELETE', `/api/expenses/${id}`, token);
    }
  });

  test('net kâr, seçilen döneme ait işçilik gelirleriyle hesaplanır', async ({ request }) => {
    const token = await apiLogin(request, OWNER);
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    const todayStr = dateOnly(now);
    const monthFirst = `${y}-${pad2(m + 1)}-01`;
    const monthLast = dateOnly(new Date(y, m + 1, 0));
    const yearFirst = `${y}-01-01`;
    const yearLast = `${y}-12-31`;

    // Farklı dönemlere ait işçilik kalemli iş emirleri
    const specs = [
      { date: isoAtNoon(y, m, now.getDate()), labor: 30000 }, // bugün
      { date: isoAtNoon(y, 0, 1), labor: 70000 }, // bu yılın başı
      { date: isoAtNoon(y - 1, 5, 15), labor: 90000 } // geçen yıl
    ];

    const localDay = (iso: string) => dateOnly(new Date(iso));
    const sumIf = (pred: (d: string) => boolean) =>
      specs.filter((s) => pred(localDay(s.date))).reduce((a, s) => a + s.labor, 0);

    const expToday = sumIf((d) => d === todayStr);
    const expMonth = sumIf((d) => d >= monthFirst && d <= monthLast);
    const expYear = sumIf((d) => d >= yearFirst && d <= yearLast);
    const expAll = sumIf(() => true);

    const baseToday = (await apiJson(request, 'GET', '/api/expenses?period=today', token)).body.summary;
    const baseMonth = (await apiJson(request, 'GET', '/api/expenses?period=month', token)).body.summary;
    const baseYear = (await apiJson(request, 'GET', '/api/expenses?period=year', token)).body.summary;
    const baseAll = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;

    const orderIds: number[] = [];
    for (const s of specs) {
      const plate = uniqPlate();
      const veh = await createVehicle(request, token, { plaka: plate });
      const r = await createWorkOrder(request, token, {
        arac_id: veh.id,
        plaka: plate,
        giris_tarihi: s.date,
        kalemler: [
          { tur: 'iscilik', ad: 'E2E işçilik', adet: 1, birim: 'Adet', birim_fiyat_kurus: s.labor }
        ]
      });
      expect(r.status, JSON.stringify(r.body)).toBe(200);
      orderIds.push(r.body.workOrder.id);
    }

    const afterToday = (await apiJson(request, 'GET', '/api/expenses?period=today', token)).body.summary;
    const afterMonth = (await apiJson(request, 'GET', '/api/expenses?period=month', token)).body.summary;
    const afterYear = (await apiJson(request, 'GET', '/api/expenses?period=year', token)).body.summary;
    const afterAll = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;

    expect(afterToday.laborIncomeKurus).toBe(baseToday.laborIncomeKurus + expToday);
    expect(afterMonth.laborIncomeKurus).toBe(baseMonth.laborIncomeKurus + expMonth);
    expect(afterYear.laborIncomeKurus).toBe(baseYear.laborIncomeKurus + expYear);
    expect(afterAll.laborIncomeKurus).toBe(baseAll.laborIncomeKurus + expAll);

    // Gider değişmediği için net kâr, gelir kadar artmalı
    expect(afterToday.netProfitKurus).toBe(baseToday.netProfitKurus + expToday);
    expect(afterAll.netProfitKurus).toBe(baseAll.netProfitKurus + expAll);

    // Temizlik: iş emirleri silinince gelir eski haline döner
    for (const id of orderIds) {
      await apiJson(request, 'DELETE', `/api/work-orders/${id}`, token);
    }
    const restored = (await apiJson(request, 'GET', '/api/expenses?period=all', token)).body.summary;
    expect(restored.laborIncomeKurus).toBe(baseAll.laborIncomeKurus);
  });
});
