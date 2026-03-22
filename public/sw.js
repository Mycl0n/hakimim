// Simple Service Worker for PWA support
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
  // Basic fetch handler (can be expanded for offline support)
  event.respondWith(fetch(event.request).catch(() => caches.match(event.request)));
});
