/* Modération : de la case à cocher aux vrais outils (§2.9 de l'audit).

   `admin.html` ne savait que marquer un signalement « traité » — le
   contenu incriminé, lui, restait en ligne. Et la page n'affichait que le
   motif : impossible de juger sans ouvrir un autre onglet.

   Les deux fonctions serveur (`moderer_contenu`, `apercu_signale`) sont
   simulées ici ; leur comportement réel est vérifié sur un vrai PostgreSQL
   par tests/outil-rls.js. Ce qui est éprouvé ici, c'est la page : ce
   qu'elle montre, ce qu'elle envoie, et ce qu'elle fait des réponses. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8137;
const BASE = 'http://localhost:' + PORT;
const MODO   = { id:'modo', email:'m@x.fr', user_metadata:{ username:'Modo' } };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

/* Trois plaintes sur le même commentaire, une sur un manga, une déjà
   traitée : de quoi éprouver le regroupement et les trois vues. */
const SIGNALEMENTS = [
  { id:1, type_contenu:'commentaire', contenu_id:'5', raison:'haine',   signale_par:'u1', statut:'nouveau', created_at:'2026-08-01T10:00:00Z' },
  { id:2, type_contenu:'commentaire', contenu_id:'5', raison:'haine',   signale_par:'u2', statut:'nouveau', created_at:'2026-08-01T11:00:00Z' },
  { id:3, type_contenu:'commentaire', contenu_id:'5', raison:'insulte', signale_par:'u3', statut:'nouveau', created_at:'2026-08-01T12:00:00Z' },
  { id:4, type_contenu:'manga',       contenu_id:'7', raison:'plagiat', signale_par:'u1', statut:'nouveau', created_at:'2026-07-30T09:00:00Z' },
  { id:5, type_contenu:'post',        contenu_id:'9', raison:'spam',    signale_par:'u2', statut:'traite',  created_at:'2026-07-20T09:00:00Z' },
];
const APERCUS = {
  'commentaire|5': { extrait:'Message vraiment odieux', auteur:'Fauteur',  auteur_id:'u9', masque:false,
                     lien:'lecteur.html?manga_id=7&chapitre=10#comment-5' },
  'manga|7':       { extrait:'Darkworld — un récit sombre.', auteur:'Auteur', auteur_id:'u8', masque:false,
                     lien:'manga.html?id=7' },
  'post|9':        { extrait:'Achetez des followers !', auteur:'Spammeur', auteur_id:'u7', masque:true,
                     lien:'communaute.html?id=u7' },
};

async function ouvrir(b, { admin = true, sigs = SIGNALEMENTS } = {}) {
  const ctx = await b.newContext({viewport:{width:900,height:900}});
  const envois = [];
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), MODO);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({...MODO,aud:'authenticated'})}));

  const etat = JSON.parse(JSON.stringify(sigs));
  const apercus = JSON.parse(JSON.stringify(APERCUS));

  await ctx.route('**/rest/v1/**',r=>{
    const req = r.request(), u = decodeURIComponent(req.url());
    const corps = req.postData() ? JSON.parse(req.postData()) : null;

    if (u.includes('/rpc/moderer_contenu')) {
      envois.push({ rpc:'moderer_contenu', ...corps });
      const cle = corps.p_type + '|' + corps.p_id;
      if (apercus[cle]) apercus[cle].masque = corps.p_masquer;
      etat.forEach(s => { if (s.type_contenu===corps.p_type && s.contenu_id===corps.p_id)
        s.statut = corps.p_masquer ? 'traite' : 'nouveau'; });
      return r.fulfill({status:200,contentType:'application/json',body:'null'});
    }
    if (u.includes('/rpc/apercu_signale')) {
      const a = apercus[corps.p_type + '|' + corps.p_id];
      return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify(a ? [a] : [])});
    }
    if (u.includes('/signalements') && req.method() === 'PATCH') {
      envois.push({ patch:'signalements', url:u, corps });
      etat.forEach(s => { if (u.includes('eq.'+s.contenu_id)) s.statut = corps.statut; });
      return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    }
    if (u.includes('/signalements'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(etat)});
    if (u.includes('/profiles')) {
      const seul = (req.headers()['accept']||'').includes('vnd.pgrst.object');
      const moi = { id:'modo', username:'Modo', is_admin: admin };
      const autres = [moi, {id:'u1',username:'Alice'}, {id:'u2',username:'Bob'}, {id:'u3',username:'Chloé'}];
      return r.fulfill({status:200,contentType:'application/json',
        body: JSON.stringify(seul ? moi : autres)});
    }
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  await p.goto(BASE+'/admin.html');
  await p.waitForTimeout(1800);
  return { ctx, p, envois };
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ La modération voit ce qu\'elle juge');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  const t = await p.locator('#content').innerText();
  check('le contenu incriminé est affiché, pas seulement le motif',
    /Message vraiment odieux/.test(t), t.split('\n').slice(0,3).join(' | '));
  check('  son auteur est nommé', /@Fauteur/.test(t));
  check('  et un lien mène au commentaire DANS son chapitre',
    await p.locator('.sig-meta a[href*="lecteur.html?manga_id=7&chapitre=10#comment-5"]').count() === 1,
    await p.locator('.sig-meta a').first().getAttribute('href'));
  check('le lien s\'ouvre à côté (on ne perd pas sa file)',
    await p.locator('.sig-meta a[target="_blank"]').first().getAttribute('rel') === 'noopener');
  await ctx.close();
}

console.log('\n▶ Trois plaintes sur le même contenu = une seule décision');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  check('les 3 signalements du commentaire sont regroupés',
    await p.locator('.sig').count() === 2,
    await p.locator('.sig').count() + ' cartes pour 4 signalements à traiter');
  const t = await p.locator('#content').innerText();
  check('  le nombre de plaintes est indiqué', /3 signalements/.test(t));
  check('  et les deux motifs distincts sont repris', /haine, insulte/.test(t), t.split('\n')[0]);
  await ctx.close();
}

console.log('\n▶ Masquer retire vraiment le contenu');
{
  const { ctx, p, envois } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.locator('.sig').first().locator('button:has-text("Masquer")').click();
  await p.waitForTimeout(1200);
  const appel = envois.find(e => e.rpc === 'moderer_contenu');
  check('la page appelle bien la fonction de modération', !!appel, JSON.stringify(appel));
  check('  avec le bon contenu',
    appel && appel.p_type === 'commentaire' && appel.p_id === '5', JSON.stringify(appel));
  check('  et en demandant le masquage', appel && appel.p_masquer === true);
  check('un retour est donné à l\'écran',
    /masqué/i.test(await p.locator('#message').innerText()),
    await p.locator('#message').innerText());
  await ctx.close();
}

console.log('\n▶ Une erreur de modération se rattrape');
{
  const { ctx, p, envois } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  // Le message de communauté est déjà masqué dans le jeu d'essai
  await p.locator('.filtre[data-f="tous"]').click();
  await p.waitForTimeout(500);
  const carte = p.locator('.sig').filter({ hasText:'Achetez des followers' });
  check('un contenu masqué est signalé comme tel',
    /MASQUÉ/.test(await carte.innerText()), await carte.innerText());
  check('  et propose de le rétablir', await carte.locator('button:has-text("Rétablir")').count() === 1);
  await carte.locator('button:has-text("Rétablir")').click();
  await p.waitForTimeout(1200);
  const appel = envois.find(e => e.rpc === 'moderer_contenu');
  check('le rétablissement est bien demandé', appel && appel.p_masquer === false, JSON.stringify(appel));
  await ctx.close();
}

console.log('\n▶ Classer sans suite laisse le contenu en ligne');
{
  const { ctx, p, envois } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.locator('.sig').first().locator('button:has-text("Sans suite")').click();
  await p.waitForTimeout(1200);
  check('aucun masquage n\'est demandé', !envois.some(e => e.rpc === 'moderer_contenu'));
  check('  le signalement est classé',
    envois.some(e => e.patch === 'signalements' && e.corps.statut === 'traite'));
  await ctx.close();
}

console.log('\n▶ Les trois vues');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  check('« À traiter » est la vue par défaut',
    await p.locator('.filtre[data-f="nouveau"]').getAttribute('aria-pressed') === 'true');
  check('  elle cache ce qui est déjà réglé',
    !/Achetez des followers/.test(await p.locator('#content').innerText()));
  await p.locator('.filtre[data-f="traite"]').click(); await p.waitForTimeout(400);
  check('« Traités » montre l\'inverse',
    /Achetez des followers/.test(await p.locator('#content').innerText()));
  await p.locator('.filtre[data-f="tous"]').click(); await p.waitForTimeout(400);
  check('« Tous » montre les deux', await p.locator('.sig').count() === 3,
    await p.locator('.sig').count() + ' cartes');
  await ctx.close();
}

console.log('\n▶ Base pas encore à jour : on le dit franchement');
{
  /* Le site est déployé dès la fusion, la base est mise à jour à la main.
     Entre les deux, « Action impossible, réessaie » serait un mensonge :
     réessayer n'y changerait rien. */
  const ctx = await b.newContext({viewport:{width:900,height:900}});
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), MODO);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({...MODO,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    if (u.includes('/rpc/'))
      return r.fulfill({status:404,contentType:'application/json',
        body:JSON.stringify({code:'PGRST202',message:'Could not find the function'})});
    if (u.includes('/signalements'))
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(SIGNALEMENTS)});
    if (u.includes('/profiles')) {
      const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
      const moi={id:'modo',username:'Modo',is_admin:true};
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(seul?moi:[moi,{id:'u1',username:'Alice'},{id:'u2',username:'Bob'},{id:'u3',username:'Chloé'}])});
    }
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/admin.html');
  await p.waitForTimeout(2000);
  const msg = await p.locator('#message').innerText();
  check('la vraie cause est nommée', /base/i.test(msg) && /sql_a_executer/.test(msg), msg);
  check('  et pas un « réessaie » trompeur', !/[Rr]éessaie/.test(msg), msg);
  check('les signalements restent lisibles', await p.locator('.sig').count() > 0,
    await p.locator('.sig').count() + ' cartes');
  check('  mais aucun bouton qui ne marcherait pas',
    await p.locator('button:has-text("Masquer")').count() === 0);
  check('  et l\'aperçu explique son absence',
    /base n'est pas à jour/i.test(await p.locator('.apercu').first().innerText()),
    await p.locator('.apercu').first().innerText());
  await ctx.close();
}

console.log('\n▶ Rien à traiter, et porte fermée');
{
  const { ctx, p } = await ouvrir(b, { sigs: [] });
  p.on('pageerror',e=>errors.push(e.message));
  check('file vide : la page le dit clairement',
    /calme|Rien à traiter/i.test(await p.locator('#content').innerText()),
    await p.locator('#content').innerText());
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { admin:false });
  p.on('pageerror',e=>errors.push(e.message));
  check('un non-modérateur est refusé', /réservé/i.test(await p.locator('#content').innerText()));
  check('  et ne voit aucun contenu signalé',
    !/Message vraiment odieux/.test(await p.locator('body').innerText()));
  check('  ni les filtres', !(await p.locator('.filtre').first().isVisible()));
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
