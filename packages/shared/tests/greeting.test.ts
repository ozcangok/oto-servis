import { describe, it, expect } from 'vitest';
import {
  APP_BRAND_NAME,
  DAY_NAMES_TR,
  dayNameTr,
  dayPart,
  farewellGreeting,
  isWeekend,
  splashGreeting
} from '../src/greeting.js';

/**
 * Saat/gün duyarlı metin motoru.
 * Tüm örnekler YEREL saat diliminde `new Date(y, m, d, h, min)` ile kurulur.
 */

// 2026 yılı Ekim ayı referansı (Pazartesi = 12, Cumartesi = 17, Pazar = 18)
const PZT = (h: number, min = 0) => new Date(2026, 9, 12, h, min, 0, 0);
const CMT = (h: number, min = 0) => new Date(2026, 9, 17, h, min, 0, 0);
const PAZ = (h: number, min = 0) => new Date(2026, 9, 18, h, min, 0, 0);

describe('Greeting engine — sistem saati ve günü', () => {
  it('getDay() verisini hafta sonu kontrolünde kusursuz kullanır', () => {
    expect(isWeekend(CMT(12))).toBe(true);
    expect(isWeekend(PAZ(12))).toBe(true);
    expect(isWeekend(PZT(12))).toBe(false);
    expect(dayNameTr(CMT(12))).toBe('Cumartesi');
    expect(dayNameTr(PAZ(12))).toBe('Pazar');
    expect(dayNameTr(PZT(12))).toBe('Pazartesi');
    expect(DAY_NAMES_TR).toHaveLength(7);
  });

  it('gün dilimlerini saniye/milisaniye sınırına kadar doğru hesaplar', () => {
    expect(dayPart(new Date(2026, 9, 12, 5, 59, 59, 999))).toBe('evening'); // 05:59:59.999
    expect(dayPart(new Date(2026, 9, 12, 6, 0, 0, 0))).toBe('morning'); // 06:00:00.000
    expect(dayPart(new Date(2026, 9, 12, 11, 59, 59, 999))).toBe('morning');
    expect(dayPart(new Date(2026, 9, 12, 12, 0, 0, 0))).toBe('afternoon');
    expect(dayPart(new Date(2026, 9, 12, 16, 59, 59, 999))).toBe('afternoon');
    expect(dayPart(new Date(2026, 9, 12, 17, 0, 0, 0))).toBe('evening');
    expect(dayPart(new Date(2026, 9, 12, 23, 59, 59, 999))).toBe('evening');
    expect(dayPart(new Date(2026, 9, 12, 0, 0, 0, 0))).toBe('evening');
  });

  it('06:00–11:59 arası günaydın + o günün adını yazar (hafta içi)', () => {
    expect(splashGreeting(PZT(6, 0))).toBe(
      `Günaydın! Harika bir Pazartesi sabahından ${APP_BRAND_NAME}'e Hoş Geldiniz.`
    );
    expect(splashGreeting(PZT(11, 59))).toContain('Günaydın!');
    expect(splashGreeting(PZT(11, 59))).not.toContain('İyi hafta sonları');
  });

  it('12:00–16:59 arası iyi günler der', () => {
    expect(splashGreeting(PZT(12, 0))).toBe(`İyi Günler! ${APP_BRAND_NAME}'e Hoş Geldiniz.`);
    expect(splashGreeting(PZT(16, 59))).toBe(`İyi Günler! ${APP_BRAND_NAME}'e Hoş Geldiniz.`);
  });

  it('17:00–05:59 arası iyi akşamlar der', () => {
    expect(splashGreeting(PZT(17, 0))).toBe(`İyi Akşamlar! ${APP_BRAND_NAME}'e Hoş Geldiniz.`);
    expect(splashGreeting(PZT(23, 59))).toBe(`İyi Akşamlar! ${APP_BRAND_NAME}'e Hoş Geldiniz.`);
    expect(splashGreeting(PZT(0, 0))).toBe(`İyi Akşamlar! ${APP_BRAND_NAME}'e Hoş Geldiniz.`);
    expect(splashGreeting(PZT(5, 59))).toBe(`İyi Akşamlar! ${APP_BRAND_NAME}'e Hoş Geldiniz.`);
  });

  it('Cumartesi/Pazar günü tüm karşılama metinlerine hafta sonu dileğini ekler', () => {
    expect(splashGreeting(CMT(9, 30))).toBe(
      `Günaydın! Harika bir Cumartesi sabahından ${APP_BRAND_NAME}'e Hoş Geldiniz. İyi hafta sonları dileriz.`
    );
    expect(splashGreeting(PAZ(13, 0))).toBe(
      `İyi Günler! ${APP_BRAND_NAME}'e Hoş Geldiniz. İyi hafta sonları dileriz.`
    );
    expect(splashGreeting(PAZ(20, 0))).toBe(
      `İyi Akşamlar! ${APP_BRAND_NAME}'e Hoş Geldiniz. İyi hafta sonları dileriz.`
    );
  });

  it('veda metni saat dilimine göre iyi günler / iyi akşamlar der', () => {
    expect(farewellGreeting(PZT(6, 0))).toBe(
      `${APP_BRAND_NAME} iyi günler diler. Verileriniz güvenle yedekleniyor...`
    );
    expect(farewellGreeting(PZT(16, 59))).toContain('iyi günler');
    expect(farewellGreeting(PZT(17, 0))).toContain('iyi akşamlar');
    expect(farewellGreeting(PZT(4, 30))).toContain('iyi akşamlar');
  });

  it('veda metnine de hafta sonu dileği eklenir', () => {
    expect(farewellGreeting(CMT(18, 0))).toBe(
      `${APP_BRAND_NAME} iyi akşamlar diler. Verileriniz güvenle yedekleniyor... İyi hafta sonları dileriz.`
    );
    expect(farewellGreeting(PAZ(11, 0))).toBe(
      `${APP_BRAND_NAME} iyi günler diler. Verileriniz güvenle yedekleniyor... İyi hafta sonları dileriz.`
    );
  });

  it('marka adı parametre ile değiştirilebilir (metin şablonu sabittir)', () => {
    expect(splashGreeting(PZT(9, 0), 'Deneme Oto')).toContain('Deneme Oto');
    expect(farewellGreeting(PZT(9, 0), 'Deneme Oto')).toContain('Deneme Oto');
  });
});
