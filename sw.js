/* Service worker Inkrise — volontairement minimal et sûr.
   - assets statiques (assets/*) : cache d'abord, réseau en secours
   - navigations (pages HTML) : réseau d'abord, cache en secours, indexées
     par chemin (sans query string) pour que lecteur.html?manga_id=…
     fonctionne hors-ligne quelle que soit l'URL exacte
   - planches téléchargées (cache "inkrise-pages", rempli par
     assets/inkrise-offline.js) : cache d'abord — lecture hors-ligne
   - tout le reste (API Supabase, autres origines) : jamais intercepté */
const CACHE = 'inkrise-v2';
const PAGES_CACHE = 'inkrise-pages';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE && k !== PAGES_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Planches de chapitres téléchargées (Storage Supabase) : cache-first
  if (url.pathname.includes('/storage/v1/object/public/pages/')) {
    e.respondWith(
      caches.open(PAGES_CACHE)
        .then(c => c.match(req.url))
        .then(hit => hit || fetch(req))
    );
    return;
  }

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

  // Pages : network-first, cache par chemin (sans query) en secours
  if (req.mode === 'navigate' || url.pathname.endsWith('.html')) {
    const cacheKey = url.origin + url.pathname;
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(cacheKey, copy));
        }
        return res;
      }).catch(() =>
        caches.match(cacheKey).then(hit => hit || caches.match(self.location.origin + '/index.html'))
      )
    );
  }
});
