// Service worker: makes the site installable and usable offline.
//  - app shell (HTML/CSS/JS/icons): precached; served cache-first, refreshed in the background
//  - data/*.json: network-first (fresh news), falls back to the last copy when offline
//  - Google Fonts: cache-first
// BUILD is replaced at build time with a hash of the shell files, so a new
// deploy installs a new worker only when the app itself changed.
const BUILD = '__BUILD__';
const SHELL = `shell-${BUILD}`;
const DATA = 'data-v1';
const FONTS = 'fonts-v1';
const SHELL_FILES = [
  './', 'index.html', 'manifest.webmanifest',
  'assets/styles.css', 'assets/app.js', 'assets/i18n.js', 'assets/gnews.js', 'assets/chart.js', 'assets/icon.svg',
  'assets/icons/icon-192.png', 'assets/icons/apple-touch-icon.png', 'assets/icons/favicon-32.png',
];

// Data needed to open the app offline on the very first launch (best effort).
const DATA_FILES = ['data/topics.json', 'data/gold.json', 'data/gold-history.json', 'data/news/vizag.en.json', 'data/news/vizag.te.json'];

self.addEventListener('install', (e) => {
  e.waitUntil(Promise.all([
    caches.open(SHELL).then((c) => c.addAll(SHELL_FILES.map((u) => new Request(u, { cache: 'reload' })))),
    caches.open(DATA).then((c) => Promise.allSettled(DATA_FILES.map(async (f) => {
      const url = new URL(f, self.registration.scope);
      const res = await fetch(url, { cache: 'no-cache' });
      if (res.ok) await c.put(url.origin + url.pathname, res);
    }))),
  ]).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('shell-') && k !== SHELL).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const offlineCopy = (res) => {
  const h = new Headers(res.headers);
  h.set('x-offline', '1');
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
};

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(FONTS).then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }));
    return;
  }
  if (url.origin !== location.origin) return;

  // News/gold data: always try the network, keep a copy for offline.
  if (url.pathname.includes('/data/')) {
    const key = url.origin + url.pathname; // ignore cache-busting query
    e.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) { const copy = res.clone(); caches.open(DATA).then((c) => c.put(key, copy)); }
          return res;
        })
        .catch(() => caches.open(DATA).then((c) => c.match(key)).then((r) => (r ? offlineCopy(r) : Response.error())))
    );
    return;
  }

  // App shell: navigations → cached index.html; assets → cache-first + background refresh.
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('index.html', { ignoreSearch: true })));
    return;
  }
  e.respondWith(
    caches.open(SHELL).then(async (c) => {
      const hit = await c.match(req, { ignoreSearch: true });
      const net = fetch(req).then((res) => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
      return hit || net;
    })
  );
});
