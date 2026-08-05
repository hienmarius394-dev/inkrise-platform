/* Thème clair / sombre : mémorisation, suivi du réglage système, absence
   de flash blanc, basculeur du menu latéral, et surtout — aucune zone
   restée claire au milieu d'une page sombre. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8114;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

/* Toute page dont le fond est clair alors que le thème est sombre.
   On ignore les dégradés (couvertures, bannières) et le trop transparent. */
const ILOTS = () => {
  const lum = (c) => {
    const m = c.match(/[\d.]+/g); if (!m) return null;
    if (m.length > 3 && parseFloat(m[3]) < 0.5) return null;
    const [r,g,b] = m.slice(0,3).map(Number);
    const f = v => { v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
  };
  const out = [];
  document.querySelectorAll('body *').forEach(el => {
    const r = el.getBoundingClientRect();
    if (r.width < 90 || r.height < 26) return;
    const st = getComputedStyle(el);
    if (st.display==='none' || st.visibility==='hidden' || +st.opacity < 0.2) return;
    if (/gradient|url\(/.test(st.backgroundImage)) return;
    const L = lum(st.backgroundColor);
    if (L === null || L < 0.55) return;
    if (el.parentElement) {                      // on ne garde que le plus haut de la chaîne
      const pl = lum(getComputedStyle(el.parentElement).backgroundColor);
      if (pl !== null && pl >= 0.55) return;
    }
    out.push(el.tagName.toLowerCase() + (el.className && typeof el.className==='string'
      ? '.'+el.className.trim().split(/\s+/)[0] : ''));
  });
  return out;
};

const PAGES = ['index.html','recherche.html','manga.html?id=1','bibliotheque.html','profil.html',
  'auteur.html?id=u1','communaute.html?id=u1','tutoriels.html','pack.html?id=1','espace-createur.html',
  'upload-manga.html','gestion-chapitres.html?manga_id=1','auth.html','404.html','admin.html',
  'cgu.html','confidentialite.html','mentions-legales.html','creators-remuneration.html'];

async function prepare(ctx) {
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'}));
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

// ── 1. Le réglage système est suivi par défaut ──
console.log('\n▶ Réglage par défaut : celui de l\'appareil');
for (const [scheme, attendu] of [['dark','dark'], ['light','light']]) {
  const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:scheme});
  await prepare(ctx);
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(500);
  check(`appareil en ${scheme} → thème ${attendu}`,
    await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))===attendu);
  await ctx.close();
}

// ── 2. Pas de flash blanc ──
/* Le seul moyen fiable d'éviter le flash est structurel : un <script>
   synchrone placé dans <head> s'exécute forcément avant que le navigateur
   ne peigne le moindre pixel de <body>. On vérifie donc l'invariant sur
   les 21 pages, plutôt que de courir après un instant de rendu. */
console.log('\n▶ Aucun flash clair au chargement');
{
  const fichiers = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
  const fautifs = [];
  for (const f of fichiers) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const head = src.slice(0, src.indexOf('</head>'));
    const balise = head.match(/<script[^>]*inkrise-theme\.js[^>]*>/);
    if (!balise) { fautifs.push(f + ' : absent du <head>'); continue; }
    if (/\basync\b|\bdefer\b/.test(balise[0])) fautifs.push(f + ' : async/defer → trop tard');
  }
  check(`le script de thème est synchrone en <head> sur les ${fichiers.length} pages`,
        fautifs.length === 0, fautifs.join(' ; '));

  const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
  await prepare(ctx);
  const p=await ctx.newPage();
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(400);
  const fond = await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  check('le fond de la page est bien sombre', !/255, 255, 255/.test(fond), fond);
  await ctx.close();
}

// ── 3. Le choix est mémorisé et le basculeur fonctionne ──
console.log('\n▶ Basculeur du menu latéral');
{
  const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:'light'});
  await prepare(ctx);
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(900);
  check('thème clair au départ',
    await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='light');
  check('le basculeur est dans le menu', await p.locator('#inkThemeRow').count()===1);
  check('trois choix proposés', await p.locator('.ink-theme-opt').count()===3);
  check('« Auto » est actif par défaut',
    await p.locator('.ink-theme-opt[data-valeur=auto]').getAttribute('aria-pressed')==='true');

  await p.evaluate(()=>document.querySelector('.ink-theme-opt[data-valeur=sombre]').click());
  await p.waitForTimeout(200);
  check('clic sur « Sombre » → la page passe en sombre',
    await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='dark');
  check('l\'état du bouton est annoncé',
    await p.locator('.ink-theme-opt[data-valeur=sombre]').getAttribute('aria-pressed')==='true');
  check('la couleur de barre système suit',
    await p.evaluate(()=>document.querySelector('meta[name="theme-color"]').content)==='#121016');

  // Mémorisation d'une page à l'autre
  await p.goto(BASE+'/recherche.html'); await p.waitForTimeout(600);
  check('le choix est conservé en changeant de page',
    await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='dark');

  await p.evaluate(()=>document.querySelector('.ink-theme-opt[data-valeur=clair]').click());
  await p.waitForTimeout(200);
  check('retour au clair possible malgré un appareil en clair',
    await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='light');
  await ctx.close();
}

// ── 4. Aucune zone restée claire ──
console.log('\n▶ Aucune zone claire au milieu d\'une page sombre');
{
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await ctx.addInitScript(()=>{ try{localStorage.setItem('inkrise_theme','sombre');}catch(e){} });
  await prepare(ctx);
  let fautives = 0;
  for (const pg of PAGES) {
    const p=await ctx.newPage();
    try {
      await p.goto(BASE+'/'+pg,{waitUntil:'load',timeout:20000});
      await p.waitForTimeout(900);
      const ilots = await p.evaluate(ILOTS);
      if (ilots.length) { fautives++; console.log('     ↳ '+pg+' : '+[...new Set(ilots)].join(', ')); }
    } catch(e) { fautives++; console.log('     ↳ '+pg+' : '+e.message.slice(0,50)); }
    await p.close();
  }
  check(`les ${PAGES.length} pages sont entièrement sombres`, fautives===0, fautives+' page(s) fautive(s)');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
