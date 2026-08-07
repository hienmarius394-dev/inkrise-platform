/* Réordonnancement au doigt, sélecteurs visuels âge/sens, accessibilité du menu. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2', '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json' };
const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('404');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});
  res.end(fs.readFileSync(p));});

const USER = { id:'u1', email:'c@x.fr', user_metadata:{ username:'Createur' } };
const MANGA = { id:1, titre:'Le Minerai', synopsis:'Syn', statut:'en_cours', type:'manga',
                sens_lecture:'rl', age_recommande:'12+', adulte:false, auteur_id:'u1',
                couverture_url:null, genres:['Action'] };
const CHAPS = [1,2,3].map(n => ({ id: 10+n, numero:n, titre:'Chapitre '+n, manga_id:1,
                                  created_at:new Date().toISOString() }));

const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8103);
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

async function authCtx(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), USER);
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...USER, aud:'authenticated' }) }));
  return ctx;
}

(async () => {
  await new Promise(r => server.listen(Number(process.env.PORT) || 8103, r));
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const errors = []; const patches = [];

  // ══ 1. Réordonner les chapitres au doigt (mobile, sans souris) ══
  console.log('\n▶ gestion-chapitres — réordonner au doigt, sans glisser-déposer');
  const ctx = await authCtx(browser, { viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = req.url();
    if (u.includes('/chapitres') && req.method() === 'PATCH') {
      patches.push(JSON.parse(req.postData()||'{}'));
      return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    }
    if (u.includes('/mangas')) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(MANGA) });
    if (u.includes('/chapitres')) return r.fulfill({ status:200, contentType:'application/json', body: JSON.stringify(CHAPS) });
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  await ctx.route('**/storage/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push('gestion-chapitres: '+e.message));
  await page.goto(BASE + '/gestion-chapitres.html?manga_id=1');
  await page.waitForTimeout(1600);

  const rows = () => page.$$eval('.chap-row .chap-title-display', els => els.map(e => e.textContent.trim()));
  check('ordre initial 1,2,3', JSON.stringify(await rows()) === JSON.stringify(['Chapitre 1','Chapitre 2','Chapitre 3']),
        (await rows()).join(' / '));
  check('boutons monter/descendre présents', (await page.locator('.order-btn').count()) === 6,
        (await page.locator('.order-btn').count()) + ' boutons');
  check('poignée de glissement masquée sur écran tactile',
        !(await page.locator('.drag-handle').first().isVisible()));
  check('cibles tactiles ≥ 44px', await page.evaluate(() => {
    const b = document.querySelector('.order-btn').getBoundingClientRect();
    return b.width >= 44;
  }), await page.evaluate(() => Math.round(document.querySelector('.order-btn').getBoundingClientRect().width)+'px'));
  check('« monter » désactivé sur le premier chapitre',
        await page.locator('.chap-row').first().locator('.order-btn.up').isDisabled());
  check('« descendre » désactivé sur le dernier',
        await page.locator('.chap-row').last().locator('.order-btn.down').isDisabled());

  // Descendre le chapitre 1 — au tap, comme sur un téléphone
  await page.locator('.chap-row').first().locator('.order-btn.down').tap();
  await page.waitForTimeout(700);
  check('après « descendre » → 2,1,3',
        JSON.stringify(await rows()) === JSON.stringify(['Chapitre 2','Chapitre 1','Chapitre 3']),
        (await rows()).join(' / '));
  check('nouvelle numérotation persistée', patches.length === 3,
        patches.length + ' enregistrements');
  check('focus conservé pour enchaîner les déplacements',
        await page.evaluate(() => document.activeElement.classList.contains('order-btn')));
  await page.screenshot({ path: path.join(__dirname,'shot-10-reordonner-mobile.png') });
  await ctx.close();

  // ══ 2. Sélecteurs visuels âge / sens ══
  console.log('\n▶ upload-manga — sélection visuelle du contenu plutôt qu\'un menu déroulant');
  const ctx2 = await authCtx(browser, { viewport:{width:900,height:1000} });
  await ctx2.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ id:'u1', username:'Createur', is_creator:true }) }));
  await ctx2.route('**/storage/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  const p2 = await ctx2.newPage();
  p2.on('pageerror', e => errors.push('upload-manga: '+e.message));
  await p2.goto(BASE + '/upload-manga.html');
  await p2.waitForTimeout(1500);

  check('plus de menu déroulant pour l\'âge', (await p2.locator('#inputAge').count()) === 0);
  check('4 cartes de classification', (await p2.locator('input[name="age"]').count()) === 4);
  check('2 cartes de sens de lecture', (await p2.locator('input[name="sens"]').count()) === 2);
  check('les choix décrivent le contenu, pas seulement l\'âge',
        (await p2.locator('.choice:has(input[value="12+"]) .choice-desc').innerText()).toLowerCase().includes('bagarres'));
  check('« tout public » sélectionné par défaut',
        await p2.locator('input[name="age"][value="tout_public"]').isChecked());
  check('carte sélectionnée visuellement distincte', await p2.evaluate(() => {
    const on  = document.querySelector('.choice:has(input[value="tout_public"])');
    const off = document.querySelector('.choice:has(input[value="18+"])');
    return getComputedStyle(on).borderColor !== getComputedStyle(off).borderColor;
  }));
  await p2.locator('.choice:has(input[value="16+"])').click();
  await p2.waitForTimeout(200);
  check('clic sur une carte → sélection', await p2.locator('input[name="age"][value="16+"]').isChecked());
  check('valeur relue par le code de publication',
        (await p2.evaluate(() => getChoice('age'))) === '16+');
  check('le type de projet ajuste le sens automatiquement', await p2.evaluate(() => {
    const t = document.getElementById('inputType');
    t.value = 'webtoon'; t.dispatchEvent(new Event('change'));
    return getChoice('sens') === 'lr';
  }));
  check('navigable au clavier (vrais boutons radio)', await p2.evaluate(() => {
    const r = document.querySelector('input[name="age"][value="18+"]');
    r.focus(); return document.activeElement === r;
  }));
  await p2.locator('.choice-grid').first().scrollIntoViewIfNeeded();
  await p2.screenshot({ path: path.join(__dirname,'shot-11-selection-age.png'), fullPage:false });
  await ctx2.close();

  // ══ 3. Accessibilité du menu latéral, sur des pages à ordre de script différent ══
  console.log('\n▶ Menu latéral — accessibilité (pages à ordre de scripts différent)');
  for (const [file, label] of [['index.html','index (nav.js avant openDrawer)'],
                               ['auth.html','auth (openDrawer avant nav.js)']]) {
    const c = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
    await c.route('**/rest/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
    await c.route('**/auth/v1/**', r => r.fulfill({ status:401, body:'{}' }));
    await c.route('**/storage/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
    const pg = await c.newPage();
    pg.on('pageerror', e => errors.push(file+': '+e.message));
    await pg.goto(BASE + '/' + file);
    await pg.waitForTimeout(1400);

    const hbg = pg.locator('.univ-nav-hbg').first();
    check(`[${label}] menu annoncé comme dialogue`,
          (await pg.locator('#univDrawer').getAttribute('role')) === 'dialog');
    check(`[${label}] bouton menu : état fermé annoncé`,
          (await hbg.getAttribute('aria-expanded')) === 'false');
    await hbg.click();
    await pg.waitForTimeout(400);
    check(`[${label}] état ouvert annoncé`, (await hbg.getAttribute('aria-expanded')) === 'true');
    check(`[${label}] focus déplacé dans le menu`, await pg.evaluate(() =>
      document.getElementById('univDrawer').contains(document.activeElement)));
    await pg.keyboard.press('Escape');
    await pg.waitForTimeout(400);
    check(`[${label}] Échap referme le menu`,
          !(await pg.locator('#univDrawer').evaluate(e => e.classList.contains('open'))));
    check(`[${label}] focus rendu au bouton menu`, await pg.evaluate(() =>
      document.activeElement.classList.contains('univ-nav-hbg')));
    check(`[${label}] liens légaux lisibles (contraste)`, await pg.evaluate(() => {
      const a = document.querySelector('#univDrawer a[href="cgu.html"]');
      if (!a) return false;
      const m = getComputedStyle(a).color.match(/\d+/g).map(Number);
      const lin = v => { v /= 255; return v <= .03928 ? v/12.92 : Math.pow((v+.055)/1.055, 2.4); };
      const L = .2126*lin(m[0]) + .7152*lin(m[1]) + .0722*lin(m[2]);
      return (1.05 / (L + .05)) >= 4.5;
    }));
    await c.close();
  }

  /* ══ 4. Les commandes qu'on TAPE font au moins 32px ══
     Relevé par outil-chasse, puis figé ici pour qu'il ne revienne pas.
     Il a fallu DÉPLIER les onglets et les modales pour les voir : ce qui
     est en `display:none` sort de toute mesure, et c'est ainsi que le
     bouton ✕ des modales — la sortie de secours d'une fenêtre — est resté
     à 28×28 sans que rien ne le signale.

     Les liens de TEXTE EN LIGNE sont hors de portée : un lien dans une
     phrase ou un pied de page a la hauteur de sa ligne, et l'agrandir
     reviendrait à réécrire la mise en page. Ce sont les BOUTONS et les
     pastilles cliquables qui doivent tenir sous un doigt. */
  console.log('\n▶ Les commandes se tapent au doigt (32px minimum)');
  {
    const PAGES_TACTILES = ['profil.html', 'manga.html?id=1', 'bibliotheque.html',
                            'recherche.html', 'index.html'];
    const c = await authCtx(browser, { viewport:{ width:390, height:844 },
                                       hasTouch:true, isMobile:true });
    await c.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
    await c.route('**/rest/v1/**', r => {
      const req = r.request(), u = decodeURIComponent(req.url());
      const seul = (req.headers()['accept']||'').includes('vnd.pgrst.object');
      if (u.includes('/profiles')) {
        const moi = { id:'u1', username:'Createur', bio:'', avatar_url:null,
                      is_creator:true, created_at:'2026-01-05T10:00:00Z' };
        return r.fulfill({status:200,contentType:'application/json',
          headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
          body: JSON.stringify(seul ? moi : [moi])});
      }
      return r.fulfill({status:200,contentType:'application/json',
        headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'});
    });
    await c.route('**/storage/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));

    const trop_petites = [];
    for (const url of PAGES_TACTILES) {
      const pg = await c.newPage();
      pg.on('pageerror', e => errors.push(e.message));
      await pg.goto(BASE + '/' + url, { waitUntil:'load' }).catch(()=>{});
      await pg.waitForTimeout(1600);
      await pg.evaluate(() => {
        document.querySelectorAll('.tab-panel').forEach(e => e.classList.add('active'));
        document.querySelectorAll('.modal-overlay, .crop-overlay, .confirm-overlay')
          .forEach(e => e.classList.add('open'));
        document.querySelectorAll('[id^="view"], [id^="formations"], [id^="section-"]')
          .forEach(e => { if (e.style.display === 'none') e.style.display = 'block'; });
      });
      await pg.waitForTimeout(350);
      const petites = await pg.evaluate(() =>
        [...document.querySelectorAll('button, [role="button"], a.btn-upload, a.btn-creator')]
          .filter(el => {
            const st = getComputedStyle(el);
            if (st.display === 'none' || st.visibility === 'hidden') return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && (r.width < 32 || r.height < 32);
          })
          .map(el => { const r = el.getBoundingClientRect();
            return Math.round(r.width) + '×' + Math.round(r.height) + ' « ' +
              (el.getAttribute('aria-label') || el.title || el.textContent || '').trim().slice(0,20) + ' »'; }));
      petites.forEach(x => trop_petites.push(url + ' : ' + x));
      await pg.close();
    }
    check(`aucun bouton sous 32px sur ${PAGES_TACTILES.length} pages, tout déplié`,
      trop_petites.length === 0, trop_petites.slice(0, 5).join(' · ') || 'aucun');
    await c.close();
  }

  await browser.close(); server.close();
  console.log('\n' + '═'.repeat(60));
  const ko = results.filter(r => !r.p);
  console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
  if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,150))); }
  if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r=>console.log('   - '+r.n)); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
