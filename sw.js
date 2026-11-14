// ============================================================
// SEYDİŞEHİR İTFAİYESİ - SERVICE WORKER (Hızlı Açılış / Akıllı Önbellek)
// ============================================================

const CACHE_NAME = 'icap-takip-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Yeni Service Worker'ı hemen devreye al
});

self.addEventListener('activate', (e) => {
  // Eski sürümlerden kalan önbellekleri temizle
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  // Sadece kendi sitemizin dosyalarını önbelleğe al (Supabase API isteklerine dokunma)
  if (!e.request.url.startsWith(self.location.origin)) return;
  
  e.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(e.request).then((cachedResponse) => {
        // Arka planda internetten en güncel dosyayı çekmeye çalış
        const fetchPromise = fetch(e.request).then((networkResponse) => {
          // Gelen yeni dosyayı önbelleğe kaydet
          cache.put(e.request, networkResponse.clone());
          return networkResponse;
        }).catch(() => {
          // İnternet yoksa önbellekteki eskisini kullan
          return cachedResponse;
        });
        
        // Eğer dosya önbellekte varsa ANINDA onu göster (Sıfır gecikme, zıplama biter)
        // Yoksa ağdan indirilmesini bekle
        return cachedResponse || fetchPromise;
      });
    })
  );
});
