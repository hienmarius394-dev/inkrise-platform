/* Service worker Inkrise — volontairement minimal et sûr.
   - assets statiques (assets/*) : stale-while-revalidate — on sert le cache
     tout de suite (rapide + hors-ligne) MAIS on récupère la version réseau
     en arrière-plan et on met le cache à jour, pour que les mises à jour de
     JS/CSS arrivent au chargement suivant sans forcer le rechargement
   - navigations (pages HTML) : réseau d'abord, cache en secours, indexées
     par chemin (sans query string) pour que lecteur.html?manga_id=…
     fonctionne hors-ligne quelle que soit l'URL exacte
   - planches téléchargées (cache "inkrise-pages", rempli par
     assets/inkrise-offline.js) : cache d'abord — lecture hors-ligne
   - tout le reste (API Supabase, autres origines) : jamais intercepté */
const CACHE = 'inkrise-v5';
const PAGES_CACHE = 'inkrise-pages';

// Toute la « coquille » de l'app est mise en cache dès l'installation
// (~1,2 Mo) : chaque page du site est ainsi joignable hors-ligne, même si
// elle n'a jamais été visitée — indispensable pour que le clic sur un
// chapitre téléchargé ouvre le lecteur sans réseau.
const PRECACHE = [
  'index.html', 'recherche.html', 'manga.html', 'lecteur.html',
  'bibliotheque.html', 'profil.html', 'auteur.html', 'communaute.html',
  'tutoriels.html', 'pack.html', 'espace-createur.html',
  'mon-espace.html', 'upload-manga.html', 'gestion-chapitres.html',
  'auth.html', 'admin.html', '404.html',
  'mentions-legales.html', 'cgu.html', 'confidentialite.html',
  'creators-remuneration.html',
  'assets/supabase.js', 'assets/inkrise-nav.js', 'assets/inkrise-offline.js',
  'assets/inkrise-img.js', 'assets/legal.css',
  'assets/favicon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(PRECACHE.map(u => cache.add(u).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
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

  // Dépendances externes indispensables (librairie Supabase, polices Google) :
  // cache-first pour qu'elles soient présentes hors-ligne. Sans ça,
  // window.supabase n'existe pas et toutes les pages cassent hors connexion.
  const EXT_HOSTS = ['cdn.jsdelivr.net', 'fonts.googleapis.com', 'fonts.gstatic.com'];
  if (EXT_HOSTS.indexOf(url.hostname) !== -1) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req).then(hit => {
          const network = fetch(req).then(res => {
            if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || network;
        })
      )
    );
    return;
  }

  if (url.origin !== self.location.origin) return;

  // Assets statiques : stale-while-revalidate (sert le cache, met à jour en fond)
  if (url.pathname.includes('/assets/') || url.pathname.endsWith('.webmanifest')) {
    e.respondWith(
      caches.open(CACHE).then(cache =>
        cache.match(req).then(hit => {
          // cache: 'no-cache' → revalidation réseau, contourne le cache HTTP
          // du navigateur pour toujours détecter une nouvelle version.
          const network = fetch(req, { cache: 'no-cache' }).then(res => {
            if (res.ok) cache.put(req, res.clone());
            return res;
          }).catch(() => hit);
          return hit || network;
        })
      )
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
