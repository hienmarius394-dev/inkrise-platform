/* Retour à la destination après connexion + refus des redirections externes. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});
const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8107);
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

(async()=>{
await new Promise(r=>server.listen(Number(process.env.PORT) || 8107,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,contentType:'application/json',body:'{"error":"x"}'}));
await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));

console.log('\n▶ Une page réservée transmet la destination');
/* `espace-createur.html` n'est plus une page : elle redirige vers l'onglet
   Formations du profil (les deux tableaux de bord ont fusionné). La
   destination attendue n'est donc plus son propre nom — mais la chaîne
   doit continuer de mener quelque part, et de dire POURQUOI on demande
   une connexion. */
for (const [page, raison, attendu] of [
      ['upload-manga.html','createur','upload-manga.html'],
      ['gestion-chapitres.html?manga_id=1','createur','gestion-chapitres.html'],
      ['profil.html','connexion','profil.html'],
      ['espace-createur.html','createur','profil.html?tab=formations']]) {
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(page+': '+e.message));
  p.goto(BASE + '/'+page).catch(()=>{});
  await p.waitForFunction(()=>location.pathname.endsWith('auth.html'),{timeout:12000}).catch(()=>{});
  const u=new URL(p.url());
  check(`${page.split('?')[0]} → renvoie vers la connexion en gardant la destination`,
        u.pathname.endsWith('auth.html') && (u.searchParams.get('next')||'').startsWith(attendu),
        'next=' + u.searchParams.get('next'));
  check(`  et dit pourquoi (raison=${raison})`,
        u.searchParams.get('raison') === raison,
        'raison=' + u.searchParams.get('raison'));
  if (page.includes('gestion-chapitres')) {
    check('les paramètres de la page sont conservés',
          (u.searchParams.get('next')||'').includes('manga_id=1'),
          u.searchParams.get('next'));
  }
  // Après redirection, attendre que la page d'arrivée ait fini de s'exécuter
  await p.waitForLoadState('load').catch(()=>{});
  await p.waitForSelector('#loginForm [role=status]',{timeout:8000}).catch(()=>{});
  const note = await p.evaluate(()=>{
    const n=[...document.querySelectorAll('[role=status]')].map(e=>e.textContent.trim());
    return n.join(' | ');
  });
  check(`  et explique pourquoi (${raison})`, note.length>10, note.slice(0,50));
  await p.close();
}

console.log('\n▶ Après connexion, on revient au bon endroit');
const p2=await ctx.newPage();
p2.on('pageerror',e=>errors.push('auth: '+e.message));
await p2.goto(BASE + '/auth.html?next=upload-manga.html&raison=createur');
await p2.waitForTimeout(1000);
check('destination retenue', (await p2.evaluate(()=>destinationApresConnexion('index.html')))==='upload-manga.html');
check('destination avec paramètres retenue',
      (await p2.evaluate(()=>{history.replaceState({},'','auth.html?next='+encodeURIComponent('gestion-chapitres.html?manga_id=7'));
        return destinationApresConnexion('index.html');}))==='gestion-chapitres.html?manga_id=7');

console.log('\n▶ Une destination extérieure est refusée');
for (const mauvais of ['https://evil.example/x','//evil.example/x','/etc/passwd','javascript:alert(1)','inconnu.html']) {
  const got = await p2.evaluate((m)=>{ history.replaceState({},'','auth.html?next='+encodeURIComponent(m));
    return destinationApresConnexion('index.html'); }, mauvais);
  check(`refusé : ${mauvais.slice(0,26)}`, got==='index.html', 'renvoie ' + got);
}
check('sans destination, comportement inchangé',
      (await p2.evaluate(()=>{history.replaceState({},'','auth.html');return destinationApresConnexion('index.html');}))==='index.html');

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,120)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
