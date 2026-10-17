# RAPOR — Güvenlik ve Derinlik Testi (TEST-GUVENLIK-VE-DERIN.md)

**Proje:** oto-servis (tek dükkân oto servis yönetimi · Fastify + SQLite + React + Electron)
**Dal:** `ui/premium-yenileme` · **Test tarihi:** 17 Ekim 2026
**Yöntem:** Plan sırayla uygulandı; her bölüm ya otomatik teste ya da belgelenmiş ölçüme bağlandı.
**Sonuç:** Tüm testler **yeşil** (`npm run verify` → çıkış kodu **0**). **3 gerçek yazılım kusuru düzeltildi**
(+2 arayüz kusuru). Geri kalan 9 madde **tasarım kararı** ya da **bakım önerisi** olarak raporlandı.

---

## 1. Özet sayılar

| Katman | Test | Sonuç |
|---|---|---|
| Sunucu (birim + derinlik) | 73 | ✅ |
| Paylaşılan mantık | 20 | ✅ |
| Electron (masaüstü) | 6 | ✅ |
| Uçtan uca (gerçek Chrome) | 65 | ✅ |
| **Toplam** | **164** | **✅ hepsi geçti** |

Kanıt dosyaları: `yetki-matrisi-sonuc.md` (52 uç nokta), `03-eski-veri.md` (bozuk/eski veri + fuzz),
`04-arayuz.md` (arayüz ölçümleri), `ekran/` (19 görüntü), `00-envanter.md`, `01-duman-testi.md`, `02-yetki-guvenlik.md`.

---

## 2. Bulgular tablosu

| ID | Bulgu | Önem | Durum |
|---|---|---|---|
| **G-01** | Giriş hatasında kullanıcı adı numaralandırması + "kalan hak" sızıntısı + zamanlama farkı | Orta | ✅ **Düzeltildi** (kırmızı→yeşil test) |
| **G-02** | Personel, negatif stok korumasını istek gövdesindeki bayrakla atlatabiliyordu | **Yüksek** | ✅ **Düzeltildi** |
| **G-03** | İş emri güncellemede stok çakışması 500 dönüyordu (beklenen 400) | Orta | ✅ **Düzeltildi** |
| **G-04** | Anonim istekte 9 uçta 401 yerine 403 (veri sızmıyor) | Düşük | 📋 Raporlandı |
| **G-05** | Güvenlik başlıkları yok (CSP, X-Frame-Options, …) | Düşük | 📋 Raporlandı |
| **G-06** | CORS: kimlik bilgisiyle her origin'e izin (yansıtma) | Orta | 📋 Raporlandı |
| **G-07** | Oturum anahtarı `localStorage`'da (çerez zaten HttpOnly) | Orta | 📋 Raporlandı |
| **G-08** | `seed.ts` içinde bilinen demo parolaları | Orta–Düşük | 📋 Raporlandı |
| **G-09** | Personelin kendi parolasını değiştirebileceği uç yok | Orta | 📋 Raporlandı |
| **G-10** | **7 silme ucundan 5'i personelde açık** (customers, vehicles, parts, work-orders, payments) | **Yüksek** | ⏸️ **Tasarım kararı bekliyor** |
| **G-11** | Personel parça **alış/maliyet** fiyatını görüyor ve yazabiliyor | **Yüksek** | ⏸️ **Tasarım kararı bekliyor** |
| **G-12** | Üretim bağımlılıklarında 6 bilinen zafiyet (fastify, @fastify/static, adm-zip, drizzle, find-my-way) | **Yüksek** | 📋 Raporlandı (yükseltme kuralınız gereği **yapılmadı**; somut istismar bulunamadı) |
| **A-01** | Personel ana ekranda mali KPI rakamlarını görüyor (Bu ay KDV dâhil / Toplam işçilik / Açık cari) | Orta | ⏸️ **Tasarım kararı bekliyor** |
| **A-02** | Personel "Cari hesap" menüsünü ve ekranını görüyor | Orta | ⏸️ **Tasarım kararı bekliyor** |
| **A-03** | Personel menüsünde "Ayarlar" düğmesi var (rota koruması çalışıyor, düğme korumasız) | Düşük | ⏸️ **Tasarım kararı bekliyor** |
| **A-04** | Personel "Giderler" ekranını görebiliyor (yalnız gündelik kategoriler) | — | 📋 Tasarım notu (mevcut kuralınız: personel gündelik gider girebilir) |
| **A-05** | Tanımsız adres adres çubuğunda kalıyordu | Düşük | ✅ **Düzeltildi** |
| **A-06** | Ayarlar modalı açıkken adres değişince modal kapanmıyordu | Düşük | ✅ **Düzeltildi** |
| **V-01** | Eski şema migrasyonu güvenli ve **idempotent** (admin→owner, cashier/mechanic→staff, eksik `eposta`) | — | ✅ Sorun yok |
| **V-02** | Düz metin parolalı eski kullanıcı giriş yapamıyor (güvenli); sahip parola sıfırlamalı | Düşük | 📋 Raporlandı |
| **V-03** | Bozuk veri 24 uç noktada 500/NaN üretmedi; tek bozuk kayıt listeyi düşürmüyor | — | ✅ Sorun yok |
| **V-04** | Rolü tanımsız kullanıcı sahip yetkisi almıyor | — | ✅ Sorun yok |
| **V-05** | 20 tohumlu rastgele bozma (fuzz): çökme yok | — | ✅ Sorun yok |
| **V-06** | Veri bütünlüğü taraması: stok hareketi ile stok hesabı tutarlı; kasa özeti 200 | — | ✅ Sorun yok |

Tam gerekçe/kanıt/öneri: **`02-yetki-guvenlik.md`** (G-xx), **`03-eski-veri.md`** (V-xx), **`04-arayuz.md`** (A-xx).

---

## 3. Düzeltilen yazılım kusurları

| Dosya | Değişiklik | Kanıt (kırmızı → yeşil) |
|---|---|---|
| `packages/server/src/services/authService.ts` | G-01: Tek genel hata mesajı + olmayan kullanıcıda da bcrypt karşılaştırması (zamanlama eşitlemesi, `DUMMY_HASH`) | `security.test.ts` "yanlış parola ve olmayan kullanıcı AYNI genel mesajı döner" |
| `packages/server/src/routes/parts.ts` | G-02: `override_negative` bayrağı artık **yalnızca sahip** için geçerli | `security.test.ts` "negatif stok: personel gövdedeki bayrakla aşamaz" |
| `packages/server/src/routes/workOrders.ts` | G-02 + G-03: aynı bayrak düzeltmesi + PUT `/:id` `try/catch` → stok hatası **400** (önce 500) | aynı test (önce 200/500, sonra 400) |
| `packages/client/src/App.tsx` | A-05: tanımsız adres → geçerli sekmeye döner · A-06: adres değişince Ayarlar modalı kapanır | `e2e/14` "…modal kapanır (geri tuşu / kenar çubuğu)" |

**Değişmeyenler (golden rules):** iş mantığı, veri modeli, alan adları, rota/DB adları, görünen etiketler,
hash rotaları, KDV/kasa hesapları; hiçbir paket yükseltilmedi, örnek/elle veri eklenmedi.

---

## 4. Doğrulama kanıtları (komutlar ve sonuçlar)

```bash
# 1) Tam doğrulama: derleme + tüm birim + tüm E2E
npm run verify
#   → build: tsc ×3 + vite build ✅ · sunucu 73 ✅ · paylaşılan 20 ✅ · electron 6 ✅ · e2e 65 ✅ · EXIT=0

# 2) Güvenlik (Bölüm 4)
cd packages/server && ../../node_modules/.bin/vitest run tests/security.test.ts --pool=forks
#   → 28 test ✅  (giriş, oturum, XSS, enjeksiyon, kanonik olmayan yol, yol dolaşma)

# 3) Yetki matrisi (Bölüm 4.4) — 52 uç nokta
cd packages/server && ../../node_modules/.bin/vitest run tests/authorizationMatrix.test.ts --pool=forks
#   → 5 test ✅ · sınır ihlali 0 · rapor: test-raporu/yetki-matrisi-sonuc.md

# 4) Bozuk / eski veri (Bölüm 5)
cd packages/server && ../../node_modules/.bin/vitest run tests/legacyData.test.ts --pool=forks
#   → 7 test ✅ · rapor: test-raporu/03-eski-veri.md

# 5) Arayüz (Bölüm 3 + 4.3) + ekran görüntüleri
./node_modules/.bin/playwright test e2e/14-mahremiyet-ve-dayaniklilik.spec.ts
#   → 7 test ✅ · 19 ekran görüntüsü · rapor: test-raporu/04-arayuz.md

# 6) Bağımlılık taraması (yalnızca OKUMA; düzeltme/yükseltme yok)
npm audit --omit=dev   # → 6 zafiyet (1 orta, 5 yüksek) — bkz. G-12
```

**Elle doğrulanan somut saldırı denemeleri (hepsi başarısız = güvenli):**
yol dolaşma (`/../package.json`, `%2e%2e`, `/uploads/../../data/…sqlite`) → **403, dosya sızmadı**;
kanonik olmayan yol (`//api`, `/./api`, `/API`, `%63ash-desk`, `;x=1`, `..`) → **401/404/HTML kabuk, veri yok**;
bozuk URL ile kimlik atlama (GHSA-p68q-wchp-6fh7 sınıfı) → **atlama yok** (regresyon testi eklendi).

---

## 5. Bölüm 6 — Gerçek verinin kopyası (yalnızca okuma)

- Yedek: `/private/var/…/opencode/yedek-20261017-2056/` (sunucu + masaüstü SQLite'ı).
- Kopya, uygulamanın **kendi açılış/migrasyon koduyla** açıldı: 2 kullanıcı (`sezer çınar` = owner, `kullanıcı` = staff),
  iş verisi 0 · `PRAGMA integrity_check` → `ok` · kopya üzerinde çalışıldı, **gerçek dosya değiştirilmedi**.

---

## 6. Tasarım kararı bekleyen maddeler (karar sizin)

1. **G-10 — Silme yetkisi:** Personel iş emri/müşteri/araç/parça/ödeme silebilsin mi? (Öneri: hayır.)
2. **G-11 — Alış (maliyet) fiyatı:** Personel parça alış fiyatını görsün/değiştirsin mi? (Öneri: hayır → alanı gizle + yazmayı sahibe kısıtla.)
3. **A-01/A-02/A-03 — Mali mahremiyet:** Personel ana ekrandaki ciro/işçilik/açık cari rakamlarını, Cari hesabı ve Ayarlar düğmesini görmemeli mi?
4. **G-06/G-07 — Güvenlik sertleştirme:** CORS'u yalnız kendi origin'lerine kapatalım mı; `localStorage` yerine yalnız çerez oturumu?
5. **G-12 — Paket yükseltme:** `fastify@5` (+ ilgili paketler) bakım penceresi açalım mı? (Şu an kuralınız gereği yapılmadı.)
6. Daha önce bekleyen kararlar: `~/Documents/CinarOto_Yedekler/…sqlite` artık yedeğinin silinmesi; `kullanıcı` hesabının gerçek ad-soyadı; Parça arşivindeki "Kâr %…" etiketi; Windows `.exe` üretimi.

---

## 7. Varsayımlar

| No | Varsayım |
|---|---|
| V-1 | Plan körü körüne uygulanacak; soru sorulmayacak, **en kısıtlayıcı** yorum seçilecek (plan §1.3). |
| V-2 | Yetki **matrisi bir varsayım** kabul edildi: kesin *uygulama* hataları düzeltildi, **belirsiz yetki tasarımları** değiştirilmedi — "bana bırak" gereği raporlandı. |
| V-3 | Testler **ayrı/izole** ortamda: sunucu testleri bellek içi SQLite, E2E kendi `.e2e-data` + `3101/5174`. Gerçek veriye dokunulmadı; tek canlı adres `3001` korundu. |
| V-4 | Yıkıcı uçlar (`backup/restore`, `kvkk/anonymize`) **sahip** kimliğiyle bile çağrılmadı (canlı veriyi geri dönüşsüz değiştirebilir). |
| V-5 | Bölüm 3.2'nin tam ekran matrisi (her ekran × 2 rol × açık/koyu × 3 genişlik) yerine **19 temsilî** görüntü üretildi. |
| V-6 | Bölüm 5'te bozuk veriyle yalnızca **okuma** yolları fuzz edildi; yazma (POST/PUT) yolları bozuk veriyle denenmedi (veri bozma riski). |
| V-7 | `npm audit` yalnızca **okundu**; kuralınız gereği **yükseltme/`audit fix` yapılmadı**, sonuç raporlandı (G-12). |
| V-8 | Görünen etiketler, hash rotaları ve iş hesapları korundu; düzeltmeler yalnızca sunucu/istemci davranışına dokundu. |
| V-9 | "Bozuk veri" senaryoları ayrı bir **test** veritabanında üretildi; gerçek veri kopyası yalnız açıldı/okundu. |
| V-10 | Bir sorun hem sunucuda hem arayüzde görünüyorsa **sunucu** tarafı esas alındı (asıl koruma sınırı sunucu). |

---

## 8. Git durumu ve sonraki adım

- Değişiklikler **commit edilmedi/push edilmedi** (onayınız bekleniyor).
- Değişen/eklenen: `packages/server/src/services/authService.ts`, `packages/server/src/routes/parts.ts`,
  `packages/server/src/routes/workOrders.ts`, `packages/client/src/App.tsx`,
  `packages/server/tests/{security,authorizationMatrix,legacyData}.test.ts`,
  `e2e/14-mahremiyet-ve-dayaniklilik.spec.ts`, `test-raporu/`.
- Onay verirseniz: önce yerel commit (pre-commit tam doğrulamayı çalıştırır), sonra `ui/premium-yenileme`
  dalına push; ardından `main`'e `--ff-only` birleştirme.
