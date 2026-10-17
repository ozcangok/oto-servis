'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  BACKUP_FOLDER_NAME,
  DB_FILE_NAME,
  backupFileName,
  backupStamp,
  createDatabaseBackup
} = require('../backup.cjs');

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'oto-yedek-'));
}

test('backupStamp yerel saati YYYYAAAAGG-SSDDss olarak sıfır-dolgulu üretir', () => {
  assert.equal(backupStamp(new Date(2026, 9, 17, 9, 30, 5)), '20261017-093005');
  assert.equal(backupStamp(new Date(2026, 0, 3, 0, 0, 0)), '20260103-000000');
  assert.equal(backupStamp(new Date(2026, 11, 31, 23, 59, 59)), '20261231-235959');
});

test('backupFileName zaman damgasını ve yan dosya uzantısını korur', () => {
  assert.equal(backupFileName('20261017-093005'), 'oto-servis-20261017-093005.sqlite');
  assert.equal(backupFileName('20261017-093005', '-wal'), 'oto-servis-20261017-093005.sqlite-wal');
  assert.equal(backupFileName('20261017-093005', '-shm'), 'oto-servis-20261017-093005.sqlite-shm');
});

test('veritabanını zaman damgalı adla Belgelerim/CinarOto_Yedekler klasörüne kopyalar', (t) => {
  const root = makeTempDir();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const dataDir = path.join(root, 'data');
  const documentsDir = path.join(root, 'Belgelerim');
  fs.mkdirSync(dataDir, { recursive: true });

  const payload = Buffer.from('SQLite format 3\0DEMO-DB-ICERIK');
  fs.writeFileSync(path.join(dataDir, DB_FILE_NAME), payload);
  fs.writeFileSync(path.join(dataDir, `${DB_FILE_NAME}-wal`), Buffer.from('wal'));
  fs.writeFileSync(path.join(dataDir, `${DB_FILE_NAME}-shm`), Buffer.from('shm'));

  const result = createDatabaseBackup({
    dataDir,
    documentsDir,
    now: new Date(2026, 9, 17, 9, 30, 5)
  });

  assert.equal(result.ok, true);
  assert.equal(result.stamp, '20261017-093005');
  assert.equal(result.folder, path.join(documentsDir, BACKUP_FOLDER_NAME));
  assert.equal(result.main, path.join(documentsDir, BACKUP_FOLDER_NAME, 'oto-servis-20261017-093005.sqlite'));

  // Ana veritabanı + WAL yan dosyaları kopyalanır
  assert.equal(result.copied.length, 3);
  assert.ok(fs.existsSync(result.main));
  assert.ok(fs.existsSync(`${result.main}-wal`));
  assert.ok(fs.existsSync(`${result.main}-shm`));

  // İçerik bayt bayt aynı olmalı (yedek bozulmaz)
  assert.deepEqual(fs.readFileSync(result.main), payload);
  assert.equal(fs.readFileSync(`${result.main}-wal`, 'utf8'), 'wal');
  assert.equal(fs.readFileSync(`${result.main}-shm`, 'utf8'), 'shm');

  // Kaynak veritabanı yerinde kalır (kopyalama, taşıma değil)
  assert.ok(fs.existsSync(path.join(dataDir, DB_FILE_NAME)));
});

test('yan dosya yoksa yalnızca ana veritabanını kopyalar', (t) => {
  const root = makeTempDir();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const dataDir = path.join(root, 'data');
  const documentsDir = path.join(root, 'Belgelerim');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, DB_FILE_NAME), Buffer.from('tek-dosya'));

  const result = createDatabaseBackup({ dataDir, documentsDir, now: new Date(2026, 9, 17, 9, 30, 5) });

  assert.equal(result.ok, true);
  assert.equal(result.copied.length, 1);
  assert.equal(fs.readFileSync(result.main, 'utf8'), 'tek-dosya');
});

test('veritabanı yoksa ok:false döner ama yedek klasörünü yine de oluşturur', (t) => {
  const root = makeTempDir();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const dataDir = path.join(root, 'bos-data');
  const documentsDir = path.join(root, 'Belgelerim');
  fs.mkdirSync(dataDir, { recursive: true });

  const result = createDatabaseBackup({ dataDir, documentsDir, now: new Date(2026, 9, 17, 9, 30, 5) });

  assert.equal(result.ok, false);
  assert.equal(result.reason, 'db-not-found');
  assert.equal(result.copied.length, 0);
  assert.equal(result.main, null);
  assert.ok(fs.existsSync(path.join(documentsDir, BACKUP_FOLDER_NAME)));
});

test('dataDir/documentsDir zorunludur', () => {
  assert.throws(() => createDatabaseBackup({ documentsDir: '/tmp' }), /dataDir ve documentsDir zorunludur/);
  assert.throws(() => createDatabaseBackup({ dataDir: '/tmp' }), /dataDir ve documentsDir zorunludur/);
});
