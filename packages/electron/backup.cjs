'use strict';

/**
 * Güvenli kapanışta çalışan SQLite yedekleme modülü.
 *
 * Bu modül BİLEREK Electron'dan bağımsız (saf Node) tutulur: böylece hem masaüstü
 * ana süreci hem de `node --test` birim testleri aynı kodu kullanır.
 *
 * Yedek dosyası: Belgelerim / CinarOto_Yedekler / oto-servis-YYYYAAGG-SSDDss.sqlite
 * (WAL modu kullanıldığı için `-wal` ve `-shm` yan dosyaları da varsa kopyalanır.)
 */

const fs = require('fs');
const path = require('path');

/** Veritabanı dosya adı (`server/src/db/index.ts` ile aynı olmalı). */
const DB_FILE_NAME = 'oto-servis.sqlite';
/** Belgelerim altında oluşturulacak yedek klasörü. */
const BACKUP_FOLDER_NAME = 'CinarOto_Yedekler';
/** SQLite (WAL) yan dosya uzantıları. */
const SIDECAR_SUFFIXES = ['', '-wal', '-shm'];

function pad2(value) {
  return String(value).padStart(2, '0');
}

/**
 * Zaman damgası: YYYYAAAAGG-SSDDss (yerel saat).
 * Örn. 2026-10-17 09:30:05 → 20261017-093005
 */
function backupStamp(date) {
  return (
    `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}` +
    `-${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`
  );
}

/** Yedek dosya adı üretir. */
function backupFileName(stamp, suffix = '') {
  return `oto-servis-${stamp}.sqlite${suffix}`;
}

/** Yedek klasörünün adı. */
function backupFolderName() {
  return BACKUP_FOLDER_NAME;
}

/**
 * Veritabanını (ve WAL yan dosyalarını) belgelerim altındaki yedek klasörüne
 * zaman damgasıyla kopyalar.
 *
 * @returns {{ok:boolean, reason?:string, stamp:string, folder:string, source:string, main:string|null, copied:string[]}}
 */
function createDatabaseBackup(options) {
  const opts = options || {};
  const dataDir = opts.dataDir;
  const documentsDir = opts.documentsDir;
  const now = opts.now instanceof Date ? opts.now : new Date();
  const io = opts.fsImpl || fs;

  if (!dataDir || !documentsDir) {
    throw new Error('createDatabaseBackup: dataDir ve documentsDir zorunludur.');
  }

  const folder = path.join(documentsDir, BACKUP_FOLDER_NAME);
  io.mkdirSync(folder, { recursive: true });

  const stamp = backupStamp(now);
  const source = path.join(dataDir, DB_FILE_NAME);
  const copied = [];

  if (!io.existsSync(source)) {
    return { ok: false, reason: 'db-not-found', stamp, folder, source, main: null, copied };
  }

  for (const suffix of SIDECAR_SUFFIXES) {
    const src = source + suffix;
    if (!io.existsSync(src)) continue;
    const dest = path.join(folder, backupFileName(stamp, suffix));
    io.copyFileSync(src, dest);
    copied.push(dest);
  }

  return { ok: true, stamp, folder, source, main: copied[0] || null, copied };
}

module.exports = {
  DB_FILE_NAME,
  BACKUP_FOLDER_NAME,
  SIDECAR_SUFFIXES,
  backupStamp,
  backupFileName,
  backupFolderName,
  createDatabaseBackup
};
