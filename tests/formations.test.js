/* Onglet « Formations » du profil : créations et achats séparés, et
   chemin direct vers l'édition d'un pack.

   Les deux étaient mélangés dans une seule grille : on ne voyait pas d'un
   coup d'œil ce qu'on pouvait modifier, et rien ne menait à l'édition —
   il fallait savoir que ça se passait dans l'espace créateur (§3.2). */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8127;
const BASE = 'http://localhost:' + PORT;
const U = { id:'moi', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

const MIEN   = { id:7, titre:'Encrage avancé', auteur_id:'moi', prix:5, image_url:null, description:'d', contenu_url:'x', images:[], niveau:'debutant', objectifs:[], created_at:'2026-05-01T10:00:00Z' };
const ACHETE = { id:9, titre:'Perspective', auteur_id:'autre', prix:0, image_url:null, description:'d', contenu_url:'x', images:[], niveau:'debutant', objectifs:[], created_at:'2026-05-02T10:00:00Z' };

async function ouvrir(b, { packsCrees, achats }) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...U,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    if (req.method()!=='GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    let rows=[];
    if (u.includes('achats_packs') && u.includes('packs_tutoriels'))
      rows = achats.map(p=>({ packs_tutoriels: p }));
    else if (u.includes('achats_packs')) rows = achats.map(p=>({ pack_id:p.id }));
    else if (u.includes('packs_tutoriels')) rows = packsCrees;
    else if (u.includes('/profiles')) rows = [{ id:'moi', username:'Marius', is_creator:true, avatar_url:null, bio:'', created_at:'2026-01-01T10:00:00Z' }];
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/'+rows.length,'Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul?(rows[0]||null):rows)});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  return { ctx, p };
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Créations et achats sont distingués');
{
  const { ctx, p } = await ouvrir(b, { packsCrees:[MIEN], achats:[ACHETE] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/profil.html'); await p.waitForTimeout(2000);
  await p.locator('.ptab[data-tab=formations]').click(); await p.waitForTimeout(1200);

  check('la section « Mes créations » est affichée', await p.locator('#formationsCreees').isVisible());
  check('la section « Mes achats » aussi', await p.locator('#formationsAchetees').isVisible());
  const cree = await p.locator('#formationsGrilleCreees').innerText();
  const achat = await p.locator('#formationsGrilleAchetees').innerText();
  check('le pack créé est du bon côté', /Encrage avancé/.test(cree) && !/Encrage avancé/.test(achat));
  check('le pack acheté aussi', /Perspective/.test(achat) && !/Perspective/.test(cree));
  check('le prix de vente est rappelé sur ses créations', /5\s*€/.test(cree), cree.replace(/\n/g,' | '));
  await ctx.close();
}

console.log('\n▶ Chemin direct vers l\'édition');
{
  const { ctx, p } = await ouvrir(b, { packsCrees:[MIEN], achats:[ACHETE] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/profil.html'); await p.waitForTimeout(2000);
  await p.locator('.ptab[data-tab=formations]').click(); await p.waitForTimeout(1200);

  const gerer = p.locator('#formationsGrilleCreees a[href*="edit="]');
  check('un bouton « Gérer » sur le pack créé', await gerer.count()===1);
  check('  il vise le bon pack', await gerer.getAttribute('href')==='espace-createur.html?edit=7',
    await gerer.getAttribute('href'));
  check('aucun bouton « Gérer » sur un pack acheté',
    await p.locator('#formationsGrilleAchetees a[href*="edit="]').count()===0);

  // Le lien doit réellement ouvrir le formulaire d'édition, pas juste la page
  await gerer.click();
  await p.waitForTimeout(2500);
  check('le clic mène à l\'espace créateur', /espace-createur\.html\?edit=7/.test(p.url()), p.url());
  const modale = p.locator('#modal-overlay');
  check('  et ouvre directement le formulaire du pack', await modale.isVisible());
  check('  pré-rempli avec le bon titre',
    await p.locator('#f-titre').inputValue()==='Encrage avancé',
    await p.locator('#f-titre').inputValue());
  await ctx.close();
}

console.log('\n▶ Rien de créé : pas de section vide');
{
  const { ctx, p } = await ouvrir(b, { packsCrees:[], achats:[ACHETE] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/profil.html'); await p.waitForTimeout(2000);
  await p.locator('.ptab[data-tab=formations]').click(); await p.waitForTimeout(1200);
  check('« Mes créations » reste masquée', !(await p.locator('#formationsCreees').isVisible()));
  check('« Mes achats » est affichée', await p.locator('#formationsAchetees').isVisible());
  await ctx.close();
}

console.log('\n▶ L\'espace créateur ne se fait plus passer pour un tableau de bord');
{
  const { ctx, p } = await ouvrir(b, { packsCrees:[MIEN], achats:[] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/espace-createur.html'); await p.waitForTimeout(2200);
  const t = await p.evaluate(()=>document.body.innerText);
  check('plus de « Bienvenue » qui double l\'accueil du profil', !/Bienvenue,/.test(t));
  check('un retour vers le profil est proposé',
    await p.locator('#hero a[href="profil.html"]').count()===1);
  check('la gestion des packs fonctionne toujours', /Encrage avancé/.test(t));
  await ctx.close();
}

console.log('\n▶ La page Tutoriels ne propose pas de filtres vides');
{
  const UN = { id:1, titre:'Encrage avancé', description:'Encrage au pinceau.', prix:5,
               auteur_id:'autre', couverture_url:null, contenu_url:'x', images:[],
               niveau:'Intermédiaire', objectifs:[], created_at:'2026-05-01T10:00:00Z' };
  const COULEUR = { ...UN, id:2, titre:'Mise en couleur', description:'Couleur numérique.' };

  async function tutoriels(packs) {
    const { ctx, p } = await ouvrir(b, { packsCrees:packs, achats:[] });
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(BASE+'/tutoriels.html'); await p.waitForTimeout(1800);
    return { ctx, p };
  }

  // Un seul thème représenté : filtrer ne peut rien restreindre
  {
    const { ctx, p } = await tutoriels([UN]);
    check('un seul thème : la rangée de filtres est masquée',
      !(await p.locator('.filters-wrap').isVisible()));
    check('  les packs restent affichés', /Encrage avancé/.test(await p.locator('#packsGrid').innerText()));
    await ctx.close();
  }
  // Deux thèmes : la rangée revient, sans les catégories à zéro
  {
    const { ctx, p } = await tutoriels([UN, COULEUR]);
    check('deux thèmes : la rangée réapparaît', await p.locator('.filters-wrap').isVisible());
    const vus = await p.locator('#filterBtns .filter-btn:visible').allInnerTexts();
    check('  aucun filtre à (0) n\'est proposé', !vus.some(t=>/\(0\)/.test(t)), vus.join(' | '));
    check('  « Encrage » et « Couleur » sont là',
      vus.some(t=>/Encrage/.test(t)) && vus.some(t=>/Couleur/.test(t)), vus.join(' | '));
    check('  « Tout » compte les deux packs', vus.some(t=>/Tout \(2\)/.test(t)), vus.join(' | '));
    await ctx.close();
  }
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
