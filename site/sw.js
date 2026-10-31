// Network-first service worker: always tries fresh content, falls back to the
// last copy when offline. Only same-origin GET requests are handled.
const CACHE = 'pnd-v1';
self.addEventListener('install', (e) => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          const key = url.origin + url.pathname; // ignore cache-busting query
          caches.open(CACHE).then((c) => c.put(key, copy));
        }
        return res;
      })
      .catch(() => caches.match(url.origin + url.pathname).then((r) => r || Response.error()))
  );
});
