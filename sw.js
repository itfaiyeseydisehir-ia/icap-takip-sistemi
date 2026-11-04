// ============================================================
// SEYDİŞEHİR İTFAİYESİ - SERVICE WORKER (PWA & CACHE)
// ============================================================

// ⚠️ ONESIGNAL AKTİF EDİLDİĞİNDE ALTTAKİ SATIRIN BAŞINDaki // İŞARETİNİ KALDIRIN
// importScripts("https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.sw.js");

const CACHE_NAME = 'icap-takip-v1';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './itslogoilk.png',
  // Uygulamanızda kullandığınız diğer statik resimler (varsa ekleyebilirsiniz)
  'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/yangin.png',
  'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/kask.png',
  'https://raw.githubusercontent.com/itfaiyeseydisehir-ia/icap-takip-sistemi/main/dalgic.png'
];

// 1. Kurulum: Dosyaları önbelleğe al (hızlı açılması için)
self.addEventListener('install', (e) => {
  self.skipWaiting(); // Yeni Service Worker'ı hemen aktif et
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Önbellek oluşturuluyor...');
      return cache.addAll(ASSETS);
    })
  );
});

// 2. Aktivasyon: Eski önbellekleri temizle
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('Eski önbellek silindi:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Yeni Service Worker'ı hemen kontrolü al
});

// 3. Getirme (Fetch): Önbellekten oku, yoksa internetten çek
self.addEventListener('fetch', (e) => {
  // Supabase API istekleri her zaman canlı (internetten) gitmeli, önbelleğe alınmamalı!
  if (e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      // Eğer önbellekte varsa hızlıca oradan dön
      if (cachedResponse) {
        return cachedResponse;
      }

      // Önbellekte yoksa internetten çek ve önbelleğe kaydet
      return fetch(e.request).then((networkResponse) => {
        return caches.open(CACHE_NAME).then((cache) => {
          // Sadece başarılı (200 OK) ve GET isteklerini önbelleğe al
          if (networkResponse.status === 200 && e.request.method === 'GET') {
            cache.put(e.request, networkResponse.clone());
          }
          return networkResponse;
        });
      }).catch(() => {
        // İnternet yoksa ve önbellekte de yoksa (şu an boş dönüyor, istenirse offline sayfası eklenebilir)
      });
    })
  );
});
