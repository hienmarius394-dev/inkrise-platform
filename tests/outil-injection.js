#!/usr/bin/env node
/* Échappement des contenus écrits par les utilisateurs.
   ─────────────────────────────────────────────────────────────────────
   Presque tout le site se rend avec `innerHTML` et des gabarits `${}`.
   Un pseudo, un titre de manga ou un commentaire y arrivent tels quels :
   si l'échappement manque — ou n'oublie qu'un seul caractère — le texte
   d'un inconnu devient du balisage sur la page de tout le monde.

   Plutôt que de relire les gabarits, on empoisonne chaque champ texte
   servi par Supabase et on regarde ce que le navigateur en fait :

   • <inkrise-injection> apparaît dans le DOM → la chaîne a été analysée
     comme du HTML au lieu d'être affichée.
   • un attribut x-inkrise-attr apparaît → les guillemets n'ont pas été
     neutralisés, on est sorti de l'attribut.
   • window.__coups se remplit → du code fourni par un tiers s'est
     exécuté. C'est le cas le plus grave.

   Usage :  node tests/outil-injection.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml',
               '.webmanifest':'application/json','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png'};
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});

/* Une charge par contexte de sortie. Le nom du champ voyage avec elle
   pour que le rapport dise QUOI est mal échappé, pas seulement où. */
const charge = champ =>
  `<inkrise-injection data-champ="${champ}"></inkrise-injection>` +
  `" x-inkrise-attr="${champ}` +
  `' x-inkrise-attr='${champ}` +
  `<img src=x onerror="window.__coups.push('${champ}')">`;

const T = charge;
/* Les visuels ne peuvent pas être nuls : c'est dans les attributs
   (`src="…"`, `alt="…"`, `style="…"`) que l'échappement se rate le plus
   souvent, et un champ vide fait sauter tout ce chemin de rendu. Première
   version de cet outil : tout à null, donc rien de tout cela n'était
   éprouvé. */
const IMG = 'https://exemple.test/i.jpg';
const U = { id:'u1', email:'m@x.fr', user_metadata:{ username: T('user_metadata.username') } };

const PROFIL = i => ({
  id: i, username: T('profiles.username'), bio: T('profiles.bio'),
  avatar_url: IMG, is_creator: true, is_admin: false,
  created_at: '2026-01-05T10:00:00Z',
  pref_masquer_adulte: false, pref_notif_chapitres: true,
  pref_notif_social: true, pref_notif_push: false,
});
const MANGA = i => ({
  id: i, titre: T('mangas.titre'), synopsis: T('mangas.synopsis'),
  type: 'manga', statut: 'en_cours', genres: [T('mangas.genres')],
  couverture_url: IMG, auteur_id: 'u1', vues: 120, adulte: false,
  langue: 'fr', sens_lecture: 'rl', age_recommande: '12+',
  commentaires_actifs: true, created_at: '2026-06-01T10:00:00Z',
  note_moyenne: 4.2, nb_avis: 3,
  profiles: { username: T('mangas.profiles.username'), avatar_url: IMG },
});
const CHAP = i => ({ id: 100 + i, numero: i, titre: T('chapitres.titre'),
                     manga_id: 1, created_at: '2026-06-11T10:00:00Z' });
const PACK = i => ({ id: i, titre: T('packs.titre'), description: T('packs.description'),
                     prix: 5, auteur_id: 'u1', couverture_url: IMG, image_url: IMG,
                     contenu_url: 'x', images: [IMG], niveau: T('packs.niveau'),
                     objectifs: [T('packs.objectifs')], created_at: '2026-05-01T10:00:00Z' });
const COMMENTAIRE = { id: 1, manga_id: 1, chapitre_id: 101, user_id: 'u2',
                      contenu: T('commentaires.contenu'), parent_id: null,
                      created_at: '2026-07-01T10:00:00Z',
                      profiles: { username: T('commentaires.profiles.username'), avatar_url: IMG } };

function corps(u) {
  const t = n => u.includes(n);
  if (t('/profiles'))               return [PROFIL('u1')];
  if (t('avis_mangas'))             return [{ id:1, user_id:'u2', note:5, commentaire:T('avis_mangas.commentaire'),
                                              created_at:'2026-07-01T10:00:00Z',
                                              profiles:{ username:T('avis_mangas.profiles.username'), avatar_url:IMG } }];
  if (t('avis_packs'))              return [{ id:1, pack_id:1, user_id:'u2', note:5, commentaire:T('avis_packs.commentaire'),
                                              created_at:'2026-07-01T10:00:00Z',
                                              profiles:{ username:T('avis_packs.profiles.username'), avatar_url:IMG } }];
  if (t('commentaires_communaute')) return [{ id:1, post_id:1, user_id:'u2', contenu:T('commc.contenu'),
                                              parent_id:null, created_at:'2026-07-01T10:00:00Z',
                                              profiles:{ username:T('commc.profiles.username'), avatar_url:IMG } }];
  if (t('posts_communaute'))        return [{ id:1, creator_id:'u1', auteur_id:'u1', type:'post',
                                              contenu:T('posts.contenu'), est_epingle:false, image_url:IMG,
                                              created_at:'2026-07-01T10:00:00Z' }];
  if (t('/commentaires'))           return [COMMENTAIRE];
  if (t('/mangas'))                 return [1, 2].map(MANGA);
  if (t('/chapitres'))              return [1, 2].map(CHAP);
  if (t('packs_tutoriels'))         return [PACK(1)];
  if (t('/bibliotheque'))           return [{ user_id:'u1', manga_id:1, chapitre:101, page:3,
                                              total_pages:12, total_chapitres:3,
                                              mangas:{ titre:T('bibliotheque.mangas.titre'), couverture_url:IMG } }];
  if (t('/follows'))                return [{ user_id:'u1', followed_id:'u1' }];
  if (t('achats_packs'))            return [{ id:1, user_id:'u1', pack_id:1, prix_paye:0,
                                              packs_tutoriels: PACK(1) }];
  if (t('/notifications'))          return [{ id:1, user_id:'u1', type:'info',
                                              titre:T('notifications.titre'),
                                              message:T('notifications.message'),
                                              lien:T('notifications.lien'), lu:false,
                                              created_at:'2026-07-20T10:00:00Z' }];
  if (t('/signalements'))           return [{ id:1, signale_par:'u2', type_contenu:'manga',
                                              contenu_id:'1', raison:T('signalements.raison'),
                                              statut:'nouveau', created_at:'2026-07-20T10:00:00Z' }];
  return [];
}

const URLS = ['index.html', 'recherche.html?q=a', 'manga.html?id=1', 'bibliotheque.html',
  'profil.html', 'auteur.html?id=u1', 'communaute.html?id=u1', 'communaute.html',
  'tutoriels.html', 'pack.html?id=1', 'espace-createur.html', 'upload-manga.html',
  'gestion-chapitres.html?manga_id=1', 'lecteur.html?manga_id=1&chapitre=101',
  'parametres.html', 'admin.html'];

/* Relevé fait dans la page : on cherche les traces, pas les gabarits. */
const SONDE = () => {
  const out = [];
  document.querySelectorAll('inkrise-injection').forEach(e =>
    out.push({ g: 'balise-injectee', d: e.dataset.champ || '(champ inconnu)' }));
  document.querySelectorAll('[x-inkrise-attr]').forEach(e =>
    out.push({ g: 'sortie-d-attribut', d: e.getAttribute('x-inkrise-attr') +
      ' — sur <' + e.tagName.toLowerCase() + '>' }));
  (window.__coups || []).forEach(c => out.push({ g: 'code-execute', d: c }));
  // Un lien javascript: exécute au clic, sans rien laisser paraître avant.
  document.querySelectorAll('a[href]').forEach(a => {
    if (/^\s*javascript:/i.test(a.getAttribute('href') || ''))
      out.push({ g: 'lien-javascript', d: a.getAttribute('href').slice(0, 60) });
  });
  return out;
};

const releve = [];
const noter = (genre, page, detail) => releve.push({ genre, page, detail });

(async () => {
await new Promise(r => server.listen(8543, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

for (const mode of ['auth', 'anon']) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.addInitScript(() => { window.__coups = []; });
  if (mode === 'auth') {
    await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
        expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  } else {
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status:401, body:'{}' }));
  }
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({ status:200, contentType:'text/css', body:'' }));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (req.method() !== 'GET') return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    const rows = corps(decodeURIComponent(req.url()));
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers:{ 'Content-Range':'0-0/'+rows.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (rows[0] || null) : rows) });
  });
  await ctx.route('**/storage/v1/object/list/**', r => r.fulfill({ status:200,
    contentType:'application/json', body:'[{"name":"01.jpg"}]' }));
  await ctx.route('**/storage/v1/**', r => r.fulfill({ status:200,
    contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg"/>' }));

  for (const u of URLS) {
    const p = await ctx.newPage();
    try {
      await p.goto('http://localhost:8543/' + u, { waitUntil:'load', timeout:20000 });
      await p.waitForTimeout(1800);
      // Déplier ce qui ne se rend qu'au clic (onglets du profil, etc.)
      await p.evaluate(() => {
        document.querySelectorAll('.ptab, .tab-btn, [data-tab]').forEach(e => { try { e.click(); } catch (_) {} });
      }).catch(() => {});
      await p.waitForTimeout(600);
      (await p.evaluate(SONDE)).forEach(x => noter(x.g, u + ' [' + mode + ']', x.d));
    } catch (e) {
      noter('page-plantee', u + ' [' + mode + ']', e.message.slice(0, 70));
    }
    await p.close();
  }
  await ctx.close();
}
await b.close(); server.close();

/* ══ Rapport ══ */
const parGenre = {};
releve.forEach(r => {
  const c = r.genre + '|' + r.detail;
  (parGenre[r.genre] = parGenre[r.genre] || new Map());
  if (!parGenre[r.genre].has(c)) parGenre[r.genre].set(c, { detail: r.detail, pages: new Set() });
  parGenre[r.genre].get(c).pages.add(r.page);
});
console.log('\n═══ ÉCHAPPEMENT DES CONTENUS UTILISATEUR ═══\n');
const ORDRE = ['code-execute', 'lien-javascript', 'sortie-d-attribut', 'balise-injectee', 'page-plantee'];
const LIBELLE = {
  'code-execute':      'CODE EXÉCUTÉ — le plus grave : du script fourni par un tiers a tourné',
  'lien-javascript':   'LIEN JAVASCRIPT — s\'exécute au clic',
  'sortie-d-attribut': 'SORTIE D\'ATTRIBUT — les guillemets ne sont pas neutralisés',
  'balise-injectee':   'BALISE INJECTÉE — la chaîne est analysée comme du HTML',
  'page-plantee':      'PAGE PLANTÉE pendant le test',
};
let total = 0;
for (const g of ORDRE) {
  if (!parGenre[g]) continue;
  const liste = [...parGenre[g].values()];
  total += liste.length;
  console.log('### ' + LIBELLE[g] + ' (' + liste.length + ')');
  liste.slice(0, 15).forEach(x => {
    const pg = [...x.pages];
    console.log('  • ' + x.detail);
    console.log('      ' + pg.slice(0, 4).join(', ') + (pg.length > 4 ? ' +' + (pg.length - 4) : ''));
  });
  if (liste.length > 15) console.log('  … et ' + (liste.length - 15) + ' autres');
  console.log('');
}
console.log('───────────');
console.log(total === 0
  ? '✅ aucun contenu utilisateur ne s\'échappe de son cadre'
  : total + ' défaut(s) d\'échappement');
process.exit(total === 0 ? 0 : 1);
})();
