import path from 'path';
import fs from 'fs';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { getSqlite, initDatabase } from '../db/index.js';
import { getSettings, updateSettings } from './settingsService.js';
import { logAudit } from './auditService.js';

const MAX_BACKUP_RETENTION = 30;

export interface BackupStatus {
  lastBackupDate: string | null;
  isStale: boolean; // > 3 days old
  backupCount: number;
  backups: Array<{ filename: string; sizeBytes: number; createdAt: string; fullPath: string }>;
  backupDir: string;
}

export function getBackupDirectory(): string {
  const custom = process.env.BACKUP_DIR;
  if (custom && fs.existsSync(custom)) {
    return custom;
  }
  const defaultDir = path.join(process.cwd(), 'backups');
  if (!fs.existsSync(defaultDir)) {
    fs.mkdirSync(defaultDir, { recursive: true });
  }
  return defaultDir;
}

export async function createBackup(customDestDir?: string) {
  const destDir = customDestDir || getBackupDirectory();
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const zipFileName = `oto-servis-backup-${timestamp}.zip`;
  const zipFilePath = path.join(destDir, zipFileName);

  const sqlite = getSqlite();

  // Temporary snapshot using SQLite VACUUM INTO
  const tempDbSnapshot = path.join(destDir, `temp-snap-${Date.now()}.sqlite`);
  if (fs.existsSync(tempDbSnapshot)) {
    fs.unlinkSync(tempDbSnapshot);
  }

  // Consistent online backup using SQLite VACUUM INTO
  sqlite.exec(`VACUUM INTO '${tempDbSnapshot}'`);

  // Create Zip
  const output = fs.createWriteStream(zipFilePath);
  const archive = archiver('zip', { zlib: { level: 9 } });

  await new Promise<void>((resolve, reject) => {
    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);

    // 1. Add SQLite database snapshot
    archive.file(tempDbSnapshot, { name: 'oto-servis.sqlite' });

    // 2. Add Uploads directory (photos)
    const uploadsDir = path.join(process.cwd(), 'uploads');
    if (fs.existsSync(uploadsDir)) {
      archive.directory(uploadsDir, 'uploads');
    }

    // 3. Add metadata
    const metadata = {
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      created_by: 'Oto Servis Otomatik Yedekleme'
    };
    archive.append(JSON.stringify(metadata, null, 2), { name: 'metadata.json' });

    archive.finalize();
  });

  // Clean up temp snapshot
  if (fs.existsSync(tempDbSnapshot)) {
    fs.unlinkSync(tempDbSnapshot);
  }

  const stats = fs.statSync(zipFilePath);

  // Prune backups beyond last 30
  pruneOldBackups(destDir);

  await updateSettings({ backup_dir: destDir });

  return {
    backupFile: zipFileName,
    fullPath: zipFilePath,
    sizeBytes: stats.size,
    timestamp: new Date().toISOString()
  };
}

function pruneOldBackups(backupDir: string) {
  try {
    const files = fs.readdirSync(backupDir).filter((f) => f.startsWith('oto-servis-backup-') && f.endsWith('.zip'));

    if (files.length > MAX_BACKUP_RETENTION) {
      // Sort oldest first
      const sorted = files
        .map((f) => ({
          filename: f,
          time: fs.statSync(path.join(backupDir, f)).mtimeMs
        }))
        .sort((a, b) => a.time - b.time);

      const deleteCount = sorted.length - MAX_BACKUP_RETENTION;
      for (let i = 0; i < deleteCount; i++) {
        fs.unlinkSync(path.join(backupDir, sorted[i].filename));
      }
    }
  } catch (err) {
    console.error('[BACKUP_PRUNE_ERROR]', err);
  }
}

export async function getBackupStatus(): Promise<BackupStatus> {
  const dir = getBackupDirectory();
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.startsWith('oto-servis-backup-') && f.endsWith('.zip'))
    : [];

  const backups = files.map((f) => {
    const fullPath = path.join(dir, f);
    const stat = fs.statSync(fullPath);
    return {
      filename: f,
      sizeBytes: stat.size,
      createdAt: new Date(stat.mtimeMs).toISOString(),
      fullPath
    };
  }).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const lastBackupDate = backups.length > 0 ? backups[0].createdAt : null;
  const threeDaysAgo = Date.now() - 3 * 24 * 60 * 60 * 1000;
  const isStale = !lastBackupDate || new Date(lastBackupDate).getTime() < threeDaysAgo;

  return {
    lastBackupDate,
    isStale,
    backupCount: backups.length,
    backups,
    backupDir: dir
  };
}

export async function restoreBackup(backupZipPath: string) {
  if (!fs.existsSync(backupZipPath)) {
    throw new Error('Yedek dosyası bulunamadı.');
  }

  const zip = new AdmZip(backupZipPath);
  const zipEntries = zip.getEntries();

  // Validate zip contains sqlite database
  const hasDb = zipEntries.some((entry) => entry.entryName === 'oto-servis.sqlite');
  if (!hasDb) {
    throw new Error('Geçersiz yedek arşivi: oto-servis.sqlite dosyası içermiyor.');
  }

  // Close active sqlite connection
  const activeSqlite = getSqlite();
  try {
    activeSqlite.close();
  } catch {}

  const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
  const targetDbPath = path.join(dataDir, 'oto-servis.sqlite');

  // Extract database
  zip.extractEntryTo('oto-servis.sqlite', dataDir, false, true);

  // Extract uploads if present
  const uploadsDir = path.join(process.cwd(), 'uploads');
  for (const entry of zipEntries) {
    if (entry.entryName.startsWith('uploads/') && !entry.isDirectory) {
      zip.extractEntryTo(entry.entryName, process.cwd(), false, true);
    }
  }

  // Re-initialize database
  initDatabase({ dbPath: targetDbPath });

  await logAudit({
    islem: 'backup_restore',
    hedef_tablo: 'system',
    detay: `Yedekten geri yüklendi: ${path.basename(backupZipPath)}`
  });

  return {
    success: true,
    message: 'Veritabanı ve fotoğraflar yedekten başarıyla geri yüklendi.'
  };
}
