#!/usr/bin/env node
/* Le retour arrière — le geste le plus utilisé sur un téléphone.
   ─────────────────────────────────────────────────────────────────────
   Sur mobile, revenir en arrière n'est pas un bouton dans un coin : c'est
   un glissement du pouce depuis le bord, fait cent fois par jour, souvent
   sans y penser. C'est ce qu'on fait pour **annuler la dernière chose**.

   Aucune page d'Inkrise n'appelle `history.pushState` ni n'écoute
   `popstate`. Conséquence à vérifier : quand on ouvre une fenêtre, qu'on
   change d'onglet ou qu'on pose un filtre, rien n'est inscrit dans
   l'historique — et le retour arrière ne défait pas le dernier geste, il
   **quitte la page**. On voulait fermer une fenêtre, on se retrouve sur
   la page précédente, et tout ce qu'on avait fait avant est perdu.

   L'outil accomplit un geste, appuie sur retour, et regarde où l'on
   atterrit :

   • SORTIE BRUTALE  : le retour quitte la page alors qu'il restait
                       quelque chose à défaire à l'écran (une fenêtre
                       ouverte par-dessus)
   • ÉTAT PERDU      : le retour ramène bien sur la page, mais l'état
                       qu'on avait construit (onglet, filtres) a disparu

   Usage :  node tests/outil-retour.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png','.jpg':'image/jpeg'};
const PORT = 8601;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});

const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, cover_url:null, bio:'Auteur',
  is_creator:true, created_at:'2026-01-05T10:00:00Z', pref_masquer_adulte:false,
  pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };
const MANGA = i => ({ id:i, titre:'Darkworld '+i, synopsis:'Un récit sombre.', type:'manga',
  statut:'en_cours', genres:['Action'], couverture_url:null, auteur_id:'u1', vues:120+i,
  adulte:false, langue:'fr', sens_lecture:'rl', age_recommande:'12+', commentaires_actifs:true,
  created_at:'2026-06-01T10:00:00Z', note_moyenne:4.2, nb_avis:3 });
function lignes(url) {
  const t = n => url.includes(n);
  if (t('/profiles')) return [PROFILE];
  if (t('/mangas')) return [1,2].map(MANGA);
  if (t('/chapitres')) return [{ id:101, numero:1, titre:'Ch 1', manga_id:1, created_at:'2026-06-11T10:00:00Z' }];
  if (t('packs_tutoriels')) return [{ id:1, titre:'Pack encrage', description:'Apprends.', prix:5,
    auteur_id:'u1', couverture_url:null, contenu_url:'x', images:[], niveau:'Débutant',
    objectifs:['Trait'], created_at:'2026-05-01T10:00:00Z' }];
  return [];
}

/* Chaque scénario : d'où l'on vient, ce qu'on fait, et comment savoir si
   le geste est encore visible après le retour. */
const SCENARIOS = [
  { depuis:'index.html', page:'profil.html', quoi:'ouvrir la fenêtre « Modifier le profil »',
    faire: async p => { await p.locator('#btnEditProfile').click(); },
    visible: async p => (await p.locator('.modal-overlay.open').count()) > 0,
    genre:'fenêtre' },
  /* ARBITRAGE ASSUMÉ, pas un défaut. Changer d'onglet sur le profil
     n'inscrit rien dans l'historique : le retour arrière quitte donc la
     page au lieu de revenir à l'onglet précédent.

     Les deux comportements se défendent. Empiler sept onglets dans
     l'historique obligerait à sept retours pour quitter la page, ce qui
     est agaçant autrement. Ce n'est pas la même situation qu'une couche
     posée PAR-DESSUS l'écran (menu, fenêtre de confirmation) : là, le
     retour est le geste universel pour la refermer, et il n'y avait pas
     d'arbitrage — c'était un défaut, corrigé.

     Ce qui a été corrigé ici : l'ADRESSE suit désormais l'onglet
     (`replaceState`), donc recharger ou partager le lien retombe au bon
     endroit — sans ajouter d'étape dans l'historique. */
  { depuis:'index.html', page:'profil.html', quoi:'changer d\'onglet (Mes Mangas)',
    faire: async p => { await p.locator('.ptab[data-tab="mangas"]').click(); },
    visible: async p => (await p.locator('.ptab[data-tab="mangas"]').getAttribute('class') || '').includes('active'),
    arbitrage: 'un onglet n\'est pas une couche par-dessus l\'écran ; l\'adresse le suit (replaceState), l\'historique non',
    genre:'onglet' },
  /* Les filtres de recherche sont de VRAIS LIENS (`recherche.html?genre=…`).
     Le retour arrière doit donc défaire le filtre et revenir au catalogue
     complet — c'est le comportement juste, pas une perte. Ma première
     version de cet outil exigeait l'inverse et accusait la page à tort ;
     ce scénario est gardé comme témoin, avec la bonne attente. */
  { depuis:'index.html', page:'recherche.html', quoi:'filtrer par genre (témoin : lien réel)',
    faire: async p => { await p.locator('.genre-chip').nth(1).click(); },
    visible: async p => /genre=/.test(p.url()),
    apresRetour: async p => !/genre=/.test(p.url()),
    genre:'filtre' },
  { depuis:'index.html', page:'parametres.html', quoi:'ouvrir la boîte de suppression de compte',
    faire: async p => { await p.locator('#btnSupprimer').click(); },
    visible: async p => (await p.locator('.ink-confirm-ov').count()) > 0,
    genre:'fenêtre' },
  { depuis:'index.html', page:'manga.html?id=1', quoi:'ouvrir le menu latéral',
    faire: async p => { await p.locator('.univ-nav-hbg').first().click(); },
    visible: async p => (await p.evaluate(() => {
      const d = document.getElementById('univDrawer');
      return !!d && d.classList.contains('open');
    })),
    genre:'menu' },
];

const releve = [];
const noter = (genre, ou, detail) => releve.push({ genre, ou, detail });

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

for (const s of SCENARIOS) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    const rows = lignes(decodeURIComponent(req.url()));
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+rows.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (rows[0]||null) : rows) });
  });
  await ctx.route('**/storage/v1/object/list/**', r =>
    r.fulfill({status:200,contentType:'application/json',body:'[{"name":"01.jpg"}]'}));
  await ctx.route('**/storage/v1/**', r =>
    r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));

  const p = await ctx.newPage();
  /* On arrive par une page précédente : sans elle, le retour n'a nulle
     part où aller et on ne mesurerait rien. C'est aussi le cas réel — on
     arrive toujours de quelque part. */
  await p.goto(BASE + '/' + s.depuis, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.goto(BASE + '/' + s.page, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(2200);

  try { await s.faire(p); } catch (e) {
    console.log(`  ⏭  ${s.page} — ${s.quoi} : commande introuvable`);
    await ctx.close(); continue;
  }
  await p.waitForTimeout(700);

  if (!(await s.visible(p).catch(() => false))) {
    console.log(`  ⏭  ${s.page} — ${s.quoi} : le geste n'a rien changé, rien à mesurer`);
    await ctx.close(); continue;
  }

  await p.goBack({ waitUntil:'domcontentloaded' }).catch(()=>{});
  await p.waitForTimeout(1600);
  const arrivee = p.url().replace(BASE + '/', '');
  const surLaPage = arrivee.split('?')[0] === s.page.split('?')[0];

  /* Certains gestes DOIVENT être défaits par le retour (un filtre posé par
     un lien) ; d'autres doivent seulement être refermés sans quitter la
     page (une fenêtre par-dessus). `apresRetour` dit ce qu'on attend. */
  const attendu = s.apresRetour
    ? await s.apresRetour(p).catch(() => false)
    : surLaPage && !(await s.visible(p).catch(() => false));

  if (s.apresRetour) {
    if (attendu) console.log(`  ✅ ${s.page} — ${s.quoi} → le retour défait bien le geste`);
    else { noter('RETOUR SANS EFFET', s.page + ' — ' + s.quoi, 'le ' + s.genre + ' survit au retour');
           console.log(`  ⚠️  ${s.page} — ${s.quoi} → ${s.genre} inchangé`); }
  } else if (!surLaPage) {
    /* Un arbitrage écrit noir sur blanc n'est pas un défaut : on le
       rappelle sans faire rougir l'outil, sinon il finirait ignoré. */
    if (s.arbitrage) {
      console.log(`  ➖ ${s.page} — ${s.quoi} → quitte la page, choix assumé`);
      console.log(`      ${s.arbitrage}`);
    } else {
      noter('SORTIE BRUTALE', s.page + ' — ' + s.quoi,
            'le retour quitte la page (→ ' + arrivee + ') au lieu de refermer le ' + s.genre);
      console.log(`  ⚠️  ${s.page} — ${s.quoi} → quitte vers ${arrivee}`);
    }
  } else if (!attendu) {
    noter('RETOUR SANS EFFET', s.page + ' — ' + s.quoi,
          'on reste sur la page, mais le ' + s.genre + ' est toujours ouvert');
    console.log(`  ⚠️  ${s.page} — ${s.quoi} → ${s.genre} toujours ouvert`);
  } else {
    console.log(`  ✅ ${s.page} — ${s.quoi} → le retour referme le ${s.genre}, sans quitter la page`);
  }
  await ctx.close();
}

await b.close(); server.close();

console.log('\n═══ LE RETOUR ARRIÈRE ═══\n');
if (!releve.length) {
  console.log('───────────');
  console.log('✅ le retour arrière défait le dernier geste');
  process.exit(0);
}
for (const genre of [...new Set(releve.map(r => r.genre))]) {
  const lot = releve.filter(r => r.genre === genre);
  console.log(`\n### ${genre} (${lot.length})`);
  for (const r of lot) console.log(`  • ${r.ou}\n      ${r.detail}`);
}
console.log('\n───────────');
console.log(`${releve.length} point(s) à regarder`);
process.exit(1);
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
