/* Inscription : consentement aux conditions, et connexion Google.

   Les CGU affirment « en créant un compte, tu acceptes ces conditions »,
   mais rien ne le demandait ni ne le montrait à l'écran. Une case à
   cocher, jamais pré-cochée : un consentement pré-donné n'en est pas un.

   Le bouton Google n'apparaît que si le fournisseur est réellement
   configuré (INKRISE_GOOGLE). Un bouton qui renvoie une erreur de
   configuration coûte plus cher que pas de bouton : la personne croit
   que le site est cassé, et repart. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8145;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

async function ouvrir(b, { google = false, url = '/auth.html' } = {}) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const inscriptions = [];
  /* Poser le drapeau avant le chargement de la page ne servait à rien :
     `assets/inkrise-config.js` se charge ensuite et le remet à false.
     On sert donc une config réellement activée — c'est aussi le geste que
     fera le propriétaire du site. */
  if (google) await ctx.route('**/assets/inkrise-config.js', r => r.fulfill({
    status: 200, contentType: 'text/javascript',
    body: fs.readFileSync(path.join(ROOT, 'assets/inkrise-config.js'), 'utf8')
            .replace('window.INKRISE_GOOGLE = false;', 'window.INKRISE_GOOGLE = true;')
  }));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    if (u.includes('/signup')) {
      inscriptions.push(JSON.parse(req.postData() || '{}'));
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify({ user:{ id:'u1', email:'m@x.fr' }, session:null })});
    }
    return r.fulfill({status:401,contentType:'application/json',body:'{}'});
  });
  await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'}));
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  await p.goto(BASE + url);
  await p.waitForTimeout(1400);
  await p.locator('[onclick*="signup"]').first().click().catch(()=>{});
  await p.waitForTimeout(500);
  return { ctx, p, inscriptions };
}

async function remplir(p) {
  await p.fill('#signupUsername', 'nouveau_lecteur');
  await p.fill('#signupEmail', 'nouveau@exemple.fr');
  await p.fill('#signupPassword', 'motdepasse123');
  await p.waitForTimeout(400);   // la vérification du pseudo est asynchrone
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ On ne crée pas de compte sans accepter les conditions');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  const case_ = p.locator('#signupCgu');
  check('une case est proposée', await case_.count() === 1);
  check('  jamais pré-cochée', !(await case_.isChecked()));
  check('  les conditions sont atteignables',
    await p.locator('.field-cgu a[href="cgu.html"]').count() === 1);
  check('  la confidentialité aussi',
    await p.locator('.field-cgu a[href="confidentialite.html"]').count() === 1);
  check('  et les liens s\'ouvrent à côté (le formulaire n\'est pas perdu)',
    await p.locator('.field-cgu a').first().getAttribute('target') === '_blank');
  await ctx.close();
}
{
  const { ctx, p, inscriptions } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await remplir(p);
  await p.click('#signupBtn');
  await p.waitForTimeout(900);
  check('case décochée : aucune inscription n\'est envoyée',
    inscriptions.length === 0, JSON.stringify(inscriptions));
  check('  et la raison est dite', /conditions/i.test(await p.locator('#signupMsg').innerText()),
    await p.locator('#signupMsg').innerText());
  await ctx.close();
}
{
  const { ctx, p, inscriptions } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await remplir(p);
  await p.check('#signupCgu');
  await p.click('#signupBtn');
  await p.waitForTimeout(1200);
  check('case cochée : l\'inscription part', inscriptions.length === 1,
    JSON.stringify(inscriptions).slice(0, 90));
  check('  avec le pseudo saisi',
    inscriptions[0] && inscriptions[0].data && inscriptions[0].data.username === 'nouveau_lecteur',
    JSON.stringify(inscriptions[0] && inscriptions[0].data));
  await ctx.close();
}

console.log('\n▶ Connexion Google : rien tant qu\'elle n\'est pas configurée');
{
  const { ctx, p } = await ouvrir(b, { google:false });
  p.on('pageerror',e=>errors.push(e.message));
  check('non configurée : aucun bouton Google',
    !(await p.locator('#googleSignup').isVisible()) &&
    !(await p.locator('#googleLogin').isVisible()));
  check('  la connexion par email reste entière',
    await p.locator('#signupBtn').isVisible());
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { google:true });
  p.on('pageerror',e=>errors.push(e.message));
  check('configurée : le bouton apparaît à l\'inscription',
    await p.locator('#googleSignup').isVisible());
  check('  et à la connexion',
    await p.locator('#googleLogin').count() === 1);
  check('  il est décrit, pas seulement dessiné',
    /Google/.test(await p.locator('#googleSignup button').innerText()),
    await p.locator('#googleSignup button').innerText());
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
