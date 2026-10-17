import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { initDatabase, getSqlite, bootstrapSchema } from '../src/db/index.js';

/**
 * Kullanılmayan eski `reminders` tablosunun temizliğini doğrular.
 *
 * Hatırlatıcılar artık kalıcı olarak saklanmıyor (istek anında hesaplanıyor:
 * reminderService.getDueReminders) ve WhatsApp gönderim kaydı ayrı bir tabloda
 * (`whatsapp_messages`) tutuluyor. Bu yüzden eski `reminders` tablosu ölü.
 */
function remindersTableExists(sqlite: Database.Database): boolean {
  const row = sqlite
    .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'reminders'")
    .get() as { n: number };
  return row.n > 0;
}

describe('Eski şema temizliği: kullanılmayan `reminders` tablosu', () => {
  it('yeni veritabanında `reminders` tablosu HİÇ oluşturulmaz', () => {
    initDatabase({ inMemory: true });
    const sqlite = getSqlite();
    expect(remindersTableExists(sqlite)).toBe(false);
  });

  it('eski sürümden kalan BOŞ `reminders` tablosu kaldırılır', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tur TEXT NOT NULL,
        referans_id INTEGER NOT NULL,
        baslik TEXT NOT NULL,
        mesaj TEXT NOT NULL,
        hedef_tarih TEXT,
        gonderildi_tarihi TEXT,
        created_at TEXT NOT NULL
      );
    `);
    expect(remindersTableExists(sqlite)).toBe(true);

    bootstrapSchema(sqlite);

    expect(remindersTableExists(sqlite)).toBe(false);
    sqlite.close();
  });

  it('eski tablo DOLU ise veri kaybını önlemek için dokunulmaz', () => {
    const sqlite = new Database(':memory:');
    sqlite.exec(`
      CREATE TABLE reminders (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tur TEXT NOT NULL,
        referans_id INTEGER NOT NULL,
        baslik TEXT NOT NULL,
        mesaj TEXT NOT NULL,
        hedef_tarih TEXT,
        gonderildi_tarihi TEXT,
        created_at TEXT NOT NULL
      );
      INSERT INTO reminders (tur, referans_id, baslik, mesaj, created_at)
      VALUES ('bakim', 1, 'legacy', 'legacy kayıt', '2020-01-01T00:00:00.000Z');
    `);

    bootstrapSchema(sqlite);

    expect(remindersTableExists(sqlite)).toBe(true);
    const count = sqlite.prepare('SELECT COUNT(*) AS n FROM reminders').get() as { n: number };
    expect(count.n).toBe(1);
    sqlite.close();
  });
});
