// ============================================================
// SEYDİŞEHİR İTFAİYESİ - SERVICE WORKER (Önbelleksiz / Her Zaman Güncel)
// ============================================================

// Önbellek (Cache) kullanmıyoruz. Her açılışta en güncel dosyalar çekilir.
// Bu sayede kod güncellediğinde v1, v2 gibi sürüm atlatmana gerek kalmaz.

self.addEventListener('install', (e) => {
  self.skipWaiting(); // Yeni Service Worker'ı hemen devreye al
});

self.addEventListener('activate', (e) => {
  // Eski sürümlerden kalan önbellekleri (cache) tamamen temizle
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          return caches.delete(cacheName);
        })
      );
    }).then(() => self.clients.claim()) // Hemen kontrolü ele al
  );
});

self.addEventListener('fetch', (e) => {
  // Supabase API isteklerini veya diğerlerini önbelleğe almıyoruz, 
  // her isteği doğrudan internete (sunucuya) yönlendiriyoruz.
  return; 
});
