/* Découverte au-delà de la recherche (§2.4 de l'audit).

   Deux culs-de-sac mesurés à l'audit :
   - la rangée de créateurs de l'accueil s'arrête à douze et ne menait
     nulle part ;
   - les vingt genres n'existaient que dans un menu déroulant replié, donc
     invisibles, et une fiche manga affichait « Action » sans qu'on puisse
     cliquer dessus. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8141;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

const MANGA = i => ({ id:i, titre:'Darkworld '+i, synopsis:'Un récit sombre.', type:'manga',
  statut:'en_cours', genres:['Action','Fantasy'], couverture_url:null, auteur_id:'a'+i,
  vues:100+i, adulte:false, langue:'fr', sens_lecture:'rl', age_recommande:'12+',
  commentaires_actifs:true, created_at:'2026-06-01T10:00:00Z', note_moyenne:4.2, nb_avis:3 });
const PROFIL = i => ({ id:'a'+i, username:'Créateur '+i, bio:'Bio '+i, avatar_url:null,
  is_creator:true, created_at:'2026-01-0'+((i%9)+1)+'T10:00:00Z' });

/* Quinze créateurs : plus que les douze de la rangée d'accueil, pour que la
   page « tous les créateurs » ait quelque chose de plus à montrer. */
const NB = 15;

async function ouvrir(b, url, { vide = false } = {}) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const requetes = [];
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    requetes.push(u);
    if (req.method()!=='GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    let rows=[];
    if (u.includes('/mangas'))            rows = vide ? [] : Array.from({length:NB},(_,i)=>MANGA(i+1));
    else if (u.includes('packs_tutoriels')) rows = [];
    else if (u.includes('/profiles'))     rows = vide ? [] : Array.from({length:NB},(_,i)=>PROFIL(i+1));
    else if (u.includes('/chapitres'))    rows = [{id:10,numero:1,titre:'Ch 1',manga_id:1,created_at:'2026-06-11T10:00:00Z'}];
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/'+rows.length,'Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul?(rows[0]||null):rows)});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  await p.goto(BASE + url);
  await p.waitForTimeout(2200);
  return { ctx, p, requetes };
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ La rangée de créateurs mène quelque part');
{
  const { ctx, p } = await ouvrir(b, '/index.html');
  p.on('pageerror',e=>errors.push(e.message));
  const lien = p.locator('#creatorsSection a.sec-link');
  check('un « Voir tout » est proposé', await lien.count() === 1);
  check('  il mène à la page des créateurs',
    await lien.getAttribute('href') === 'recherche.html?vue=createurs',
    await lien.getAttribute('href'));
  await ctx.close();
}

console.log('\n▶ La page « tous les créateurs » existe');
{
  const { ctx, p } = await ouvrir(b, '/recherche.html?vue=createurs');
  p.on('pageerror',e=>errors.push(e.message));
  check('le titre annonce les créateurs',
    /créateurs/i.test(await p.locator('#heroTitle').innerText()),
    await p.locator('#heroTitle').innerText());
  const cartes = p.locator('.creator-card');
  check('tous les créateurs sont listés, pas seulement douze',
    await cartes.count() === NB, await cartes.count() + ' cartes pour ' + NB + ' créateurs');
  check('  chacun mène à son profil public',
    (await cartes.first().getAttribute('href') || '').startsWith('auteur.html?id='),
    await cartes.first().getAttribute('href'));
  check('les filtres de mangas sont masqués ici', !(await p.locator('#filtersBar').isVisible()));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, '/recherche.html?vue=createurs', { vide:true });
  p.on('pageerror',e=>errors.push(e.message));
  const t = await p.locator('#mainContent').innerText();
  check('aucun créateur : la page le dit et propose de publier',
    /Aucun créateur/i.test(t) && /Publier/i.test(t), t.replace(/\n/g,' | ').slice(0,90));
  await ctx.close();
}

console.log('\n▶ Les genres deviennent des chemins');
{
  const { ctx, p } = await ouvrir(b, '/recherche.html');
  p.on('pageerror',e=>errors.push(e.message));
  const puces = p.locator('.genre-chip');
  check('une rangée de genres est visible sans dérouler de menu',
    await puces.count() > 15, await puces.count() + ' genres');
  check('  « Tous » ramène au catalogue entier',
    await puces.first().getAttribute('href') === 'recherche.html',
    await puces.first().getAttribute('href'));
  const action = p.locator('.genre-chip', { hasText:'Action' }).first();
  check('  chaque genre a une adresse partageable',
    await action.getAttribute('href') === 'recherche.html?genre=Action',
    await action.getAttribute('href'));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, '/recherche.html?genre=Action');
  p.on('pageerror',e=>errors.push(e.message));
  check('le titre reprend le genre parcouru',
    /Action/.test(await p.locator('#heroTitle').innerText()),
    await p.locator('#heroTitle').innerText());
  check('  l\'onglet du navigateur aussi', /Action/.test(await p.title()), await p.title());
  check('  et la puce du genre est marquée comme courante',
    await p.locator('.genre-chip[aria-current="page"]').innerText() === 'Action',
    await p.locator('.genre-chip[aria-current="page"]').innerText());
  await ctx.close();
}

console.log('\n▶ Les genres d\'une fiche manga sont cliquables');
{
  const { ctx, p } = await ouvrir(b, '/manga.html?id=1');
  p.on('pageerror',e=>errors.push(e.message));
  const tags = p.locator('#genresList a.genre-tag');
  check('les genres sont des liens, plus des étiquettes mortes',
    await tags.count() === 2, await tags.count() + ' liens');
  check('  vers le catalogue filtré',
    await tags.first().getAttribute('href') === 'recherche.html?genre=Action',
    await tags.first().getAttribute('href'));
  check('  avec une infobulle qui dit où ça mène',
    /Voir tous les mangas/.test(await tags.first().getAttribute('title') || ''),
    await tags.first().getAttribute('title'));
  // Un lien dans un lien serait invalide : on vérifie qu'on n'en a pas créé.
  check('aucun lien imbriqué dans un autre',
    await p.locator('a a').count() === 0, await p.locator('a a').count() + ' imbrications');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
