// Empty service worker - can be expanded later for caching
self.addEventListener('install', (event) => {
  // Skip waiting to activate immediately after install
  self.skipWaiting();
  
  // Pre-cache files
  event.waitUntil(
    caches.open('darts-pwa-cache').then((cache) => {
      return cache.addAll([
        '/',
        '/index.html',
        '/app.js',
        '/styles.css'
      ]);
    })
  );
});

self.addEventListener('activate', (event) => {
  // Claim clients immediately
  self.clients.claim();
  
  // Clean up old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== 'darts-pwa-cache') {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (event) => {
  // Serve from cache if available, otherwise fetch
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});