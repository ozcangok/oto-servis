# 01 — Duman Testi ve Temel Çalışma (Bölüm 2 + 3)

Bu dosya, `TEST-GUVENLIK-VE-DERIN.md` planının **Bölüm 2 (duman testi)** ve
**Bölüm 3 (arayüz)** maddelerinin sonuçlarını özetler. Ayrıntılı arayüz ölçümleri: `04-arayuz.md`.

## 2.1 Test sayaçları — önce / sonra

| Paket / katman | Bu çalışmadan önce | Bu çalışmadan sonra | Durum |
|---|---|---|---|
| Sunucu birim/derinlik (`packages/server/tests`) | 33 test | **73 test** (10 dosya) | ✅ hepsi geçti |
| Paylaşılan (`packages/shared/tests`) | 20 test | 20 test | ✅ |
| Masaüstü/Electron (`packages/electron/tests`, `node --test`) | 6 test | 6 test | ✅ (0 başarısız) |
| Uçtan uca (`e2e/01..14`, Playwright + gerçek Chrome) | 58 test | **65 test** | ✅ hepsi geçti |
| Derleme (`tsc` × 3 + `vite build`) | ✅ | ✅ | ✅ |

**Komut:** `npm run verify` (= `npm run build && npm test && npm run test:e2e`) → **çıkış kodu 0**.

## 2.2 Veritabanı ve izolasyon

| Ortam | Yol | Testte kullanımı |
|---|---|---|
| Canlı | `packages/server/data/oto-servis.sqlite` | **Yalnızca okundu** (kopya alındı, Bölüm 6) |
| Test (E2E) | `packages/server/.e2e-data` | Her koşuda sıfırdan oluşturulur |
| Test (birim) | `:memory:` (bellek içi) | İzole; port açılmaz |

- Test öncesi gerçek veri yedeği: `/private/var/…/opencode/yedek-20261017-2056/` (iki SQLite, `PRAGMA integrity_check` → `ok`).
- Canlı veri testten **etkilenmedi** (müşteri=0, araç=0, iş emri=0, kullanıcı=2 — değişmedi).
- Tek canlı adres korundu: `http://localhost:3001` → 200 (test boyunca ayakta).

## 3.1 Arayüz açılışları (Bölüm 3)

`e2e/14-mahremiyet-ve-dayaniklilik.spec.ts` → *Bölüm 3 — tüm ekranlar açılıyor + ekran görüntüleri*:

| Rol | Açılan ekranlar | Sonuç |
|---|---|---|
| Sahip (owner) | Araç sorgu, Araçlar, Müşteriler, Parça arşivi, Cari hesap, Kasa, Giderler, Hatırlatıcılar, Ayarlar (modal) | ✅ hepsi açıldı, konsol hatası yok |
| Personel (staff) | Araç sorgu, Araçlar, Müşteriler, Parça arşivi, Cari hesap, Giderler, Hatırlatıcılar | ✅ |
| Personel — yasaklı | `#/kasa`, `#/ayarlar`, `#/kullanicilar` | ✅ `#/sorgu`'ya yönlendiriyor, içerik yok |

**Ekran görüntüleri:** `test-raporu/ekran/` → **19 görüntü** (sahip 9 ekran açık tema + koyu tema ×2 +
dar ekran ×1 + personel 7 ekran). Bkz. aşağıda **Varsayım V-5** (tam matris yerine temsilî küme).

## 3.2 Formlar ve akışlar

Mevcut uçtan uca testler formları gerçek tarayıcıda doldurup doğruluyor; bu çalışmada kırılmadıkları teyit edildi:

| Form / akış | Kapsayan test | Sonuç |
|---|---|---|
| Giriş (kullanıcı/parola) | `e2e/01-session-privacy` | ✅ |
| Yeni araç + müşteri + iş emri (tam zincir) | `e2e/11-master-uctan-uca` | ✅ |
| Parça + stok girişi/çıkışı | `e2e/09-parca-stok`, `e2e/05-stock` | ✅ |
| Ödeme / tahsilat, kasa toplamı | `e2e/03-math`, `e2e/11` (finans bölümü) | ✅ |
| Gider ekleme + kategori kısıtı | `e2e/02-role-privacy`, `e2e/11` (RBAC) | ✅ |
| WhatsApp mesaj taslakları | `e2e/06-form-whatsapp`, `e2e/07-whatsapp-status` | ✅ |
| Takvim / pano / hatırlatıcılar | `e2e/10-pano-takvim` | ✅ |
| Kaskad (plaka silinince kasa/stok geri alma) | `e2e/11` (kaskad), `e2e/04-cascade` | ✅ |
| Masaüstü katmanı (splash, kilit, güvenli kapanış) | `e2e/12-premium-denetim` | ✅ |
| Arayüz tutarlılığı | `e2e/13-arayuz-tutarlilik` | ✅ |

## 3.3 Duman testinde bulunan ve düzeltilen arayüz kusurları

| No | Kusur | Durum |
|---|---|---|
| A-05 | Tanımsız adres (`#/kullanicilar` gibi eski bağlantı) adres çubuğunda kalıyordu; ekran önceki sekmeyi gösteriyordu (veri sızmıyordu) | ✅ Düzeltildi (`App.tsx`) |
| A-06 | Ayarlar modalı açıkken adres değişince (Geri tuşu / kenar çubuğu) modal kapanmıyordu → adres ile ekran tutarsız kalıyordu | ✅ Düzeltildi (`App.tsx`) |

Her ikisi için de **regresyon testi** eklendi (`e2e/14`, 6. test).

## 3.4 Yapılamayanlar (dürüst eksik listesi)

| Madde | Neden yapılamadı |
|---|---|
| Her ekran × 2 rol × açık/koyu × 3 genişlik için ~100+ görüntülük tam matris | Yerine 19 **temsilî** görüntü alındı (bkz. Varsayım V-5) |
| Electron penceresinde **elle** test / X ile kapatma akışının elle denenmesi | Kod ve `node --test` (6 test) yeşil; macOS'ta pencere arayüzü elle sürülemedi |
| Telefonla LAN testi | Fiziksel cihaz yok; `http://192.168.1.106:3001` → HTTP 200 doğrulandı |
| Windows `.exe` üretimi ve testi | Windows makine yok; `better-sqlite3` yerel derleme + paket düzeni gerekir (önceki raporda "bekliyor") |
| Yıkıcı uçların **sahip** tarafından çağrılması (`backup/restore`, `kvkk/anonymize`) | Canlı veriyi geri dönüşsüz değiştirir; bilinçli olarak **çağrılmadı** |
| Bozuk veriyle **yazma** (POST/PUT) denemeleri | Yalnızca okuma yolları fuzz edildi (bkz. Varsayım V-6) |
