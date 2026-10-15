import { describe, it, expect } from 'vitest';
import {
  calculateWorkOrderTotals,
  formatCurrency,
  parseCurrencyToKurus,
  formatDate,
  formatDateTime
} from '../src/calculations.js';

describe('Calculations and Currency Engine', () => {
  it('strictly validates the user-specified calculation example', () => {
    // Örnek doğrulama: 2 × 850 ₺ parça + 500 ₺ işçilik, %10 iskonto, %20 KDV → KDV dahil 2.376,00 ₺, peşin fiyat (ara toplamdan %5) 1.881,00 ₺.
    const result = calculateWorkOrderTotals({
      lines: [
        { adet: 2, birim_fiyat_kuruş: 85000 }, // 2 x 850,00 ₺
        { adet: 1, birim_fiyat_kuruş: 50000 }  // 1 x 500,00 ₺
      ],
      kdv_orani: 20,
      kdv_dahil_mi: false, // Kalemler KDV hariç
      iskonto_yuzde: 10,
      pesin_iskonto_yuzde: 5
    });

    // Toplam: 1700 + 500 = 2200 ₺ -> 220000 kuruş
    expect(result.toplam_kurus).toBe(220000);
    // İskonto: %10 = 220 ₺ -> 22000 kuruş
    expect(result.iskonto_kurus).toBe(22000);
    // Net (matrah): 2200 - 220 = 1980 ₺ -> 198000 kuruş
    expect(result.net_kurus).toBe(198000);
    // KDV (%20): 1980 * 0.20 = 396 ₺ -> 39600 kuruş
    expect(result.kdv_tutar_kurus).toBe(39600);
    // Brüt (KDV dahil): 1980 + 396 = 2376 ₺ -> 237600 kuruş
    expect(result.brut_kurus).toBe(237600);
    expect(formatCurrency(result.brut_kurus)).toBe('2.376,00 ₺');

    // Peşin fiyat (ara toplam 1980 ₺ üzerinden %5 peşin iskonto): 1980 * 0.95 = 1881.00 ₺ -> 188100 kuruş
    expect(result.pesin_fiyat_kurus).toBe(188100);
    expect(formatCurrency(result.pesin_fiyat_kurus)).toBe('1.881,00 ₺');
  });

  it('handles KDV-dahil (tax-inclusive) mode correctly', () => {
    // 1200 ₺ gross with 20% VAT
    const result = calculateWorkOrderTotals({
      lines: [{ adet: 1, birim_fiyat_kuruş: 120000 }],
      kdv_orani: 20,
      kdv_dahil_mi: true,
      iskonto_yuzde: 0,
      pesin_iskonto_yuzde: 5
    });

    expect(result.toplam_kurus).toBe(120000);
    expect(result.brut_kurus).toBe(120000);
    // net = 1200 / 1.2 = 1000 ₺
    expect(result.net_kurus).toBe(100000);
    expect(result.kdv_tutar_kurus).toBe(20000);
  });

  it('supports fixed amount discounts and caps discount at lines total', () => {
    const result = calculateWorkOrderTotals({
      lines: [{ adet: 1, birim_fiyat_kuruş: 10000 }], // 100 ₺
      kdv_orani: 20,
      kdv_dahil_mi: false,
      iskonto_tutar_kurus: 15000 // 150 ₺ discount requested
    });

    // Discount cannot exceed 100 ₺
    expect(result.iskonto_kurus).toBe(10000);
    expect(result.net_kurus).toBe(0);
    expect(result.brut_kurus).toBe(0);
  });

  it('honors manual cash price override', () => {
    const result = calculateWorkOrderTotals({
      lines: [{ adet: 1, birim_fiyat_kuruş: 100000 }], // 1000 ₺
      kdv_orani: 20,
      kdv_dahil_mi: true,
      pesin_fiyat_elle_kurus: 85000 // Manual 850 ₺
    });

    expect(result.pesin_fiyat_kurus).toBe(85000);
  });

  it('calculates remaining balance correctly and prevents negative balance', () => {
    const result = calculateWorkOrderTotals({
      lines: [{ adet: 1, birim_fiyat_kuruş: 100000 }],
      kdv_orani: 0,
      kdv_dahil_mi: false,
      odenen_kurus: 40000
    });

    expect(result.kalan_kurus).toBe(60000);

    const overpaid = calculateWorkOrderTotals({
      lines: [{ adet: 1, birim_fiyat_kuruş: 100000 }],
      kdv_orani: 0,
      kdv_dahil_mi: false,
      odenen_kurus: 120000
    });

    expect(overpaid.kalan_kurus).toBe(0);
  });

  it('formats Turkish currency in kuruş properly', () => {
    expect(formatCurrency(0)).toBe('0,00 ₺');
    expect(formatCurrency(50)).toBe('0,50 ₺');
    expect(formatCurrency(123450)).toBe('1.234,50 ₺');
    expect(formatCurrency(10000000)).toBe('100.000,00 ₺');
  });

  it('parses Turkish currency input to kuruş properly', () => {
    expect(parseCurrencyToKurus('1.234,50')).toBe(123450);
    expect(parseCurrencyToKurus('1234,50')).toBe(123450);
    expect(parseCurrencyToKurus('1234.50')).toBe(123450);
    expect(parseCurrencyToKurus('500')).toBe(50000);
    expect(parseCurrencyToKurus(250.75)).toBe(25075);
  });

  it('formats date and time in Europe/Istanbul timezone', () => {
    // 2026-10-14T12:00:00Z -> In UTC+3 (Europe/Istanbul) is 15:00
    const formatted = formatDateTime('2026-10-14T12:00:00Z');
    expect(formatted).toContain('14.10.2026');
    expect(formatted).toContain('15:00');
  });
});
