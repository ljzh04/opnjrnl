const CACHE_NAME = 'minimal-journal-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Basic precache
      return cache.addAll([
        '/',
        '/index.html',
        '/icon.svg',
        '/manifest.json'
      ]);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Stale-while-revalidate strategy for the app
  if (event.request.method === 'GET' && !event.request.url.includes('googleapis')) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, networkResponse.clone());
          });
          return networkResponse;
        }).catch(() => {
          // If network fails (offline), return what's in cache if we have it
          // Nothing extreme for this simple naive SW
        });
        return cachedResponse || fetchPromise;
      })
    );
  }
});
