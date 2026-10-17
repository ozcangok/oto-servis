# 🚗 Oto Servis Yönetim Sistemi

Oto tamir ve bakım servisleri için özel olarak geliştirilmiş; gerçek SQLite (WAL modunda) veritabanına sahip, kuruş hassasiyetinde hesaplama motoru barındıran, Türkçe arayüzlü, hem masaüstünde (Electron Windows .exe / Web) hem mobil cihazlarda (PWA) çalışan tam kapsamlı servis yönetim programı.

---

## 🌟 Öne Çıkan Özellikler

1. **Çift Platform Desteği:**
   - **Masaüstü (Desktop):** Bölünmüş ekran düzeni (sol panelde araç geçmişi, sağ panelde hızlı iş emri formu), klavye kısayolları (`/` ile plakaya odaklanma, `Ctrl+N` yeni iş emri, `Ctrl+S` kaydetme), barkod tabanca okuyucu desteği, A4 servis formu yazdırma.
   - **Mobil & Tablet (PWA):** Telefona "Ana Ekrana Ekle" ile native uygulama gibi yüklenme, tam ekran çalışma, kamera ile barkod okuma (`html5-qrcode`), kamera ile araç fotoğrafları çekip ekleme, tek tıkla **Ara** (`tel:`) ve **WhatsApp** (`wa.me`) butonları.
   - **Çevrimdışı Dayanıklılık (Offline Queue):** İnternet veya Wi-Fi kesildiğinde iş emirleri ve tahsilatlar cihazda yerel kuyruğa alınır, bağlantı gelince otomatik senkronize edilir. Çakışma durumunda verinin üstüne sessizce yazılmaz.

2. **Kuruş Hassasiyetinde Finans ve Hesaplama Motoru:**
   - Tüm para değerleri veritabanında tamsayı kuruş (1 TL = 100 kuruş) olarak tutulur; kayan nokta (float) yuvarlama hataları kesinlikle yaşanmaz.
   - Arayüzde `tr-TR` standartlarında formatlanır (`1.234,50 ₺`).
   - Girilen fiyatlar her zaman KDV hariç sayılır; KDV oranı yalnızca KDV tutarı ve KDV dahil toplama eklenir, ara toplam ve peşin fiyatı etkilemez.
   - **Örnek Doğrulama Testi:** 2 × 850,00 ₺ parça + 500,00 ₺ işçilik, %10 iskonto, %20 KDV → KDV dahil **2.376,00 ₺**, peşin iskonto (%5, ara toplam üzerinden) ile peşin fiyat **1.881,00 ₺**.
   - **Peşin Kapat:** Peşin fiyat üzerinden kalan tutarı otomatik tahsil eder ve iş emrini kapatır. "Yeniden Aç" ile gerekirse geri alınabilir.

3. **Plaka Normalizasyonu:**
   - Türkçe büyük harf kurallarına tam uyumlu (`i` -> `İ`, `ı` -> `I`).
   - Boşluk, tire ve özel karakterler otomatik ayıklanır (`"34abc123"` = `"34 ABC 123"`).
   - Gerçek Türk plakası görünümünde mavi `TR` şeritli görsel plaka bileşeni.

4. **Rol ve Yetkilendirme (RBAC):**
   - **Yönetici (Admin):** Tüm yetkiler, kullanıcı ekleme/silme, parola sıfırlama, yedekleme, KVKK silme/anonimleştirme.
   - **Kasiyer (Cashier):** İş emri, tahsilat alma, cari hesap ve kasa gün sonu raporları.
   - **Usta (Mechanic):** İş emri ve durum güncelleme, parça ekleme; fiyatları, kasayı ve cari hesapları **kesinlikle göremez**.
   - Brute-force saldırılarına karşı 5 hatalı giriş sonrası 15 dakika hesap kilitleme koruması.
   - **Hareketsizlik (idle) güvenlik kilidi:** 3 dakika boyunca fare/klavye hareketi olmazsa ekran buzlu camla kapanır; ilk harekette oturum hem sunucuda hem cihazda kapatılır. Aynı katman sol menüdeki **Ekranı kilitle** düğmesiyle beklemeden de indirilebilir.
   - İlk kurulumda otomatik Yönetici Oluşturma Sihirbazı.

5. **Stok Yönetimi ve Atomik Transaction'lar:**
   - İş emri açıldığında parça stoku atomik transaction ile düşer.
   - İş emri düzenlendiğinde yalnızca fark (delta) uygulanır.
   - İş emri silindiğinde kullanılan tüm parçalar otomatik olarak stoka iade edilir.
   - Kritik stok seviyesi uyarıları. Sıfırın altına inme koruması (yönetici izniyle aşılabilir).

6. **Kasa ve Cari Hesap:**
   - Gün sonu nakit, kredi kartı, havale ve çek tahsilat toplamları.
   - Excel uyumlu (Türkçe karakter destekli, UTF-8 BOM'lu) CSV dışa aktarma.
   - Müşteri bazında cari hesap ekstresi ve bakiye takibi.

7. **Hatırlatıcılar:**
   - Teslime hazır araçlar, TÜVTÜRK muayenesi yaklaşanlar, periyodik bakımı gelenler.
   - Hazır mesaj şablonu ile WhatsApp veya SMS metnini tek tıkla hazırlama (arka planda sessizce izinsiz mesaj göndermez).
   - Arayüz seviyesinde genişletilebilir bildirim sağlayıcı mimarisi.

8. **Veri Güvenliği, Yedekleme ve KVKK:**
   - SQLite `VACUUM INTO` + yüklenen fotoğraflar arşivi ile tutarlı tarihli ZIP yedekleri.
   - Son 30 yedek saklanır, eski yedekler otomatik temizlenir.
   - Ayarlardan "Şimdi Yedekle", "Yedekten Geri Yükle", 3 günden eski yedeklerde sağlık uyarısı.
   - Denetim kaydı (`audit_log`): Kim, ne zaman, hangi tabloda hangi eski/yeni değeri değiştirdi.
   - KVKK kapsamında müşteri verilerini JSON indirme ve kalıcı anonimleştirme/silme.

---

## 🏗️ Proje Mimarisi ve Klasör Yapısı

```
/root/oto-servis/
├── packages/
│   ├── shared/                # Ortak kütüphane (Hesaplama motoru, plaka normalizasyonu, tipler)
│   │   ├── src/
│   │   │   ├── calculations.ts
│   │   │   ├── plate.ts
│   │   │   └── types.ts
│   │   └── tests/             # Hesaplama ve plaka birim testleri (Vitest)
│   │
│   ├── server/                # Backend API (Node.js + TypeScript + Fastify + Drizzle ORM)
│   │   ├── src/
│   │   │   ├── db/            # SQLite WAL şeması, better-sqlite3 bağlantısı, seed betiği
│   │   │   ├── routes/        # REST API & Swagger OpenAPI uçları
│   │   │   └── services/      # Stok, Denetim, Kasa, Hatırlatıcı, Yedekleme, KVKK servisleri
│   │   └── tests/             # Entegrasyon, auth, afet kurtarma ve yük testleri
│   │
│   ├── client/                # Frontend (React 18 + Vite + PWA + Vanilla CSS)
│   │   ├── public/            # PWA manifest.json ve Service Worker (sw.js)
│   │   └── src/
│   │       ├── components/    # TR Plaka kutusu, Kamera barkod okuyucu, Çevrimdışı banner
│   │       ├── screens/       # Araç sorgu, İş emri, Parça, Cari, Kasa, Hatırlatıcı, Ayarlar
│   │       └── styles/        # Vanilla CSS tasarım sistemi (Açık/Koyu tema, Büyük yazı modu)
│   │
│   └── electron/              # Windows Masaüstü Çerçevesi (Electron + Gömülü SQLite & Sunucu)
│       └── main.cjs
│
├── docker-compose.yml         # Tek komutla VPS dağıtımı
├── Dockerfile                 # Multi-stage üretim konteyneri
└── README.md
```

---

## ⚡ Hızlı Başlangıç

### Gereksinimler
- Node.js v18+ veya v20+
- npm v9+

### 1. Bağımlılıkları Yükleme ve Derleme
```bash
cd /root/oto-servis
npm install
npm run build
```

### 2. Testleri Çalıştırma
Tüm birim, entegrasyon, afet kurtarma ve 50.000 kayıtlık yük testlerini çalıştırmak için:
```bash
npm test
```
*(Tüm 23 test dosyası 100% başarıyla geçmektedir)*

### 3. Geliştirme Modunda Çalıştırma
```bash
# Terminal 1 - Backend API (Port 3001)
npm run dev:server

# Terminal 2 - Frontend Vite (Port 5173)
npm run dev:client
```

Tarayıcınızda açın:
- Uygulama: `http://localhost:5173`
- Swagger OpenAPI Dokümantasyonu: `http://localhost:3001/api/docs`

---

## 📱 Yerel Ağda (Wi-Fi) Telefon ile Kullanım

Masaüstü bilgisayarınızda sistem açıkken:
1. **Ayarlar > Yerel Ağ (Wi-Fi QR)** sekmesine gidin.
2. Ekranda çıkan QR kodu aynı Wi-Fi ağına bağlı cep telefonunuzun kamerasından okutun.
3. Telefonunuzda açılan sayfada tarayıcı menüsünden **"Ana Ekrana Ekle"** seçeneğini seçin.
4. Artık dükkan içindeki ustalar ve kasiyerler telefonlarından doğrudan barkod okutup fotoğraf çekebilir!

---

## 🐳 VPS Dağıtımı (Docker Compose)

Herhangi bir Linux sunucuya tek komutla kurmak için:

```bash
cd /root/oto-servis
docker compose up -d --build
```

Sunucunuzda `http://SUNUCU_IP:3001` adresinde hem API hem React arayüzü tek port üzerinden çalışacaktır. Veriler `./data`, yüklenen fotoğraflar `./uploads` ve yedekler `./backups` klasörlerinde güvenle saklanır.

---

## 💻 Windows Masaüstü (.exe) Paketi

Windows kurulum dosyası (`.exe`) oluşturmak için:
```bash
cd /root/oto-servis/packages/electron
npm run dist:win
```
Çıktı `dist-electron/` klasörü altına oluşturulur.

### Paketlemeden Masaüstü Denemesi (geliştirici)
```bash
npm run start:desktop                          # derler + gömülü sunucu + masaüstü pencere (port 3001)
OTO_SERVER_PORT=3100 npm run start:desktop     # 3001 doluysa boş port seçin
```
Pencereyi **X** ile (veya Cmd+Q ile) kapatın: veda ekranı en az 10 saniye ekranda kalır, veritabanı
`Belgelerim/CinarOto_Yedekler/oto-servis-YYYYAAAAGG-SSDDss.sqlite` olarak yedeklenir ve uygulama güvenle kapanır.
Sunucu kapanırken WAL ana dosyaya işlendiği için yedek **tek dosya** halinde eksiksizdir.

Kapanış akışını ekrana bakmadan uçtan uca doğrulamak (geliştirici duman testi — pencere görünmez,
sonuçlar konsola yazılır):
```bash
npm run build:desktop
OTO_SMOKE_TEST=1 OTO_USE_DIST=1 OTO_SERVER_PORT=3100 npm run start --workspace=@oto-servis/electron
```

---

## 🧪 Test Raporu Özeti

- **Birim Testleri (`calculations.test.ts` & `plate.test.ts`):** 11 test geçti.
  - İstenen örnek doğrulama formülü: 2 × 850 ₺ parça + 500 ₺ işçilik, %10 iskonto, %20 KDV → 2.376,00 ₺, peşin fiyat (ara toplamdan %5) 1.881,00 ₺ kuruşu kuruşuna doğrulandı.
  - Türkçe plaka normalizasyonu ve karakter dönüşümleri doğrulandı.
- **Güvenlik & Rol Testleri (`auth.test.ts`):** 5 test geçti.
  - İlk kurulum sihirbazı, oturum çerezi, 5 hatalı girişte 15 dakika kilitlenme ve rol sınırları doğrulandı.
- **Entegrasyon Testleri (`api.test.ts`):** 5 test geçti.
  - Müşteri, araç, plaka araması, parça kataloğu, barkod okuma, iş emri oluşturma, stok düşüşü, peşin kapatma ve iş emri silindiğinde stoka otomatik iade doğrulandı.
- **Afet Kurtarma Testi (`backupRestore.test.ts`):** 1 test geçti.
  - `VACUUM INTO` ile canlı yedek alındı, veritabanı silindi, yedekten geri yüklendi ve tüm verilerin birebir korunduğu kanıtlandı.
- **Yük Testi (`benchmark.test.ts`):** 1 test geçti.
  - 20.000 araç ve 50.000 iş emri içeren veritabanında plaka sorgusu **0.089 ms** sürede tamamlandı (Hedef: < 200 ms).
