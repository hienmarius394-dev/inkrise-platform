/* Banc d'essai du lecteur Inkrise.
   Sert le dépôt en local et simule les réponses Supabase pour piloter la vraie
   page (écrans d'avant-lecture, mode horizontal, bandeau de pages, glissement). */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const OUT = __dirname;

const MIME = {'.woff2':'font/woff2', '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png' };

// ── serveur statique ──
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
    res.writeHead(404); return res.end('404');
  }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  res.end(fs.readFileSync(p));
});

const PAGE_COUNT = 8;
const pageSvg = n => `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1150">
  <rect width="100%" height="100%" fill="#${n % 2 ? 'eef0fb' : 'fbeef4'}"/>
  <text x="400" y="575" font-size="180" font-family="sans-serif" font-weight="bold"
        text-anchor="middle" fill="#4a3f8f">P${n}</text></svg>`;

// Jeux de données : un manga japonais classé 16+, un comics tout public
const FIXTURES = {
  rl16: { id: 1, titre: 'Le Minerai d’Amarite', type: 'manga', sens_lecture: 'rl',
          age_recommande: '16+', commentaires_actifs: true, auteur_id: 'a1' },
  lrTP: { id: 2, titre: 'Comics Test', type: 'bd', sens_lecture: 'lr',
          age_recommande: 'tout_public', commentaires_actifs: true, auteur_id: 'a1' },
};

async function route(ctx, manga) {
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status: 401, body: '{}' }));

  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (u.includes('/mangas')) return r.fulfill({ status: 200, contentType: 'application/json',
      headers: { 'Content-Range': '0-0/1' }, body: JSON.stringify(manga) });
    if (u.includes('/chapitres')) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([
        { id: 10, numero: 1, titre: 'Ouverture', manga_id: manga.id },
        { id: 11, numero: 2, titre: 'Suite',     manga_id: manga.id }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  await ctx.route('**/storage/v1/object/list/**', r => r.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify(Array.from({ length: PAGE_COUNT }, (_, i) =>
      ({ name: String(i + 1).padStart(2, '0') + '.jpg', id: 'f' + i }))) }));

  await ctx.route('**/storage/v1/object/public/**', r => {
    const m = r.request().url().match(/(\d+)\.jpg/);
    return r.fulfill({ status: 200, contentType: 'image/svg+xml',
                       body: pageSvg(m ? parseInt(m[1], 10) : 0) });
  });
}

// Glissement tactile : le handler lit e.touches[0].clientX, des TouchEvent
// synthétiques suffisent donc à reproduire fidèlement le geste.
async function swipe(page, dx) {
  await page.evaluate(async (dx) => {
    const el = document.getElementById('pagesViewer');
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2, x0 = r.left + r.width / 2;
    const mk = (t, x) => new TouchEvent(t, { bubbles: true, cancelable: true,
      touches: t === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })] });
    el.dispatchEvent(mk('touchstart', x0));
    for (let i = 1; i <= 4; i++) {
      el.dispatchEvent(mk('touchmove', x0 + (dx * i) / 4));
      await new Promise(r => setTimeout(r, 12));
    }
    el.dispatchEvent(mk('touchend', x0 + dx));
  }, dx);
  await page.waitForTimeout(250);
}

const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8101);
const results = [];
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '  ✅' : '  ❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

(async () => {
  await new Promise(r => server.listen(Number(process.env.PORT) || 8101, r));
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const errors = [];

  // ══ Scénario 1 : manga japonais classé 16+ (mobile) ══
  console.log('\n▶ Scénario 1 — manga droite→gauche, classé 16+ (mobile 390×844)');
  let ctx = await browser.newContext({ viewport: { width: 390, height: 844 },
                                       hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  await route(ctx, FIXTURES.rl16);
  let page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/lecteur.html?manga_id=1&chapitre=10');
  await page.waitForTimeout(1200);

  const warn = page.locator('#gateWarning');
  check('écran Avertissements affiché', await warn.isVisible());
  check('badge d\'âge = 16', (await page.locator('#gateWarningBadges .age-badge').innerText()).includes('16'));
  check('bouton Annuler renvoie vers la fiche manga',
        (await page.locator('#gateWarningCancel').getAttribute('href')) === 'manga.html?id=1');
  check('le lecteur est bien bloqué derrière l\'écran',
        await page.evaluate(() => getComputedStyle(document.body).overflow === 'hidden'));
  await page.screenshot({ path: path.join(OUT, 'shot-1-avertissements.png') });

  await page.locator('#gateWarningOk').click();
  await page.waitForTimeout(400);
  const dir = page.locator('#gateDirection');
  check('écran Sens de lecture affiché ensuite', await dir.isVisible());
  check('écran Avertissements refermé', !(await warn.isVisible()));
  await page.screenshot({ path: path.join(OUT, 'shot-2-sens-lecture.png') });

  await page.locator('#gateDirectionOk').click();
  await page.waitForTimeout(600);
  check('les deux écrans refermés, lecture accessible',
        !(await warn.isVisible()) && !(await dir.isVisible()));
  check('défilement de la page rendu au lecteur',
        await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'));
  check('mode vertical par défaut',
        await page.locator('#btnModeScroll').evaluate(e => e.classList.contains('active')));
  check('8 planches rendues en vertical',
        (await page.locator('.scroll-page').count()) === PAGE_COUNT,
        (await page.locator('.scroll-page').count()) + ' planches');

  // ── nav du bas masquée + lecture verticale continue ──
  check('nav du bas absente pendant la lecture',
        (await page.locator('.univ-bnav').count()) === 0);
  check('planches verticales jointives (aucun trou entre elles)', await page.evaluate(() => {
    const im = [...document.querySelectorAll('.scroll-page')];
    if (im.length < 2) return false;
    return im.slice(1).every((el, i) =>
      Math.abs(el.getBoundingClientRect().top - im[i].getBoundingClientRect().bottom) <= 1);
  }));
  check('aucun coin arrondi ni ombre par planche', await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector('.scroll-page'));
    return s.borderTopLeftRadius === '0px' && s.boxShadow === 'none';
  }));
  check('arrondi porté par la colonne entière', await page.evaluate(() => {
    const s = getComputedStyle(document.getElementById('scrollViewer'));
    return s.borderTopLeftRadius !== '0px' && s.overflow === 'hidden';
  }));
  await page.screenshot({ path: path.join(OUT, 'shot-3-vertical.png') });

  // ── bascule en horizontal ──
  console.log('\n▶ Mode horizontal + bandeau de pages');
  await page.locator('#btnModePage').click();
  await page.waitForTimeout(600);
  check('bouton Horizontal actif',
        await page.locator('#btnModePage').evaluate(e => e.classList.contains('active')));
  check('aria-pressed cohérent',
        (await page.locator('#btnModePage').getAttribute('aria-pressed')) === 'true' &&
        (await page.locator('#btnModeScroll').getAttribute('aria-pressed')) === 'false');
  const strip = page.locator('#pageStrip');
  check('bandeau de pages visible', await strip.isVisible());
  check('bandeau en sens japonais (droite→gauche)',
        await strip.evaluate(e => e.classList.contains('rtl')));
  check('bandeau : 8 vignettes', (await page.locator('#pageStrip .strip-item').count()) === PAGE_COUNT);
  check('vignette 1 marquée courante',
        await page.locator('#pageStrip .strip-item[data-i="0"]').evaluate(e => e.classList.contains('current')));
  check('la planche n\'est pas masquée par le bandeau', await page.evaluate(() => {
    const img = document.getElementById('pageImg').getBoundingClientRect();
    const s = document.getElementById('pageStrip').getBoundingClientRect();
    return img.bottom <= s.top + 1;
  }));

  // ── topbar : rien ne doit déborder ni se chevaucher ──
  check('topbar sans débordement horizontal', await page.evaluate(() => {
    const t = document.getElementById('topbar');
    return t.scrollWidth <= t.clientWidth + 1;
  }), await page.evaluate(() => { const t = document.getElementById('topbar');
    return t.scrollWidth + 'px de contenu pour ' + t.clientWidth + 'px'; }));
  check('bouton retour non recouvert par le sélecteur de mode', await page.evaluate(() => {
    const a = document.getElementById('btnBack').getBoundingClientRect();
    const b = document.getElementById('modeToggle').getBoundingClientRect();
    return a.right <= b.left + 1;
  }));
  check('page sans défilement horizontal', await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1));
  // ── Les flèches latérales ne doivent pas rester sur le dessin ──
  check('flèches montrées brièvement à l\'ouverture',
        await page.evaluate(() => document.getElementById('pagesViewer').classList.contains('zones-visible')));
  const zoneOpacity = () => page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.click-zone')).opacity));
  check('flèches visibles pendant l\'indice', (await zoneOpacity()) > 0.5);
  await page.waitForTimeout(2600);
  check('flèches effacées ensuite, planche dégagée', (await zoneOpacity()) < 0.05,
        'opacité ' + (await zoneOpacity()));
  check('les zones restent tapables une fois les flèches parties',
        await page.evaluate(() => getComputedStyle(document.querySelector('.click-zone')).pointerEvents !== 'none'));
  const p0 = await page.locator('#pageNum').innerText();
  await page.locator('.click-zone.left').click();
  await page.waitForTimeout(300);
  check('taper la zone gauche tourne quand même la page',
        (await page.locator('#pageNum').innerText()) !== p0,
        p0 + ' → ' + (await page.locator('#pageNum').innerText()));
  // Ce test a tourné une page : on revient au début pour ne pas fausser
  // les vérifications de glissement qui suivent.
  await page.evaluate(() => showPage(0));
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, 'shot-4-horizontal.png') });

  // ── glissement tactile ──
  console.log('\n▶ Glissement tactile (sens japonais : vers la droite = page suivante)');
  const num = () => page.locator('#pageNum').innerText();
  check('départ page 1', (await num()) === '1');
  await swipe(page, 120);
  check('glisser vers la DROITE → page 2', (await num()) === '2', 'page ' + (await num()));
  await swipe(page, 120);
  check('encore à droite → page 3', (await num()) === '3', 'page ' + (await num()));
  await swipe(page, -120);
  check('glisser vers la GAUCHE → retour page 2', (await num()) === '2', 'page ' + (await num()));
  check('bandeau suit la page courante',
        await page.locator('#pageStrip .strip-item[data-i="1"]').evaluate(e => e.classList.contains('current')));
  check('l\'interface n\'a pas clignoté pendant les glissements',
        await page.locator('#topbar').isVisible());
  await page.screenshot({ path: path.join(OUT, 'shot-5-apres-swipe.png') });

  // ── clic sur le bandeau ──
  await page.locator('#pageStrip .strip-item[data-i="6"]').click();
  await page.waitForTimeout(300);
  check('clic sur la vignette 7 → page 7', (await num()) === '7', 'page ' + (await num()));

  // ── clavier ──
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(250);
  check('flèche GAUCHE avance en sens japonais → page 8', (await num()) === '8', 'page ' + (await num()));

  // ── persistance du mode ──
  await page.goto(BASE + '/lecteur.html?manga_id=1&chapitre=11');
  await page.waitForTimeout(1200);
  check('écrans non re-affichés sur le chapitre suivant (même session)',
        !(await page.locator('#gateWarning').isVisible()) && !(await page.locator('#gateDirection').isVisible()));
  check('mode horizontal conservé d\'un chapitre à l\'autre',
        await page.locator('#btnModePage').evaluate(e => e.classList.contains('active')));
  await ctx.close();

  // ══ Scénario 2 : comics gauche→droite, tout public ══
  console.log('\n▶ Scénario 2 — comics gauche→droite, tout public (aucun écran attendu)');
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await route(ctx, FIXTURES.lrTP);
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/lecteur.html?manga_id=2&chapitre=10');
  await page.waitForTimeout(1400);
  check('aucun écran d\'avertissement (tout public)', !(await page.locator('#gateWarning').isVisible()));
  check('aucun écran de sens (lecture gauche→droite)', !(await page.locator('#gateDirection').isVisible()));
  check('lecture immédiatement accessible',
        await page.evaluate(() => getComputedStyle(document.body).overflow !== 'hidden'));

  await page.locator('#btnModePage').click();
  await page.waitForTimeout(600);
  check('bandeau en sens occidental (gauche→droite)',
        await page.locator('#pageStrip').evaluate(e => !e.classList.contains('rtl')));
  await swipe(page, -120);
  check('sens BD : glisser vers la GAUCHE → page 2',
        (await page.locator('#pageNum').innerText()) === '2',
        'page ' + (await page.locator('#pageNum').innerText()));
  await page.screenshot({ path: path.join(OUT, 'shot-6-comics-lr.png') });
  await ctx.close();

  // ══ Scénario 3 : schéma sans age_recommande (repli) ══
  console.log('\n▶ Scénario 3 — colonne age_recommande absente du schéma (repli)');
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status: 401, body: '{}' }));
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (u.includes('/mangas')) {
      if (u.includes('age_recommande')) return r.fulfill({ status: 400, contentType: 'application/json',
        body: JSON.stringify({ code: '42703', message: 'column mangas.age_recommande does not exist' }) });
      const { age_recommande, ...slim } = FIXTURES.rl16;
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(slim) });
    }
    if (u.includes('/chapitres')) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 10, numero: 1, titre: 'Ouverture', manga_id: 1 }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await ctx.route('**/storage/v1/object/list/**', r => r.fulfill({ status: 200,
    contentType: 'application/json',
    body: JSON.stringify(Array.from({ length: PAGE_COUNT }, (_, i) => ({ name: (i + 1) + '.jpg' }))) }));
  await ctx.route('**/storage/v1/object/public/**', r => r.fulfill({ status: 200,
    contentType: 'image/svg+xml', body: pageSvg(1) }));
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/lecteur.html?manga_id=1&chapitre=10');
  await page.waitForTimeout(1500);
  check('le lecteur fonctionne malgré la colonne manquante',
        (await page.locator('.scroll-page').count()) === PAGE_COUNT,
        (await page.locator('.scroll-page').count()) + ' planches');
  check('écran d\'avertissement sauté (donnée indisponible)',
        !(await page.locator('#gateWarning').isVisible()));
  check('écran de sens toujours affiché (sens_lecture lu correctement)',
        await page.locator('#gateDirection').isVisible());
  await ctx.close();

  // ══ Scénario 4 : chapitre sans aucune page ══
  console.log('\n▶ Scénario 4 — chapitre publié mais vide');
  ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status: 401, body: '{}' }));
  await ctx.route('**/rest/v1/**', r => {
    const u = r.request().url();
    if (u.includes('/mangas')) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify(FIXTURES.lrTP) });
    if (u.includes('/chapitres')) return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ id: 10, numero: 1, titre: 'Ouverture', manga_id: 2 }]) });
    return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  // Aucune planche dans le dossier de stockage
  await ctx.route('**/storage/v1/object/list/**', r => r.fulfill({ status: 200,
    contentType: 'application/json', body: '[]' }));
  page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/lecteur.html?manga_id=2&chapitre=10');
  await page.waitForTimeout(1800);
  check('le message « aucune page » est affiché',
        await page.locator('#noPages').isVisible());
  {
    const indicateur = (await page.locator('.page-indicator').innerText()).replace(/\s+/g, ' ').trim();
    check('le compteur ne prétend plus « 1 sur 0 »', !/1\s*sur\s*0/.test(indicateur), indicateur);
    check('  il annonce l\'absence de page', /Aucune page/.test(indicateur), indicateur);
  }
  check('un retour vers la fiche du manga est proposé',
        await page.locator('#noPages a[href*="manga.html"]').count() >= 1);
  await ctx.close();

  await browser.close();
  server.close();

  console.log('\n' + '═'.repeat(62));
  const ko = results.filter(r => !r.pass);
  console.log(`${results.length - ko.length}/${results.length} vérifications OK`);
  if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e => console.log('   ' + e)); }
  if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.name + (r.detail ? ' (' + r.detail + ')' : ''))); process.exit(1); }
  console.log('Aucune erreur JS.' );
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
