self.addEventListener('install', (e) => {
  self.skipWaiting();
});
self.addEventListener('fetch', (e) => {
  // Şimdilik sadece ağ isteklerine izin veriyoruz
});
