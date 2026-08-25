/* Le site sur un réseau lent, et ce qu'il fait quand l'envoi lâche.
   Toutes les autres mesures de cet audit ont été prises en local, où une
   requête revient en une milliseconde. Le public d'Inkrise lit sur
   téléphone : la 3G y est la norme. Deux choses sont figées ici.

   1. Aucune page ne précharge de police. Mesuré sur une 3G à 400 kb/s,
      les deux `<link rel="preload" as="font">` réclamaient 70 Ko au débit
      maximal AVANT l'arrivée du HTML et retardaient le premier affichage
      de 1,6 s. Sur fibre, l'écart était plus petit que la variation d'un
      essai à l'autre.

   2. Un envoi de planches interrompu ne met plus l'œuvre en ligne
      amputée. Sur un réseau qui lâche à la moitié d'un chapitre, le manga
      partait public avec trois planches sur dix, sans que rien ne le
      signale aux lecteurs. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png','.jpg':'image/jpeg'};
const PORT = Number(process.env.PORT) || 8581;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});
const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, bio:'', is_creator:true,
  created_at:'2026-01-05T10:00:00Z' };
const results = [];
const check = (n, p, d = '') => { results.push({n,p,d}); console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`); };

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors = [];

// ══ 1. Aucune page ne vole la bande passante au HTML ══
console.log('\n▶ Aucune police préchargée au détriment du premier affichage');
{
  const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
  const fautifs = pages.filter(f =>
    /rel="preload"[^>]*as="font"|as="font"[^>]*rel="preload"/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  check(`aucune des ${pages.length} pages ne précharge de police`,
        fautifs.length === 0, fautifs.join(' '));
  /* Le préchargement n'est acceptable que s'il ne bloque pas le premier
     affichage : `font-display: swap` doit rester en place, sinon le texte
     resterait invisible le temps que la police arrive. */
  const fontsCss = fs.readFileSync(path.join(ROOT, 'assets/inkrise-fonts.css'), 'utf8');
  const familles = (fontsCss.match(/@font-face/g) || []).length;
  const swaps = (fontsCss.match(/font-display:\s*swap/g) || []).length;
  check('chaque @font-face garde font-display: swap',
        familles > 0 && swaps === familles, swaps + '/' + familles);
}

// ══ 2. Un envoi interrompu ne publie pas une œuvre amputée ══
console.log('\n▶ Envoi de planches interrompu en cours de route');
{
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));

  /* On note ce que le site écrit vraiment dans la base : c'est là qu'on
     verra s'il publie ou s'il garde en brouillon. */
  const ecritures = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    const url = decodeURIComponent(req.url());
    if (req.method() !== 'GET') {
      let corps = null;
      try { corps = JSON.parse(req.postData() || 'null'); } catch (e) {}
      ecritures.push({ methode: req.method(), url, corps });
      if (url.includes('/mangas') && req.method() === 'POST')
        return r.fulfill({ status:201, contentType:'application/json',
          body: JSON.stringify([{ id: 42, ...(Array.isArray(corps) ? corps[0] : corps) }]) });
      if (url.includes('/chapitres') && req.method() === 'POST')
        return r.fulfill({ status:201, contentType:'application/json',
          body: JSON.stringify([{ id: 7, numero: 1, titre: 'Chapitre 1', manga_id: 42 }]) });
      return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    }
    const lignes = url.includes('/profiles') ? [PROFILE] : [];
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+lignes.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (lignes[0]||null) : lignes) });
  });
  /* LE RÉSEAU LÂCHE : chaque envoi de planche échoue, comme au bord de la
     couverture. La couverture, elle, passe.
     L'ORDRE COMPTE : Playwright essaie les routes de la plus récemment
     déclarée à la plus ancienne. La règle générale doit donc être posée
     EN PREMIER, sinon elle avale les envois de planches et la panne
     qu'on veut simuler n'arrive jamais. */
  await ctx.route('**/storage/v1/**', r =>
    r.fulfill({ status:200, contentType:'application/json', body:'{"Key":"ok"}' }));
  await ctx.route('**/storage/v1/object/pages/**', r =>
    r.fulfill({ status:503, contentType:'application/json',
      body: JSON.stringify({ message:'Failed to fetch', statusCode:'503' }) }));

  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/upload-manga.html');
  await p.waitForSelector('#mainForm', { state:'visible', timeout: 10000 }).catch(()=>{});

  await p.fill('#inputTitre', 'Œuvre interrompue');
  await p.fill('#inputDescription', 'Un récit que le réseau a coupé en deux.');
  await p.locator('.genre-chip').first().click().catch(()=>{});
  /* On veut publier PUBLIQUEMENT : c'est tout l'enjeu du contrôle. */
  const pub = p.locator('#togglePublic');
  if (!(await pub.isChecked().catch(() => true))) await pub.check({ force: true }).catch(()=>{});

  /* Deux planches à envoyer — les deux échoueront. */
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  await p.locator('input.chap-pages').first().setInputFiles([
    { name:'01.png', mimeType:'image/png', buffer: png },
    { name:'02.png', mimeType:'image/png', buffer: png },
  ]).catch(()=>{});
  await p.waitForTimeout(700);

  await p.locator('#btnSubmit').click();
  await p.waitForSelector('#successZone', { state:'visible', timeout: 25000 }).catch(()=>{});

  const majBrouillon = ecritures.find(e =>
    e.methode === 'PATCH' && e.url.includes('/mangas') &&
    e.corps && e.corps.statut === 'brouillon');
  check('l\'œuvre est repassée en brouillon plutôt que publiée amputée',
        !!majBrouillon, majBrouillon ? JSON.stringify(majBrouillon.corps) : 'aucun passage en brouillon');

  const texte = await p.locator('#successZone').innerText().catch(() => '');
  check('  et on le dit à l\'auteur', /brouillon/i.test(texte), texte.replace(/\s+/g,' ').slice(0, 80));
  check('  en expliquant que des planches manquent',
        /planches? manquent|manquent à l'appel/i.test(texte));
  check('  sans prétendre que la communauté peut le découvrir',
        !/communauté peut le découvrir/.test(texte));

  const corps = await p.locator('body').innerText();
  check('le détail technique de l\'échec n\'est pas recopié à l\'écran',
        !/Failed to fetch|statusCode|503/.test(corps));
  await ctx.close();
}

/* Contre-épreuve indispensable : si l'envoi se passe bien, l'œuvre doit
   partir PUBLIQUE comme avant. Une règle qui garderait tout en brouillon
   serait pire que le défaut qu'elle corrige. */
console.log('\n▶ Contre-épreuve : un envoi qui réussit publie bien');
{
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  const ecritures2 = [];
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(); const url = decodeURIComponent(req.url());
    if (req.method() !== 'GET') {
      let corps = null; try { corps = JSON.parse(req.postData() || 'null'); } catch (e) {}
      ecritures2.push({ methode: req.method(), url, corps });
      if (url.includes('/mangas') && req.method() === 'POST')
        return r.fulfill({ status:201, contentType:'application/json',
          body: JSON.stringify([{ id: 43, ...(Array.isArray(corps) ? corps[0] : corps) }]) });
      if (url.includes('/chapitres') && req.method() === 'POST')
        return r.fulfill({ status:201, contentType:'application/json',
          body: JSON.stringify([{ id: 8, numero: 1, titre: 'Chapitre 1', manga_id: 43 }]) });
      return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    }
    const lignes = url.includes('/profiles') ? [PROFILE] : [];
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+lignes.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (lignes[0]||null) : lignes) });
  });
  await ctx.route('**/storage/v1/**', r =>
    r.fulfill({ status:200, contentType:'application/json', body:'{"Key":"ok"}' }));

  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/upload-manga.html');
  await p.waitForSelector('#mainForm', { state:'visible', timeout: 10000 }).catch(()=>{});
  await p.fill('#inputTitre', 'Œuvre complète');
  await p.fill('#inputDescription', 'Un récit qui est arrivé entier.');
  await p.locator('.genre-chip').first().click().catch(()=>{});
  const png2 = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64');
  await p.locator('input.chap-pages').first().setInputFiles([
    { name:'01.png', mimeType:'image/png', buffer: png2 }]).catch(()=>{});
  await p.waitForTimeout(700);
  await p.locator('#btnSubmit').click();
  await p.waitForSelector('#successZone', { state:'visible', timeout: 25000 }).catch(()=>{});

  const bascule = ecritures2.find(e => e.methode === 'PATCH' && e.url.includes('/mangas')
    && e.corps && e.corps.statut === 'brouillon');
  check('aucun passage en brouillon quand tout est arrivé', !bascule);
  const t2 = await p.locator('#successZone').innerText().catch(() => '');
  check('  l\'œuvre est bien annoncée publiée', /Manga publié/i.test(t2), t2.replace(/\s+/g,' ').slice(0, 70));
  await ctx.close();
}

// ══ 3. Le serveur qui ne répond jamais ══
/* Signalé depuis un vrai téléphone : le bandeau s'affichait, et l'accueil
   gardait « Chargement… » sous deux sections, indéfiniment. Un serveur en
   pause n'refuse pas toujours la connexion — il l'accepte et ne répond
   jamais. La promesse ne rejette donc pas, et rien ne se déclenchait. */
console.log('\n▶ Un serveur qui accepte la connexion et ne répond jamais');
{
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  /* On répond au bout de deux minutes plutôt que « jamais » : un routeur
     qui ne rend jamais la main fausse la mesure. */
  await ctx.route('**supabase.co/**', async r => {
    await new Promise(res => setTimeout(res, 120000));
    return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/index.html', { waitUntil:'domcontentloaded' });

  const etat = () => p.evaluate(() => ({
    bandeau: !!document.getElementById('inkriseBandeauReseau'),
    attentes: [...document.querySelectorAll('div, span, p')].filter(e =>
      e.children.length === 0 && /^Chargement/.test((e.textContent || '').trim())
      && e.getBoundingClientRect().height > 0).length,
  }));

  await p.waitForTimeout(12000);
  const tot = await etat();
  check('à 12 s, rien n\'est encore annoncé — on laisse sa chance au réseau',
        !tot.bandeau);

  await p.waitForTimeout(16000);   // ~28 s au total
  const tard = await etat();
  check('passé 20 s, le blocage est annoncé', tard.bandeau);
  check('  et les « Chargement… » cessent de mentir', tard.attentes === 0,
        tard.attentes + ' encore visible(s)');
  const corps = await p.locator('body').innerText();
  check('  la page dit ce qui se passe, en français',
        /ne répond pas|Indisponible/.test(corps));
  await ctx.close();
}

// ══ 4. Contre-épreuve : lent mais qui marche, aucune fausse alerte ══
console.log('\n▶ Contre-épreuve : une 3G au bord de la couverture n\'alerte pas');
{
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  await ctx.route('**/rest/v1/**', r => {
    const url = decodeURIComponent(r.request().url());
    const rows = url.includes('/profiles') ? [PROFILE] : [];
    const seul = (r.request().headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+rows.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (rows[0]||null) : rows) });
  });
  await ctx.route('**/storage/v1/**', r =>
    r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('Network.enable');
  /* 200 kb/s, 3 s de latence : le pire cas mesuré (§7.24), où le lecteur
     met 12,3 s. Le seuil de 20 s doit garder de la marge. */
  await cdp.send('Network.emulateNetworkConditions', { offline:false, latency:3000,
    downloadThroughput: 200*1024/8, uploadThroughput: 100*1024/8 });
  await p.goto(BASE + '/index.html', { waitUntil:'commit', timeout: 60000 });
  await p.waitForTimeout(30000);
  check('rien n\'est annoncé à tort sur une connexion lente qui fonctionne',
        !(await p.evaluate(() => !!document.getElementById('inkriseBandeauReseau'))));
  check('  et aucun « Indisponible » n\'est écrit par erreur',
        !/Indisponible — le serveur/.test(await p.locator('body').innerText()));
  await ctx.close();
}

await b.close(); server.close();
console.log('\n' + '═'.repeat(56));
const ko = results.filter(r => !r.p);
console.log(`${results.length - ko.length}/${results.length} vérifications OK`);
if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e => console.log('   ' + e.slice(0,130))); }
if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.n + (r.d ? ' — ' + r.d : ''))); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
