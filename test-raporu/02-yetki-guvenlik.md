# 02 — Giriş, Oturum, Güvenlik ve Yetki Sonuçları (Bölüm 4)

Otomatik testler: `packages/server/tests/security.test.ts` (28 test),
`packages/server/tests/authorizationMatrix.test.ts` (5 test, 52 uç nokta + 7 silme ucu).

## 4.1 Giriş (login) — sonuçlar

| Denetim | Sonuç |
|---|---|
| Doğru bilgiyle sahip ve personel girişi | ✅ 200, rol doğru |
| Yanıt gövdesinde parola/hash sızıntısı | ✅ yok |
| Oturum çerezi `HttpOnly`, `SameSite=Lax`, `Path=/` | ✅ |
| Boş / sadece boşluk / 5000 karakter giriş | ✅ 400/401, çökme yok |
| SQL enjeksiyonu denemeleri (`' OR 1=1 --` vb.) | ✅ giriş yok, tablo bozulmadı |
| 5 hatalı denemeden sonra kilit (15 dk) | ✅ kilit çalışıyor |
| Devre dışı kullanıcı girişi | ✅ 401 |
| Parolaların bcrypt (tuzlu hash) saklanması | ✅ hash ≠ parola, tuz farklı |
| Kullanıcı listesi API'sinde hash sızıntısı | ✅ yok |
| **Kullanıcı adı numaralandırması** | ⚠️ **KUSUR VARDI → DÜZELTİLDİ (G-01)** |
| Rolü tanımsız kullanıcı sahip yetkisi alır mı | ✅ hayır (403) |

## 4.2 Oturum (session) — sonuçlar

| Denetim | Sonuç |
|---|---|
| Çıkış sonrası token sunucuda geçersiz | ✅ 401 + `sessions` kaydı silindi |
| Bozulmuş / değiştirilmiş / `alg:none` token | ✅ hepsi 401 |
| Süresi dolmuş token | ✅ 401 + kayıt temizlendi |
| `X-Role: owner`, `?role=owner` ile rol yükseltme | ✅ 401/403 |
| Silinen kullanıcının açık token'ı | ✅ anında 401 |
| Devre dışı bırakılan kullanıcının açık token'ı | ✅ 401 |
| İki oturumun bağımsızlığı (birinin çıkışı diğerini bozmaz) | ✅ |
| Parola sıfırlanınca o kullanıcının tüm oturumları geçersiz | ✅ |
| Çıkış sonrası Geri tuşu / farklı kullanıcı kalıntısı | ✅ (mevcut `e2e/01-session-privacy`, 7 test) |

## 4.3 Arayüz mahremiyeti (personel)

Bkz. `04-arayuz.md`. Özet: Kasa/Ayarlar/kullanıcılar erişilemez ✅; **ana ekran KPI mali rakamları (A-01),
Cari hesap (A-02) ve Ayarlar düğmesi (A-03) personelde görünüyor**; ayrıca iki arayüz kusuru **düzeltildi
(A-05 tanımsız adres, A-06 Ayarlar modalı)**.

## 4.4 Sunucu tarafı yetki matrisi

Tam çizelge: **`yetki-matrisi-sonuc.md`** (52 uç nokta, sapma yok; silme uçlarında 5 açık).

| Sonuç | Değer |
|---|---|
| İncelenen uç nokta | 52 |
| Sınır ihlali (anonim veri aldı / personel sahip ucuna girdi / sahip engellendi) | **0** |
| Kimlik yokken 401 yerine 403 dönen uç | 9 (Düşük, G-04) |
| Personelin silebildiği silme ucu | **5 / 7** (Tasarım kararı, G-10) |
| Gider sahipliği (kendi+gündelik ✅, başkası/hassas ❌) | ✅ doğru |
| 403 yan etkisizliği (personel ayarı değiştiremiyor) | ✅ doğru |
| HTTP metot/yol hileleri (HEAD, `//`, `/API/`, `?role=owner`) | ✅ yetki atlatma yok |

## 4.5 Genel web güvenliği

| Denetim | Sonuç |
|---|---|
| Sunucu hata yanıtlarında yığın izi / dosya yolu / SQL sızıntısı | ✅ yok (hepsi < 500) |
| XSS: müşteri adına etiket yazma (API + gerçek tarayıcı) | ✅ çalışmıyor, metin olarak görünüyor |
| `dangerouslySetInnerHTML` / `eval` / `new Function` | ✅ yok |
| SQL enjeksiyonu (arama filtreleri) | ✅ yok |
| Girdi doğrulama sunucuda (eksik/yanlış tür/1 MB gövde) | ✅ reddediliyor |
| Mass assignment (fazladan alanlar) | ✅ yok sayılıyor/şema bozulmuyor |
| Denetim izi (silme, parola sıfırlama) | ✅ kaydediliyor |
| Güvenlik başlıkları | ⚠️ yok (G-05) |
| CORS (kimlik bilgisiyle origin yansıtma) | ⚠️ var (G-06) |
| Oturum anahtarının saklandığı yer | ⚠️ `localStorage` (G-07) |
| Kodda/zayıf varsayılan kimlik bilgileri | ⚠️ seed'de demo parolalar (G-08) |
| Kanonik olmayan / kodlanmış yollar (`//api`, `/API`, `%63ash`, `;x=1`, `..`) | ✅ veri sızdırmıyor, yetki atlanmıyor |
| Yol dolaşma (`/../package.json`, `%2e%2e`, `/uploads/../../…sqlite`) | ✅ 403, dosya sızmıyor |
| Üretim bağımlılıklarında bilinen zafiyetler (`npm audit --omit=dev`) | ⚠️ 6 adet (G-12) |
| Hız sınırı (rate limit) | ✅ 300 istek/dk (üretimde açık) |

---

# Bulgular (güvenlik / yetki)

Her bulgu: **kanıt → yer → beklenen → gerçekleşen → olasılık → etki → durum/öneri**

## G-01 — Giriş hatalarında kullanıcı adı numaralandırması ve deneme hakkı sızıntısı — **DÜZELTİLDİ**

- **Kanıt:** `security.test.ts` → "yanlış parola ve olmayan kullanıcı AYNI genel mesajı döner" testi ilk koşuda **kırmızı**.
- **Yer:** `packages/server/src/services/authService.ts` (`loginUser`).
- **Beklenen:** Her iki hata tipinde birebir aynı genel mesaj (kullanıcı adının varlığı ele verilmemeli).
- **Gerçekleşen:** Var olan kullanıcı + yanlış parola → `…parola hatalı. (Kalan hak: 4)`; olmayan kullanıcı → `…parola hatalı.` Fark, kullanıcı adının var olduğunu gösteriyordu. Ayrıca olmayan kullanıcıda bcrypt çalışmadığı için **yanıt süresi** çok kısaydı (zamanlama sızıntısı).
- **Olasılık:** Yüksek (otomatik denenebilir) · **Etki:** Orta (kullanıcı adı keşfi, sonra kaba kuvvet).
- **Düzeltme:** Tek genel mesaj + olmayan kullanıcıda da bcrypt karşılaştırması (`DUMMY_HASH`). Kilit mesajı (5 denemeden *sonra*) korundu.

## G-02 — Personel, negatif stok korumasını istek gövdesiyle atlatabiliyordu — **DÜZELTİLDİ**

- **Kanıt:** `security.test.ts` → "negatif stok koruması: personel gövdedeki bayrakla aşamaz" testi **kırmızı** (önce 200, düzeltmeden sonra 400).
- **Yer:** `packages/server/src/routes/parts.ts:408` (`override_negative`), `packages/server/src/routes/workOrders.ts:452` (`override_negative_stock`).
- **Beklenen:** Negatif stoğa izin yalnızca dükkân sahibinde (kodun kendi yorumu: *"negatif stok YALNIZCA dükkân sahibine açıktır; personel asla eksiye düşüremez"*).
- **Gerçekleşen:** Personel, istek gövdesine `override_negative: true` yazarak korumayı atlıyordu. Aynı koruma iş emri **oluşturma** yolunda doğru çalışıyordu (mevcut `e2e/05-stock` testi) — yani tutarsız bir açık.
- **Olasılık:** Orta (elle hazırlanmış istek/bozuk istemci) · **Etki:** Yüksek (stok bozulması → yanlış maliyet, kâr ve cari).
- **Düzeltme:** Her iki yolda bayrak yok sayılır; yalnızca `role === 'owner'` geçerli.

## G-03 — İş emri güncellemede stok çakışması 500 dönüyordu — **DÜZELTİLDİ**

- **Kanıt:** G-02 kırmızı testinde personel denemesi **500** döndü (beklenen 400).
- **Yer:** `packages/server/src/routes/workOrders.ts` PUT `/:id` (try/catch yoktu).
- **Beklenen:** Beklenen iş kuralı hatası → 400 (`{success:false,error}`).
- **Gerçekleşen:** Hata genel yakalayıcıya düşüp 500 oluyordu; işlem geri alınıyordu (transaction rollback ✅) ama istemci "sunucu hatası" görüyordu.
- **Etki:** Orta (yanıltıcı hata, gereksiz hata kaydı).
- **Düzeltme:** PUT `/:id` gövdesi `try/catch` ile sarıldı: stok hatası → 400, diğer → 500.

## G-04 — Anonim istekte 401 yerine 403 (Düşük) — **RAPORLANDI (düzeltilmedi)**

- **Yer:** `auth.ts /users*`, `backup.ts`, `kvkk.ts`, `app.ts /admin/*` (9 uç).
- **Beklenen (plan):** Anonim → 401. · **Gerçekleşen:** 403. **Veri dönmüyor**, yalnızca durum kodu tutarsız. Etki: Bilgilendirici.

## G-05 — Güvenlik başlıkları yok (Düşük) — **RAPORLANDI**

- **Ölçüm:** `x-content-type-options`, `x-frame-options`, `content-security-policy`, `referrer-policy` → hepsi boş.
- **Öneri:** `@fastify/helmet` benzeri başlıklar. (Golden rule: paket kurmadım.)

## G-06 — CORS kimlik bilgisiyle origin yansıtıyor (Orta) — **RAPORLANDI**

- **Yer:** `packages/server/src/app.ts` — `origin: true, credentials: true`.
- **Gerçekleşen:** `Origin: http://kotu-site.example` yanıta yansıtılıyor; `Access-Control-Allow-Credentials: true`.
- **Etki:** Yerel ağdaki bir tarayıcıdan kötü niyetli site, kullanıcının oturumuyla istek atabilir.
- **Öneri:** Yalnızca kendi origin'lerine (localhost + LAN IP) izin ver. (Aynı origin'den servis edildiği için CORS'a ihtiyaç yok.)

## G-07 — Oturum anahtarı `localStorage`'da (Orta) — **RAPORLANDI**

- **Yer:** `packages/client/src/services/api.ts` (token okuma/yazma), `e2e/01` bunu doğruluyor.
- **Etki:** XSS bulunmasa da çalınma yüzeyi. Çerez zaten HttpOnly; `localStorage` gereksiz.
- **Öneri:** Yalnızca çerez tabanlı oturuma geçmek (CSRF için SameSite=Lax yeterli olabilir).

## G-08 — Kaynak kodda zayıf demo kimlik bilgileri (Orta-Düşük) — **RAPORLANDI**

- **Yer:** `packages/server/src/db/seed.ts` — `admin/admin123`, `kasiyer/kasiyer123`, `usta/usta123`.
- **Not:** Açılışta otomatik yüklenmiyor (yalnız `OTO_SEED_SAMPLE=1` veya sahip `/api/admin/seed`), ancak herkes okuyabilir.
- **Öneri:** Örnek veri tohumu hesap oluşturmasın; gerekirse rastgele parola üretip konsola yazsın.

## G-09 — Personelin kendi parolasını değiştirme ucu yok (Orta, işlev eksikliği) — **RAPORLANDI**

- Plandaki matris "Kendi şifresini değiştirme: herkes ✅" der; uygulamada yok. Yalnızca sahip başkasınınkini sıfırlayabilir (`/api/auth/users/:id/reset-password`).

## G-10 — Silme uçları personelde açık (Yüksek) — **TASARIM KARARI BEKLİYOR**

- **Kanıt:** `yetki-matrisi-sonuc.md` → silme bölümü: personel `DELETE` yapabildi → customers, vehicles, parts, work-orders, payments (**5/7**). `expenses` ve `auth/users` doğru (403).
- **Yer:** `customers.ts:303`, `vehicles.ts`, `parts.ts`, `workOrders.ts:715`, `payments.ts` (silme uçlarında rol kontrolü yok).
- **Özel not:** `payments.ts` silme ucunun **yorumu** "Admin / Cashier only" diyor ama kodda denetim **yok** — niyet ile uygulama çelişkisi.
- **Etki:** Yanlışlıkla silme; iş emri silme stok hareketlerini geri alır → stok/cari/kasa bozulur. Denetim izi tutulur (kim sildiği görülür).
- **Neden düzeltilmedi:** Projede yazılı yetki kuralı yok; plan Bölüm 1.3 "varsayılan matrisi **varsayım** olarak kullan, raporda belirt ve **bana bırak**" der. Ayrıca arayüzde personel için de Sil düğmeleri var (tasarım niyeti bu yönde olabilir).
- **Öneri (onay verilirse):** Silme uçlarına `role === 'owner'` kapısı + arayüzde personelden Sil düğmelerinin gizlenmesi.

## G-11 — Personel parça alış (maliyet) fiyatını görüyor ve değiştirebiliyor (Yüksek) — **TASARIM KARARI BEKLİYOR**

- **Kanıt:** `GET /api/parts*` yanıtlarında `alis_kurus` personele de dönüyor (kaynak: `parts.ts` yanıt nesnesi); `POST /api/parts/:id/stock-in` gövdesindeki `yeni_alis_fiyati_kurus` ile personel maliyet fiyatını değiştirebiliyor; `PUT /api/parts/:id` ile de `alis_kurus` yazılabiliyor.
- **Yer:** `packages/server/src/routes/parts.ts` (GET yanıtları, PUT `/:id`, `/:id/stock-in`).
- **Beklenen:** README'de yazılı kural — *"Usta ... fiyatları, kasayı ve cari hesapları **kesinlikle göremez**."* Varsayılan matris: parça **görüntüleme/stok hareketi** ✅, **alış/maliyet fiyatı** ❌.
- **Gerçekleşen:** `staff` rolü hem "kasiyer" hem "usta"yı temsil ediyor; ayrım kalmadığı için maliyet fiyatı görünür ve değiştirilebilir.
- **Etki:** Yüksek (kâr marjı/maliyet gizliliği; fiyat bozulması).
- **Neden düzeltilmedi:** Rol modeli mimari bir karar (3 rol → 2 rol). Tek taraflı değiştirmek kasada/maliyette davranış değiştirir; plan "tasarım kararını raporla" diyor.
- **Öneri:** (a) `staff` için `alis_kurus` alanını yanıttan çıkar + yazma uçlarını sahibe kısıtla, **veya** (b) "kasiyer/usta" ayrımını geri getir.

## G-12 — Üretim bağımlılıklarında bilinen güvenlik açıkları (Yüksek) — **RAPORLANDI (yükseltme yapılmadı)**

- **Kanıt:** `npm audit --omit=dev` → **6 zafiyet (1 orta, 5 yüksek)**. (Geliştirme bağımlılıkları dâhil: 28 zafiyet — 10 orta, 15 yüksek, 3 kritik; bunlar yalnızca geliştirme/derleme araçlarında.)
- **Üretimde kullanılan paketler ve uyarılar:**
  | Paket | Önem | Uyarı | Bu projede geçerli mi? |
  |---|---|---|---|
  | `fastify` (GHSA-p68q-wchp-6fh7) | yüksek | Bozuk URL ile kimlik atlama | **Hayır** — `/api//…`, `/API/…`, `%63ash-desk`, `;x=1`, `..` yolları denendi; hepsi 401/404/HTML kabuk döndü, veri yok (yeni regresyon testi eklendi) |
  | `@fastify/static` (GHSA-83w8-p2f5-377r, GHSA-8pvw-jcv7-9cmj) | yüksek/orta | Yol dolaşma ile koruma atlama | **Hayır** — `/../package.json`, `%2e%2e`, `/uploads/../../data/…sqlite` → 403, dosya sızmadı |
  | `adm-zip` (4 uyarı) | yüksek | ZIP bombası / sembolik bağlantı ile dosya üzerine yazma | **Kısmen** — yalnız yedek geri yüklemede; sahip yetkisi gerekir (yerel saldırı) |
  | `drizzle-orm` | yüksek | Kimlik/tanımlayıcı alan adıyla SQL enjeksiyonu | **Hayır** — tüm tanımlayıcılar kaynak kodda sabit, kullanıcı girdisi parametreli |
  | `find-my-way` (GHSA-c96f-x56v-gq3h) | yüksek | HTTP/2 DDoS | **Hayır** — uygulama yalnızca HTTP/1 |
- **Neden yükseltilmedi:** Sizin kuralınız: *"paket yükseltme / npm audit fix yok"*. Düzeltme `fastify@5` gibi **kırıcı (major)** sürüm değişikliği gerektiriyor.
- **Öneri:** Golden rules dışında bir bakım penceresi planlanıp `fastify@5` + `@fastify/static` yükseltmeli ve tam doğrulama yeniden koşulmalı. Kritik istismar kanıtlanmadı (yukarıdaki somut denemeler temiz).

---

# Düzeltilen dosyalar (git diff)

| Dosya | Değişiklik |
|---|---|
| `packages/server/src/services/authService.ts` | G-01: tek genel giriş hatası + zamanlama eşitlemesi |
| `packages/server/src/routes/parts.ts` | G-02: `override_negative` bayrağı personelde yok sayılır |
| `packages/server/src/routes/workOrders.ts` | G-02 + G-03: bayrak yok sayılır, PUT `/:id` try/catch (400/500) |
| `packages/client/src/App.tsx` | A-05: tanımsız adres → geçerli sekmeye döner; A-06: adres değişince Ayarlar modalı kapanır |

# İyi çıkan sonuçlar (önlem alınmış)

- Tüm korumalı uçlarda kimlik doğrulaması çalışıyor; **personel hiçbir sahip ucundan veri alamadı** (52 uç tarandı).
- Gider sahipliği ve kategori kısıtı hem sunucuda hem arayüzde doğru.
- Parola/oturum yönetimi sağlam (bcrypt, sunucu tarafı oturum, kilit, oturum iptali).
- XSS ve SQL enjeksiyonu bulunamadı; bozuk JSON ve aşırı gövde çökertmiyor.
- Metot/yol hileleri (HEAD, `//`, `/API/...`, `?role=owner`) ve `alg:none` token yetki atlatamıyor.
