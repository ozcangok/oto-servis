const CACHE_NAME = 'oto-servis-v2';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json'
];

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

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Network-first for API requests (3 deneme: sunucu yeniden başlama / tünel dalgalanmalarını tolere eder)
  if (url.pathname.startsWith('/api')) {
    event.respondWith(
      (async () => {
        let lastError = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          try {
            return await fetch(event.request.clone());
          } catch (err) {
            lastError = err;
            if (attempt < 2) await sleep(1200);
          }
        }
        return offlineApiResponse();
      })()
    );
    return;
  }

  // Cache-first fallback for UI assets
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return (
        cached ||
        fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, clone);
            });
          }
          return response;
        })
      );
    })
  );
});
