/* Ce qu'entend un lecteur d'écran.
   ─────────────────────────────────────────────────────────────────────
   Une page peut être parfaitement lisible à l'œil et incompréhensible à
   l'oreille. Rien ne plante, rien ne rougit — c'est la même famille que le
   clavier et le contraste.

   Quatre choses se mesurent ici, sur le DOM RENDU (beaucoup de titres sont
   posés par JavaScript, les lire dans le fichier ne prouverait rien) :

   1. UN TITRE PRINCIPAL, ET UN SEUL. C'est la première chose qu'annonce un
      lecteur d'écran, et le repère qui dit « voilà de quoi parle cette
      page ». Zéro titre = on atterrit dans le vide.

   2. PAS DE NIVEAU SAUTÉ. Passer de <h1> à <h3> fait croire à une
      sous-section manquante : la navigation par titres devient trompeuse.

   3. UN REPÈRE « CONTENU PRINCIPAL ». Sans <main>, impossible de sauter la
      navigation — il faut retraverser le menu à chaque page.

   4. UN NOM POUR CHAQUE COMMANDE. Un bouton qui ne contient qu'une icône
      s'annonce « bouton », sans plus. Il lui faut un aria-label.

   Usage :  node tests/outil-semantique.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = 8152;
const BASE = 'http://localhost:' + PORT;
const U = { id:'u1', email:'m@x.fr', aud:'authenticated', user_metadata:{ username:'Marius' } };
const PROFIL = { id:'u1', username:'Marius', bio:'Dessinateur', avatar_url:null,
                 is_creator:true, created_at:'2026-01-05T10:00:00Z' };
const MANGA = { id:1, titre:'Darkworld', synopsis:'Un récit', type:'manga', statut:'en_cours',
                genres:['Action'], couverture_url:null, auteur_id:'u2', sens_lecture:'rl',
                age_recommande:'tout_public', commentaires_actifs:true, vues:12 };

/* auth.html ne s'affiche QUE déconnectée. */
const SANS_SESSION = new Set(['auth.html']);
const PAGES = ['index.html', 'recherche.html?q=a', 'manga.html?id=1', 'bibliotheque.html',
  'profil.html', 'auteur.html?id=u1', 'communaute.html', 'tutoriels.html', 'pack.html?id=1',
  'upload-manga.html', 'gestion-chapitres.html?manga_id=1', 'auth.html', 'parametres.html',
  'lecteur.html?manga_id=1&chapitre=10', 'admin.html', '404.html',
  'cgu.html', 'confidentialite.html', 'mentions-legales.html', 'creators-remuneration.html'];

const releve = [];
const noter = (genre, page, detail) => releve.push({ genre, page, detail });

const SONDE = () => {
  const out = [];
  const visible = e => {
    const s = getComputedStyle(e);
    if (s.display === 'none' || s.visibility === 'hidden') return false;
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };

  /* ── 1 et 2. Les titres ── */
  const titres = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter(visible)
    .map(e => ({ n: +e.tagName[1], txt: (e.textContent || '').trim().slice(0, 30) }));
  const h1 = titres.filter(t => t.n === 1);
  if (h1.length === 0) out.push({ g:'sans-titre-principal', d:'aucun <h1> visible' });
  else if (h1.length > 1)
    out.push({ g:'titres-principaux-multiples', d:h1.length + ' <h1> : ' + h1.map(t=>t.txt).join(' | ') });

  let precedent = 0;
  for (const t of titres) {
    if (precedent && t.n > precedent + 1)
      out.push({ g:'niveau-saute', d:`h${precedent} → h${t.n} (« ${t.txt} »)` });
    precedent = t.n;
  }

  /* ── 3. Le repère de contenu principal ── */
  if (!document.querySelector('main, [role="main"]'))
    out.push({ g:'sans-repere-principal', d:'ni <main> ni role="main"' });

  return out;
};

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

async function contexte(session) {
  const ctx = await b.newContext({ viewport:{ width:1280, height:1000 } });
  if (session) await ctx.addInitScript(u=>localStorage.setItem(
    'sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status: session?200:401,
    contentType:'application/json', body:JSON.stringify(session?U:{})}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    if (u.includes('/profiles')) return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul?PROFIL:[PROFIL])});
    if (u.includes('/mangas')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(seul?MANGA:[MANGA])});
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{ id:10, numero:1, titre:'Ouverture', manga_id:1 }])});
    return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  return ctx;
}

const ctxConnecte = await contexte(true);
const ctxAnon = await contexte(false);
const detournees = [];

for (const url of PAGES) {
  const ctx = SANS_SESSION.has(url.split('?')[0]) ? ctxAnon : ctxConnecte;
  const p = await ctx.newPage();
  try {
    await p.goto(BASE + '/' + url, { waitUntil:'load', timeout:20000 });
    await p.waitForTimeout(1700);
    /* Une page qui a redirigé serait mesurée sous le nom d'une autre. */
    if (!p.url().includes('/' + url.split('?')[0])) {
      detournees.push(url + ' → ' + p.url().split('/').pop().slice(0, 30));
      await p.close(); continue;
    }
    (await p.evaluate(SONDE)).forEach(x => noter(x.g, url, x.d));

    /* LE NOM DES COMMANDES se lit dans l'arbre d'accessibilité, pas dans
       le texte. Ma première version comparait `textContent`/`aria-label`
       et accusait les quatre interrupteurs des Paramètres — or ils sont
       parfaitement nommés par leur `<label for>`, `<button>` étant un
       élément étiquetable. `ariaSnapshot()` rend le nom RÉELLEMENT calculé,
       celui qu'un lecteur d'écran prononce. */
    const arbre = await p.locator('body').ariaSnapshot();
    const muets = new Set();
    for (const ligne of arbre.split('\n')) {
      const m = ligne.match(/^\s*- (button|link|switch|checkbox)(?: "([^"]*)")?/);
      if (!m) continue;
      const nom = (m[2] || '').trim();
      if (nom && /[\p{L}\p{N}]/u.test(nom)) continue;      // il dit quelque chose
      muets.add(m[1] + (nom ? ' « ' + nom + ' »' : ' — aucun nom'));
    }
    muets.forEach(d => noter('commande-sans-nom', url, d));
  } catch (e) { noter('page-illisible', url, e.message.slice(0, 60)); }
  await p.close();
}

await b.close(); server.close();

console.log('\n═══ CE QU\'ENTEND UN LECTEUR D\'ÉCRAN ═══\n');
if (detournees.length) {
  console.log('⚠️  non mesurées (redirection) : ' + detournees.join(' · ') + '\n');
}
const parGenre = {};
for (const r of releve) {
  (parGenre[r.genre] = parGenre[r.genre] || new Map());
  const m = parGenre[r.genre];
  if (!m.has(r.detail)) m.set(r.detail, new Set());
  m.get(r.detail).add(r.page);
}
const ORDRE = ['page-illisible','sans-titre-principal','titres-principaux-multiples',
               'niveau-saute','sans-repere-principal','commande-sans-nom'];
let total = 0;
for (const g of ORDRE) {
  if (!parGenre[g]) continue;
  const liste = [...parGenre[g].entries()];
  total += liste.length;
  console.log('### ' + g.toUpperCase() + ' (' + liste.length + ')');
  liste.slice(0, 12).forEach(([d, pages]) => {
    console.log('  • ' + d);
    console.log('      ' + [...pages].slice(0,5).join(', ') +
      ([...pages].length > 5 ? ' +' + ([...pages].length - 5) : ''));
  });
  if (liste.length > 12) console.log('  … et ' + (liste.length - 12) + ' autres');
  console.log('');
}
console.log('───────────');
console.log(total ? total + ' défaut(s) de structure'
                  : '✅ la structure s\'annonce correctement');
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
