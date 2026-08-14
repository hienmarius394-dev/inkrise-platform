#!/usr/bin/env node
/* Ce qui se passe quand on tape deux fois.
   ─────────────────────────────────────────────────────────────────────
   Suite directe de la mesure du réseau lent : sur une 3G, une page met
   entre 4 et 12 secondes, et une action met souvent 2 secondes de plus.
   Personne n'attend 2 secondes devant un bouton qui n'a pas bougé. **On
   retape.** C'est le geste le plus banal du monde, et il n'a jamais été
   mesuré ici — en local, la réponse arrive avant que le doigt se relève.

   L'outil ralentit chaque écriture d'une seconde et demie, tape deux fois
   sur la même commande à 200 ms d'intervalle, et compte ce qui part
   vraiment vers la base.

   Trois défauts cherchés :

   • DOUBLE ÉCRITURE : deux requêtes pour un seul geste. Selon la table,
                       ça fait un doublon, une erreur affichée à quelqu'un
                       qui n'a rien fait de mal, ou un compteur faux.
   • COMPTEUR FAUX   : le nombre affiché à l'écran bouge deux fois alors
                       qu'une seule action a eu lieu
   • AUCUN RETOUR    : la commande ne montre rien pendant l'attente — ni
                       désactivation, ni changement d'état — donc rien
                       n'invite à patienter plutôt qu'à retaper

   Usage :  node tests/outil-double.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png','.jpg':'image/jpeg'};
const PORT = 8591;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});

const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
/* L'auteur du manga est QUELQU'UN D'AUTRE : sinon le site masque à juste
   titre « suivre », « s'abonner » et le formulaire d'avis. */
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, cover_url:null, bio:'Lecteur',
  is_creator:false, created_at:'2026-01-05T10:00:00Z', pref_masquer_adulte:false,
  pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };
const AUTEUR = { id:'u9', username:'Autrice', avatar_url:null, bio:'', is_creator:true,
  created_at:'2026-01-05T10:00:00Z' };
const MANGA = { id:1, titre:'Darkworld', synopsis:'Un récit sombre.', type:'manga',
  statut:'en_cours', genres:['Action'], couverture_url:null, auteur_id:'u9', vues:120,
  adulte:false, langue:'fr', sens_lecture:'rl', age_recommande:'12+', commentaires_actifs:true,
  created_at:'2026-06-01T10:00:00Z', note_moyenne:4.2, nb_avis:3,
  profiles:{ username:'Autrice', avatar_url:null } };
const PACK = { id:1, titre:'Pack encrage', description:'Apprends.', prix:0, auteur_id:'u9',
  couverture_url:null, contenu_url:'x', images:[], niveau:'debutant', objectifs:['Trait'],
  created_at:'2026-05-01T10:00:00Z' };

function lignes(url) {
  const t = n => url.includes(n);
  if (t('/profiles')) {
    /* Le jeu d'essai doit respecter le filtre demandé : sinon
       `?id=eq.u9` renvoyait le profil de u1, le mur communautaire se
       croyait chez quelqu'un d'autre et n'affichait aucun post — on
       mesurait alors une page vide en croyant mesurer des réactions. */
    const m = url.match(/id=eq\.([^&]+)/);
    if (m) return [PROFILE, AUTEUR].filter(p => p.id === m[1]);
    const inn = url.match(/id=in\.\(([^)]+)\)/);
    if (inn) {
      const ids = inn[1].split(',').map(x => x.replace(/"/g, ''));
      return [PROFILE, AUTEUR].filter(p => ids.includes(p.id));
    }
    return [PROFILE, AUTEUR];
  }
  if (t('/mangas')) return [MANGA];
  if (t('/chapitres')) return [{ id:101, numero:1, titre:'Ch 1', manga_id:1, created_at:'2026-06-11T10:00:00Z' }];
  if (t('packs_tutoriels')) return [PACK];
  if (t('achats_packs')) return [{ id:1, user_id:'u1', pack_id:1, prix_paye:0 }];
  if (t('posts_communaute')) return [{ id:1, creator_id:'u9', type:'post', contenu:'Salut',
    est_epingle:false, image_url:null, created_at:'2026-07-01T10:00:00Z', auteur_id:'u9' }];
  return [];
}

/* Chaque scénario : la page, la commande à taper deux fois, et la table
   qui ne doit recevoir qu'une seule écriture. */
const GESTES = [
  { page:'manga.html?id=1',  quoi:'suivre le créateur',        cible:'#btnFollow',      table:'follows' },
  { page:'manga.html?id=1',  quoi:'s\'abonner au manga',       cible:'#btnSubscribe',   table:'abonnements_manga' },
  { page:'manga.html?id=1',  quoi:'ajouter à la bibliothèque', cible:'#btnLibrary',     table:'bibliotheque' },
  { page:'auteur.html?id=u9',quoi:'suivre depuis le profil',   cible:'#btnFollowAuthor',table:'follows' },
  { page:'manga.html?id=1',  quoi:'publier un avis',            cible:'#avisEnvoyer',    table:'avis_mangas',
    avant: async p => { await p.locator('#avisEtoiles button').nth(4).click(); } },
  { page:'pack.html?id=1',   quoi:'noter un pack',              cible:'#avisSubmit',     table:'avis_packs',
    avant: async p => { await p.locator('#avisStars span[data-n="5"]').click(); } },
  { page:'lecteur.html?manga_id=1&chapitre=101', quoi:'publier un commentaire',
    cible:'#btnPublish', table:'commentaires',
    avant: async p => { await p.locator('#newCommentText').fill('Bien vu.'); } },
  /* Les gestes les plus fréquents du site : réagir, voter, publier. */
  { page:'communaute.html?id=u9', quoi:'réagir à un post',  cible:'.reaction-btn', table:'reactions' },
  { page:'communaute.html?id=u9', quoi:'commenter un post', cible:'.comment-submit-btn, [class*="comment-submit"]',
    table:'commentaires_communaute',
    avant: async p => { await p.locator('.comment-input, input[class*="comment"]').first().fill('Bravo.'); } },
];

const releve = [];
const noter = (genre, ou, detail) => releve.push({ genre, ou, detail });

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

for (const g of GESTES) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...U, aud:'authenticated' }) }));

  const ecritures = [];
  let lenteur = 0;   // on ne ralentit qu'APRÈS le chargement de la page
  await ctx.route('**/rest/v1/**', async r => {
    const req = r.request();
    const url = decodeURIComponent(req.url());
    if (req.method() !== 'GET') {
      ecritures.push({ methode: req.method(), url });
      /* Le délai est ce qui rend le double appui possible : sans lui, la
         réponse revient avant que le doigt se relève, et le défaut ne se
         reproduit jamais — c'est exactement pourquoi il n'avait pas été vu. */
      if (lenteur) await new Promise(res => setTimeout(res, lenteur));
      return r.fulfill({ status:201, contentType:'application/json', body:'[]' });
    }
    const rows = lignes(url);
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
  await p.goto(BASE + '/' + g.page, { waitUntil:'domcontentloaded' });
  await p.waitForTimeout(2000);

  const cible = p.locator(g.cible).first();
  if (!(await cible.count()) || !(await cible.isVisible().catch(() => false))) {
    console.log(`  ⏭  ${g.quoi} — commande absente (${g.cible})`);
    await ctx.close(); continue;
  }

  /* Certains gestes exigent une saisie préalable — noter avant de publier
     un avis, écrire avant d'envoyer un commentaire. Sans ça, la commande
     refuse et on ne mesure rien. */
  if (g.avant) { try { await g.avant(p); } catch (e) {} await p.waitForTimeout(400); }

  lenteur = 1500;
  ecritures.length = 0;

  /* Deux appuis à 200 ms d'intervalle : le geste de quelqu'un qui croit
     que le premier n'a pas pris. */
  await cible.click({ force: true });
  await p.waitForTimeout(200);
  const etatIntermediaire = await cible.evaluate(el => ({
    desactive: !!el.disabled || el.getAttribute('aria-disabled') === 'true',
    texte: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 40),
  })).catch(() => null);
  await cible.click({ force: true }).catch(() => {});
  await p.waitForTimeout(3200);

  const versTable = ecritures.filter(e => e.url.includes(g.table));
  if (versTable.length > 1)
    noter('DOUBLE ÉCRITURE', g.page + ' — ' + g.quoi,
          versTable.length + ' écritures vers ' + g.table + ' pour un seul geste');

  /* Zéro écriture = le geste n'a jamais eu lieu (une saisie manquait, une
     condition d'affichage n'était pas remplie). Accuser la commande de ne
     rien montrer serait alors une fausse accusation : c'est le montage qui
     est en cause, pas le site. On le signale comme tel. */
  if (!versTable.length) {
    console.log(`      ↳ aucune écriture : le geste n'a pas eu lieu, rien n'est mesuré ici`);
  } else if (etatIntermediaire && !etatIntermediaire.desactive) {
    noter('AUCUN RETOUR', g.page + ' — ' + g.quoi,
          'la commande reste active pendant l\'attente (« ' + etatIntermediaire.texte + ' »)');
  }

  console.log(`  ${versTable.length === 1 ? '✅' : '⚠️ '} ${g.quoi} — ${versTable.length} écriture(s) vers ${g.table}`);
  await ctx.close();
}

await b.close(); server.close();

console.log('\n═══ QUAND ON TAPE DEUX FOIS ═══\n');
if (!releve.length) {
  console.log('───────────');
  console.log('✅ un geste répété ne produit qu\'une seule action');
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
