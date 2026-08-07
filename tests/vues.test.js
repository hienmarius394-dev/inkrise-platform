/* Comptage des lectures (§ roadmap « vues côté serveur »).

   Avant : le site insérait lui-même une ligne dans `vues`, et seulement
   pour les gens connectés — la politique de sécurité exige
   `user_id = auth.uid()`. Sur un site de lecture public, c'est
   l'essentiel du trafic qui n'était pas compté.

   Le tri (auteur qui relit, empreinte fantaisiste, doublon) se fait côté
   serveur et est vérifié sur un vrai PostgreSQL par tests/outil-rls.js.
   Ce qui est éprouvé ici : ce que le navigateur envoie, quand, et ce
   qu'il range dans le stockage local. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8139;
const BASE = 'http://localhost:' + PORT;
const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const MANGA = { id:1, titre:'Darkworld', type:'manga', statut:'en_cours', sens_lecture:'rl',
                age_recommande:'tout_public', commentaires_actifs:true, auteur_id:'autre',
                vues:120, genres:['Action'], couverture_url:null, synopsis:'S' };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

async function ouvrir(b, { connecte = false, url = '/manga.html?id=1', horsLigne = false } = {}) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const appels = [];
  const ecritures = [];
  if (connecte) {
    await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
        expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
    await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({...U,aud:'authenticated'})}));
  } else {
    await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  }
  if (horsLigne) await ctx.addInitScript(() =>
    Object.defineProperty(navigator, 'onLine', { configurable:true, get:()=>false }));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/rest/v1/**',r=>{
    const req = r.request(), u = decodeURIComponent(req.url());
    if (u.includes('/rpc/enregistrer_vue')) {
      appels.push(JSON.parse(req.postData() || '{}'));
      return r.fulfill({status:200,contentType:'application/json',body:'null'});
    }
    if (u.includes('/vues')) { ecritures.push(req.method() + ' ' + u.slice(-40)); }
    if (req.method() !== 'GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    if (u.includes('/mangas')) {
      const seul = (req.headers()['accept']||'').includes('vnd.pgrst.object');
      return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify(seul ? MANGA : [MANGA])});
    }
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{id:10,numero:1,titre:'Ch 1',manga_id:1,created_at:'2026-06-01T10:00:00Z'}])});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await ctx.route('**/storage/v1/object/list/**',r=>r.fulfill({status:200,
    contentType:'application/json',body:'[{"name":"01.jpg"}]'}));
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',
    body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
  const p = await ctx.newPage();
  await p.goto(BASE + url);
  await p.waitForTimeout(2400);
  return { ctx, p, appels, ecritures };
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Un visiteur déconnecté est enfin compté');
{
  const { ctx, p, appels, ecritures } = await ouvrir(b, { connecte:false });
  p.on('pageerror',e=>errors.push(e.message));
  check('une lecture est enregistrée sans compte', appels.length === 1,
    JSON.stringify(appels));
  check('  sur le bon manga', appels[0] && appels[0].p_manga_id === 1, JSON.stringify(appels[0]));
  check('  avec une empreinte utilisable',
    appels[0] && typeof appels[0].p_empreinte === 'string' && appels[0].p_empreinte.length >= 16,
    appels[0] && appels[0].p_empreinte);
  check('la table `vues` n\'est plus écrite depuis le navigateur',
    ecritures.length === 0, ecritures.join(' | '));
  await ctx.close();
}

console.log('\n▶ Un lecteur connecté aussi');
{
  const { ctx, p, appels } = await ouvrir(b, { connecte:true });
  p.on('pageerror',e=>errors.push(e.message));
  check('une lecture est enregistrée', appels.length === 1, JSON.stringify(appels));
  await ctx.close();
}

console.log('\n▶ L\'empreinte reste la même d\'une page à l\'autre');
{
  const { ctx, p, appels } = await ouvrir(b, { connecte:false });
  p.on('pageerror',e=>errors.push(e.message));
  const premiere = appels[0] && appels[0].p_empreinte;
  await p.goto(BASE + '/manga.html?id=1');
  await p.waitForTimeout(2000);
  check('le même appareil garde son empreinte',
    appels.length === 2 && appels[1].p_empreinte === premiere,
    appels.map(a=>a.p_empreinte && a.p_empreinte.slice(0,10)).join(' / '));
  check('  elle est rangée dans le stockage local',
    (await p.evaluate(()=>localStorage.getItem('inkrise_appareil'))) === premiere);
  await ctx.close();
}
{
  // Un autre appareil = un autre navigateur = un autre stockage
  const { ctx, appels } = await ouvrir(b, { connecte:false });
  const a = appels[0] && appels[0].p_empreinte;
  await ctx.close();
  const deux = await ouvrir(b, { connecte:false });
  check('un autre appareil a une empreinte différente',
    deux.appels[0] && deux.appels[0].p_empreinte !== a,
    (a||'').slice(0,10) + ' ≠ ' + ((deux.appels[0]||{}).p_empreinte||'').slice(0,10));
  await deux.ctx.close();
}

console.log('\n▶ Le lecteur compte aussi, mais pas hors ligne');
{
  const { ctx, p, appels } = await ouvrir(b, { connecte:false,
    url:'/lecteur.html?manga_id=1&chapitre=10' });
  p.on('pageerror',e=>errors.push(e.message));
  check('ouvrir un chapitre compte une lecture', appels.length >= 1, JSON.stringify(appels[0]));
  await ctx.close();
}
{
  /* Hors ligne, la lecture vient du cache : une requête vouée à échouer
     ne ferait qu'afficher le bandeau réseau pour rien. */
  const { ctx, p, appels } = await ouvrir(b, { connecte:false, horsLigne:true,
    url:'/lecteur.html?manga_id=1&chapitre=10' });
  p.on('pageerror',e=>errors.push(e.message));
  check('hors ligne, aucune tentative', appels.length === 0,
    'page finale : ' + new URL(p.url()).pathname + ' — ' + JSON.stringify(appels));
  await ctx.close();
}

console.log('\n▶ Base pas encore à jour : on retombe sur l\'ancien chemin');
{
  /* Le site est déployé dès la fusion, la base est mise à jour à la main :
     entre les deux, la fonction n'existe pas. Ne plus rien compter du tout
     serait pire qu'avant. */
  const ctx = await b.newContext({viewport:{width:390,height:844}});
  const ecritures = [];
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({...U,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    if (u.includes('/rpc/enregistrer_vue'))
      return r.fulfill({status:404,contentType:'application/json',
        body:JSON.stringify({code:'PGRST202',message:'Could not find the function'})});
    if (u.includes('/vues') && req.method()==='POST') {
      ecritures.push(JSON.parse(req.postData()||'{}'));
      return r.fulfill({status:201,contentType:'application/json',body:'[]'});
    }
    if (req.method()!=='GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    if (u.includes('/mangas')) {
      const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(seul?MANGA:[MANGA])});
    }
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{id:10,numero:1,titre:'Ch 1',manga_id:1,created_at:'2026-06-01T10:00:00Z'}])});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  const erreursPage = [];
  p.on('pageerror', e => erreursPage.push(e.message));
  await p.goto(BASE + '/manga.html?id=1');
  await p.waitForTimeout(2600);
  check('fonction absente : la lecture est comptée par l\'ancien chemin',
    ecritures.length === 1, JSON.stringify(ecritures));
  check('  au nom du lecteur connecté',
    ecritures[0] && ecritures[0].user_id === 'u1', JSON.stringify(ecritures[0]));
  check('  et la page ne s\'en trouve pas cassée',
    /Darkworld/.test(await p.locator('body').innerText()) && erreursPage.length === 0,
    erreursPage[0] || '');
  await ctx.close();
}

console.log('\n▶ Un compteur ne casse jamais une lecture');
{
  const ctx = await b.newContext({viewport:{width:390,height:844}});
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    // La fonction de comptage échoue : la page doit s'afficher quand même.
    if (u.includes('/rpc/enregistrer_vue'))
      return r.fulfill({status:500,contentType:'application/json',body:'{"message":"boom"}'});
    if (u.includes('/mangas')) {
      const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(seul?MANGA:[MANGA])});
    }
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{id:10,numero:1,titre:'Ch 1',manga_id:1,created_at:'2026-06-01T10:00:00Z'}])});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  const erreursPage = [];
  p.on('pageerror', e => erreursPage.push(e.message));
  await p.goto(BASE + '/manga.html?id=1');
  await p.waitForTimeout(2400);
  check('comptage en échec : la fiche s\'affiche quand même',
    /Darkworld/.test(await p.locator('body').innerText()));
  check('  et aucune erreur JavaScript ne remonte', erreursPage.length === 0,
    erreursPage[0] || '');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
