/* L'onglet « Communauté » sans identifiant : fil des créateurs suivis et
   découverte des espaces actifs.

   Avant, une personne connectée était redirigée vers son propre mur : un
   nouveau créateur (zéro abonné) atterrissait donc sur une page où il se
   parlait à lui-même, sans aucun chemin vers le mur de quelqu'un d'autre. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8119;
const BASE = 'http://localhost:' + PORT;
const U = { id:'moi', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

const PROFILS = [
  { id:'moi',  username:'Marius', avatar_url:null, bio:'Moi' },
  { id:'ami',  username:'Aya',    avatar_url:null, bio:'Dessinatrice de Kaze' },
  { id:'incon',username:'Kenji',  avatar_url:null, bio:'Auteur de Ronin' },
];
const POSTS = [
  { id:1, creator_id:'ami',  auteur_id:'ami',  type:'post',    contenu:'Nouveau chapitre de Kaze demain !', image_url:null, created_at:'2026-08-01T10:00:00Z' },
  { id:2, creator_id:'ami',  auteur_id:'moi',  type:'post',    contenu:'Hâte de lire ça',                   image_url:null, created_at:'2026-07-30T10:00:00Z' },
  { id:3, creator_id:'incon',auteur_id:'incon',type:'annonce', contenu:'Ronin tome 2 en cours',             image_url:null, created_at:'2026-07-20T10:00:00Z' },
];

/* `suivis` pilote ce que renvoie la table follows d'un scénario à l'autre. */
async function ouvrir(b, { session, suivis, posts }) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  if (session) {
    await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
        expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
    await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({...U,aud:'authenticated'})}));
  } else {
    await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  }
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/rest/v1/**',r=>{
    const u = decodeURIComponent(r.request().url());
    let rows = [];
    if (u.includes('/follows')) rows = (suivis||[]).map(id=>({followed_id:id}));
    else if (u.includes('posts_communaute')) {
      rows = posts === undefined ? POSTS : posts;
      const m = u.match(/creator_id=in\.\(([^)]*)\)/);
      if (m) { const ok = m[1].split(',').map(x=>x.replace(/"/g,'')); rows = rows.filter(p=>ok.includes(p.creator_id)); }
    }
    else if (u.includes('/profiles')) rows = PROFILS;
    // maybeSingle()/single() demandent un objet, pas un tableau : sans ça
    // la page du mur reçoit un tableau là où elle attend un profil.
    const u2 = r.request().url();
    if (u2.includes('/profiles')) {
      const m2 = u2.match(/id=eq\.([^&]+)/);
      if (m2) rows = rows.filter(x => x.id === decodeURIComponent(m2[1]));
    }
    const seul = (r.request().headers()['accept']||'').includes('vnd.pgrst.object');
    r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/'+rows.length,'Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul ? (rows[0] || null) : rows)});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  return { ctx, p };
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Connecté, suit un créateur → son fil');
{
  const { ctx, p } = await ouvrir(b, { session:true, suivis:['ami'] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/communaute.html'); await p.waitForTimeout(1800);
  check('on n\'est plus redirigé vers son propre mur',
    !/[?&]id=/.test(p.url()), p.url().replace(BASE,''));
  const t = await p.evaluate(()=>document.body.innerText);
  check('les deux onglets sont proposés', /Mon fil/.test(t) && /Découvrir/.test(t));
  check('« Mon fil » est ouvert par défaut',
    await p.locator('[data-onglet=fil]').getAttribute('aria-selected')==='true');
  check('la publication du créateur suivi apparaît', /Nouveau chapitre de Kaze/.test(t));
  check('celle d\'un créateur non suivi n\'apparaît pas', !/Ronin tome 2/.test(t));
  check('le nom de l\'auteur est affiché', /Aya/.test(t));
  check('un message posté chez un autre indique chez qui', /chez Aya/.test(t));
  const href = await p.locator('a.post-card').first().getAttribute('href');
  check('chaque carte mène au mur concerné', href==='communaute.html?id=ami', href);
  await ctx.close();
}

console.log('\n▶ Onglet Découvrir : trouver d\'autres espaces');
{
  const { ctx, p } = await ouvrir(b, { session:true, suivis:['ami'] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/communaute.html'); await p.waitForTimeout(1800);
  await p.locator('[data-onglet=decouvrir]').click();
  await p.waitForTimeout(900);
  const t = await p.evaluate(()=>document.body.innerText);
  check('les espaces actifs sont listés', /Aya/.test(t) && /Kenji/.test(t));
  check('un créateur inconnu est atteignable — la découverte existe enfin',
    (await p.locator('a[href="communaute.html?id=incon"]').count())>0);
  check('le nombre de publications est indiqué', /publication/.test(t));
  check('les espaces déjà suivis sont marqués', /SUIVI/.test(t));
  check('l\'espace le plus actif est en tête',
    (await p.locator('a.post-card').first().getAttribute('href'))==='communaute.html?id=ami');
  await ctx.close();
}

console.log('\n▶ Connecté mais ne suit personne');
{
  const { ctx, p } = await ouvrir(b, { session:true, suivis:[] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/communaute.html'); await p.waitForTimeout(1800);
  check('on ouvre directement sur Découvrir, pas sur un fil vide',
    await p.locator('[data-onglet=decouvrir]').getAttribute('aria-selected')==='true');
  const t = await p.evaluate(()=>document.body.innerText);
  check('des créateurs à suivre sont proposés', /Aya|Kenji/.test(t));
  await p.locator('[data-onglet=fil]').click(); await p.waitForTimeout(700);
  const t2 = await p.evaluate(()=>document.body.innerText);
  check('le fil explique quoi faire plutôt que rester vide', /ne suis encore personne/i.test(t2));
  await p.locator('a[href="#decouvrir"]').click(); await p.waitForTimeout(700);
  check('son bouton ramène bien à Découvrir',
    await p.locator('[data-onglet=decouvrir]').getAttribute('aria-selected')==='true');
  await ctx.close();
}

console.log('\n▶ Déconnecté');
{
  const { ctx, p } = await ouvrir(b, { session:false, suivis:[] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/communaute.html'); await p.waitForTimeout(1800);
  const t = await p.evaluate(()=>document.body.innerText);
  check('les espaces restent consultables sans compte', /Aya|Kenji/.test(t));
  await p.locator('[data-onglet=fil]').click(); await p.waitForTimeout(700);
  check('le fil invite à se connecter',
    /Connecte-toi/.test(await p.evaluate(()=>document.body.innerText)));
  await ctx.close();
}

console.log('\n▶ Site encore vide');
{
  const { ctx, p } = await ouvrir(b, { session:true, suivis:[], posts:[] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/communaute.html'); await p.waitForTimeout(1800);
  const t = await p.evaluate(()=>document.body.innerText);
  check('un état vide explicite, pas une page blanche', /Aucun espace actif/.test(t));
  check('  avec une action proposée', (await p.locator('.empty-state a').count())>0);
  await ctx.close();
}

console.log('\n▶ Le mur d\'un créateur fonctionne toujours');
{
  const { ctx, p } = await ouvrir(b, { session:true, suivis:['ami'] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/communaute.html?id=ami'); await p.waitForTimeout(2000);
  const t = await p.evaluate(()=>document.body.innerText);
  check('le mur ciblé s\'affiche comme avant', /Nouveau chapitre de Kaze/.test(t));
  check('  et pas les onglets du fil', (await p.locator('[data-onglet]').count())===0);
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
