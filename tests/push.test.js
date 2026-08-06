/* Notifications push : ce que fait le service worker quand un message
   arrive alors que le site est fermé, et ce que fait la page Paramètres
   quand la clé VAPID n'est pas encore configurée.

   On ne peut pas faire transiter un vrai push par un service de push
   externe depuis un test ; on déclenche donc l'événement `push` sur le
   service worker enregistré, ce qui exécute exactement le même code. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8133;
const BASE = 'http://localhost:' + PORT;
const U = { id:'moi', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Le service worker reçoit et affiche');
{
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'}));
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/index.html');
  await p.waitForFunction(()=>navigator.serviceWorker.controller || navigator.serviceWorker.ready, null, {timeout:15000});
  const sw = await ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker', {timeout:15000});
  check('le service worker est enregistré', !!sw);

  /* On observe les notifications affichées en remplaçant showNotification
     dans le worker lui-même : c'est ce que le vrai push déclenchera. */
  await sw.evaluate(()=>{
    self.__affichees = [];
    self.registration.showNotification = (titre, options) => {
      self.__affichees.push({ titre, options });
      return Promise.resolve();
    };
  });

  // Un push complet
  await sw.evaluate(()=>{
    const e = new Event('push');
    e.data = { json: () => ({ titre:'Nouveau chapitre', corps:'Kaze — chapitre 12 est sorti', lien:'manga.html?id=7', tag:'chap-7' }) };
    e.waitUntil = (pr)=>pr;
    self.dispatchEvent(e);
  });
  await p.waitForTimeout(400);
  let vues = await sw.evaluate(()=>self.__affichees);
  check('une notification est affichée', vues.length===1, JSON.stringify(vues));
  check('  avec le titre reçu', vues[0] && vues[0].titre==='Nouveau chapitre', vues[0] && vues[0].titre);
  check('  le corps reçu', vues[0] && vues[0].options.body==='Kaze — chapitre 12 est sorti');
  check('  et le lien mémorisé pour le clic',
    vues[0] && vues[0].options.data.lien==='manga.html?id=7', vues[0] && JSON.stringify(vues[0].options.data));
  check('  regroupée par tag, pour ne pas empiler', vues[0] && vues[0].options.tag==='chap-7');

  // Un push sans charge utile : le navigateur exige quand même un affichage
  await sw.evaluate(()=>{ self.__affichees = []; });
  await sw.evaluate(()=>{
    const e = new Event('push');
    e.data = null;
    e.waitUntil = (pr)=>pr;
    self.dispatchEvent(e);
  });
  await p.waitForTimeout(400);
  vues = await sw.evaluate(()=>self.__affichees);
  check('un push vide affiche quand même quelque chose', vues.length===1, JSON.stringify(vues));
  check('  (sinon le navigateur finit par couper l\'abonnement)',
    vues[0] && !!vues[0].options.body && !!vues[0].titre);

  // Charge utile illisible
  await sw.evaluate(()=>{ self.__affichees = []; });
  await sw.evaluate(()=>{
    const e = new Event('push');
    e.data = { json: () => { throw new Error('pas du JSON'); }, text: () => 'coucou' };
    e.waitUntil = (pr)=>pr;
    self.dispatchEvent(e);
  });
  await p.waitForTimeout(400);
  vues = await sw.evaluate(()=>self.__affichees);
  check('une charge illisible retombe sur le texte brut',
    vues.length===1 && vues[0].options.body==='coucou', JSON.stringify(vues));

  await ctx.close();
}

console.log('\n▶ Paramètres sans clé VAPID configurée');
{
  const ctx=await b.newContext({viewport:{width:390,height:844}});
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...U,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
    body:JSON.stringify((r.request().headers()['accept']||'').includes('vnd.pgrst.object')
      ? {id:'moi',username:'Marius',pref_masquer_adulte:true,pref_notif_chapitres:true,pref_notif_social:true,pref_notif_push:false}
      : [])}));
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/parametres.html'); await p.waitForTimeout(1800);
  check('aucun interrupteur push tant que la clé manque',
    await p.locator('#prefPush').count()===0);
  /* Et rien d'autre non plus : l'ancien message « pas encore activées »
     s'affichait sous deux interrupteurs cochés, où il se lisait comme une
     panne. Ce n'est ni un défaut ni une action possible pour la personne. */
  check('  et pas d\'avertissement qui ressemble à une panne',
    (await p.locator('#zonePush').innerText()).trim()==='',
    JSON.stringify(await p.locator('#zonePush').innerText()));
  await ctx.close();
}

console.log('\n▶ Paramètres avec une clé VAPID');
{
  const ctx=await b.newContext({viewport:{width:390,height:844},
    permissions:['notifications'], origin: BASE});
  await ctx.addInitScript(u=>{
    localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
        expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u}));
  }, U);
  /* On sert un assets/inkrise-config.js renseigné, plutôt que d'injecter la
     variable avant : c'est bien ce fichier qui fixe la valeur finale, et le
     tester autrement contournerait le mécanisme réel. */
  await ctx.route('**/assets/inkrise-config.js', r=>r.fulfill({status:200,
    contentType:'text/javascript',
    body:"window.INKRISE_VAPID_PUBLIC='BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJhBbLtLM4RQFHKvzZzKFPtQ0zk';window.INKRISE_ANALYTICS={script:'',domaine:''};"}));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...U,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
    body:JSON.stringify((r.request().headers()['accept']||'').includes('vnd.pgrst.object')
      ? {id:'moi',username:'Marius',pref_masquer_adulte:true,pref_notif_chapitres:true,pref_notif_social:true,pref_notif_push:false}
      : [])}));
  const p=await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/parametres.html'); await p.waitForTimeout(2200);
  check('l\'interrupteur push apparaît', await p.locator('#prefPush').count()===1);
  check('  éteint tant qu\'on ne s\'est pas abonné',
    await p.locator('#prefPush').getAttribute('aria-checked')==='false');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
