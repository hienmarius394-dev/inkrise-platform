/* Ce que voit quelqu'un qui revient APRÈS une mise en ligne.
   ─────────────────────────────────────────────────────────────────────
   Le service worker ne traite pas les pages et les assets de la même
   façon :

   — les PAGES sont servies réseau d'abord, donc toujours fraîches ;
   — les ASSETS (CSS, JS) sont servis DEPUIS LE CACHE, et rafraîchis en
     arrière-plan pour la fois d'après.

   Conséquence : au premier chargement suivant une mise en ligne, on
   reçoit le NOUVEAU HTML avec l'ANCIEN CSS. Rien ne plante, rien ne
   s'affiche en rouge — la page est simplement dessinée avec la feuille de
   la veille. C'est exactement le genre de décalage que l'audit traque.

   Ce test simule un déploiement : on visite, on change un fichier sur le
   serveur, on revient, et on regarde ce qui est réellement appliqué. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};

const PORT = Number(process.env.PORT) || 8153;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

/* Le serveur peut « déployer » : à partir d'un certain moment il sert une
   version modifiée d'un fichier, sans toucher au dépôt. */
let versionServie = 1;
const MARQUEUR = { 1: '--marqueur-version: un;', 2: '--marqueur-version: deux;' };

const server = http.createServer((q, r) => {
  const rel = decodeURIComponent(q.url.split('?')[0]);
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('404'); }
  let corps = fs.readFileSync(p);
  if (rel === '/assets/inkrise-theme.css') {
    corps = Buffer.from(':root{' + MARQUEUR[versionServie] + '}\n' + corps.toString('utf8'), 'utf8');
  }
  r.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream',
                     'Cache-Control': 'no-cache' });
  r.end(corps);
});

const lireMarqueur = p => p.evaluate(() =>
  getComputedStyle(document.documentElement).getPropertyValue('--marqueur-version').trim());

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

const ctx = await b.newContext({ viewport:{ width:1280, height:900 }, serviceWorkers:'allow' });
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
  headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'}));
await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
const p = await ctx.newPage();
p.on('pageerror',e=>errors.push(e.message));

console.log('\n▶ Première visite : le service worker prend la main');
await p.goto(BASE + '/index.html', { waitUntil:'load' });
/* L'enregistrement puis le CONTRÔLE de la page prennent un instant : sans
   attendre `controller`, on mesurerait un navigateur encore tout seul. */
const controle = await p.evaluate(() => new Promise(res => {
  if (!navigator.serviceWorker) return res('pas de service worker');
  navigator.serviceWorker.register('sw.js').catch(()=>{});
  const t = setTimeout(() => res('délai dépassé'), 12000);
  const voir = () => { if (navigator.serviceWorker.controller) { clearTimeout(t); res('contrôlée'); } };
  navigator.serviceWorker.addEventListener('controllerchange', voir);
  navigator.serviceWorker.ready.then(() => setTimeout(voir, 300));
  voir();
}));
check('la page finit par être contrôlée', controle === 'contrôlée', controle);
check('  et la version servie est bien la première',
  (await lireMarqueur(p)) === 'un', await lireMarqueur(p));

console.log('\n▶ Mise en ligne d\'une nouvelle version, puis retour');
versionServie = 2;
await p.reload({ waitUntil:'load' });
await p.waitForTimeout(700);
const auRetour = await lireMarqueur(p);
check('la feuille de style appliquée est la NOUVELLE', auRetour === 'deux',
  auRetour === 'un' ? 'c\'est encore celle d\'avant la mise en ligne' : auRetour);

console.log('\n▶ Et hors-ligne, la page reste lisible');
await ctx.setOffline(true);
await p.reload({ waitUntil:'load' }).catch(()=>{});
await p.waitForTimeout(700);
const texte = (await p.locator('body').innerText().catch(()=>'')).trim();
check('hors-ligne : la page s\'affiche depuis le cache', texte.length > 100,
  texte.length + ' caractères');
check('  avec une feuille de style, pas une page nue',
  ['un','deux'].includes(await lireMarqueur(p)), await lireMarqueur(p) || 'aucune');
await ctx.setOffline(false);

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
