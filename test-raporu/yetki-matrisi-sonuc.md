# Yetki Matrisi Sonucu (Bölüm 4.4)

Sunucu tarafı, üç kimlikle çağrıldı: **Anonim** (token yok), **Personel** (staff), **Sahip** (owner).

`Beklenti` sütunu plandaki **varsayılan en-az-yetki matrisinden** türetilmiştir (projede yazılı yetki kuralı yok).
Sahip çağrısı atlanan yıkıcı uçlar `—` ile işaretlidir.

| Uç nokta | Anonim | Personel | Sahip | Beklenen | Sonuç | Not |
|---|---|---|---|---|---|---|
| `GET /api/health` | 200 | 200 | 200 | herkes | ✅ | Sağlık kontrolü (public) |
| `GET /api/auth/setup-status` | 200 | 200 | 200 | herkes | ✅ | İlk kurulum durumu (public) |
| `POST /api/auth/login` | 200 | 200 | 200 | herkes | ✅ | Giriş (public) |
| `POST /api/auth/setup` | 400 | 400 | 400 | herkes | ✅ | Kurulum (kurulum bittiyse 400) |
| `GET /api/auth/me` | 401 | 200 | 200 | personel + sahip | ✅ | Aktif kullanıcı |
| `GET /api/auth/users` | 403 | 403 | 200 | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık) |
| `POST /api/auth/users` | 403 | 403 | 200 | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık) |
| `GET /api/customers` | 401 | 200 | 200 | personel + sahip | ✅ | Müşteri listesi |
| `GET /api/customers/1` | 401 | 200 | 200 | personel + sahip | ✅ | Müşteri detay |
| `GET /api/customers/1/statement` | 401 | 200 | 200 | personel + sahip | ✅ | Cari ekstresi |
| `POST /api/customers` | 401 | 200 | 200 | personel + sahip | ✅ | Müşteri ekleme |
| `PUT /api/customers/1` | 401 | 200 | 200 | personel + sahip | ✅ | Müşteri düzenleme |
| `GET /api/vehicles/search` | 401 | 200 | 200 | personel + sahip | ✅ | Araç arama |
| `GET /api/vehicles/by-plate/34MAT001` | 401 | 200 | 200 | personel + sahip | ✅ | Plaka ile araç |
| `GET /api/vehicles/1` | 401 | 200 | 200 | personel + sahip | ✅ | Araç detay |
| `POST /api/vehicles` | 401 | 200 | 200 | personel + sahip | ✅ | Araç ekleme |
| `PUT /api/vehicles/1` | 401 | 200 | 200 | personel + sahip | ✅ | Araç düzenleme |
| `GET /api/parts` | 401 | 200 | 200 | personel + sahip | ✅ | Parça listesi |
| `GET /api/parts/by-barcode/MATBAR1` | 401 | 200 | 200 | personel + sahip | ✅ | Barkod ile parça |
| `GET /api/parts/critical` | 401 | 200 | 200 | personel + sahip | ✅ | Kritik stok listesi |
| `GET /api/parts/1` | 401 | 200 | 200 | personel + sahip | ✅ | Parça detay |
| `POST /api/parts` | 401 | 200 | 200 | personel + sahip | ✅ | Parça ekleme |
| `PUT /api/parts/1` | 401 | 200 | 200 | personel + sahip | ✅ | Parça düzenleme (fiyat dahil) |
| `POST /api/parts/1/stock-movement` | 401 | 200 | 200 | personel + sahip | ✅ | Stok hareketi |
| `POST /api/parts/1/stock-in` | 401 | 200 | 200 | personel + sahip | ✅ | Depo girişi / alış fiyatı |
| `GET /api/work-orders` | 401 | 200 | 200 | personel + sahip | ✅ | İş emri listesi |
| `GET /api/work-orders/1` | 401 | 200 | 200 | personel + sahip | ✅ | İş emri detay |
| `POST /api/work-orders` | 401 | 200 | 200 | personel + sahip | ✅ | İş emri oluşturma |
| `PUT /api/work-orders/1` | 401 | 200 | 200 | personel + sahip | ✅ | İş emri düzenleme |
| `PUT /api/work-orders/1/status` | 401 | 200 | 200 | personel + sahip | ✅ | Durum güncelleme |
| `POST /api/work-orders/1/payments` | 401 | 200 | 200 | personel + sahip | ✅ | İş emrine ödeme |
| `POST /api/work-orders/1/reopen` | 401 | 200 | 200 | personel + sahip | ✅ | İş emri yeniden açma |
| `POST /api/payments` | 401 | 200 | 200 | personel + sahip | ✅ | Ödeme ekleme |
| `GET /api/payments/work-order/1` | 401 | 200 | 200 | personel + sahip | ✅ | İş emri ödemeleri |
| `GET /api/cash-desk/summary` | 401 | 403 | 200 | yalnız sahip | ✅ | Kasa raporu (mali) |
| `GET /api/cash-desk/export-csv` | 401 | 403 | 200 | yalnız sahip | ✅ | Kasa CSV (mali) |
| `GET /api/expenses` | 401 | 200 | 200 | personel + sahip | ✅ | Gider listesi (özet sahibe) |
| `POST /api/expenses` | 401 | 200 | 200 | personel + sahip | ✅ | Gider ekleme (staff: yalnız gündelik kategori) |
| `GET /api/reminders/due` | 401 | 200 | 200 | personel + sahip | ✅ | Vadesi gelen hatırlatıcılar |
| `GET /api/reminders/messages` | 401 | 200 | 200 | personel + sahip | ✅ | WhatsApp mesaj kayıtları |
| `POST /api/reminders/messages/2/sent` | 401 | 200 | 200 | personel + sahip | ✅ | Mesaj gönderildi işaretle |
| `GET /api/settings` | 401 | 200 | 200 | personel + sahip | ✅ | Ayarları görüntüle |
| `GET /api/settings/lan-info` | 401 | 200 | 200 | personel + sahip | ✅ | LAN bilgisi |
| `PUT /api/settings` | 401 | 403 | 200 | yalnız sahip | ✅ | Ayarları değiştir |
| `GET /api/settings/audit-logs` | 401 | 403 | 200 | yalnız sahip | ✅ | Denetim izleri |
| `GET /api/backup/status` | 403 | 403 | 200 | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık) |
| `POST /api/backup/now` | 403 | 403 | 200 | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık) |
| `POST /api/backup/restore` | 403 | 403 | — | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık); owner: canlı veritabanını değiştirir (test yığınında çalıştırılmaz) |
| `GET /api/kvkk/export/1` | 403 | 403 | 200 | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık) |
| `POST /api/kvkk/anonymize/1` | 403 | 403 | — | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık); owner: müşteri verisini geri döndürülemez biçimde anonimleştirir |
| `POST /api/admin/purge-samples` | 403 | 403 | 200 | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık) |
| `POST /api/admin/seed` | 403 | 403 | 200 | yalnız sahip | ✅ | anon 403 (401 yerine — düşük önem tutarsızlık) |

Toplam uç nokta: **52** · Uygun: **52** · Sapma: **0**

## Silme (DELETE) uçları — her kimlik için taze kayıt

| Uç nokta | Anonim | Personel | Sahip | Sonuç | Not |
|---|---|---|---|---|---|
| `DELETE /api/customers/:id` | 401 | 200 | 200 | ⚠️ | personel silebildi — varsayılan matrise göre yalnızca sahip silmeli (Tasarım kararı bekliyor) |
| `DELETE /api/vehicles/:id` | 401 | 200 | 200 | ⚠️ | personel silebildi — varsayılan matrise göre yalnızca sahip silmeli (Tasarım kararı bekliyor) |
| `DELETE /api/parts/:id` | 401 | 200 | 200 | ⚠️ | personel silebildi — varsayılan matrise göre yalnızca sahip silmeli (Tasarım kararı bekliyor) |
| `DELETE /api/work-orders/:id` | 401 | 200 | 200 | ⚠️ | personel silebildi — varsayılan matrise göre yalnızca sahip silmeli (Tasarım kararı bekliyor) |
| `DELETE /api/payments/:id` | 401 | 200 | 200 | ⚠️ | personel silebildi — varsayılan matrise göre yalnızca sahip silmeli (Tasarım kararı bekliyor) |
| `DELETE /api/expenses/:id` | 401 | 403 | 200 | ✅ | personel reddedildi (varsayılan matrise uygun) |
| `DELETE /api/auth/users/:id` | 403 | 403 | 200 | ✅ | personel reddedildi (varsayılan matrise uygun) |

Personelin silebildiği uç sayısı: **5 / 7** (varsayılan matrise göre 0 olmalı)
