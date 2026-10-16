// Pixel Chess service worker: offline app shell.
// Install precaches the shell; page loads are network-first so game updates land
// immediately (cached copy served when offline); other same-origin assets update
// stale-while-revalidate. /api/* (leaderboards, P2P signaling) is NEVER cached.
const CACHE = 'pixel-chess-v1';
const SHELL = [
  '/', '/index.html',
  '/chess/index.html',
  '/manifest.webmanifest',
  '/icon-192.png', '/icon-512.png',
  '/shared/shell.css',
  '/shared/shared.js', '/shared/shell.js',
  '/shared/trophies-data.js', '/shared/trophies.js',
  '/shared/vendor/PressStart2P-Regular.woff2',
];
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

const putCopy = (req, res) =>
  caches.open(CACHE).then(c => c.put(req, res.clone())).catch(() => {});

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const same = url.origin === self.location.origin;

  // Leaderboards + P2P signaling: always live traffic.
  if (same && url.pathname.startsWith('/api/')) return;

  // Page loads: network first, cached shell when offline.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req)
        .then(res => (res.ok ? putCopy(req, res).then(() => res) : res))
        .catch(() =>
          caches.match(req)
            .then(hit => hit || caches.match('/index.html'))
            .then(hit => hit || caches.match('/chess/index.html'))
            .then(hit => hit || Response.error()))
    );
    return;
  }

  // Google Fonts: cache first once fetched (opaque responses are fine to store).
  if (!same) {
    if (!FONT_HOSTS.includes(url.hostname)) return;
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res =>
        (res.ok || res.type === 'opaque') ? putCopy(req, res).then(() => res) : res))
    );
    return;
  }

  // Same-origin assets: stale-while-revalidate.
  e.respondWith(
    caches.match(req).then(hit => {
      const live = fetch(req)
        .then(res => (res.ok ? putCopy(req, res).then(() => res) : res))
        .catch(() => hit);
      if (hit) { e.waitUntil(live); return hit; }
      return live;
    })
  );
});
