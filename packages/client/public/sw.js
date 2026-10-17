/**
 * Oto Servis — Service Worker (PWA çevrimdışı desteği).
 *
 * TASARIM KURALLARI (bayat arayüz kesinlikle sunulmaz):
 *  1) Uygulama kabuğu (HTML / gezinme istekleri) HER ZAMAN AĞDAN alınır.
 *     Yalnızca çevrimdışıyken kendi önbelleğimizden yedek sunulur.
 *  2) `caches.match()` (kökendeki TÜM önbelleklere bakan global arama)
 *     KULLANILMAZ. Aynı kökende (ör. localhost) başka bir projenin kalmış
 *     önbelleği olabilir; ondan yanıt sunmak "iki farklı arayüz" hatasına yol açar.
 *     Bu yüzden yalnızca KENDİ adlandırılmış önbelleğimize bakılır.
 *  3) Sürüm değişince (CACHE_NAME) eski ve YABANCI tüm önbellekler silinir.
 */
const CACHE_NAME = 'oto-servis-v3';

/** Ön yüklenen dosyalar: yalnızca değişmeyenler. HTML ön yüklenmez (madde 1). */
const PRECACHE = ['/manifest.json'];

/** Çevrimdışıyken API için dönen nazik yanıt. */
function offlineApiResponse() {
  return new Response(
    JSON.stringify({
      success: false,
      error: 'Şu anda çevrimdışısınız. Bağlantınız geldiğinde işlemler senkronize edilecektir.',
      is_offline: true
    }),
    { headers: { 'Content-Type': 'application/json' }, status: 503 }
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Yalnızca KENDİ önbelleğimizden oku. */
async function matchOwn(request) {
  const cache = await caches.open(CACHE_NAME);
  return cache.match(request);
}

/** Yanıtı yalnızca KENDİ önbelleğimize yaz (başarılı, tam yanıtlar). */
async function putOwn(request, response) {
  if (!response || response.status !== 200 || response.type === 'opaque') return;
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  } catch {
    /* kota vb. — yoksay */
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Eski sürümlerin VE aynı kökende kalmış yabancı önbelleklerin tamamını sil.
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)));
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // API: ağ öncelikli (sunucu yeniden başlama / tünel dalgalanmalarını tolere eden 3 deneme).
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      (async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await fetch(request.clone());
          } catch {
            if (attempt < 2) await sleep(1200);
          }
        }
        return offlineApiResponse();
      })()
    );
    return;
  }

  // Farklı kökenler (CDN, jsPDF, html2canvas...): araya girmeyiz.
  if (url.origin !== self.location.origin) return;

  // HTML / gezinme: AĞ ÖNCELİKLİ. Böylece her yenilemede EN GÜNCEL arayüz gelir;
  // yalnızca çevrimdışıyken son başarılı kopya kullanılır.
  const isHTML =
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('.html') ||
    (request.headers.get('accept') || '').includes('text/html');

  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          await putOwn(request, fresh);
          return fresh;
        } catch {
          const cached = await matchOwn(request);
          if (cached) return cached;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Çevrimdışı</title>' +
              '<body style="font-family:sans-serif;padding:2rem">Şu anda çevrimdışısınız. Bağlantı gelince bu sayfayı yenileyin.</body>',
            { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
          );
        }
      })()
    );
    return;
  }

  // İçerik-hash'li varlıklar (/assets/...) veya kök ikon/manifest: önbellek öncelikli,
  // arka planda sessizce tazelenir. Dosya adları sürüme bağlı olduğu için bayatlama olmaz.
  const isImmutableAsset =
    url.pathname.startsWith('/assets/') ||
    /\.(?:png|jpe?g|svg|webp|ico|woff2?|ttf)$/i.test(url.pathname);

  if (isImmutableAsset) {
    event.respondWith(
      (async () => {
        const cached = await matchOwn(request);
        const network = fetch(request)
          .then((response) => {
            void putOwn(request, response);
            return response;
          })
          .catch(() => null);

        if (cached) return cached;
        const fresh = await network;
        if (fresh) return fresh;
        throw new Error('asset yok');
      })()
    );
    return;
  }

  // Diğer tüm istekler (geliştirme modülü, HMR, dinamik dosyalar): AĞDAN, önbelleksiz.
  // Böylece geliştirme sırasında asla bayat modül sunulmaz.
});
