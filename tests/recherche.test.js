/* Filtres, tri et pagination de la recherche + contrôle des contrastes. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml' };
const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('404');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});
  res.end(fs.readFileSync(p));});

// 57 mangas : de quoi dépasser largement une page de 24
const GENRES = ['Action','Romance','Horreur'];
const TYPES  = ['manga','webtoon','bd'];
const ALL = Array.from({length:57}, (_,i) => ({
  id:i+1, titre:'Manga '+String(i+1).padStart(2,'0'), synopsis:'Synopsis '+(i+1),
  type:TYPES[i%2===0?0:1], statut:i%4===0?'termine':'en_cours', genres:[GENRES[i%3]],
  vues:(i*7)%100, langue:'fr', adulte:false, couverture_url:null,
  created_at:new Date(Date.now()-i*86400000).toISOString(), auteur_id:'u1'
}));

const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8104);
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

// Reproduit côté test le filtrage/tri/pagination attendu de PostgREST
function serve(url) {
  const u = new URL(url);
  const p = u.searchParams;
  let rows = ALL.filter(m => m.statut !== 'brouillon');
  const gp = p.get('genres');            // cs.{Action}
  if (gp) { const g = gp.replace(/^cs\.\{|\}$/g,''); rows = rows.filter(m => m.genres.includes(g)); }
  const tp = p.get('type');              // eq.manga
  if (tp) { const t = tp.replace(/^eq\./,''); rows = rows.filter(m => m.type === t); }
  const st = p.get('statut');            // neq.brouillon [&statut=eq.x]
  p.getAll('statut').forEach(v => {
    if (v.startsWith('eq.')) { const s = v.slice(3); rows = rows.filter(m => m.statut === s); }
  });
  const or = p.get('or');
  if (or) { const m2 = or.match(/titre\.ilike\.%([^%]*)%/);
            if (m2) rows = rows.filter(m => m.titre.toLowerCase().includes(m2[1].toLowerCase())); }
  const order = p.get('order') || '';
  if (order.startsWith('vues.desc'))       rows.sort((a,b)=>b.vues-a.vues);
  else if (order.startsWith('titre.asc'))  rows.sort((a,b)=>a.titre.localeCompare(b.titre));
  else                                     rows.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
  return rows;
}

(async () => {
  await new Promise(r => server.listen(Number(process.env.PORT) || 8104, r));
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const errors = [];
  const ctx = await browser.newContext({ viewport:{width:1280,height:1000} });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:401, body:'{}' }));
  await ctx.route('**/rest/v1/**', r => {
    const url = r.request().url();
    if (!url.includes('/mangas')) return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    const rows = serve(url);
    // supabase-js pagine par offset/limit, et le total ne traverse le CORS
    // que si Content-Range est explicitement exposé au script.
    const a = parseInt(new URL(url).searchParams.get('offset') || '0', 10);
    const lim = parseInt(new URL(url).searchParams.get('limit') || '24', 10);
    const page = rows.slice(a, a + lim);
    return r.fulfill({ status:206, contentType:'application/json',
      headers:{ 'Content-Range': `${a}-${a+page.length-1}/${rows.length}`,
                'Access-Control-Expose-Headers': 'Content-Range' },
      body: JSON.stringify(page) });
  });
  await ctx.route('**/storage/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));

  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));

  console.log('\n▶ Catalogue complet — pagination');
  await page.goto(BASE + '/recherche.html');
  await page.waitForTimeout(1500);
  const cards = () => page.locator('#mangaFeed .manga-feed-card').count();
  const settled = () => page.waitForSelector('#mangaFeed, .no-results', { timeout: 15000 });
  check('première page limitée à 24 titres', (await cards()) === 24, (await cards())+' cartes');
  check('le total réel est annoncé',
        (await page.locator('.section-count').first().innerText()).includes('57'),
        await page.locator('.section-count').first().innerText());
  check('compteur « affichés sur total »',
        (await page.locator('#filtersCount').innerText()).includes('24') &&
        (await page.locator('#filtersCount').innerText()).includes('57'),
        await page.locator('#filtersCount').innerText());
  check('bouton « Voir plus » proposé', await page.locator('#btnLoadMore').isVisible());
  await page.screenshot({ path: path.join(__dirname,'shot-12-recherche-filtres.png') });

  await page.locator('#btnLoadMore').click();
  await page.waitForTimeout(800);
  check('« Voir plus » ajoute la page suivante', (await cards()) === 48, (await cards())+' cartes');
  check('les premiers titres restent affichés',
        (await page.locator('#mangaFeed .manga-feed-title').first().innerText()).includes('Manga'));
  await page.locator('#btnLoadMore').click();
  await page.waitForTimeout(800);
  check('dernière page : les 57 titres sont là', (await cards()) === 57, (await cards())+' cartes');
  check('bouton retiré une fois tout chargé', (await page.locator('#btnLoadMore').count()) === 0);

  console.log('\n▶ Filtres');
  await page.locator('#filterGenre').selectOption('Horreur');
  await page.waitForURL(/genre=Horreur/, { timeout: 15000 });
  await settled();
  check('filtre genre appliqué', (await cards()) === ALL.filter(m=>m.genres.includes('Horreur')).length,
        (await cards())+' titres d\'horreur');
  check('filtre inscrit dans l\'URL (partageable)', page.url().includes('genre=Horreur'));
  check('sélecteur toujours positionné après rechargement',
        (await page.locator('#filterGenre').inputValue()) === 'Horreur');
  check('bouton Réinitialiser apparu', await page.locator('#btnResetFilters').isVisible());

  await page.locator('#filterType').selectOption('webtoon');
  await page.waitForURL(/type=webtoon/, { timeout: 15000 });
  await settled();
  const expect2 = ALL.filter(m=>m.genres.includes('Horreur') && m.type==='webtoon').length;
  check('deux filtres se cumulent', expect2 > 0 && (await cards()) === expect2,
        (await cards())+' vs '+expect2+' attendus');

  console.log('\n▶ Tri');
  await page.goto(BASE + '/recherche.html?tri=titre');
  await settled();
  const titles = await page.locator('#mangaFeed .manga-feed-title').allInnerTexts();
  check('tri alphabétique respecté',
        JSON.stringify(titles) === JSON.stringify([...titles].sort((a,b)=>a.localeCompare(b))),
        titles.slice(0,3).join(', '));
  await page.goto(BASE + '/recherche.html?tri=vues');
  await settled();
  const views = await page.locator('#mangaFeed .manga-feed-likes').allInnerTexts();
  const nums = views.map(v => parseInt(v.replace(/\D/g,''),10));
  check('tri par vues décroissant',
        nums.every((v,i) => i===0 || nums[i-1] >= v), nums.slice(0,5).join(' ≥ '));

  console.log('\n▶ Aucun résultat avec filtres');
  await page.goto(BASE + '/recherche.html?q=zzzintrouvable&genre=Action');
  await page.waitForTimeout(1500);
  check('message distingue « filtres trop stricts » de « catalogue vide »',
        (await page.locator('.no-results h2').innerText()).toLowerCase().includes('filtres'),
        await page.locator('.no-results h2').innerText());
  check('propose de relâcher les filtres',
        (await page.locator('.no-results .btn-retry').innerText()).toLowerCase().includes('réinitialiser'));

  console.log('\n▶ Contrastes du texte secondaire (rendu réel)');
  for (const f of ['recherche.html','index.html','bibliotheque.html','auth.html','404.html']) {
    await page.goto(BASE + '/' + f);
    await page.waitForTimeout(900);
    const worst = await page.evaluate(() => {
      const lin = v => { v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); };
      const lum = ([r,g,b]) => .2126*lin(r)+.7152*lin(g)+.0722*lin(b);
      let min = 99, sample = '';
      for (const el of document.querySelectorAll('body *')) {
        const t = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim().length>2);
        if (!t) continue;
        const st = getComputedStyle(el);
        if (st.visibility==='hidden' || st.display==='none' || +st.opacity < .5) continue;
        const fg = st.color.match(/[\d.]+/g).map(Number);
        if (fg[3] !== undefined && fg[3] < .5) continue;
        // Fond effectif : on empile les couches translucides jusqu'au premier
        // fond opaque. Un dégradé n'est pas mesurable de façon fiable → on
        // écarte l'élément plutôt que de rapporter un faux 1:1.
        let bg = null, stack = [], n = el, gradient = false;
        while (n && n !== document.documentElement) {
          const st2 = getComputedStyle(n);
          if (st2.backgroundImage && st2.backgroundImage !== 'none') { gradient = true; break; }
          const c = st2.backgroundColor.match(/[\d.]+/g);
          if (c) {
            const a = c[3] === undefined ? 1 : +c[3];
            if (a > 0) stack.push([c.slice(0,3).map(Number), a]);
            if (a >= 1) { bg = stack.pop()[0]; break; }
          }
          n = n.parentElement;
        }
        if (gradient) continue;
        if (!bg) bg = [255,255,255];
        for (let i = stack.length - 1; i >= 0; i--) {
          const [c2, a] = stack[i];
          bg = bg.map((v, k) => c2[k] * a + v * (1 - a));
        }
        const L1 = lum(fg.slice(0,3)), L2 = lum(bg);
        const c = (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
        const fs = parseFloat(st.fontSize), big = fs >= 24 || (fs >= 18.66 && +st.fontWeight >= 700);
        if (big) continue;
        if (c < min) { min = c; sample = el.tagName+'.'+(el.className||'').toString().slice(0,24)+' : '+st.color; }
      }
      return { min: Math.round(min*100)/100, sample };
    });
    check(`[${f}] plus faible contraste de texte ≥ 4,5:1`, worst.min >= 4.5,
          worst.min + ':1 — ' + worst.sample);
  }

  await browser.close(); server.close();
  console.log('\n' + '═'.repeat(60));
  const ko = results.filter(r=>!r.p);
  console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
  if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,140))); }
  if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':''))); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
