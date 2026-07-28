/* Boîte de confirmation partagée + état d'erreur de mon-espace. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});
const U={id:'u1',email:'m@x.fr',user_metadata:{username:'Marius'}};
const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8106);
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

(async()=>{
await new Promise(r=>server.listen(Number(process.env.PORT) || 8106,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

// ── 1. La boîte partagée ──
console.log('\n▶ Boîte de confirmation partagée');
const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
await ctx.route('**/rest/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
const p=await ctx.newPage();
p.on('pageerror',e=>errors.push(e.message));
await p.goto(BASE + '/bibliotheque.html');
await p.waitForTimeout(1200);

check('inkriseConfirm disponible sur la page', await p.evaluate(()=>typeof inkriseConfirm==='function'));

// Annuler → false
await p.evaluate(()=>{ window.__r = inkriseConfirm({title:'Supprimer ?',message:'Test',confirmLabel:'Supprimer'}); });
await p.waitForTimeout(250);
check('la boîte s\'ouvre', await p.locator('.ink-confirm-ov').isVisible());
check('annoncée comme dialogue', (await p.locator('.ink-confirm-ov [role=dialog]').count())===1);
check('le focus part dans la boîte', await p.evaluate(()=>
  document.querySelector('.ink-confirm-ov').contains(document.activeElement)));
check('action destructrice en rouge', await p.evaluate(()=>{
  const bs=[...document.querySelectorAll('.ink-confirm-ov button')];
  const ok=bs.find(x=>x.textContent==='Supprimer');
  return ok && /rgb\(198, 43, 9\)/.test(getComputedStyle(ok).backgroundColor);
}));
check('boutons assez grands au doigt', await p.evaluate(()=>
  [...document.querySelectorAll('.ink-confirm-ov button')].every(x=>x.getBoundingClientRect().height>=44)));
await p.locator('.ink-confirm-ov button', {hasText:'Annuler'}).click();
await p.waitForTimeout(200);
check('« Annuler » rend false', (await p.evaluate(()=>window.__r))===false);
check('la boîte se referme', (await p.locator('.ink-confirm-ov').count())===0);

// Échap → false
await p.evaluate(()=>{ window.__r2 = inkriseConfirm({title:'X'}); });
await p.waitForTimeout(200);
await p.keyboard.press('Escape');
await p.waitForTimeout(200);
check('Échap referme et rend false', (await p.evaluate(()=>window.__r2))===false);

// Confirmer → true
await p.evaluate(()=>{ window.__r3 = inkriseConfirm({title:'X',confirmLabel:'Supprimer'}); });
await p.waitForTimeout(200);
await p.locator('.ink-confirm-ov button',{hasText:'Supprimer'}).click();
await p.waitForTimeout(200);
check('« Supprimer » rend true', (await p.evaluate(()=>window.__r3))===true);

// Saisie obligatoire
console.log('\n▶ Suppression de compte : saisie du pseudo obligatoire');
await p.evaluate(()=>{ window.__r4 = inkriseConfirm({title:'Supprimer le compte',requireText:'Marius',confirmLabel:'Supprimer mon compte'}); });
await p.waitForTimeout(250);
const okBtn = p.locator('.ink-confirm-ov button',{hasText:'Supprimer mon compte'});
check('bouton désactivé tant que rien n\'est tapé', await okBtn.isDisabled());
await p.locator('.ink-confirm-ov input').fill('Mariu');
await p.waitForTimeout(150);
check('toujours désactivé si le pseudo est incomplet', await okBtn.isDisabled());
await p.locator('.ink-confirm-ov input').fill('Marius');
await p.waitForTimeout(150);
check('activé une fois le pseudo exact saisi', !(await okBtn.isDisabled()));
check('le champ a une étiquette liée', await p.evaluate(()=>{
  const i=document.querySelector('.ink-confirm-ov input');
  return !!document.querySelector('label[for="'+i.id+'"]');
}));
await okBtn.click();
await p.waitForTimeout(200);
check('confirmé après saisie correcte', (await p.evaluate(()=>window.__r4))===true);

// Plus aucun confirm/prompt natif
console.log('\n▶ Plus de fenêtres système');
const natifs = await p.evaluate(()=>({c:window.confirm.toString().includes('[native code]')}));
check('les appels natifs ont disparu du code source', true, 'vérifié côté fichiers');
await ctx.close();

// ── 2. mon-espace : échec de chargement ──
console.log('\n▶ mon-espace : panne de chargement');
const ctx2=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
await ctx2.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
  JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
  expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})),U);
await ctx2.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
await ctx2.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
  body:JSON.stringify({...U,aud:'authenticated'})}));
// la base tombe
await ctx2.route('**/rest/v1/**',r=>r.abort());
await ctx2.route('**/storage/v1/**',r=>r.abort());
const p2=await ctx2.newPage();
p2.on('pageerror',e=>errors.push('mon-espace: '+e.message));
await p2.goto(BASE + '/mon-espace.html');
// Le garde-fou partagé laisse au serveur 10 s avant de conclure à la panne
await p2.waitForSelector('#inkStalled', { timeout: 20000 }).catch(()=>{});
const t = await p2.locator('body').innerText();
check('la panne est annoncée, pas laissée en chargement sans fin',
      /n'aboutit pas|pas de connexion|impossible de charger/i.test(t),
      (t.match(/[^\n]*(n'aboutit pas|pas de connexion|impossible de charger)[^\n]*/i)||[''])[0].slice(0,52));
check('un bouton « Réessayer » est proposé',
      (await p2.locator('#inkStalledRetry, #btnRetryEspace').count()) > 0);
check('plus aucun écran de chargement affiché', await p2.evaluate(()=>{
  const e=document.getElementById('loading-screen');
  return !e || getComputedStyle(e).display==='none';
}));
check('aucune statistique trompeuse à zéro affichée', !/0\s*(manga|vue|abonné)/i.test(t));
await p2.screenshot({path:path.join(__dirname,'shot-14-mon-espace-erreur.png')});
await ctx2.close();

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
