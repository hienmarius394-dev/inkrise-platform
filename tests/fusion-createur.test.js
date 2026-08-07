/* Fusion de l'espace créateur dans le profil (backlog n°10).

   Deux tableaux de bord pour la même personne : le profil montrait ses
   formations sans permettre de les modifier, l'espace créateur permettait
   de les modifier sans montrer le reste. Pour changer un prix, il fallait
   passer de l'un à l'autre.

   Ce qui est vérifié : que tout se fait DEPUIS LE PROFIL — créer,
   modifier, supprimer — que les anciennes adresses mènent encore au bon
   endroit, et surtout que le bouton « Nouveau pack » est atteignable
   quand on n'a AUCUNE création : il vivait dans une section masquée dans
   ce cas, ce qui aurait enfermé tout créateur débutant. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8149;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

const U = { id:'u1', email:'m@x.fr', aud:'authenticated', user_metadata:{ username:'Marius' } };
const MOI = { id:'u1', username:'Marius', bio:'Dessinateur', avatar_url:null,
              is_creator:true, created_at:'2026-01-05T10:00:00Z' };

const PACK = { id:7, titre:'Dessiner les visages', description:'Un pack complet',
  prix:12, image_url:null, contenu_url:null, objectifs:['Proportions','Expressions'],
  niveau:'Débutant', limite_ventes:20, images:[], auteur_id:'u1', auteur_nom:'Marius' };

async function ouvrir(b, { url = '/profil.html', packs = [PACK], createur = true } = {}) {
  const ctx = await b.newContext({ viewport:{ width:1280, height:1000 } });
  const envois = [];          // tout ce que la page écrit dans packs_tutoriels
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(U)}));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = decodeURIComponent(req.url()), m = req.method();
    if (u.includes('/packs_tutoriels')) {
      if (m !== 'GET' && m !== 'HEAD') {
        envois.push({ methode:m, url:u, corps: req.postData() || '' });
        return r.fulfill({status:200,contentType:'application/json',body:'[]'});
      }
      /* `.single()` réclame un objet, pas un tableau. */
      const seul = (req.headers()['accept']||'').includes('vnd.pgrst.object');
      if (seul) return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(packs[0] || null)});
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(packs)});
    }
    if (m !== 'GET' && m !== 'HEAD')
      return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    if (u.includes('/profiles')) {
      const seul = (req.headers()['accept']||'').includes('vnd.pgrst.object');
      const p = { ...MOI, is_creator: createur };
      return r.fulfill({status:200,contentType:'application/json',
        headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
        body:JSON.stringify(seul ? p : [p])});
    }
    if (u.includes('/achats_packs'))
      return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  await p.goto(BASE + url);
  await p.waitForTimeout(2400);
  return { ctx, p, envois };
}

const ouvrirFormations = async p => {
  await p.click('.ptab[data-tab="formations"]');
  await p.waitForTimeout(500);
};

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Il ne reste qu\'un seul tableau de bord');
{
  const pagesAvecLien = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).filter(f => {
    const s = fs.readFileSync(path.join(ROOT, f), 'utf8')
      .replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
    return /href="espace-createur\.html"|'espace-createur\.html'/.test(s);
  });
  check('aucune page ne renvoie encore vers l\'espace créateur',
    pagesAvecLien.length === 0, pagesAvecLien.join(', ') || 'aucune');
  check('  et le fichier survit comme redirection (les favoris marchent)',
    fs.existsSync(path.join(ROOT, 'espace-createur.html')) &&
    fs.readFileSync(path.join(ROOT, 'espace-createur.html'), 'utf8').length < 4000);
}
{
  const { ctx, p } = await ouvrir(b, { url:'/espace-createur.html?edit=7' });
  p.on('pageerror',e=>errors.push(e.message));
  check('l\'ancienne adresse mène au profil', /profil\.html/.test(p.url()), p.url());
  check('  et garde le pack qu\'on venait éditer', /edit=7/.test(p.url()), p.url());
  check('  le formulaire s\'ouvre bien sur ce pack',
    await p.locator('#packModal.open').count() === 1 &&
    (await p.locator('#packTitre').inputValue()) === 'Dessiner les visages',
    await p.locator('#packTitre').inputValue().catch(()=>'—'));
  await ctx.close();
}

console.log('\n▶ Créer une formation sans quitter la page');
{
  const { ctx, p, envois } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await ouvrirFormations(p);
  await p.click('#btnNouveauPack');
  await p.waitForTimeout(400);
  check('le formulaire s\'ouvre sur place', await p.locator('#packModal.open').count() === 1);
  check('  on est toujours sur le profil', /profil\.html/.test(p.url()), p.url());
  await p.fill('#packTitre', 'Encrage au pinceau');
  await p.fill('#packDesc', 'Le geste, la pression, le trait');
  await p.fill('#packPrix', '8');
  await p.fill('#packObjectifs', 'Tenir le pinceau\nVarier l\'épaisseur');
  await p.click('#packFormSubmit');
  await p.waitForTimeout(900);
  const creation = envois.find(e => e.methode === 'POST');
  check('la création part vers la base', !!creation, JSON.stringify(envois.map(e=>e.methode)));
  const corps = creation ? JSON.parse(creation.corps) : {};
  check('  avec le titre saisi', corps.titre === 'Encrage au pinceau', corps.titre);
  check('  le prix saisi', Number(corps.prix) === 8, String(corps.prix));
  check('  les objectifs découpés ligne à ligne',
    Array.isArray(corps.objectifs) && corps.objectifs.length === 2,
    JSON.stringify(corps.objectifs));
  check('  et l\'auteur, sans quoi la politique RLS refuserait',
    corps.auteur_id === 'u1', corps.auteur_id);
  check('le formulaire se referme après envoi',
    await p.locator('#packModal.open').count() === 0);
  await ctx.close();
}

console.log('\n▶ Modifier et supprimer, au même endroit');
{
  const { ctx, p, envois } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await ouvrirFormations(p);
  check('le pack publié est listé dans « Mes créations »',
    await p.locator('#formationsGrilleCreees .manga-card').count() === 1);
  check('  avec son nombre d\'acheteurs',
    /acheteur/.test(await p.locator('#formationsGrilleCreees .pack-buyers').innerText()),
    await p.locator('#formationsGrilleCreees .pack-buyers').innerText());
  await p.click('#formationsGrilleCreees [data-modifier]');
  await p.waitForTimeout(700);
  check('« Modifier » ouvre le pack rempli',
    (await p.locator('#packTitre').inputValue()) === 'Dessiner les visages',
    await p.locator('#packTitre').inputValue());
  check('  y compris ce qui n\'était pas sur la carte',
    (await p.locator('#packObjectifs').inputValue()).includes('Proportions'),
    JSON.stringify(await p.locator('#packObjectifs').inputValue()));
  check('  et le bouton dit « Enregistrer », pas « Créer »',
    (await p.locator('#packFormSubmit').innerText()).includes('Enregistrer'),
    await p.locator('#packFormSubmit').innerText());
  await p.fill('#packPrix', '15');
  await p.click('#packFormSubmit');
  await p.waitForTimeout(900);
  const maj = envois.find(e => e.methode === 'PATCH');
  check('l\'enregistrement est une mise à jour, pas une création', !!maj,
    JSON.stringify(envois.map(e=>e.methode)));
  check('  ciblée sur ce pack ET sur son auteur',
    !!maj && /id=eq\.7/.test(maj.url) && /auteur_id=eq\.u1/.test(maj.url),
    maj ? maj.url.split('?')[1] : '—');
  await ctx.close();
}
{
  const { ctx, p, envois } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await ouvrirFormations(p);
  await p.click('#formationsGrilleCreees [data-supprimer]');
  await p.waitForTimeout(500);
  const boite = p.locator('.ink-confirm-ov');
  check('supprimer demande confirmation', await boite.count() === 1);
  check('  et nomme la formation concernée',
    /Dessiner les visages/.test(await boite.innerText()),
    (await boite.innerText().catch(()=>'—')).slice(0, 70));
  check('  rien n\'est encore parti',
    !envois.some(e => e.methode === 'DELETE'));
  await p.locator('.ink-confirm-ov button', { hasText:'Supprimer' }).last().click();
  await p.waitForTimeout(800);
  const supp = envois.find(e => e.methode === 'DELETE');
  check('après confirmation, la suppression part', !!supp,
    JSON.stringify(envois.map(e=>e.methode)));
  check('  bornée à ce pack et à son auteur',
    !!supp && /id=eq\.7/.test(supp.url) && /auteur_id=eq\.u1/.test(supp.url),
    supp ? supp.url.split('?')[1] : '—');
  await ctx.close();
}

console.log('\n▶ Un créateur sans aucune formation n\'est pas coincé');
{
  /* Le piège : le bouton « Nouveau pack » vit dans la section « Mes
     créations », qui n'a aucune raison de s'afficher quand on n'a rien
     publié. Sans garde-fou, personne ne pourrait publier son premier. */
  const { ctx, p } = await ouvrir(b, { packs: [] });
  p.on('pageerror',e=>errors.push(e.message));
  await ouvrirFormations(p);
  check('le bouton « Nouveau pack » est visible',
    await p.locator('#btnNouveauPack').isVisible());
  check('  et il fonctionne', await (async () => {
    await p.click('#btnNouveauPack'); await p.waitForTimeout(400);
    return await p.locator('#packModal.open').count() === 1;
  })());
  await ctx.close();
}
{
  // Un simple lecteur, lui, n'a pas à voir un tableau de bord de créateur
  const { ctx, p } = await ouvrir(b, { packs: [], createur: false });
  p.on('pageerror',e=>errors.push(e.message));
  await ouvrirFormations(p);
  check('un lecteur ne voit pas la section de publication',
    !(await p.locator('#btnNouveauPack').isVisible()));
  check('  mais on lui propose d\'en découvrir',
    await p.locator('#formationsEmpty').isVisible());
  await ctx.close();
}

console.log('\n▶ Les raccourcis mènent à l\'onglet, pas à un rechargement');
{
  /* « Ouvrir mon espace 🎨 » pointait vers l'espace créateur. Devenu un
     lien vers cette page même, il rechargerait tout pour changer d'onglet. */
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.click('.ptab[data-tab="infos"]');
  await p.waitForTimeout(400);
  /* Un témoin posé sur window : un rechargement le ferait disparaître.
     C'est la seule preuve directe qu'on n'a pas re-navigué. */
  await p.evaluate(() => { window.__temoin = 'vivant'; });
  await p.click('#btnOpenPlans2');
  await p.waitForTimeout(700);
  check('le bouton du bandeau ouvre l\'onglet Formations',
    await p.locator('#tab-formations.active').count() === 1);
  check('  sans recharger la page',
    (await p.evaluate(() => window.__temoin)) === 'vivant');
  await ctx.close();
}

console.log('\n▶ Le recadrage et la confirmation ne sont plus en double');
{
  const src = fs.readFileSync(path.join(ROOT, 'profil.html'), 'utf8');
  check('une seule fonction de recadrage sur la page',
    (src.match(/function openCropModal/g) || []).length === 1,
    (src.match(/function openCropModal/g) || []).length + ' déclaration(s)');
  check('  et un seul élément #cropImg',
    (src.match(/id="cropImg"/g) || []).length === 1);
  check('la boîte de confirmation partagée est utilisée, pas une copie',
    /inkriseConfirm\(/.test(src) && !/id="confirm-overlay"/.test(src));
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
