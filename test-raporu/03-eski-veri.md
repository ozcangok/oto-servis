# Eski / Bozuk Veri Sonuçları (Bölüm 5)

Bozuk fixture ile 24 uç nokta, owner ve personel kimliğiyle çağrıldı.

## Bozuk veri ile ekran/uç nokta taraması

- Owner sorunları: **0**
- Personel sorunları: **0**

## Tek bozuk kayıt etkisi

- Liste 200 döndü; 24 kayıt geldi, 20 sağlam kayıt eksiksiz. ✅

## Eski kullanıcı / şifre biçimleri

- Düz metin parola ile giriş denemesi → **401** (güvenli). ✅
- Tanımsız rollü kullanıcı girişi → **401**; sahip yetkisi yok. ✅

## Eski şema migrasyonu

- Eski roller (admin→owner, cashier/mechanic→staff, tanımsız→staff) normalize edildi. ✅
- Eksik `eposta` sütunu eklendi; migrasyon iki kez çalıştırıldığında veri bozulmadı (idempotent). ✅

## Veri bütünlüğü taraması

- Ödeme kayıtları toplamı: -100 kuruş
- Gider kayıtları toplamı: -500 kuruş (kasaya yansımamalı)
- Açık iş emri sayısı: 2
- Kasa özeti yanıtı: HTTP 200
- Stok tutarsızlığı (hareket toplamı ≠ stok hesabı): **0** parça

> Not: Bozuk fixture kasıtlı olarak tutarsız veri içerir; sayılar beklenen ✅/⚠️ için değil, veri kalitesini göstermek için raporlanır.

## Fuzz (rastgele bozma)

- 20 tohum × 5 tablo × 8 uç nokta tarandı.
- Bulunan çökme/NaN: **0**
