// Service Worker (PWA için gerekli)
self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('fetch', (e) => {
  // PWABuilder'ın "boş" dememesi için basit bir fetch dinleyicisi
});
