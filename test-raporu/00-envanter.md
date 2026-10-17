# 00 — Envanter ve Ortam Haritası (Bölüm 1)

Bu dosya, `TEST-GUVENLIK-VE-DERIN.md` planının **Bölüm 1 (Keşif)** maddesini karşılar.
Uygulama, tek dükkânlı bir oto servis yönetim programıdır (Fastify + SQLite + React + Electron).

## 1.1 Ortam ve sürümler

| Öğe | Değer |
|---|---|
| İşletim sistemi | macOS 26.6.2 |
| Node.js | v20.18.1 |
| Dal (branch) | `ui/premium-yenileme` |
| Test öncesi son commit | `1053325` |
| Sunucu | Fastify ^4.26.2, better-sqlite3 ^9.4.5, drizzle-orm ^0.30.10, zod ^3.23.8 |
| Kimlik | bcryptjs ^2.4.3 |
| Arayüz | React ^18.2.0, Vite ^5.2.10 |
| Masaüstü | Electron ^30.0.1 |
| Test | vitest ^1.5/1.6, @playwright/test (Chrome kanalı) |

## 1.2 Çalıştırma, adresler, portlar

| Ortam | Komut | Adres | Veritabanı |
|---|---|---|---|
| **Canlı (tek adres)** | `npm run dev:server` | `http://localhost:3001`, `http://192.168.1.106:3001` | `packages/server/data/oto-servis.sqlite` |
| Masaüstü (Electron) | `npm run start:desktop` | pencere içi | `~/Library/Application Support/Oto Servis Yonetimi/data/oto-servis.sqlite` |
| **Test (yalnızca testte, geçici)** | `playwright test` | API `127.0.0.1:3101` + arayüz `127.0.0.1:5174` | `packages/server/.e2e-data` (her koşuda silinir/yeniden tohumlanır) |
| **Sunucu birim/derinlik testleri** | `vitest` | port YOK (bellek içi SQLite) | `:memory:` (izole) |

> Testler **gerçek veriye dokunmaz**. Bölüm 6 (gerçek veri kopyası) dışında tüm testler bellek içi
> ya da izole `.e2e-data` veritabanında çalışır. Gerçek veritabanları yalnızca **okundu** (kopya alındı).

## 1.3 Ortam değişkenleri

| Değişken | Varsayılan | Anlamı |
|---|---|---|
| `PORT` | `3001` | Sunucu portu |
| `HOST` | `0.0.0.0` | Dinleme adresi (LAN'a açık) |
| `DATA_DIR` | `packages/server/data` | SQLite dosya klasörü |
| `OTO_SEED_SAMPLE` | (boş) | `1` ise açılışta örnek veri + demo hesaplar yüklenir |
| `BACKUP_DIR` | `<DATA_DIR>/backups` | Yedek klasörü |
| `NODE_ENV` | — | `test` iken hız sınırı (rate limit) kapalı |

## 1.4 Kimlik ve yetki modeli

- **Roller:** `owner` (sahip), `staff` (personel). Başka rol yok.
- **Giriş:** kullanıcı adı + parola → bcrypt (cost 10) karşılaştırması.
- **Oturum:** sunucuda `sessions` tablosunda tutulan 32 baytlık rastgele anahtar.
  İstemciye `session_token` **HttpOnly + SameSite=Lax + Path=/** çerezi olarak verilir;
  ayrıca istemci `Authorization: Bearer` başlığıyla da gönderebilir. Geçerlilik 30 gün.
- **Kaba kuvvet koruması:** 5 hatalı denemeden sonra hesap 15 dakika kilitlenir.
- **Yetki denetimi:** her rota kendi `preHandler` korumasını tanımlar; global zorunlu kimlik doğrulama yoktur.
- **İlk kurulum:** sistemde hiç kullanıcı yoksa `/api/auth/setup` ile ilk `owner` oluşturulur.

## 1.5 Uç nokta (API) envanteri — 52 adet

Tam çizelge (yöntem × anonim/personel/sahip sonuçlarıyla) burada: **`yetki-matrisi-sonuc.md`**

Dosya bazında özet:

| Rota dosyası | Uç sayısı | Yetki modeli |
|---|---|---|
| `auth.ts` | 9 | `/login,/logout,/setup,/setup-status` herkese açık; `/me` kimlik; `/users*` **yalnız sahip** |
| `app.ts` (admin) | 2 | `/api/admin/seed`, `/api/admin/purge-samples` **yalnız sahip** |
| `customers.ts` | 6 | kimlik gerekli; rol ayrımı yok |
| `vehicles.ts` | 6 | kimlik gerekli; rol ayrımı yok |
| `parts.ts` | 9 | kimlik gerekli; rol ayrımı yok |
| `workOrders.ts` | 9 | kimlik gerekli; rol ayrımı yok |
| `payments.ts` | 3 | kimlik gerekli; rol ayrımı yok |
| `cashDesk.ts` | 2 | **yalnız sahip** |
| `expenses.ts` | 4 | kimlik; personel yalnız **kendi + gündelik** kategorisi |
| `reminders.ts` | 3 | kimlik gerekli |
| `settings.ts` | 4 | `GET` kimlik; `PUT` ve `/audit-logs` **yalnız sahip** |
| `backup.ts` | 3 | **yalnız sahip** |
| `kvkk.ts` | 2 | **yalnız sahip** |
| `app.ts` (health) | 1 | herkese açık |

## 1.6 Arayüz ekranları ve hash yolları

| Ekran | Yol | Personel erişimi |
|---|---|---|
| Araç sorgu (ana ekran + takvim) | `#/sorgu` | ✅ |
| Araçlar | `#/araclar` | ✅ |
| Müşteriler | `#/musteriler` | ✅ |
| Parça arşivi | `#/parcalar` | ✅ |
| Cari hesap | `#/cari` | ✅ (bkz. Bulgu A-04) |
| Kasa | `#/kasa` | ❌ yönlendirilir |
| Giderler | `#/giderler` | ✅ (yalnız gündelik kategoriler) |
| Hatırlatıcılar | `#/hatirlaticilar` | ✅ |
| Ayarlar (modal) | `#/ayarlar` | ❌ yönlendirilir (bkz. Bulgu A-05) |
| Yeni iş emri (modal) | — | ✅ |
| Giriş | `#/login` | herkese |

## 1.7 Test dosyaları envanteri

**Mevcut (önceden var olan):** `packages/server/tests/` → `api`, `auth`, `auditActions`, `benchmark`,
`backupRestore`, `legacySchema`, `startupNoSeed`. `packages/shared/tests/` → `greeting`, `plate`, `calculations`.
`packages/electron/tests/` → 6 test. `e2e/01..13` → 58 senaryo.

**Bu çalışmada eklenen:**

| Dosya | Kapsam |
|---|---|
| `packages/server/tests/security.test.ts` | Bölüm 4.1/4.2/4.5 — giriş, oturum, web güvenliği (28 test) |
| `packages/server/tests/authorizationMatrix.test.ts` | Bölüm 4.4 — 52 uç × anon/personel/sahip + 7 silme ucu (5 test) |
| `packages/server/tests/legacyData.test.ts` | Bölüm 5 — bozuk/eski/uyumsuz veri + fuzz + bütünlük (7 test) |
| `e2e/14-mahremiyet-ve-dayaniklilik.spec.ts` | Bölüm 3/4.3 — arayüz mahremiyeti, XSS, ekran görüntüleri (7 test) |
