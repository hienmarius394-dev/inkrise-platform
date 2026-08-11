#!/usr/bin/env node
/* Le parcours de quelqu'un qui vient d'arriver — et dont la base est vide.
   ─────────────────────────────────────────────────────────────────────
   Toutes les suites de tests remplissent Supabase avant de mesurer :
   deux mangas, un chapitre, un pack, un abonné, un avis. C'est commode,
   et c'est précisément l'inverse de ce que voit quelqu'un qui vient de
   créer son compte. Lui trouve **tout vide** : pas de bibliothèque, pas
   d'abonnement, pas de manga publié, pas de fil.

   Or c'est là qu'on se perd. Une page pleine se conduit toute seule — on
   clique sur ce qu'on voit. Une page vide doit **dire quoi faire**, sinon
   c'est un cul-de-sac : on regarde un écran qui annonce « rien », et on
   s'en va.

   Cet outil parcourt le site avec une base entièrement vide, et cherche
   trois défauts, tous silencieux :

   • CUL-DE-SAC   : la zone principale ne propose aucune action — rien à
                    cliquer qui mène ailleurs
   • MUET         : la zone est vide et ne l'explique pas ; on ne sait pas
                    si ça charge, si c'est cassé, ou s'il n'y a rien
   • LIEN MORT    : l'action proposée pointe vers une page qui n'existe
                    pas, ou vers la page où l'on est déjà

   La coquille commune (barre du bas, menu latéral, pied de page) est
   exclue : elle est présente partout et permettrait à n'importe quelle
   page vide de passer pour vivante.

   Usage :  node tests/outil-parcours.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css',
              '.svg':'image/svg+xml','.webmanifest':'application/json','.jpg':'image/jpeg','.png':'image/png'};
const PORT = 8551;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});

/* Un compte tout juste créé : le profil existe (le trigger SQL le crée à
   l'inscription), mais il ne contient rien et n'a rien publié. */
const U = { id:'neuf', email:'neuf@x.fr', user_metadata:{ username:'Nouvelle' } };
const PROFIL_NEUF = { id:'neuf', username:'Nouvelle', avatar_url:null, cover_url:null,
  bio:'', is_creator:false, created_at:'2026-08-01T10:00:00Z',
  pref_masquer_adulte:false, pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };

/* Les pages du parcours, dans l'ordre où on les rencontre vraiment.
   `attendu` : ce que la page devrait proposer de faire ensuite. */
const ETAPES = [
  { url:'index.html',        quoi:'la page d\'accueil, catalogue vide' },
  { url:'recherche.html',    quoi:'le catalogue, aucun manga' },
  { url:'bibliotheque.html', quoi:'ma bibliothèque, encore vide' },
  { url:'profil.html',       quoi:'mon profil, rien de publié' },
  { url:'communaute.html',   quoi:'la communauté, aucun abonnement' },
  { url:'tutoriels.html',    quoi:'les tutoriels, aucun pack' },
  { url:'upload-manga.html', quoi:'publier un manga, premier essai' },
  { url:'auteur.html?id=neuf', quoi:'mon profil public, rien dessus' },
  { url:'gestion-chapitres.html?manga_id=1', quoi:'gérer un manga qui n\'existe pas' },
  { url:'manga.html?id=1',   quoi:'une fiche manga introuvable' },
  { url:'pack.html?id=1',    quoi:'un pack introuvable' },
  { url:'lecteur.html?manga_id=1&chapitre=1', quoi:'un chapitre introuvable' },
  { url:'parametres.html',   quoi:'les réglages d\'un compte neuf' },
  { url:'404.html',          quoi:'la page perdue' },
  { url:'auth.html',         quoi:'la porte d\'entrée' },
];

/* La coquille est partout : la compter ferait passer n'importe quel
   cul-de-sac pour une page riche en possibilités. */
const HORS_COQUILLE = `
  :not(.univ-bnav *):not(#univDrawer *):not(.univ-drawer *):not(.footer *)
  :not(.univ-nav *):not(#inkThemeRow *):not(.ink-skip)
`.replace(/\s+/g, '');

const SONDE = (horsCoquille) => {
  /* Zone principale : ce que la page a vraiment à dire. */
  const zone = document.querySelector('main, #mainContent, #app, .main-wrap, .page-wrap')
            || document.body;

  const dansCoquille = (el) => !!el.closest(
    '.univ-bnav, #univDrawer, .univ-drawer, .footer, .univ-nav, #inkThemeRow, .ink-skip');

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };

  /* Actions réellement offertes : un lien qui mène ailleurs, ou un bouton
     actif. Un bouton désactivé ne propose rien. */
  const actions = [...zone.querySelectorAll('a[href], button, [role="button"], input[type="submit"]')]
    .filter(el => !dansCoquille(el) && visible(el) && !el.disabled
                 && el.getAttribute('aria-disabled') !== 'true')
    .map(el => ({
      texte: (el.innerText || el.value || el.getAttribute('aria-label') || '').replace(/\s+/g,' ').trim().slice(0, 46),
      href: el.tagName === 'A' ? el.getAttribute('href') : null,
      bouton: el.tagName !== 'A'
    }))
    .filter(a => a.texte || a.href);

  /* Texte propre à la page, coquille retirée.
     Piège rencontré en écrivant cet outil : `innerText` sur un CLONE
     détaché du document ne connaît plus la mise en forme, et rend donc
     aussi les onglets repliés et les messages d'erreur masqués. Le profil
     paraissait ainsi contenir 68 000 caractères, et `auteur.html`
     affichait à la fois « Profil introuvable » et le profil. On lit
     l'élément VIVANT, puis on retranche la coquille qu'il contient. */
  /* Second piège de la même famille : `innerText` sur un élément qui
     n'est PAS RENDU (display:none) retombe lui aussi sur textContent. Une
     zone principale entièrement masquée paraissait donc pleine de texte.
     On vérifie d'abord qu'elle s'affiche. */
  const zoneVisible = zone.getBoundingClientRect().height > 0
                   && getComputedStyle(zone).display !== 'none'
                   && getComputedStyle(zone).visibility !== 'hidden';
  let texte = zoneVisible ? (zone.innerText || '').replace(/\s+/g, ' ').trim() : '';
  zone.querySelectorAll('.univ-bnav, #univDrawer, .univ-drawer, .footer, .univ-nav, #inkThemeRow, .ink-skip')
      .forEach(n => {
        const t = (n.innerText || '').replace(/\s+/g, ' ').trim();
        if (t) texte = texte.split(t).join(' ');
      });
  texte = texte.replace(/\s+/g, ' ').trim();

  return { actions, texte, longueur: texte.length };
};

const releve = [];
const noter = (genre, page, detail) => releve.push({ genre, page, detail });

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

/* Toutes les adresses internes citées par une action doivent exister. */
const PAGES = new Set(fs.readdirSync(ROOT).filter(f => f.endsWith('.html')));

for (const connecte of [true, false]) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  if (connecte) {
    await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
      JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
        expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
      body: JSON.stringify({ ...U, aud:'authenticated' }) }));
  } else {
    await ctx.route('**/auth/v1/**', r => r.fulfill({ status:401, body:'{}' }));
  }
  /* LA BASE EST VIDE. Seul le profil de la personne existe — c'est le cas
     réel : le trigger SQL le crée à l'inscription. Tout le reste est
     vide, comme au premier jour. */
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    if (req.method() !== 'GET')
      return r.fulfill({ status:200, contentType:'application/json', body:'[]' });
    const url = decodeURIComponent(req.url());
    const lignes = (connecte && url.includes('/profiles')) ? [PROFIL_NEUF] : [];
    const seul = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
    r.fulfill({ status:200, contentType:'application/json',
      headers: { 'Content-Range':'0-0/' + lignes.length, 'Access-Control-Expose-Headers':'Content-Range' },
      body: JSON.stringify(seul ? (lignes[0] || null) : lignes) });
  });
  await ctx.route('**/storage/v1/object/list/**', r =>
    r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  await ctx.route('**/storage/v1/**', r =>
    r.fulfill({ status:200, contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg"/>' }));

  const etiquette = connecte ? '' : ' (déconnecté)';
  for (const etape of ETAPES) {
    const p = await ctx.newPage();
    let arrivee = etape.url;
    try {
      await p.goto(BASE + '/' + etape.url, { waitUntil:'domcontentloaded' });
      await p.waitForTimeout(1800);
      arrivee = p.url().replace(BASE + '/', '');
    } catch (e) { await p.close(); continue; }

    /* Une redirection est une réponse légitime : on note où l'on atterrit
       et on juge la page d'arrivée, pas celle qu'on visait. */
    const redirige = arrivee.split('?')[0] !== etape.url.split('?')[0];
    const nom = etape.url + etiquette + (redirige ? ' → ' + arrivee : '');

    const r = await p.evaluate(SONDE, HORS_COQUILLE);

    if (process.env.INKRISE_VOIR) {
      console.log('\n--- ' + nom + ' (' + r.longueur + ' car.)');
      console.log('    texte : ' + r.texte.slice(0, 700));
      console.log('    actions : ' + r.actions.map(a => a.texte + (a.href ? '→'+a.href : '')).join(' | ').slice(0, 300));
    }
    if (!r.actions.length) {
      noter('CUL-DE-SAC', nom, r.texte.slice(0, 80) || '(page sans texte)');
    }
    if (r.longueur < 40) {
      noter('MUET', nom, r.texte || '(rien du tout)');
    }
    for (const a of r.actions) {
      if (!a.href) continue;
      if (/^(https?:|mailto:|tel:|#|javascript:)/.test(a.href)) continue;
      const cible = a.href.split('?')[0].split('#')[0].replace(/^\.?\//, '');
      if (!cible) continue;
      if (!PAGES.has(cible))
        noter('LIEN MORT', nom, `« ${a.texte} » → ${a.href}`);
      else if (cible === arrivee.split('?')[0] && !a.href.includes('?'))
        noter('LIEN SUR SOI', nom, `« ${a.texte} » → ${a.href}`);
    }
    await p.close();
  }
  await ctx.close();
}

await b.close(); server.close();

console.log('\n═══ LE PARCOURS D\'UN COMPTE NEUF, BASE VIDE ═══\n');
if (!releve.length) {
  console.log('───────────');
  console.log('✅ aucune impasse : chaque page vide propose une suite');
  process.exit(0);
}
const genres = [...new Set(releve.map(r => r.genre))];
for (const g of genres) {
  const lot = releve.filter(r => r.genre === g);
  console.log(`\n### ${g} (${lot.length})`);
  for (const r of lot) console.log(`  • ${r.page}\n      ${r.detail}`);
}
console.log('\n───────────');
console.log(`${releve.length} point(s) à regarder`);
process.exit(1);
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
