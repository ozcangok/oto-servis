# ÖZET — Güvenlik ve Derinlik Testi (17 Ekim 2026)

Plan (`TEST-GUVENLIK-VE-DERIN.md`) sırayla uygulandı. Sonuç: **TÜM TESTLER YEŞİL** (`npm run verify` → çıkış kodu 0).
Toplam **164 test**: sunucu 73 · paylaşılan mantık 20 · Electron 6 · uçtan uca (gerçek Chrome) 65.

**Düzeltilen 3 gerçek kusur:** (1) giriş hatalarında kullanıcı adı numaralandırması ve "kalan hak" sızıntısı;
(2) personelin negatif stok korumasını istek gövdesindeki bayrakla atlatması; (3) iş emri güncellemede 500 yerine 400.
Ayrıca **2 arayüz kusuru** düzeltildi (tanımsız adres adres çubuğunda kalıyordu; Ayarlar modalı adres değişince kapanmıyordu).

**Sağlam çıkanlar:** 52 uç noktada yetki sınırı ihlali **0**; oturum/parola yönetimi doğru; XSS ve SQL enjeksiyonu yok;
yol dolaşma ve bozuk URL ile kimlik atlama yok; bozuk/eski veri hiçbir uçta çökertmiyor (fuzz: 0 çökme); migrasyon idempotent.

**Tasarım kararı bekleyenler (kararı siz verirsiniz):**
- **G-10:** 7 silme ucundan 5'i personelde açık (iş emri, müşteri, araç, parça, ödeme).
- **G-11:** personel parça **alış (maliyet)** fiyatını görüyor ve yazabiliyor.
- **A-01/A-02/A-03:** personel ana ekran mali KPI rakamlarını, Cari hesabı ve Ayarlar düğmesini görüyor.
- **G-12:** üretim bağımlılıklarında 6 bilinen zafiyet (fastify vb.) — kuralınız gereği yükseltme **yapılmadı**.
- **G-06/G-07:** CORS her origin'i kabul ediyor; oturum anahtarı `localStorage`'da.

**Yapılamayanlar:** tam ekran matrisi (100+ görüntü yerine 19 temsilî görüntü), Electron penceresinde elle test,
telefonla LAN testi, Windows `.exe` üretimi, yıkıcı uçların (yedek geri yükleme/anonimleştirme) sahip çağrıları.
Varsayımlar: `RAPOR.md` §7.

**Durum:** değişiklikler **commit/push EDİLMEDİ** — onayınızı bekliyor. Ayrıntı: `test-raporu/RAPOR.md`.
