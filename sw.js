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
const CACHE = 'inkrise-v11';
const PAGES_CACHE = 'inkrise-pages';

// Toute la « coquille » de l'app est mise en cache dès l'installation
// (~1,2 Mo) : chaque page du site est ainsi joignable hors-ligne, même si
// elle n'a jamais été visitée — indispensable pour que le clic sur un
// chapitre téléchargé ouvre le lecteur sans réseau.
const PRECACHE = [
  'index.html', 'recherche.html', 'manga.html', 'lecteur.html',
  'bibliotheque.html', 'profil.html', 'auteur.html', 'communaute.html',
  'tutoriels.html', 'pack.html', 'espace-createur.html',
  'upload-manga.html', 'gestion-chapitres.html',
  'auth.html', 'admin.html', '404.html', 'parametres.html',
  'mentions-legales.html', 'cgu.html', 'confidentialite.html',
  'creators-remuneration.html',
  'assets/inkrise-theme.css', 'assets/inkrise-theme.js', 'assets/inkrise-config.js', 'assets/supabase.js', 'assets/inkrise-nav.js', 'assets/inkrise-offline.js',
  'assets/inkrise-reseau.js', 'assets/inkrise-veille.js', 'assets/inkrise-vue.js',
  'assets/inkrise-img.js', 'assets/legal.css', 'assets/inkrise-fonts.css',
  'assets/favicon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'manifest.webmanifest',
  // Polices : seuls les fichiers « latin » sont préchargés. Ils couvrent
  // la totalité de l'interface ; les variantes latin-ext ne servent qu'aux
  // pseudos écrits avec des caractères d'Europe centrale, et le navigateur
  // ne les réclame que dans ce cas — inutile de les embarquer d'office.
  'assets/fonts/syne-latin.woff2', 'assets/fonts/dmsans-latin.woff2',
  'assets/fonts/nunito-latin.woff2', 'assets/fonts/bebasneue-latin.woff2'
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

/* ── Notifications push ──────────────────────────────────────────────
   Le service worker est le seul code qui tourne encore quand l'onglet est
   fermé : c'est donc lui qui reçoit la notification et l'affiche.

   `userVisibleOnly: true` a été promis au navigateur à l'abonnement : il
   faut afficher quelque chose à chaque push reçu, sinon il finit par
   révoquer l'abonnement. D'où la notification de repli si la charge utile
   est absente ou illisible. */
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; }
  catch (err) {
    try { d = { corps: e.data.text() }; } catch (err2) { d = {}; }
  }
  const titre = d.titre || 'Inkrise';
  const options = {
    body: d.corps || 'Tu as du nouveau sur Inkrise.',
    icon: 'assets/icon-192.png',
    badge: 'assets/icon-192.png',
    lang: 'fr',
    data: { lien: d.lien || 'index.html' },
    /* Même tag = la nouvelle notification remplace la précédente au lieu
       d'empiler dix lignes dans le volet système. */
    tag: d.tag || 'inkrise',
    renotify: true
  };
  e.waitUntil(self.registration.showNotification(titre, options));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const lien = (e.notification.data && e.notification.data.lien) || 'index.html';
  const cible = new URL(lien, self.location.origin).href;
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((liste) => {
      /* Si Inkrise est déjà ouvert quelque part, on y navigue plutôt que
         d'ouvrir un énième onglet. */
      for (const c of liste) {
        if (c.url.indexOf(self.location.origin) === 0 && 'focus' in c) {
          return c.focus().then(() => (c.navigate ? c.navigate(cible) : null));
        }
      }
      return clients.openWindow(cible);
    })
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

  // Dernière dépendance externe : la librairie Supabase. Cache-first, sans
  // quoi window.supabase n'existe pas et toutes les pages cassent hors
  // connexion. (Les polices étaient ici aussi ; elles sont désormais
  // servies par Inkrise et passent par la règle « assets » plus bas.)
  const EXT_HOSTS = ['cdn.jsdelivr.net'];
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

  // Fonctions serverless (/api/…) : jamais mises en cache. Elles rendent
  // une réponse propre à la requête ; la servir depuis le cache n'aurait
  // aucun sens et masquerait une mise à jour.
  if (url.pathname.startsWith('/api/')) return;

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
