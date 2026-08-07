/* Avis sur les mangas, recommandations, et page Paramètres.

   Trois manques de l'audit (§2.4 et §2.6) : les mangas n'avaient ni note
   ni avis alors que les packs en avaient ; une fiche manga ne renvoyait
   vers rien d'autre ; et il n'existait aucune page de réglages — le
   filtre 18+ n'existait pas malgré le champ `adulte` en base. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8121;
const BASE = 'http://localhost:' + PORT;
const U = { id:'lecteur', email:'l@x.fr', user_metadata:{ username:'Lecteur' } };
const AUTEUR = { id:'auteur', email:'a@x.fr', user_metadata:{ username:'Aya' } };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

const MANGA = { id:1, titre:'Darkworld', synopsis:'Un récit sombre.', type:'manga', statut:'en_cours',
  genres:['Action','Drame'], couverture_url:null, auteur_id:'auteur', vues:120, adulte:false,
  langue:'fr', sens_lecture:'rl', commentaires_actifs:true, created_at:'2026-06-01T10:00:00Z',
  note_moyenne:4.50, nb_avis:2, profiles:{ username:'Aya', avatar_url:null } };
const AUTRES = [
  { id:2, titre:'Kaze', couverture_url:null, type:'manga', note_moyenne:4.20, nb_avis:5, vues:90, auteur_id:'auteur', statut:'en_cours', genres:['Action'], synopsis:'x', adulte:false, langue:'fr', created_at:'2026-06-02T10:00:00Z' },
  { id:3, titre:'Ronin', couverture_url:null, type:'manga', note_moyenne:null, nb_avis:0, vues:40, auteur_id:'autre', statut:'en_cours', genres:['Action'], synopsis:'y', adulte:false, langue:'fr', created_at:'2026-06-03T10:00:00Z' },
];
const AVIS = [
  { id:1, user_id:'lecteur2', note:5, commentaire:'Excellent, vraiment.', created_at:'2026-07-01T10:00:00Z', profiles:{ username:'Kenji', avatar_url:null } },
  { id:2, user_id:'lecteur3', note:4, commentaire:null, created_at:'2026-07-02T10:00:00Z', profiles:{ username:'Mia', avatar_url:null } },
];

async function ouvrir(b, { user, avis, profilPrefs, capterEcritures }) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  if (user) {
    await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
        expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), user);
    await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({...user,aud:'authenticated'})}));
  } else {
    await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  }
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  const ecritures = [];
  await ctx.route('**/rest/v1/**',async r=>{
    const req=r.request(), u=decodeURIComponent(req.url()), m=req.method();
    if (m !== 'GET') {
      let corps=null; try{corps=JSON.parse(req.postData()||'null');}catch(e){}
      ecritures.push({ methode:m, url:u, corps });
      return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    }
    let rows=[];
    if (u.includes('avis_mangas')) rows = avis === undefined ? AVIS : avis;
    else if (u.includes('/mangas')) {
      rows = /id=eq\.1(\D|$)/.test(u) ? [MANGA] : AUTRES.filter(x=>!/id=neq\.1/.test(u) || x.id!==1);
      if (/adulte=neq\.true/.test(u)) ecritures.push({ methode:'FILTRE18', url:u });
    }
    else if (u.includes('/profiles')) rows = [{ id:(user&&user.id)||'x', username:'Lecteur',
        // false = ce que porte un profil neuf depuis que le filtre n'est
        // plus coché d'office.
        pref_masquer_adulte: profilPrefs ? profilPrefs.pref_masquer_adulte : false,
        pref_mode_lecture: profilPrefs ? profilPrefs.pref_mode_lecture : null,
        pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false }];
    else if (u.includes('/chapitres')) rows=[{id:101,numero:1,titre:'Ch 1',manga_id:1,created_at:'2026-06-05T10:00:00Z'}];
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/'+rows.length,'Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul?(rows[0]||null):rows)});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  return { ctx, p, ecritures };
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Avis affichés sur la fiche manga');
{
  const { ctx, p } = await ouvrir(b, { user:U });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/manga.html?id=1'); await p.waitForTimeout(2200);
  const t = await p.evaluate(()=>document.body.innerText);
  check('la moyenne est affichée', /4[.,]5/.test(t), (t.match(/4[.,]\d/)||[])[0]);
  check('le nombre d\'avis aussi', /2 avis/.test(t));
  // « 4.5 » sous l'étiquette « Avis » se lisait comme un nombre d'avis :
  // l'étoile dit que c'est une note, l'étiquette porte le compte.
  const enTete = (await p.locator('#statNote').textContent()).trim();
  check('la note remonte dans l\'en-tête', /★\s*4\.5/.test(enTete), enTete);
  check('  étiquetée par le nombre d\'avis',
    (await p.locator('#statNoteLabel').textContent()).trim()==='2 avis',
    await p.locator('#statNoteLabel').textContent());
  check('un avis rédigé est affiché', /Excellent, vraiment/.test(t));
  check('  avec le nom de son auteur', /Kenji/.test(t));
  check('un avis sans texte ne crée pas de ligne vide', !/Mia/.test(t));
  await ctx.close();
}

console.log('\n▶ Donner son avis');
{
  const { ctx, p, ecritures } = await ouvrir(b, { user:U, avis:[] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/manga.html?id=1'); await p.waitForTimeout(2200);
  check('le formulaire est proposé', await p.locator('#avisEtoiles').count()===1);
  check('cinq étoiles cliquables', await p.locator('#avisEtoiles button').count()===5);

  // Publier sans note : refusé, avec explication
  await p.locator('#avisEnvoyer').click(); await p.waitForTimeout(300);
  check('publier sans note est refusé',
    /Choisis une note/.test(await p.locator('#avisMsg').textContent()));
  // La page compte aussi une vue au chargement : on ne regarde que les avis.
  check('  et aucun avis n\'est envoyé',
    ecritures.filter(e=>e.url.includes('avis_mangas')).length===0,
    ecritures.map(e=>e.methode+' '+e.url.split('/rest/v1/')[1]).join(' | '));

  await p.locator('#avisEtoiles button[data-note="4"]').click();
  check('la note choisie est annoncée',
    await p.locator('#avisEtoiles button[data-note="4"]').getAttribute('aria-checked')==='true');
  await p.locator('#avisTexte').fill('Très bon rythme.');
  await p.locator('#avisEnvoyer').click(); await p.waitForTimeout(600);
  const env = ecritures.find(e=>e.url.includes('avis_mangas') && e.methode==='POST');
  check('l\'avis est envoyé', !!env, env ? env.methode : 'aucun envoi');
  check('  avec la bonne note', env && env.corps && env.corps.note===4, JSON.stringify(env&&env.corps));
  check('  et le commentaire saisi', env && env.corps && env.corps.commentaire==='Très bon rythme.');
  await ctx.close();
}

console.log('\n▶ On ne note pas sa propre œuvre');
{
  const { ctx, p } = await ouvrir(b, { user:AUTEUR, avis:[] });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/manga.html?id=1'); await p.waitForTimeout(2200);
  check('aucun formulaire pour l\'auteur', await p.locator('#avisEtoiles').count()===0);
  check('  mais un message qui l\'explique',
    /lecteurs pourront noter|pensent tes lecteurs/i.test(await p.evaluate(()=>document.body.innerText)));
  await ctx.close();
}

console.log('\n▶ Visiteur non connecté');
{
  const { ctx, p } = await ouvrir(b, { user:null });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/manga.html?id=1'); await p.waitForTimeout(2200);
  check('les avis restent lisibles', /Excellent, vraiment/.test(await p.evaluate(()=>document.body.innerText)));
  check('  et on invite à se connecter pour en donner un',
    /Connecte-toi pour donner ton avis/.test(await p.evaluate(()=>document.body.innerText)));
  await ctx.close();
}

console.log('\n▶ À découvrir aussi');
{
  const { ctx, p } = await ouvrir(b, { user:U });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/manga.html?id=1'); await p.waitForTimeout(2400);
  check('la section est affichée', await p.locator('#recosCard').isVisible());
  const liens = await p.locator('#recosListe a').evaluateAll(a=>a.map(x=>x.getAttribute('href')));
  check('elle propose d\'autres œuvres', liens.length>0, liens.join(', '));
  check('  jamais celle qu\'on lit déjà', !liens.some(h=>/id=1$/.test(h)), liens.join(', '));
  check('la note y figure quand elle existe',
    /4[.,]2/.test(await p.locator('#recosListe').innerText()));

  /* Une rangée à défilement horizontal dans une colonne de grille élargit
     toute la colonne si celle-ci garde `min-width: auto` — et TOUTES les
     cartes de la page se retrouvent rognées à droite, synopsis compris.
     Le débordement est invisible (`overflow-x: clip` masque la page), d'où
     ce contrôle sur les largeurs plutôt que sur l'apparence. */
  const largeurs = await p.evaluate(() => {
    const vue = document.documentElement.clientWidth;
    return [...document.querySelectorAll('.section-card')].map(c => ({
      nom: c.id || (c.querySelector('.section-title') || {}).textContent || '?',
      depasse: Math.round(c.getBoundingClientRect().right) > vue
    }));
  });
  const rognees = largeurs.filter(l => l.depasse);
  check('aucune carte ne déborde de l\'écran', rognees.length === 0,
    rognees.map(r => r.nom.trim()).join(', '));
  await ctx.close();
}

console.log('\n▶ Page Paramètres');
{
  const { ctx, p, ecritures } = await ouvrir(b, { user:U });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/parametres.html'); await p.waitForTimeout(1600);
  const t = await p.evaluate(()=>document.body.innerText);
  check('les quatre sections sont là',
    /Apparence/.test(t) && /Lecture/.test(t) && /Notifications/.test(t) && /Mes données/.test(t));
  /* « JSON » ne veut rien dire pour la plupart des gens : on dit ce que le
     fichier contient et comment l'ouvrir, pas son format. */
  check('l\'export dit ce qu\'il contient, sans jargon',
    /ton profil/.test(t) && /bloc-notes/.test(t) && !/\(JSON\)/.test(t),
    (t.match(/[^\n]*JSON[^\n]*/)||['pas de mention de JSON'])[0]);
  /* Le filtre 18+ ne doit JAMAIS être coché d'office : masquer une partie
     du catalogue sans que personne ne l'ait demandé priverait ces œuvres de
     toute visibilité, sans que le lecteur ni le créateur comprennent pourquoi. */
  check('le filtre 18+ est DÉSACTIVÉ par défaut',
    await p.locator('#prefAdulte').getAttribute('aria-checked')==='false');

  await p.locator('#prefAdulte').click(); await p.waitForTimeout(500);
  const maj = ecritures.find(e=>e.methode==='PATCH' && e.corps && 'pref_masquer_adulte' in e.corps);
  check('le cocher enregistre la préférence', !!maj && maj.corps.pref_masquer_adulte===true,
    JSON.stringify(maj && maj.corps));
  check('  et l\'interrupteur reflète le nouvel état',
    await p.locator('#prefAdulte').getAttribute('aria-checked')==='true');

  await p.locator('#prefSocial').click(); await p.waitForTimeout(500);
  const majS = ecritures.find(e=>e.methode==='PATCH' && e.corps && 'pref_notif_social' in e.corps);
  check('couper les notifications sociales est enregistré', !!majS && majS.corps.pref_notif_social===false);

  await p.selectOption('#prefMode','scroll'); await p.waitForTimeout(500);
  const majM = ecritures.find(e=>e.methode==='PATCH' && e.corps && 'pref_mode_lecture' in e.corps);
  check('le mode de lecture par défaut est enregistré', !!majM && majM.corps.pref_mode_lecture==='scroll');
  await ctx.close();
}

console.log('\n▶ Paramètres — déconnecté et export');
{
  const { ctx, p } = await ouvrir(b, { user:null });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/parametres.html'); await p.waitForTimeout(1400);
  check('un visiteur est invité à se connecter',
    /Connecte-toi/.test(await p.evaluate(()=>document.body.innerText)));
  check('  sans afficher d\'interrupteur inutile', await p.locator('[role=switch]').count()===0);
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { user:U });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/parametres.html'); await p.waitForTimeout(1600);
  const dl = p.waitForEvent('download', { timeout: 8000 }).catch(()=>null);
  await p.locator('#btnExport').click();
  const fichier = await dl;
  check('l\'export produit un fichier', !!fichier, fichier ? fichier.suggestedFilename() : 'aucun');
  if (fichier) {
    check('  nommé lisiblement', /^inkrise-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/.test(fichier.suggestedFilename()),
      fichier.suggestedFilename());
    const chemin = await fichier.path();
    const contenu = JSON.parse(fs.readFileSync(chemin,'utf8'));
    check('  contenant bien du JSON exploitable',
      !!contenu.exporte_le && !!contenu.compte && 'mangas' in contenu, Object.keys(contenu).join(','));
  }
  await ctx.close();
}

console.log('\n▶ Le filtre 18+ agit vraiment sur le catalogue');
{
  // profil sans préférence explicite → catalogue complet ; coché → filtré
  for (const [masquer, attendu] of [[true,true],[false,false]]) {
    const { ctx, p, ecritures } = await ouvrir(b, { user:U, profilPrefs:{ pref_masquer_adulte: masquer } });
    p.on('pageerror',e=>errors.push(e.message));
    await p.goto(BASE+'/recherche.html'); await p.waitForTimeout(1800);
    const filtre = ecritures.some(e=>e.methode==='FILTRE18');
    check((masquer?'préférence active':'préférence désactivée') + ' → requête ' + (attendu?'filtrée':'non filtrée'),
      filtre===attendu, 'adulte=neq.true présent : '+filtre);
    await ctx.close();
  }
}

console.log('\n▶ Le menu mène aux Paramètres');
{
  const { ctx, p } = await ouvrir(b, { user:U });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/bibliotheque.html'); await p.waitForTimeout(1600);
  check('le lien est visible une fois connecté',
    await p.locator('#drawerParametres').evaluate(e=>getComputedStyle(e).display)!=='none');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
