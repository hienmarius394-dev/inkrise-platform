/* Thème clair / sombre : mémorisation, suivi du réglage système, absence
   de flash blanc, basculeur du menu latéral, et surtout — aucune zone
   restée claire au milieu d'une page sombre. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8114;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

/* Tout ce qui est REPLIÉ n'est pas mesuré : `display:none` fait sortir de
   la sonde. Or `profil.html` a sept onglets dont un seul est affiché, et
   chaque page cache ses modales au repos. On dépliait donc un septième
   du profil en croyant l'avoir vu en entier — une carte blanche laissée
   dans l'onglet « Mon compte » passait inaperçue. */
const DEPLIER = () => {
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('active'));
  document.querySelectorAll('.modal-overlay, .crop-overlay, .confirm-overlay')
    .forEach(m => m.classList.add('open'));
  const d = document.getElementById('univDrawer');
  if (d) d.classList.add('open');
  /* Les sous-vues masquées en style direct (Suivis / Abonnés, sections
     de formations…) : on les rouvre aussi. */
  document.querySelectorAll('[id^="view"], [id^="formations"], [id^="section-"]')
    .forEach(e => { if (e.style.display === 'none') e.style.display = 'block'; });
};

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

/* `lecteur.html` manquait à cette liste — la page centrale d'un site de
   lecture de mangas. Six de ses panneaux étaient restés en blanc figé. */
const PAGES = ['index.html','recherche.html','manga.html?id=1','bibliotheque.html','profil.html',
  'lecteur.html?manga_id=1&chapitre=10',
  'auteur.html?id=u1','communaute.html?id=u1','communaute.html','tutoriels.html','pack.html?id=1','espace-createur.html',
  'upload-manga.html','gestion-chapitres.html?manga_id=1','auth.html','404.html','admin.html',
  'cgu.html','confidentialite.html','mentions-legales.html','creators-remuneration.html'];

async function prepare(ctx) {
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'}));
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
}

/* Le balayage des zones claires tournait DÉCONNECTÉ : sept des vingt
   pages renvoient alors vers auth.html, qui était donc mesurée sept fois
   pendant que le compteur annonçait « les 20 pages sont entièrement
   sombres ». Le même angle mort que celui relevé sur l'outil de
   contraste — et il faut le refermer ici aussi. */
const U = { id:'u1', email:'m@x.fr', aud:'authenticated',
            user_metadata:{ username:'Marius' } };
const PROFIL = { id:'u1', username:'Marius', bio:'Dessinateur', avatar_url:null,
                 is_creator:true, created_at:'2026-01-05T10:00:00Z' };

async function prepareConnecte(ctx) {
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(U)}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    if (u.includes('/profiles')) return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul?PROFIL:[PROFIL])});
    if (u.includes('/mangas')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(seul ? { id:1, titre:'Darkworld', type:'manga', sens_lecture:'rl',
        age_recommande:'tout_public', commentaires_actifs:true, auteur_id:'u1' } : [])});
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{ id:10, numero:1, titre:'Ouverture', manga_id:1 }])});
    return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

// ── 1. Le clair est le défaut, quel que soit l'appareil ──
/* Le clair est l'apparence de référence d'Inkrise : quelqu'un dont le
   téléphone est en sombre doit quand même découvrir le site en clair.
   Le mode « Auto » reste disponible, mais il se choisit. */
console.log('\n▶ Le clair par défaut, même sur un appareil en sombre');
for (const scheme of ['dark','light']) {
  const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:scheme});
  await prepare(ctx);
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(500);
  check(`appareil en ${scheme} → le site reste clair`,
    await p.evaluate(()=>document.documentElement.getAttribute('data-theme'))==='light');
  await ctx.close();
}

// ── 1bis. « Auto » suit bien l'appareil, une fois choisi ──
console.log('\n▶ « Auto », une fois choisi, suit l\'appareil');
for (const [scheme, attendu] of [['dark','dark'], ['light','light']]) {
  const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:scheme});
  await ctx.addInitScript(()=>{ try{localStorage.setItem('inkrise_theme','auto');}catch(e){} });
  await prepare(ctx);
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(500);
  check(`auto + appareil en ${scheme} → thème ${attendu}`,
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

  // Le sombre se choisit désormais : un appareil en sombre ne suffit plus.
  const ctx=await b.newContext({viewport:{width:390,height:844},colorScheme:'dark'});
  await ctx.addInitScript(()=>{ try{localStorage.setItem('inkrise_theme','sombre');}catch(e){} });
  await prepare(ctx);
  const p=await ctx.newPage();
  await p.goto(BASE+'/index.html'); await p.waitForTimeout(400);
  const fond = await p.evaluate(()=>getComputedStyle(document.body).backgroundColor);
  check('sombre choisi → le fond est bien sombre', !/255, 255, 255/.test(fond), fond);
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
  check('« Clair » est actif par défaut',
    await p.locator('.ink-theme-opt[data-valeur=clair]').getAttribute('aria-pressed')==='true');

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
  /* `auth.html` ne s'affiche QUE déconnectée : avec une session elle
     renvoie vers l'accueil. Elle a donc son propre contexte. */
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await ctx.addInitScript(()=>{ try{localStorage.setItem('inkrise_theme','sombre');}catch(e){} });
  await prepareConnecte(ctx);
  const ctxAnon=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  await ctxAnon.addInitScript(()=>{ try{localStorage.setItem('inkrise_theme','sombre');}catch(e){} });
  await prepare(ctxAnon);

  let fautives = 0, detournees = [];
  for (const pg of PAGES) {
    const p = await (pg.startsWith('auth.html') ? ctxAnon : ctx).newPage();
    try {
      await p.goto(BASE+'/'+pg,{waitUntil:'load',timeout:20000});
      await p.waitForTimeout(900);
      /* Sans ce contrôle, une page qui redirige est mesurée sous le nom
         d'une autre — et le compteur annonce des pages jamais vues. */
      if (!p.url().includes('/' + pg.split('?')[0])) {
        detournees.push(pg + ' → ' + p.url().split('/').pop().slice(0, 32));
        await p.close(); continue;
      }
      await p.evaluate(DEPLIER);
      await p.waitForTimeout(200);
      const ilots = await p.evaluate(ILOTS);
      if (ilots.length) { fautives++; console.log('     ↳ '+pg+' : '+[...new Set(ilots)].join(', ')); }
    } catch(e) { fautives++; console.log('     ↳ '+pg+' : '+e.message.slice(0,50)); }
    await p.close();
  }
  if (detournees.length) console.log('     ⚠️  non mesurées : ' + detournees.join(' · '));
  check(`les ${PAGES.length - detournees.length} pages atteintes sont entièrement sombres`,
    fautives===0, fautives+' page(s) fautive(s)');
  check('  et une seule page échappe à la mesure (la redirection connue)',
    detournees.length <= 1, detournees.join(' · ') || 'aucune');
  await ctx.close(); await ctxAnon.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
