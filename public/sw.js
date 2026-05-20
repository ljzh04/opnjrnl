const CACHE_NAME = 'opnjrnl-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  if (event.request.method === 'GET' && !event.request.url.includes('googleapis') && !event.request.url.includes('chrome-extension')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
  }
});
