/* Page d'un pack tutoriel : trois incohérences relevées à la relecture du
   texte affiché (pas des plantages — des phrases fausses).

   1. L'en-tête annonçait « par Créateur » pendant que la carte du bas
      affichait le vrai pseudo : `auteur_nom` n'existe pas dans la table.
   2. « 🔒 Paiement sécurisé » restait sous « Télécharger le pack » — donc
      promis à quelqu'un qui ne paiera rien (pack déjà acheté, ou le sien).
   3. L'auteur voyait le formulaire « Laisser un avis » sur son propre pack,
      alors que la politique RLS le refuse : clic garanti en erreur. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8129;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

const AUTEUR = { id:'lea', username:'Léa Kouassi', bio:'Encreuse depuis 2019.', avatar_url:null };
const MOI    = { id:'moi', username:'Marius', bio:'', avatar_url:null };
const PACK = {
  id:42, titre:'Encrage avancé', auteur_id:'lea', prix:12, image_url:null,
  description:'Douze planches commentées.', contenu_url:'https://x/pack.zip',
  images:[], niveau:'Intermédiaire', objectifs:[], ventes:0, limite_ventes:null,
  created_at:'2026-05-01T10:00:00Z'
};

/* `qui` : null = visiteur, sinon l'id connecté. `achat` : a-t-il acheté. */
async function ouvrir(b, { qui=null, achat=false, prix=12, avis=[] } = {}) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  if (qui) {
    const u = { id:qui, email:qui+'@x.fr', user_metadata:{ username: qui==='lea'?'Léa Kouassi':'Marius' } };
    await ctx.addInitScript(user=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
        expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user})), u);
    await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({...u,aud:'authenticated'})}));
  }
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    if (req.method()!=='GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    let rows=[];
    if (u.includes('packs_tutoriels'))   rows=[{ ...PACK, prix }];
    else if (u.includes('achats_packs')) rows= achat ? [{ id:1 }] : [];
    else if (u.includes('avis_packs'))   rows= avis;
    else if (u.includes('/profiles'))    rows= u.includes('id=eq.lea') ? [AUTEUR] : [MOI];
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/'+rows.length,'Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul?(rows[0]||null):rows)});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  await p.goto(BASE+'/pack.html?id=42');
  await p.waitForTimeout(2200);
  return { ctx, p };
}

const visible = (p,id)=>p.locator('#'+id).isVisible();

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Le nom du créateur est le même partout');
{
  const { ctx, p } = await ouvrir(b, {});
  p.on('pageerror',e=>errors.push(e.message));
  const entete = await p.locator('#heroAuthorLink').innerText();
  const carte  = await p.locator('#creatorName').innerText();
  check('l\'en-tête affiche le vrai pseudo', entete==='Léa Kouassi', entete);
  check('  et la carte créateur dit la même chose', carte===entete, carte);
  check('plus de « par Créateur » générique', !/Créateur$/.test(entete), entete);
  check('le lien mène au profil de l\'auteur',
    await p.locator('#heroAuthorLink').getAttribute('href')==='auteur.html?id=lea');
  await ctx.close();
}

console.log('\n▶ « Paiement sécurisé » seulement s\'il y a un paiement');
{
  const { ctx, p } = await ouvrir(b, { prix:12 });
  p.on('pageerror',e=>errors.push(e.message));
  check('pack payant, visiteur : la mention est affichée', await visible(p,'buyGuaranteeMobile'));
  check('  et cite les moyens de paiement',
    /Orange Money/.test(await p.locator('#buyGuaranteeMobile').innerText()));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { prix:0 });
  p.on('pageerror',e=>errors.push(e.message));
  check('pack gratuit : rien à sécuriser, mention masquée', !(await visible(p,'buyGuaranteeMobile')));
  check('  le bouton propose bien un téléchargement',
    /gratuit/i.test(await p.locator('#buyBtnMobile').innerText()),
    await p.locator('#buyBtnMobile').innerText());
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { qui:'moi', achat:true, prix:12 });
  p.on('pageerror',e=>errors.push(e.message));
  check('déjà acheté : le bouton devient « Télécharger »',
    /Télécharger/.test(await p.locator('#buyBtnMobile').innerText()),
    await p.locator('#buyBtnMobile').innerText());
  check('  et la mention de paiement disparaît', !(await visible(p,'buyGuaranteeMobile')),
    'elle survivait au changement de bouton');
  check('  idem sur la carte de bureau', !(await visible(p,'buyGuaranteeDesktop')));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { qui:'lea', prix:12 });
  p.on('pageerror',e=>errors.push(e.message));
  check('son propre pack : pas de mention de paiement', !(await visible(p,'buyGuaranteeMobile')));
  check('  un accès direct à l\'édition est proposé', await visible(p,'heroEditBtn'));
  await ctx.close();
}

console.log('\n▶ On ne note pas son propre pack');
{
  const { ctx, p } = await ouvrir(b, { qui:'lea', prix:12, avis:[] });
  p.on('pageerror',e=>errors.push(e.message));
  const form = await p.locator('#avisForm').innerText();
  check('l\'auteur ne voit pas « Laisser un avis »', !/Laisser un avis/.test(form), form);
  check('  aucun bouton de publication non plus',
    await p.locator('#avisSubmit').count()===0);
  check('  mais une phrase explique pourquoi', /acheteurs/.test(form), form);
  await ctx.close();
}
{
  const AVIS = [{ id:1, user_id:'zoe', note:5, commentaire:'Top', created_at:'2026-05-03T10:00:00Z',
                  profiles:{ username:'Zoé', avatar_url:null } }];
  const { ctx, p } = await ouvrir(b, { qui:'lea', prix:12, avis:AVIS });
  p.on('pageerror',e=>errors.push(e.message));
  check('l\'auteur lit quand même les avis reçus',
    /Zoé/.test(await p.locator('#avisList').innerText()));
  check('  et la moyenne est affichée',
    /5[.,]0/.test(await p.locator('#avisSummary').innerText()),
    await p.locator('#avisSummary').innerText());
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { qui:'moi', achat:true, prix:12 });
  p.on('pageerror',e=>errors.push(e.message));
  check('un acheteur, lui, garde son formulaire',
    /Laisser un avis/.test(await p.locator('#avisForm').innerText()));
  check('  avec les étoiles cliquables', await p.locator('#avisStars').count()===1);
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { qui:'moi', achat:false, prix:12 });
  p.on('pageerror',e=>errors.push(e.message));
  check('sans achat : pas de formulaire (la règle serveur le refuserait)',
    (await p.locator('#avisForm').innerText()).trim()==='');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
