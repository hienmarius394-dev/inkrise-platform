/* Service worker Inkrise — volontairement minimal et sûr.
   - assets statiques (assets/*) : cache d'abord, réseau en secours
   - navigations (pages HTML) : réseau d'abord, cache en secours (hors-ligne)
   - tout le reste (Supabase, API, autres origines) : jamais intercepté */
const CACHE = 'inkrise-v1';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Assets statiques : cache-first
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.webmanifest')) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
    return;
  }

  // Pages : network-first avec repli cache (mode hors-ligne)
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => caches.match(req).then(hit => hit || caches.match('index.html')))
    );
  }
});
