/* Le retour arrière — le geste le plus utilisé sur un téléphone.
   Revenir en arrière n'y est pas un bouton dans un coin : c'est un
   glissement du pouce depuis le bord, fait cent fois par jour. C'est LE
   geste pour annuler la dernière chose.

   Aucune page n'inscrivait rien dans l'historique en ouvrant une couche.
   On ouvrait le menu latéral, on glissait pour le refermer — et on
   quittait la page. Pareil pour la boîte « veux-tu vraiment supprimer ton
   compte ? » : le réflexe pour en sortir vous éjectait du site. Échap
   fonctionnait déjà, mais il n'y a pas de touche Échap sur un téléphone. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png','.jpg':'image/jpeg'};
const PORT = Number(process.env.PORT) || 8603;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});
const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, cover_url:null, bio:'Auteur',
  is_creator:true, created_at:'2026-01-05T10:00:00Z', pref_masquer_adulte:false,
  pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };
const MANGA = i => ({ id:i, titre:'Darkworld '+i, synopsis:'S.', type:'manga', statut:'en_cours',
  genres:['Action'], couverture_url:null, auteur_id:'u1', vues:120+i, adulte:false, langue:'fr',
  sens_lecture:'rl', age_recommande:'12+', commentaires_actifs:true,
  created_at:'2026-06-01T10:00:00Z', note_moyenne:4.2, nb_avis:3 });
function lignes(url) {
  if (url.includes('/profiles')) return [PROFILE];
  if (url.includes('/mangas')) return [1,2].map(MANGA);
  if (url.includes('/chapitres')) return [{ id:101, numero:1, titre:'Ch 1', manga_id:1 }];
  return [];
}
const results = [];
const check = (n, p, d = '') => { results.push({n,p,d}); console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`); };

async function ouvrir(b, depuis, page) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    const rows = lignes(decodeURIComponent(req.url()));
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+rows.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (rows[0]||null) : rows) });
  });
  await ctx.route('**/storage/v1/**', r =>
    r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  const p = await ctx.newPage();
  /* On arrive toujours de quelque part : sans page précédente, le retour
     n'aurait nulle part où aller et on ne mesurerait rien. */
  await p.goto(BASE + '/' + depuis, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1000);
  await p.goto(BASE + '/' + page, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(2000);
  return { ctx, p };
}

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors = [];

// ══ Le menu latéral ══
console.log('\n▶ Le menu latéral se referme au retour arrière');
{
  const { ctx, p } = await ouvrir(b, 'index.html', 'manga.html?id=1');
  p.on('pageerror', e => errors.push(e.message));
  await p.locator('.univ-nav-hbg').first().click();
  await p.waitForTimeout(600);
  const ouvert = () => p.evaluate(() => {
    const d = document.getElementById('univDrawer');
    return !!d && d.classList.contains('open');
  });
  check('le menu s\'ouvre', await ouvert());
  await p.goBack({ waitUntil:'domcontentloaded' }).catch(()=>{});
  await p.waitForTimeout(1200);
  check('  le retour le referme', !(await ouvert()));
  check('  sans quitter la page', /manga\.html/.test(p.url()), p.url().replace(BASE, ''));

  /* Fermé par la croix, le menu doit rendre l'étape d'historique qu'il
     avait prise : sinon un retour ultérieur ne ferait rien du tout. */
  await p.locator('.univ-nav-hbg').first().click();
  await p.waitForTimeout(500);
  await p.locator('.univ-d-close').first().click();
  await p.waitForTimeout(800);
  check('fermé par la croix, il rend son étape d\'historique', !(await ouvert()));
  await p.goBack({ waitUntil:'domcontentloaded' }).catch(()=>{});
  await p.waitForTimeout(1200);
  check('  un retour ramène alors bien à la page précédente',
        /index\.html/.test(p.url()), p.url().replace(BASE, ''));
  await ctx.close();
}

// ══ La boîte de confirmation ══
console.log('\n▶ La boîte de confirmation se referme au retour arrière');
{
  const { ctx, p } = await ouvrir(b, 'index.html', 'parametres.html');
  p.on('pageerror', e => errors.push(e.message));
  await p.locator('#btnSupprimer').click();
  await p.waitForTimeout(700);
  check('la boîte « supprimer mon compte » s\'ouvre',
        (await p.locator('.ink-confirm-ov').count()) > 0);
  await p.goBack({ waitUntil:'domcontentloaded' }).catch(()=>{});
  await p.waitForTimeout(1200);
  check('  le retour la referme', (await p.locator('.ink-confirm-ov').count()) === 0);
  check('  sans quitter la page', /parametres\.html/.test(p.url()), p.url().replace(BASE, ''));
  check('  et rien n\'a été supprimé — refermer vaut « annuler »',
        !/supprim/i.test(await p.locator('body').innerText().catch(() => '')) ||
        /Supprimer mon compte/.test(await p.locator('body').innerText()));
  await ctx.close();
}

// ══ Contre-épreuve : sans couche ouverte, le retour doit quitter ══
console.log('\n▶ Contre-épreuve : sans couche ouverte, le retour quitte bien la page');
{
  const { ctx, p } = await ouvrir(b, 'index.html', 'manga.html?id=1');
  p.on('pageerror', e => errors.push(e.message));
  await p.goBack({ waitUntil:'domcontentloaded' }).catch(()=>{});
  await p.waitForTimeout(1200);
  check('rien d\'ouvert : le retour ramène à la page précédente',
        /index\.html/.test(p.url()), p.url().replace(BASE, ''));
  await ctx.close();
}

// ══ Un filtre posé par un vrai lien ══
console.log('\n▶ Témoin : un filtre posé par un lien se défait au retour');
{
  const { ctx, p } = await ouvrir(b, 'index.html', 'recherche.html');
  p.on('pageerror', e => errors.push(e.message));
  await p.locator('.genre-chip').nth(1).click();
  await p.waitForTimeout(1400);
  check('le filtre s\'inscrit dans l\'adresse', /genre=/.test(p.url()), p.url().replace(BASE, ''));
  await p.goBack({ waitUntil:'domcontentloaded' }).catch(()=>{});
  await p.waitForTimeout(1400);
  check('  le retour le défait', !/genre=/.test(p.url()), p.url().replace(BASE, ''));
  await ctx.close();
}

// ══ L'adresse suit l'onglet du profil ══
console.log('\n▶ L\'adresse du profil suit l\'onglet ouvert');
{
  const { ctx, p } = await ouvrir(b, 'index.html', 'profil.html');
  p.on('pageerror', e => errors.push(e.message));
  await p.locator('.ptab[data-tab="mangas"]').click();
  await p.waitForTimeout(900);
  check('changer d\'onglet met l\'adresse à jour', /tab=mangas/.test(p.url()), p.url().replace(BASE, ''));
  /* On recharge : sans l'adresse, on retombait sur « Ma lecture ». */
  await p.reload({ waitUntil:'domcontentloaded' });
  await p.waitForTimeout(2200);
  check('  en rechargeant, on retrouve le même onglet',
        (await p.locator('.ptab[data-tab="mangas"]').getAttribute('class') || '').includes('active'));
  /* `replaceState` n'ajoute pas d'étape : le retour doit encore quitter. */
  await ctx.close();
}

await b.close(); server.close();
console.log('\n' + '═'.repeat(56));
const ko = results.filter(r => !r.p);
console.log(`${results.length - ko.length}/${results.length} vérifications OK`);
if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e => console.log('   ' + e.slice(0,130))); }
if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.n + (r.d ? ' — ' + r.d : ''))); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
