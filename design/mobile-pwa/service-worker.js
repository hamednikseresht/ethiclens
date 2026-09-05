/* Ethic Lens — service worker.
   Conservative on purpose: shell cached, API always tried live first,
   previously-read analyses available offline. Bump CACHE on every deploy. */

const CACHE = 'ethic-lens-v1';

const SHELL = [
  '/',
  '/app',
  '/history',
  '/css/app.css',
  '/css/motion.css',
  '/css/result.css',
  '/css/public.css',
  '/js/core.js',
  '/js/result.js',
  '/js/quotes.js',
  '/manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // API: network first, fall back to a cached copy so past analyses stay readable offline.
  if (url.pathname.startsWith('/api/')) {
    e.respondWith(
      fetch(request)
        .then((res) => {
          // Only cache successful reads of individual analyses.
          if (res.ok && /^\/api\/analyses\/[^/]+$/.test(url.pathname)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // Shell and static: cache first, refresh in the background.
  e.respondWith(
    caches.match(request).then((hit) => {
      const live = fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || live;
    })
  );
});
