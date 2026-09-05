/* ==========================================================================
   Service worker.

   Three rules shape everything here, and each one exists because breaking it
   breaks something specific in this product.

   1. /api is never touched. An analysis streams over Server-Sent Events for
      up to several minutes. A fetch handler that returns a cached response,
      or even one that reads the body to decide, ends the stream — and the
      failure looks like the model hanging rather than like a caching bug.
      The handler returns early for these before doing anything else.

   2. HTML is never cached. Every page behind a login renders someone's own
      dilemmas. Two people share a phone, the second opens the app, and a
      cached shell hands them the first one's screen. The shell is fetched
      fresh every time; only the immutable build assets are stored.

   3. Only same-origin GET is considered. A POST is an action, not a
      document, and replaying one from a cache would repeat it.
   ========================================================================== */

// v4: the app moved again — root to /app — so every cached path points
// somewhere that now redirects, and the second typeface was dropped, so the
// cache is also holding two font files nothing asks for. Bumping the key is
// what makes activate drop the lot.
const VERSION = 'v4';
const SHELL = `ethiclens-shell-${VERSION}`;
const ASSETS = `ethiclens-assets-${VERSION}`;

/**
 * A ceiling on the runtime cache.
 *
 * Every asset URL carries a content hash, so a deploy never overwrites an
 * entry — it adds a whole new set beside the old one, and nothing here ever
 * asked for the old one back. Left alone this grows without limit for as long
 * as the app is installed. Splitting the admin panel into its own chunks made
 * that roughly fifteen files per build instead of two, which is what made it
 * visible.
 *
 * Sixty holds about three builds' worth, so a page opened before a deploy can
 * still fetch a chunk it was going to need.
 */
const MAX_ASSETS = 60;

/**
 * Fonts and icons are worth pre-caching: they are needed on the very first
 * paint, they never change without a filename change, and they are what makes
 * an installed app look like itself while offline.
 */
const PRECACHE = [
  // All four weights, because the offline page and the app share them and a
  // missing weight is synthesised by the browser — which on Persian text
  // looks like a different typeface, not like a slightly lighter one.
  '/fonts/Shabnam-Light.woff2',
  '/fonts/Shabnam.woff2',
  '/fonts/Shabnam-Medium.woff2',
  '/fonts/Shabnam-Bold.woff2',
  // The offline page is plain HTML outside the bundle, so it carries its own
  // stylesheet; without this it renders in a fallback face at the one moment
  // the product is trying to look deliberate rather than broken.
  '/css/fonts.css',
  '/icons/icon-192.png',
  '/app/offline.html'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    // Individually, so one missing file does not abort the whole install and
    // leave the worker permanently unable to activate.
    await Promise.all(PRECACHE.map(url =>
      cache.add(url).catch(() => console.warn('[sw] skipped', url))
    ));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL, ASSETS]);
    for (const key of await caches.keys()) {
      if (!keep.has(key)) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Rule 3, and it comes first because it is the cheapest check.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Rule 1. Nothing under /api is inspected, cached, or delayed — the
  // streaming analysis depends on this request reaching the network
  // untouched.
  if (url.pathname.startsWith('/api/')) return;

  // Rule 2. A navigation always goes to the network. Offline, it falls back
  // to a page that says so rather than to someone else's cached screen.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(async () =>
        (await caches.match('/app/offline.html')) ||
        new Response('آفلاین', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      )
    );
    return;
  }

  // Build assets carry a content hash in the filename, so a hit is always the
  // right file and can be served from cache without checking the network.
  const immutable = url.pathname.startsWith('/app/assets/') ||
                    url.pathname.startsWith('/fonts/') ||
                    url.pathname.startsWith('/icons/');

  if (immutable) {
    event.respondWith((async () => {
      const hit = await caches.match(request);
      if (hit) return hit;
      const res = await fetch(request);
      await store(request, res);
      return res;
    })());
    return;
  }

  // Everything else — stylesheets, the odd static file — is served from the
  // network first, with the cache as a fallback rather than a source of
  // truth.
  event.respondWith((async () => {
    try {
      const res = await fetch(request);
      await store(request, res);
      return res;
    } catch {
      const hit = await caches.match(request);
      if (hit) return hit;
      throw new Error('offline and not cached');
    }
  })());
});

/**
 * Put a response in the runtime cache, if it is the sort of thing that
 * belongs there, and keep that cache from growing forever.
 *
 * The HTML check is rule 2 again, enforced on the response rather than the
 * request. The navigation branch above only catches documents the browser is
 * navigating to; a page fetched by script — /a/<slug> from a link preview,
 * say — arrives here instead with mode 'cors' and would otherwise be stored.
 * Checking the content type catches both, which is what the rule actually
 * meant.
 */
async function store(request, res) {
  if (!res.ok) return;
  if ((res.headers.get('content-type') || '').includes('text/html')) return;

  const cache = await caches.open(ASSETS);
  await cache.put(request, res.clone());

  // keys() is in insertion order, so the front of the list is the oldest
  // thing here — which after a deploy is the previous build's assets.
  const keys = await cache.keys();
  const excess = keys.length - MAX_ASSETS;
  for (let i = 0; i < excess; i++) await cache.delete(keys[i]);
}
