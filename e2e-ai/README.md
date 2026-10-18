# AI (Midscene) E2E Testleri — Opt-in

Bu klasör, [Midscene.js](https://github.com/web-infra-dev/midscene) tabanlı
**görsel / doğal dilli** uçtan uca testleri içerir. Midscene, arayüzü insan gibi
"görüp" anlar ve beklentileri doğal dille ifade etmenizi sağlar (`aiAssert`,
`aiQuery`, `aiTap`, ...).

## Neden ayrı paket?

- Bu testler **görsel bir model** (API anahtarı + ağ) gerektirir ve olasılıksal
  olduğundan sonuçları deterministik değildir.
- Bu yüzden **`npm run test:e2e` paketine ve commit öncesi kapıya (pre-commit)
  dahil DEĞİLDİR**. Kendi yapılandırmasıyla (`playwright.ai.config.ts`) yalnızca
  elle çalıştırılır.

## Model anahtarı (gerekli)

Midscene bir görsel dil modeli kullanır. Anahtar **repoya girmez**; kök `.env`
dosyasında (gitignore'da) tutulur. Örnek (Alibaba Cloud DashScope Qwen):

```dotenv
MIDSCENE_MODEL_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
MIDSCENE_MODEL_API_KEY=your-api-key
MIDSCENE_MODEL_NAME=qwen3.7-plus
MIDSCENE_MODEL_FAMILY=qwen3
```

Diğer sağlayıcılar (Doubao, GLM, Gemini, GPT; ayrıca yerel/self-hosted) için:
<https://midscenejs.com/model-common-config>

> Anahtar tanımlı değilse testler `test.skip` ile atlanır (ağ/model çağrısı
> yapılmaz) — yani paket anahtarsız da güvenle çalıştırılabilir.

## Çalıştırma

```bash
npm run test:ai                                      # tüm AI testleri
npm run test:ai -- e2e-ai/04-servis-dokumu-pdf.spec.ts   # tek dosya
```

İzole bir test yığını (API + arayüz + temiz veritabanı) otomatik başlatılır.
Portlar `test:e2e` ile çakışmaz: arayüz 5274, API 3201.

## Rapor

Midscene her çalıştırmada birleşik bir HTML raporu üretir:
`midscene_run/report/*.html` (gitignore'da). Ekran görüntülerini, adımları ve
model kararlarını incelemek için tarayıcıda açın.

## Kapsam

| Dosya | Akış |
| --- | --- |
| `01-giris-mahremiyet.spec.ts` | Giriş + rol mahremiyeti (owner/staff) |
| `02-arac-is-emri.spec.ts` | Araç sorgu + iş emri |
| `03-randevu-takvim.spec.ts` | Randevu/takvim → "İşleme al" |
| `04-servis-dokumu-pdf.spec.ts` | Servis dökümü (PDF) okunabilirlik regresyonu |
| `05-kasa-giderler.spec.ts` | Kasa & giderler (ticari mahremiyet) |

## Yapı

- `fixture.ts` — Midscene AI fixture'larıyla genişletilmiş Playwright `test`.
- `helpers.ts` — `.env`'den `MIDSCENE_*` yükler; deterministik E2E
  yardımcılarını (`e2e/helpers.ts`) yeniden kullanır.
- `*.spec.ts` — test senaryoları.
