// FieldStat Service Worker — offline-first caching
const CACHE_NAME = 'fieldstat-v2';
const STATIC_ASSETS = ['/', '/index.html', '/app.js', '/manifest.json'];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS).catch(()=>{}))
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET') return;
  if (!url.origin.includes(self.location.origin)) {
    event.respondWith(
      fetch(event.request)
        .then(res => {
          if (res.ok) { const c=res.clone(); caches.open(CACHE_NAME).then(ca=>ca.put(event.request,c)); }
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) { const c=res.clone(); caches.open(CACHE_NAME).then(ca=>ca.put(event.request,c)); }
        return res;
      });
    })
  );
});
