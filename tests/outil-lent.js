#!/usr/bin/env node
/* Le site sur un vrai réseau lent.
   ─────────────────────────────────────────────────────────────────────
   Toutes les mesures de cet audit ont été prises en local, où une requête
   revient en une milliseconde. Le public d'Inkrise lit sur téléphone, en
   Afrique de l'Ouest et ailleurs : la 3G y est la norme, pas l'exception.
   C'est le même angle mort que « le site n'avait jamais été mesuré avec
   ses vraies polices » — la mesure était juste, elle n'était pas prise
   dans les conditions réelles.

   Trois profils réseau, appliqués par le protocole de débogage Chrome
   (les mêmes chiffres que les DevTools) :

     rapide  — fibre : 20 Mb/s,  20 ms de latence
     3g      — 3G correcte : 1,6 Mb/s, 560 ms de latence
     3g-lent — 3G médiocre : 400 kb/s, 2 000 ms de latence

   Quatre défauts cherchés, tous invisibles en local :

   • FAUSSE PANNE  : le garde-fou anti-page-figée conclut à la panne alors
                     que la page finissait par charger. Dire « le
                     chargement n'aboutit pas » à quelqu'un dont la
                     connexion marche est pire que de ne rien dire.
   • SANS ATTENTE  : rien n'indique que ça travaille pendant les premières
                     secondes — écran figé, on croit à un plantage
   • SAUT          : le contenu bouge sous le doigt quand les images
                     arrivent enfin (pas de place réservée)
   • JAMAIS FINI   : au-delà de 30 s, la page n'a toujours rien affiché

   Usage :  node tests/outil-lent.js
            INKRISE_RESEAUX=3g-lent node tests/outil-lent.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.jpg':'image/jpeg','.png':'image/png'};
const PORT = 8563;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  let buf = fs.readFileSync(p);
  const tete = { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' };
  /* Vercel sert tout le texte en brotli. Mesurer sans compression
     reviendrait à inventer un problème qui n'existe pas en production :
     `assets/supabase.js` pèse 203 Ko sur le disque et 44 Ko sur le fil.
     Les .woff2 et .webp sont déjà compressés, on n'y touche pas. */
  if (/\.(html|css|js|json|svg)$/.test(p) && /br/.test(q.headers['accept-encoding'] || '')) {
    buf = zlib.brotliCompressSync(buf); tete['Content-Encoding'] = 'br';
  }
  r.writeHead(200, tete); r.end(buf);
});

/* Chiffres repris des profils intégrés à Chrome DevTools. */
const RESEAUX = {
  'rapide':  { download: 20 * 1024 * 1024 / 8, upload: 5 * 1024 * 1024 / 8, latency: 20 },
  '3g':      { download: 1.6 * 1024 * 1024 / 8, upload: 750 * 1024 / 8, latency: 562 },
  '3g-lent': { download: 400 * 1024 / 8, upload: 400 * 1024 / 8, latency: 2000 },
  /* Bord de couverture : 2G/EDGE, ou une 3G saturée en heure de pointe. */
  'bord':    { download: 200 * 1024 / 8, upload: 100 * 1024 / 8, latency: 3000 },
};

const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, cover_url:null, bio:'Auteur',
  is_creator:true, created_at:'2026-01-05T10:00:00Z', pref_masquer_adulte:false,
  pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };
const MANGA = i => ({ id:i, titre:'Darkworld '+i, synopsis:'Un récit sombre.', type:'manga',
  statut:'en_cours', genres:['Action'], couverture_url:null, auteur_id:'u1', vues:120+i,
  adulte:false, langue:'fr', sens_lecture:'rl', age_recommande:'12+', commentaires_actifs:true,
  created_at:'2026-06-01T10:00:00Z', note_moyenne:4.2, nb_avis:3 });
function corps(u) {
  const t = n => u.includes(n);
  if (t('/profiles')) return [PROFILE];
  if (t('avis_mangas')) return [{ id:1, user_id:'u2', note:5, commentaire:'Top', created_at:'2026-07-01T10:00:00Z' }];
  if (t('posts_communaute')) return [{ id:1, creator_id:'u1', type:'post', contenu:'Salut',
    est_epingle:false, image_url:null, created_at:'2026-07-01T10:00:00Z', auteur_id:'u1' }];
  if (t('/mangas')) return [1,2].map(MANGA);
  if (t('/chapitres')) return [{ id:101, numero:1, titre:'Ch 1', manga_id:1, created_at:'2026-06-11T10:00:00Z' }];
  if (t('packs_tutoriels')) return [{ id:1, titre:'Pack encrage', description:'Apprends.', prix:5,
    auteur_id:'u1', couverture_url:null, contenu_url:'x', images:[], niveau:'debutant',
    objectifs:['Trait'], created_at:'2026-05-01T10:00:00Z' }];
  if (t('/bibliotheque')) return [{ user_id:'u1', manga_id:1, chapitre:101, page:3, total_pages:12, total_chapitres:3 }];
  if (t('/follows')) return [{ user_id:'u1', followed_id:'u1' }];
  return [];
}

const URLS = ['index.html', 'recherche.html', 'manga.html?id=1', 'bibliotheque.html',
  'profil.html', 'communaute.html', 'tutoriels.html', 'pack.html?id=1',
  'auteur.html?id=u1', 'lecteur.html?manga_id=1&chapitre=101'];

/* Ce qu'on lit sur l'écran de quelqu'un pendant que ça charge. */
const SONDE = () => {
  /* Sur une vraie 3G lente, le HTML lui-même met plusieurs secondes à
     arriver : à la première sonde, `document.body` peut encore être nul.
     C'est une donnée du problème, pas une erreur — un écran blanc pendant
     que le document se télécharge. */
  if (!document.body) return { panne:false, panneTexte:'', attenteVisible:false, longueur:0, documentPret:false };
  const panne = document.getElementById('inkStalled');
  const texte = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
  /* Une attente ANNONCÉE (roue, « Chargement… ») vaut mieux qu'un écran
     figé : on note laquelle des deux on a sous les yeux. */
  const ATTENTE = /chargement|patiente|en cours|chargement…/i;
  const roue = [...document.querySelectorAll(
    '.loading-ring, .loading-spinner, .spinner, .comments-spinner, .loading-dots, .page-loading, .loading-wrap')]
    .some(e => e.getBoundingClientRect().height > 0);
  return {
    panne: !!panne,
    panneTexte: panne ? (panne.innerText || '').replace(/\s+/g,' ').trim().slice(0, 60) : '',
    attenteVisible: roue || ATTENTE.test(texte),
    longueur: texte.length,
    documentPret: document.readyState !== 'loading',
  };
};

const releve = [];
const temps = [];
const noter = (genre, page, detail) => releve.push({ genre, page, detail });

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const demandes = (process.env.INKRISE_RESEAUX || 'rapide,3g,3g-lent').split(',');

for (const nomReseau of demandes) {
  const profil = RESEAUX[nomReseau];
  if (!profil) { console.error('Réseau inconnu : ' + nomReseau); continue; }
  console.log('\n▶ ' + nomReseau + ' — ' + Math.round(profil.download * 8 / 1024) + ' kb/s, ' + profil.latency + ' ms');

  for (const u of URLS) {
    const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
    await ctx.addInitScript(user => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
        expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user })), U);
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ ...U, aud:'authenticated' }) }));
    await ctx.route('**/rest/v1/**', r => {
      const req = r.request();
      if (req.method() !== 'GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
      const lignes = corps(decodeURIComponent(req.url()));
      const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      r.fulfill({ status:200, contentType:'application/json',
        headers:{ 'Content-Range':'0-0/'+lignes.length, 'Access-Control-Expose-Headers':'Content-Range' },
        body: JSON.stringify(seul ? (lignes[0]||null) : lignes) });
    });
    await ctx.route('**/storage/v1/object/list/**', r =>
      r.fulfill({status:200,contentType:'application/json',body:'[{"name":"01.jpg"}]'}));
    await ctx.route('**/storage/v1/**', r =>
      r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));

    const p = await ctx.newPage();
    /* Le bridage passe par le protocole Chrome : `route()` seul ne
       ralentit rien, il ne fait que répondre à la place du réseau. */
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false, latency: profil.latency,
      downloadThroughput: profil.download, uploadThroughput: profil.upload });

    const t0 = Date.now();
    try { await p.goto(BASE + '/' + u, { waitUntil:'commit', timeout: 45000 }); }
    catch (e) { noter('JAMAIS FINI', u + ' @' + nomReseau, 'la page ne s\'ouvre pas : ' + e.message.slice(0,50));
                await ctx.close(); continue; }

    /* Deux secondes après l'ouverture : est-ce qu'on sait que ça travaille ? */
    await p.waitForTimeout(2200);
    const tot = await p.evaluate(SONDE);
    /* Un écran blanc pendant que le HTML lui-même se télécharge n'est pas
       un défaut : le navigateur n'a rien à peindre. Ce qu'on cherche, c'est
       une page DÉJÀ ARRIVÉE qui ne dit pas qu'elle travaille — là, on croit
       à un plantage alors que les requêtes sont en cours. */
    if (tot.documentPret && !tot.attenteVisible && tot.longueur < 120)
      noter('SANS ATTENTE', u + ' @' + nomReseau,
            'document arrivé, mais rien à l\'écran ni aucune attente signalée');

    /* On laisse la page finir, jusqu'à 30 s. */
    let fini = false, pris = 0;
    for (let i = 0; i < 28 && !fini; i++) {
      await p.waitForTimeout(1000);
      const r = await p.evaluate(SONDE);
      pris = Date.now() - t0;
      if (r.panne) {
        /* La panne est-elle méritée ? On continue d'attendre : si le
           contenu arrive après, c'était une fausse alerte. */
        await p.waitForTimeout(8000);
        const apres = await p.evaluate(SONDE);
        if (apres.longueur > r.longueur + 200)
          noter('FAUSSE PANNE', u + ' @' + nomReseau,
                '« ' + r.panneTexte + ' » à ' + Math.round(pris/1000) + ' s, puis le contenu arrive');
        fini = true;
      } else if (r.longueur > 400) { fini = true; temps.push([u, pris]); }
    }
    if (!fini) {
      const r = await p.evaluate(SONDE);
      noter('JAMAIS FINI', u + ' @' + nomReseau,
            'toujours ' + r.longueur + ' caractères après 30 s');
    }

    /* Place réservée aux images : le contenu doit-il sauter quand elles
       arrivent ? On mesure le déplacement réel signalé par le navigateur. */
    const saut = await p.evaluate(() => new Promise(res => {
      let total = 0;
      try {
        const obs = new PerformanceObserver(list => {
          for (const e of list.getEntries()) if (!e.hadRecentInput) total += e.value;
        });
        obs.observe({ type:'layout-shift', buffered:true });
        setTimeout(() => { obs.disconnect(); res(total); }, 600);
      } catch (e) { res(-1); }
    }));
    if (saut > 0.25) noter('SAUT', u + ' @' + nomReseau, 'déplacement cumulé de ' + saut.toFixed(2));

    await ctx.close();
  }
}

await b.close(); server.close();

console.log('\n═══ LE SITE SUR UN RÉSEAU LENT ═══\n');
if (temps.length) {
  console.log('Premier contenu affiché :');
  for (const [p, ms] of temps) console.log(`  ${String(ms).padStart(6)} ms  ${p}`);
}
if (!releve.length) {
  console.log('───────────');
  console.log('✅ le site tient sur une 3G : rien d\'annoncé à tort, rien de figé');
  process.exit(0);
}
if (temps.length) {
  console.log('Premier contenu affiché :');
  for (const [p, ms] of temps) console.log(`  ${String(ms).padStart(6)} ms  ${p}`);
  console.log('');
}
for (const g of [...new Set(releve.map(r => r.genre))]) {
  const lot = releve.filter(r => r.genre === g);
  console.log(`\n### ${g} (${lot.length})`);
  for (const r of lot) console.log(`  • ${r.page}\n      ${r.detail}`);
}
console.log('\n───────────');
console.log(`${releve.length} point(s) à regarder`);
process.exit(1);
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
