/* Vérifie que le créateur peut corriger sens de lecture + classification d'âge
   après publication (gestion-chapitres.html), et le rendu bureau du lecteur. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2', '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml' };
const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('404');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});
  res.end(fs.readFileSync(p));});

const USER = { id: 'u1', email: 'c@x.fr', user_metadata: { username: 'Créateur' } };
const MANGA = { id: 1, titre: 'Le Minerai', synopsis: 'Syn', statut: 'en_cours',
                type: 'manga', sens_lecture: 'rl', age_recommande: '12+', adulte: false,
                auteur_id: 'u1', couverture_url: null, genres: ['Action'] };

const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8102);
const results = []; const check = (n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

(async () => {
  await new Promise(r => server.listen(Number(process.env.PORT) || 8102, r));
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const errors = []; let patchBody = null;

  // ── gestion-chapitres : modale d'édition ──
  console.log('\n▶ gestion-chapitres.html — corriger sens de lecture + âge après publication');
  const ctx = await browser.newContext({ viewport: { width: 900, height: 900 } });
  await ctx.addInitScript(u => {
    // Session Supabase factice pour passer le contrôle d'auteur
    localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token', JSON.stringify({
      access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u }));
  }, USER);
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...USER, aud:'authenticated' }) }));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = req.url(), m = req.method();
    if (u.includes('/mangas') && m === 'PATCH') {
      patchBody = JSON.parse(req.postData() || '{}');
      return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    }
    if (u.includes('/mangas')) return r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify(MANGA) });
    if (u.includes('/chapitres')) return r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify([{ id:10, numero:1, titre:'Ouverture', manga_id:1, created_at:new Date().toISOString() }]) });
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  await ctx.route('**/storage/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));

  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('gestion-chapitres: ' + e.message));
  await page.goto(BASE + '/gestion-chapitres.html?manga_id=1');
  await page.waitForTimeout(1800);

  // ── Aperçus : voir son manga pendant qu'on le modifie ──
  check('bouton « Aperçu » sur la fiche manga', await page.locator('#btnPreviewManga').isVisible());
  check('l\'aperçu pointe vers la fiche publique',
        (await page.locator('#btnPreviewManga').getAttribute('href')) === 'manga.html?id=1',
        await page.locator('#btnPreviewManga').getAttribute('href'));
  check('l\'aperçu s\'ouvre à côté (le travail en cours n\'est pas perdu)',
        (await page.locator('#btnPreviewManga').getAttribute('target')) === '_blank');
  /* Le menu latéral ignorait la session : il proposait « Connexion /
     Inscription » sur une page qui exige justement d'être connecté, et
     n'offrait ni profil, ni paramètres, ni sortie. */
  const vu = id => page.locator('#' + id).isVisible();
  check('le menu sait qu\'on est connecté : plus d\'invite à se connecter', !(await vu('drawerConnexion')));
  check('  « Mon profil » est proposé', await vu('drawerProfil'));
  check('  « Paramètres » aussi', await vu('drawerParametres'));
  check('  et « Déconnexion »', await vu('drawerLogout'));
  check('la cloche de notifications est visible', await vu('navNotifLink'));
  check('l\'avatar remplace le bouton Connexion',
        (await vu('navAvatar')) && !(await vu('navConnexion')));

  const prev = page.locator('.chap-row .chap-btn.preview').first();
  check('bouton « Aperçu » sur chaque chapitre', await prev.isVisible());
  check('l\'aperçu chapitre ouvre le lecteur au bon chapitre',
        (await prev.getAttribute('href')) === 'lecteur.html?manga_id=1&chapitre=10',
        await prev.getAttribute('href'));

  await page.locator('#btnEditManga').click();
  await page.waitForTimeout(500);
  check('cartes de sens de lecture présentes dans la modale',
        (await page.locator('input[name="editSens"]').count()) === 2);
  check('cartes de classification présentes dans la modale',
        (await page.locator('input[name="editAge"]').count()) === 4);
  check('sens de lecture pré-coché depuis le manga (rl)',
        await page.locator('input[name="editSens"][value="rl"]').isChecked());
  check('âge pré-coché depuis le manga (12+)',
        await page.locator('input[name="editAge"][value="12+"]').isChecked());
  await page.screenshot({ path: path.join(__dirname, 'shot-7-edition-manga.png') });

  // On corrige : passage en BD gauche→droite et en 18+
  await page.locator('.choice:has(input[name="editSens"][value="lr"])').click();
  await page.locator('.choice:has(input[name="editAge"][value="18+"])').click();
  await page.locator('#btnSaveEditManga').click();
  await page.waitForTimeout(900);
  check('sens de lecture enregistré', patchBody && patchBody.sens_lecture === 'lr',
        patchBody ? 'sens_lecture=' + patchBody.sens_lecture : 'aucun enregistrement');
  check('classification enregistrée', patchBody && patchBody.age_recommande === '18+',
        patchBody ? 'age_recommande=' + patchBody.age_recommande : '—');
  check('drapeau `adulte` recalculé depuis la classification',
        patchBody && patchBody.adulte === true, patchBody ? 'adulte=' + patchBody.adulte : '—');
  await ctx.close();

  // ── lecteur : rendu bureau + réglage de largeur ──
  console.log('\n▶ lecteur.html — rendu bureau et réglage de largeur en vertical');
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await ctx2.route('**/auth/v1/**', r => r.fulfill({ status:401, body:'{}' }));
  await ctx2.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (u.includes('/mangas')) return r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ ...MANGA, age_recommande:'tout_public', sens_lecture:'lr', commentaires_actifs:false }) });
    if (u.includes('/chapitres')) return r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify([{ id:10, numero:1, titre:'Ouverture', manga_id:1 }]) });
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  await ctx2.route('**/storage/v1/object/list/**', r => r.fulfill({ status:200,
    contentType:'application/json',
    body: JSON.stringify(Array.from({length:6},(_,i)=>({ name:String(i+1).padStart(2,'0')+'.jpg' }))) }));
  await ctx2.route('**/storage/v1/object/public/**', r => {
    const m = r.request().url().match(/(\d+)\.jpg/); const n = m ? +m[1] : 0;
    return r.fulfill({ status:200, contentType:'image/svg+xml',
      body:`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1150"><rect width="100%" height="100%" fill="#${n%2?'f4f2ff':'fff2f7'}"/><text x="400" y="600" font-size="200" font-family="sans-serif" font-weight="bold" text-anchor="middle" fill="#4a3f8f">P${n}</text></svg>` });
  });
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push('lecteur: ' + e.message));
  await p2.goto(BASE + '/lecteur.html?manga_id=1&chapitre=10');
  await p2.waitForTimeout(1800);
  check('lecture verticale continue sur bureau aussi', await p2.evaluate(() => {
    const im = [...document.querySelectorAll('.scroll-page')];
    return im.length > 1 && im.slice(1).every((el,i) =>
      Math.abs(el.getBoundingClientRect().top - im[i].getBoundingClientRect().bottom) <= 1);
  }));
  await p2.screenshot({ path: path.join(__dirname, 'shot-8-bureau-vertical.png') });

  const w0 = await p2.evaluate(() => document.getElementById('scrollViewer').getBoundingClientRect().width);
  await p2.evaluate(() => adjustScrollWidth(-30));
  await p2.waitForTimeout(500);
  const w1 = await p2.evaluate(() => document.getElementById('scrollViewer').getBoundingClientRect().width);
  check('réglage de largeur toujours opérant', w1 < w0 - 10, Math.round(w0)+'px → '+Math.round(w1)+'px');
  check('colonne rétrécie toujours jointive', await p2.evaluate(() => {
    const im = [...document.querySelectorAll('.scroll-page')];
    return im.slice(1).every((el,i) =>
      Math.abs(el.getBoundingClientRect().top - im[i].getBoundingClientRect().bottom) <= 1);
  }));
  await p2.screenshot({ path: path.join(__dirname, 'shot-9-largeur-reduite.png') });
  await ctx2.close();

  await browser.close(); server.close();
  console.log('\n' + '═'.repeat(58));
  const ko = results.filter(r => !r.p);
  console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
  if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,140))); }
  if (ko.length) process.exit(1);
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
