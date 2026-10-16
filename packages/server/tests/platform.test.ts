import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  initPlatformDb,
  closePlatformDb,
  createCompany,
  getCompanyBySlug,
  listCompanies,
  tenantDbPath,
  normalizeCompanySlug,
  isValidCompanySlug,
  getDataDir
} from '../src/db/platform.js';

describe('Faz 1: Platform DB ve sirket kaydi', () => {
  let tmpFile = '';

  beforeEach(() => {
    tmpFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'platform-test-')), 'platform.sqlite');
    initPlatformDb({ platformDbPath: tmpFile });
  });

  afterEach(() => {
    closePlatformDb();
    try {
      fs.rmSync(path.dirname(tmpFile), { recursive: true, force: true });
    } catch {}
  });

  it('Turkce firma adindan guvenli slug uretir', () => {
    expect(normalizeCompanySlug('Çınar Otomotiv')).toBe('cinar-otomotiv');
    expect(normalizeCompanySlug('Ahmet Otomotiv Ltd. Şti.')).toBe('ahmet-otomotiv-ltd-sti');
    expect(isValidCompanySlug('cinar-otomotiv')).toBe(true);
    expect(isValidCompanySlug('../../etc')).toBe(false);
    expect(isValidCompanySlug('AB')).toBe(false);
  });

  it('sirket olusturur, 14 gun deneme suresi baslatir', () => {
    const company = createCompany({
      slug: 'cinar-otomotiv',
      ad: 'Çınar Otomotiv',
      eposta: 'info@cinarotomotiv.com',
      telefon: '05307665260'
    });

    expect(company.id).toBeDefined();
    expect(company.slug).toBe('cinar-otomotiv');
    expect(company.plan).toBe('trial');
    expect(company.durum).toBe('active');
    expect(company.trial_bitis).toBeDefined();
    const trialMs = new Date(company.trial_bitis!).getTime() - Date.now();
    expect(trialMs).toBeGreaterThan(13 * 24 * 60 * 60 * 1000);
    expect(trialMs).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000 + 60000);
  });

  it('ayni slug ile ikinci sirket acilmasini engeller', () => {
    createCompany({ slug: 'ahmet-otomotiv', ad: 'Ahmet Otomotiv' });
    expect(() => createCompany({ slug: 'ahmet-otomotiv', ad: 'Başka Firma' })).toThrow(
      /zaten kullanımda/
    );
  });

  it('sirketleri listeler ve slug ile bulur', () => {
    createCompany({ slug: 'firma-bir', ad: 'Firma Bir' });
    createCompany({ slug: 'firma-iki', ad: 'Firma İki' });

    expect(listCompanies().length).toBe(2);
    expect(getCompanyBySlug('firma-iki')?.ad).toBe('Firma İki');
    expect(getCompanyBySlug('olmayan')).toBeUndefined();
  });

  it('tenant dosya yolunu tenants klasini icinde ve guvenli uretir', () => {
    const dataDir = getDataDir();
    const p = tenantDbPath(dataDir, 'cinar-otomotiv');
    expect(p.startsWith(path.join(dataDir, 'tenants') + path.sep)).toBe(true);
    expect(p.endsWith('cinar-otomotiv.sqlite')).toBe(true);
    expect(() => tenantDbPath(dataDir, '../../etc/passwd')).toThrow();
  });
});
