/* Quand on tape deux fois.
   Suite directe de la mesure du réseau lent : sur une 3G, une page met
   entre 4 et 12 secondes, et une écriture souvent 2 de plus. Personne
   n'attend 2 secondes devant un bouton qui n'a pas bougé — on retape.
   C'est le geste le plus banal du monde, et il ne se reproduit jamais en
   local, où la réponse revient avant que le doigt se relève.

   Chaque contrôle ralentit l'écriture, tape deux fois à 200 ms
   d'intervalle, et compte ce qui part vraiment vers la base. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png','.jpg':'image/jpeg'};
const PORT = Number(process.env.PORT) || 8593;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});

const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, cover_url:null, bio:'Lecteur',
  is_creator:false, created_at:'2026-01-05T10:00:00Z', pref_masquer_adulte:false,
  pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };
const AUTEUR = { id:'u9', username:'Autrice', avatar_url:null, bio:'', is_creator:true,
  created_at:'2026-01-05T10:00:00Z' };
const MANGA = { id:1, titre:'Darkworld', synopsis:'Un récit sombre.', type:'manga',
  statut:'en_cours', genres:['Action'], couverture_url:null, auteur_id:'u9', vues:120,
  adulte:false, langue:'fr', sens_lecture:'rl', age_recommande:'12+', commentaires_actifs:true,
  created_at:'2026-06-01T10:00:00Z', note_moyenne:4.2, nb_avis:3,
  profiles:{ username:'Autrice', avatar_url:null } };

function lignes(url) {
  const t = n => url.includes(n);
  if (t('/profiles')) {
    /* Le jeu d'essai respecte le filtre : sinon `?id=eq.u9` renvoyait le
       profil de u1 et le mur communautaire n'affichait aucun post. */
    const m = url.match(/id=eq\.([^&]+)/);
    if (m) return [PROFILE, AUTEUR].filter(p => p.id === m[1]);
    const inn = url.match(/id=in\.\(([^)]+)\)/);
    if (inn) {
      const ids = inn[1].split(',').map(x => x.replace(/"/g, ''));
      return [PROFILE, AUTEUR].filter(p => ids.includes(p.id));
    }
    return [PROFILE, AUTEUR];
  }
  if (t('/mangas')) return [MANGA];
  if (t('/chapitres')) return [{ id:101, numero:1, titre:'Ch 1', manga_id:1, created_at:'2026-06-11T10:00:00Z' }];
  if (t('posts_communaute')) return [{ id:1, creator_id:'u9', type:'post', contenu:'Salut',
    est_epingle:false, image_url:null, created_at:'2026-07-01T10:00:00Z', auteur_id:'u9' }];
  return [];
}

const results = [];
const check = (n, p, d = '') => { results.push({n,p,d}); console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`); };

/* Chaque geste : la page, la commande, la table qui ne doit recevoir
   qu'une seule écriture, et l'amorce éventuelle (noter avant de publier). */
const GESTES = [
  { page:'manga.html?id=1',   quoi:'suivre le créateur',        cible:'#btnFollow',       table:'follows' },
  { page:'manga.html?id=1',   quoi:'s\'abonner au manga',       cible:'#btnSubscribe',    table:'abonnements_manga' },
  { page:'manga.html?id=1',   quoi:'ajouter à la bibliothèque', cible:'#btnLibrary',      table:'bibliotheque' },
  { page:'auteur.html?id=u9', quoi:'suivre depuis le profil',   cible:'#btnFollowAuthor', table:'follows' },
  { page:'manga.html?id=1',   quoi:'publier un avis',           cible:'#avisEnvoyer',     table:'avis_mangas',
    avant: async p => { await p.locator('#avisEtoiles button').nth(4).click(); } },
  { page:'communaute.html?id=u9', quoi:'réagir à un post',      cible:'.reaction-btn',    table:'reactions' },
];

async function contexte(b) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  await ctx.route('**/storage/v1/object/list/**', r =>
    r.fulfill({status:200,contentType:'application/json',body:'[{"name":"01.jpg"}]'}));
  await ctx.route('**/storage/v1/**', r =>
    r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  return ctx;
}

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors = [];

console.log('\n▶ Un geste répété ne produit qu\'une seule action');
for (const g of GESTES) {
  const ctx = await contexte(b);
  const ecritures = [];
  let lenteur = 0;
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(); const url = decodeURIComponent(req.url());
    if (req.method() !== 'GET') {
      ecritures.push(url);
      /* Sans ce délai, la réponse revient avant que le doigt se relève :
         le défaut ne se reproduit pas, et c'est bien pour ça qu'il n'avait
         jamais été vu. */
      if (lenteur) await new Promise(res => setTimeout(res, lenteur));
      return r.fulfill({ status:201, contentType:'application/json', body:'[]' });
    }
    const rows = lignes(url);
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+rows.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (rows[0]||null) : rows) });
  });

  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/' + g.page, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(2000);
  const cible = p.locator(g.cible).first();
  await cible.waitFor({ state:'visible', timeout: 8000 }).catch(()=>{});
  if (g.avant) { try { await g.avant(p); } catch (e) {} await p.waitForTimeout(400); }

  lenteur = 1500;
  ecritures.length = 0;
  await cible.click({ force: true });
  await p.waitForTimeout(200);
  const actifPendant = await cible.evaluate(el =>
    !el.disabled && el.getAttribute('aria-disabled') !== 'true' && el.dataset.enCours !== '1'
  ).catch(() => false);
  await cible.click({ force: true }).catch(() => {});
  await p.waitForTimeout(3200);

  const n = ecritures.filter(u => u.includes(g.table)).length;
  check(`${g.quoi} → une seule écriture vers ${g.table}`, n === 1, n + ' écriture(s)');
  check(`  la commande se verrouille pendant l'attente`, !actifPendant);
  await ctx.close();
}

/* Contre-épreuve : le verrou doit se LEVER. Une garde qui resterait
   fermée empêcherait de se désabonner, de changer d'emoji ou de corriger
   sa note — pire que le défaut qu'elle corrige. */
console.log('\n▶ Contre-épreuve : le verrou se lève, un second geste reste possible');
{
  const ctx = await contexte(b);
  const ecritures = [];
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request(); const url = decodeURIComponent(req.url());
    if (req.method() !== 'GET') {
      ecritures.push(url);
      return r.fulfill({ status:201, contentType:'application/json', body:'[]' });
    }
    const rows = lignes(url);
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+rows.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (rows[0]||null) : rows) });
  });
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(e.message));
  await p.goto(BASE + '/manga.html?id=1', { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(2000);
  const btn = p.locator('#btnFollow');
  await btn.waitFor({ state:'visible', timeout: 8000 });

  ecritures.length = 0;
  await btn.click({ force: true });               // s'abonner
  await p.waitForTimeout(900);
  check('le bouton redevient utilisable après l\'action',
        await btn.evaluate(el => !el.disabled));
  await btn.click({ force: true });               // se désabonner
  await p.waitForTimeout(900);
  check('  un second geste volontaire passe bien',
        ecritures.filter(u => u.includes('follows')).length === 2,
        ecritures.filter(u => u.includes('follows')).length + ' écriture(s)');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n' + '═'.repeat(56));
const ko = results.filter(r => !r.p);
console.log(`${results.length - ko.length}/${results.length} vérifications OK`);
if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e => console.log('   ' + e.slice(0,130))); }
if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.n + (r.d ? ' — ' + r.d : ''))); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
