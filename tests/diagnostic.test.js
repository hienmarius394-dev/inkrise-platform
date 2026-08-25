/* La page de diagnostic dit-elle la vérité ?
   Écrite après un signalement de production que je ne pouvais pas
   reproduire depuis l'atelier : le proxy de l'environnement bloque le
   domaine Supabase ET le domaine Vercel du site. Sans chemin réseau, pas
   de mesure possible — d'où une page qui mesure depuis le téléphone de la
   personne, c'est-à-dire depuis le seul réseau qui compte.

   Une page de diagnostic qui se trompe est pire qu'aucune : elle envoie
   réparer ce qui n'est pas cassé. Les six situations sont donc rejouées
   ici, et chacune doit produire SON verdict. */
const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/inkrise-platform';
const {CHROME}=require(ROOT+'/tests/_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});
const CAS = {
  'serveur en veille (rien ne répond)': ctx => ctx.route('**supabase.co/**', async r => {
      await new Promise(res=>setTimeout(res,120000)); r.fulfill({status:200,body:'[]'}); }),
  'serveur injoignable (refus net)': ctx => ctx.route('**supabase.co/**', r => r.abort('failed')),
  'clé refusée': ctx => ctx.route('**supabase.co/**', r =>
      r.request().url().includes('apikey')||Object.keys(r.request().headers()).includes('apikey')
        ? r.fulfill({status:401,contentType:'application/json',body:'{"message":"Invalid API key"}'})
        : r.fulfill({status:401,contentType:'application/json',body:'{"message":"No API key found"}'})),
  'table refusée': ctx => ctx.route('**supabase.co/**', r =>
      r.request().url().includes('/mangas')
        ? r.fulfill({status:403,contentType:'application/json',body:'{"message":"permission denied"}'})
        : r.fulfill({status:200,contentType:'application/json',body:'{}'})),
  'téléphone hors ligne': ctx => ctx.route('**supabase.co/**', r => r.abort('failed')),
  'tout va bien': ctx => ctx.route('**supabase.co/**', r =>
      r.fulfill({status:200,contentType:'application/json',body:'[{"id":1}]'})),
};
const ATTENDUS = {
  'serveur en veille (rien ne répond)': 'Le serveur de la base ne répond pas',
  'serveur injoignable (refus net)':    'Le serveur de la base ne répond pas',
  'clé refusée':                        'refuse la clé du site',
  'table refusée':                      'mais pas les données',
  'téléphone hors ligne':               'la connexion du téléphone',
  'tout va bien':                       'Tout répond normalement',
};
const results = [];
const check = (n, p, d = '') => { results.push({n,p,d}); console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`); };

(async()=>{await new Promise(r=>server.listen(Number(process.env.PORT)||8621,r));
console.log('\n▶ Chaque panne produit son propre verdict');
const b=await chromium.launch(CHROME?{executablePath:CHROME}:{});
for (const [nom, poser] of Object.entries(CAS)) {
  const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await poser(ctx);
  /* On simule le téléphone qui SE DÉCLARE hors ligne, sans couper le
     serveur local — sinon la page de diagnostic ne se charge même pas,
     ce qui est un artefact du montage, pas le cas réel (la page est
     déjà chargée, ou servie par le cache). */
  if (nom === 'téléphone hors ligne')
    await ctx.addInitScript(() => Object.defineProperty(navigator, 'onLine', { get: () => false }));
  const p=await ctx.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto('http://localhost:'+(Number(process.env.PORT)||8621)+'/diagnostic.html',{waitUntil:'domcontentloaded'});
  await p.waitForSelector('#verdict', {state:'visible', timeout:60000}).catch(()=>{});
  const v=await p.locator('#verdict h2').innerText().catch(()=>'(aucun verdict)');
  const attendu = ATTENDUS[nom];
  check('« ' + nom +' » → ' + attendu, v.includes(attendu), v);
  if (errs.length) check('  sans erreur JS pendant « ' + nom + ' »', false, errs[0].slice(0, 80));
  await ctx.close();
}
await b.close();server.close();
console.log('\n' + '\u2550'.repeat(56));
const ko = results.filter(r => !r.p);
console.log(`${results.length - ko.length}/${results.length} vérifications OK`);
if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.n + (r.d ? ' — ' + r.d : ''))); process.exit(1); }
})();
