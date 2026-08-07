#!/usr/bin/env node
/* Ce que voit l'utilisateur quand la base ne répond pas.
   ─────────────────────────────────────────────────────────────────────
   Tout le site lit Supabase depuis le navigateur. Le jour où la base
   renvoie une erreur — panne, quota, coupure réseau dans un bus — chaque
   page doit dire quelque chose. Trois échecs possibles, tous silencieux :

   • écran blanc      : la page charge, rien ne s'affiche, aucune explication
   • roue éternelle   : « Chargement… » qui ne s'arrête jamais
   • erreur en anglais : « TypeError: Cannot read properties of null »
                        recopiée telle quelle à l'écran

   Trois pannes sont rejouées sur chaque page : erreur serveur (500),
   session expirée (401) et réseau coupé. On regarde ce que la page
   affiche vraiment, pas ce que le code prétend gérer.

   Usage :  node tests/outil-panne.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
               '.webmanifest':'application/json','.jpg':'image/jpeg','.png':'image/png'};
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});

const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };

const PANNES = {
  'serveur en erreur (500)': r => r.fulfill({ status:500, contentType:'application/json',
    body: JSON.stringify({ message:'internal server error', code:'XX000' }) }),
  'session refusée (401)':   r => r.fulfill({ status:401, contentType:'application/json',
    body: JSON.stringify({ message:'JWT expired', code:'PGRST301' }) }),
  'réseau coupé':            r => r.abort('failed'),
};

const URLS = ['index.html', 'recherche.html?q=a', 'manga.html?id=1', 'bibliotheque.html',
  'profil.html', 'auteur.html?id=u1', 'communaute.html', 'tutoriels.html',
  'pack.html?id=1', 'espace-createur.html', 'gestion-chapitres.html?manga_id=1',
  'lecteur.html?manga_id=1&chapitre=101', 'parametres.html', 'admin.html'];

/* Sonde : on juge sur le texte réellement rendu. */
const SONDE = () => {
  const corps = document.body;
  const texte = (corps.innerText || '').replace(/\s+/g, ' ').trim();
  /* La coquille commune (barre de nav, menu, pied de page, sélecteur de
     thème) s'affiche même quand rien n'a chargé : la compter reviendrait
     à déclarer « il y a du contenu » sur une page vide. On la retire. */
  const coquille = [
    'INKRISE', 'Accueil', 'Manga & BD', 'Tutoriels', 'Espace Créateur', 'GRATUIT',
    'Communauté', 'MON COMPTE', 'Mon profil', 'Ma bibliothèque', 'Publier un manga',
    'Connexion / Inscription', 'Paramètres', 'Déconnexion', 'EXPLORER', 'APPARENCE',
    'Clair', 'Sombre', 'Auto', 'Connexion', 'Profil', 'Aller au contenu',
    'NOTRE MISSION', 'En savoir plus →', 'Mentions légales', 'CGU / CGV',
    'Confidentialité', 'Rémunération créateurs', 'Wave · Orange Money · MTN MoMo · Stripe',
  ];
  let utile = texte;
  for (const c of coquille) utile = utile.split(c).join(' ');
  utile = utile.replace(/[·✕☰🔍🔔🏠🎓👥👤📖📚📤🔑⚙️🚪🧑‍🎨🎨☀️🌙🌗💜\s©]/g, '').trim();
  utile = utile.replace(/Tu publies tes mangas sur Inkrise.*?œuvres\./, '').trim();
  utile = utile.replace(/\d{4}\s*Inkrise.*?artistes/, '').trim();

  /* Roue qui ne s'arrête pas. « Chargement impossible » et « Erreur de
     chargement » contiennent le mot mais disent justement que c'est fini :
     les compter revenait à reprocher à une page d'avoir bien fait son
     travail. On ne retient que l'attente encore en cours. */
  const FINI = /impossible|erreur|échec|echec|réessay|reessay|introuvable|indisponible|hors.?ligne|n'aboutit pas|a échoué/i;
  const ATTENTE = /chargement|loading|patiente|en cours|…$|\.\.\.$/i;
  const enAttente = [...document.querySelectorAll('*')].filter(e => {
    if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return false;
    const t = (e.textContent || '').trim();
    return t.length < 40 && e.children.length === 0 && ATTENTE.test(t) && !FINI.test(t);
  }).map(e => (e.textContent || '').trim());

  /* Message technique recopié à l'écran. Nuance nécessaire : une page qui
     dit « Impossible de charger ce manga — vérifie ta connexion » puis
     ajoute une ligne de diagnostic en tout petit fait bien son travail.
     Ce qu'on cherche, c'est le jargon SERVI COMME EXPLICATION, sans phrase
     en français pour l'accompagner. */
  const TECHNIQUE = /TypeError|ReferenceError|undefined is not|Cannot read|Failed to fetch|NetworkError|JWT expired|PGRST\d+|XX000|internal server error|\[object Object\]/;
  const SECOURS = /vérifie ta connexion|verifie ta connexion|réessay|reessay|plus tard|reviens|retour à l'accueil|contacte/i;
  const brut = TECHNIQUE.test(texte) ? (texte.match(TECHNIQUE) || [''])[0] : null;
  const fuite = brut && !SECOURS.test(texte) ? brut : null;

  /* Un bandeau réseau visible change la nature du problème : la roue
     tourne encore, mais l'utilisateur sait pourquoi et peut réessayer.
     Ce qu'on traque, c'est le silence — pas le pixel qui tourne. */
  // `offsetParent` vaut null sur un élément `position: fixed` — le bandeau
  // l'est. On mesure sa boîte, pas son parent de positionnement.
  var bandeau = document.getElementById('inkriseBandeauReseau');
  var explique = !!(bandeau && bandeau.getBoundingClientRect().height > 0);

  return { longueurUtile: utile.length, extrait: utile.slice(0, 90),
           enAttente: explique ? [] : enAttente, fuite, explique };
};

const releve = [];
const noter = (genre, page, detail) => releve.push({ genre, page, detail });

(async () => {
await new Promise(r => server.listen(8547, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

for (const [nomPanne, gestion] of Object.entries(PANNES)) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  // La session reste valide : on isole la panne des DONNÉES, pas de l'auth,
  // sinon toutes les pages réservées partent en redirection et ne montrent rien.
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  await ctx.route('**/rest/v1/**', gestion);
  await ctx.route('**/storage/v1/**', gestion);

  for (const u of URLS) {
    const p = await ctx.newPage();
    const erreursJS = [];
    p.on('pageerror', e => erreursJS.push(e.message.split('\n')[0].slice(0, 80)));
    const ou = u + '  [' + nomPanne + ']';
    try {
      await p.goto('http://localhost:8547/' + u, { waitUntil:'load', timeout:20000 });
      /* Attendre un délai fixe rendait le résultat instable : selon la
         machine, le bandeau arrivait juste après la mesure et une page
         parfaitement correcte se retrouvait dénoncée. On attend la
         condition elle-même, avec une limite — une page qui ne le montre
         jamais coûte l'attente complète, ce qui est le cas rare. */
      await p.waitForSelector('#inkriseBandeauReseau', { timeout: 15000 }).catch(() => {});
      await p.waitForTimeout(800);
      let s = await p.evaluate(SONDE);
      /* Quarante-deux pages ouvertes à la suite finissent par se disputer
         le processeur : une page correcte se faisait dénoncer environ une
         fois sur trois, et jamais la même. Vérifiée seule, elle passait
         huit fois sur huit. On redonne donc sa chance à toute page mise en
         cause — un vrai défaut, lui, se reproduit. */
      if (!s.explique) {
        await p.reload({ waitUntil: 'load' }).catch(() => {});
        await p.waitForSelector('#inkriseBandeauReseau', { timeout: 15000 }).catch(() => {});
        await p.waitForTimeout(1200);
        s = await p.evaluate(SONDE);
      }
      if (s.longueurUtile < 25 && !s.explique)
        noter('ecran-vide', ou, 'aucun contenu ni message — ' + s.longueurUtile + ' caractères utiles');
      if (!s.explique)
        noter('panne-non-signalee', ou, 'la page ne dit pas que le serveur est injoignable');
      if (s.enAttente.length)
        noter('roue-eternelle', ou, [...new Set(s.enAttente)].join(' / ').slice(0, 70));
      if (s.fuite)
        noter('message-technique', ou, '« ' + s.fuite + ' » affiché à l\'écran');
      if (erreursJS.length)
        noter('erreur-js', ou, [...new Set(erreursJS)][0]);
    } catch (e) {
      noter('page-plantee', ou, e.message.slice(0, 70));
    }
    await p.close();
  }
  await ctx.close();
}
await b.close(); server.close();

/* ══ Rapport ══ */
const parGenre = {};
releve.forEach(r => {
  const c = r.genre + '|' + r.detail;
  (parGenre[r.genre] = parGenre[r.genre] || new Map());
  if (!parGenre[r.genre].has(c)) parGenre[r.genre].set(c, { detail: r.detail, pages: new Set() });
  parGenre[r.genre].get(c).pages.add(r.page);
});
console.log('\n═══ COMPORTEMENT EN PANNE ═══\n');
const LIBELLE = {
  'ecran-vide':        'ÉCRAN VIDE — ni contenu, ni explication',
  'panne-non-signalee':'PANNE NON SIGNALÉE — rien n\'indique que le serveur est injoignable',
  'roue-eternelle':    'ATTENTE SANS FIN — un « chargement » qui ne finit jamais',
  'message-technique': 'MESSAGE TECHNIQUE affiché à l\'utilisateur',
  'erreur-js':         'ERREUR JAVASCRIPT (la page peut rester à moitié construite)',
  'page-plantee':      'PAGE PLANTÉE pendant le test',
};
let total = 0;
for (const g of ['ecran-vide', 'panne-non-signalee', 'roue-eternelle', 'message-technique', 'erreur-js', 'page-plantee']) {
  if (!parGenre[g]) continue;
  const liste = [...parGenre[g].values()];
  total += liste.length;
  console.log('### ' + LIBELLE[g] + ' (' + liste.length + ')');
  liste.slice(0, 20).forEach(x => {
    const pg = [...x.pages];
    console.log('  • ' + x.detail);
    pg.slice(0, 6).forEach(q => console.log('      ' + q));
    if (pg.length > 6) console.log('      … +' + (pg.length - 6));
  });
  if (liste.length > 20) console.log('  … et ' + (liste.length - 20) + ' autres');
  console.log('');
}
console.log('───────────');
console.log(total === 0
  ? '✅ chaque page dit quelque chose, même quand la base ne répond pas'
  : total + ' page(s)/panne(s) sans message clair');
})();
