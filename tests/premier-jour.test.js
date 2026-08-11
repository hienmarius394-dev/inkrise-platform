/* Le premier jour : un compte neuf, une base entièrement vide.
   Toutes les autres suites remplissent Supabase avant de mesurer — deux
   mangas, un chapitre, un pack, un abonné. C'est l'inverse exact de ce que
   voit quelqu'un qui vient de créer son compte, ou de ce qu'a vu la toute
   première personne arrivée sur le site.

   On vérifie ici que le vide se dit et propose une suite, plutôt que de
   présenter trois fois « rien » et trois portes vers la même pièce vide. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png'};
const PORT = Number(process.env.PORT) || 8557;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});
const U = { id:'neuf', email:'neuf@x.fr', user_metadata:{ username:'Nouvelle' } };
const PROFIL = { id:'neuf', username:'Nouvelle', avatar_url:null, cover_url:null, bio:'',
  is_creator:false, created_at:'2026-08-01T10:00:00Z', pref_masquer_adulte:false,
  pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };
const results = [];
const check = (n, p, d = '') => { results.push({n,p,d}); console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`); };

/* Contexte « premier jour » : la session est valable, mais la base ne
   contient que le profil créé par le trigger SQL à l'inscription. */
async function contexte(b, connecte) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  if (connecte) {
    await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
        expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  } else {
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status:401, body:'{}' }));
  }
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    const lignes = (connecte && decodeURIComponent(req.url()).includes('/profiles')) ? [PROFIL] : [];
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+lignes.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (lignes[0] || null) : lignes) });
  });
  await ctx.route('**/storage/v1/object/list/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await ctx.route('**/storage/v1/**', r => r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  return ctx;
}

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors = [];

// ══ L'accueil quand le catalogue entier est vide ══
console.log('\n▶ L\'accueil au tout premier jour');
{
  const ctx = await contexte(b, true);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/index.html');
  await p.waitForSelector('#catalogueVide', { state:'visible', timeout: 8000 }).catch(()=>{});

  check('le vide du catalogue est annoncé une seule fois',
        await p.locator('#catalogueVide').isVisible());
  const t = await p.locator('#catalogueVide').innerText();
  check('  et il est expliqué, pas seulement constaté',
        /vient d'ouvrir|personne n'a encore publié/i.test(t));

  /* Trois messages de vide et trois « Voir tout → » vers le même catalogue
     vide : le défaut d'origine. Ils doivent avoir disparu. */
  for (const id of ['secOriginals','featuredRow','secPopulaires','populairesGrid','secNouveaux','derniersGrid']) {
    const vu = await p.locator('#' + id).isVisible().catch(()=>false);
    if (vu) check('la section « ' + id + ' » ne répète plus le vide', false);
  }
  check('les trois sections vides sont retirées',
        !(await p.locator('#featuredRow').isVisible().catch(()=>false)));
  check('  et les onglets qui n\'ouvrent plus rien aussi',
        !(await p.locator('.section-tabs').isVisible().catch(()=>false)));
  check('une action est proposée : publier',
        /publier/i.test(await p.locator('#catalogueVideBtn').innerText()));
  check('  elle mène au dépôt d\'un manga',
        (await p.locator('#catalogueVideBtn').getAttribute('href')) === 'upload-manga.html');
  await ctx.close();
}
{
  const ctx = await contexte(b, false);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/index.html');
  await p.waitForSelector('#catalogueVide', { state:'visible', timeout: 8000 }).catch(()=>{});
  /* Sans compte, publier commence par en créer un : l'annoncer vaut mieux
     que d'envoyer sur un formulaire qui redemandera de se connecter. */
  const href = await p.locator('#catalogueVideBtn').getAttribute('href');
  check('sans compte, le bouton passe d\'abord par l\'inscription',
        /auth\.html/.test(href || ''), href || '');
  check('  et le dit dans son libellé',
        /compte/i.test(await p.locator('#catalogueVideBtn').innerText()));
  check('  en gardant la destination voulue',
        /next=upload-manga/.test(href || ''), href || '');
  await ctx.close();
}

// ══ Les tutoriels sans aucun pack ══
console.log('\n▶ Les tutoriels quand personne n\'a rien publié');
{
  const ctx = await contexte(b, true);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/tutoriels.html');
  await p.waitForTimeout(1600);
  const t = (await p.locator('main, body').first().innerText());
  check('on n\'accuse plus un filtre qui n\'est pas posé',
        !/Aucun pack dans cette catégorie/.test(t));
  check('  le vide réel est nommé', /Aucun tutoriel publié/i.test(t));
  check('on ne promet plus « d\'autres tutoriels » qui n\'existent pas',
        !/D'autres tutoriels arrivent/.test(t));
  check('« À partir de » n\'annonce plus un prix pour zéro pack',
        (await p.locator('#statMinPrice').innerText()).trim() === '—',
        await p.locator('#statMinPrice').innerText());
  check('le compte de créateurs est bien à zéro',
        (await p.locator('#statCreateurs').innerText()).trim() === '0');
  await ctx.close();
}

// ══ Un manga qu'on n'a pas (ou plus) ══
console.log('\n▶ Gérer un manga qui n\'existe pas');
{
  const ctx = await contexte(b, true);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/gestion-chapitres.html?manga_id=999');
  await p.waitForTimeout(2200);
  check('on n\'est plus déposé sur son profil sans un mot',
        /raison=introuvable/.test(p.url()), p.url().replace(BASE, ''));
  check('  on arrive sur l\'onglet utile, « Mes Mangas »',
        /tab=mangas/.test(p.url()));
  const corps = await p.locator('body').innerText();
  check('  et la raison est dite', /n'existe plus|ne t'appartient pas/i.test(corps));
  await ctx.close();
}

// ══ Cohérence du taux de reversement ══
console.log('\n▶ Un seul taux annoncé sur tout le site');
{
  const remu = fs.readFileSync(path.join(ROOT, 'creators-remuneration.html'), 'utf8');
  const profil = fs.readFileSync(path.join(ROOT, 'profil.html'), 'utf8');
  check('le profil annonce 90 % au créateur', /90%|90&nbsp;%|90 %/.test(profil));
  check('  la page de rémunération dit le même chiffre', /90&nbsp;%|90%|90 %/.test(remu));
  check('  et ne se contente plus d\'un « la grande majorité »',
        !/grande majorité/.test(remu));
  check('son titre visible correspond à celui de l\'onglet',
        /<h1>Comment les créateurs sont payés<\/h1>/.test(remu));
  check('  et au titre partagé sur les réseaux',
        /og:title" content="Comment les créateurs sont payés/.test(remu));
}

await b.close(); server.close();
console.log('\n' + '═'.repeat(56));
const ko = results.filter(r => !r.p);
console.log(`${results.length - ko.length}/${results.length} vérifications OK`);
if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e => console.log('   ' + e.slice(0,130))); }
if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.n + (r.d ? ' — ' + r.d : ''))); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
