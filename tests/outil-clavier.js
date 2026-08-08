/* Navigation au clavier — le défaut silencieux par excellence.
   ─────────────────────────────────────────────────────────────────────
   Rien ne plante, rien ne s'affiche en rouge : ça marche simplement mal
   pour qui n'utilise pas de souris. Trois choses se mesurent ici, et
   AUCUNE ne se lit dans le code :

   1. LE FOCUS SE VOIT-IL ? On compare le style calculé de chaque élément
      focalisé à son style au repos. Si rien ne change — ni contour, ni
      ombre, ni bordure, ni fond — la personne qui tabule ne sait pas où
      elle est. `outline: none` sans remplacement est le coupable habituel.

   2. LES FENÊTRES SE FERMENT-ELLES ? Une modale qu'on ne peut fermer
      qu'en visant un ✕ à la souris est une impasse au clavier. Échap doit
      marcher.

   3. LE FOCUS ENTRE-T-IL, ET REVIENT-IL ? À l'ouverture il doit passer
      dans la fenêtre ; à la fermeture il doit revenir sur le bouton qui
      l'avait ouverte, sinon on repart du haut de la page.

   Usage :  node tests/outil-clavier.js */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = 8151;
const BASE = 'http://localhost:' + PORT;
const U = { id:'u1', email:'m@x.fr', aud:'authenticated', user_metadata:{ username:'Marius' } };
const PROFIL = { id:'u1', username:'Marius', bio:'Dessinateur', avatar_url:null,
                 is_creator:true, created_at:'2026-01-05T10:00:00Z' };

const PAGES = ['index.html', 'profil.html', 'recherche.html?q=a', 'manga.html?id=1',
               'bibliotheque.html', 'auth.html', 'parametres.html',
               'upload-manga.html', 'tutoriels.html', 'communaute.html'];

const releve = [];
const noter = (genre, page, detail) => releve.push({ genre, page, detail });

/* Ce qui rend un focus VISIBLE. On ne cherche pas une propriété précise —
   un contour, une ombre, une bordure ou un fond qui change font tous
   l'affaire. On cherche « quelque chose a changé ».

   Y COMPRIS SUR UN ANCÊTRE : l'anneau d'un champ de recherche se pose
   naturellement sur la pilule qui l'entoure (`:focus-within`), pas sur
   l'input nu. Ne regarder que l'élément lui-même signalerait à tort un
   indicateur parfaitement visible. On remonte donc de deux niveaux. */
const SIGNATURE = el => {
  const un = e => {
    const s = getComputedStyle(e);
    return [s.outlineStyle, s.outlineWidth, s.outlineColor, s.boxShadow,
            s.borderColor, s.borderWidth, s.backgroundColor, s.color,
            s.textDecorationLine, s.transform, s.filter, s.opacity].join('|');
  };
  const bouts = [un(el)];
  let n = el.parentElement;
  for (let i = 0; i < 2 && n && n !== document.body; i++) { bouts.push(un(n)); n = n.parentElement; }
  return bouts.join('#');
};

async function ouvrir(b, url, { session = true, lecteur = false } = {}) {
  const ctx = await b.newContext({ viewport:{ width:1280, height:1000 } });
  if (session) await ctx.addInitScript(u=>localStorage.setItem(
    'sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status: session?200:401,
    contentType:'application/json', body: JSON.stringify(session?U:{})}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    if (u.includes('/profiles')) return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(seul ? { ...PROFIL, is_creator: !lecteur }
                               : [{ ...PROFIL, is_creator: !lecteur }])});
    if (u.includes('/mangas')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(seul ? { id:1, titre:'Darkworld', type:'manga', sens_lecture:'rl',
        age_recommande:'tout_public', commentaires_actifs:true, auteur_id:'u2' } : [])});
    return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + url, { waitUntil:'load' }).catch(()=>{});
  await p.waitForTimeout(1600);
  return { ctx, p };
}

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

/* ══ 1. Le focus se voit-il ? ══ */
for (const url of PAGES) {
  const { ctx, p } = await ouvrir(b, url, { session: !url.startsWith('auth') });
  if (!p.url().includes(url.split('?')[0])) { await ctx.close(); continue; }
  /* Tout déplier : les modales et les onglets repliés contiennent des
     commandes qui doivent elles aussi montrer leur focus. */
  await p.evaluate(() => {
    document.querySelectorAll('.tab-panel').forEach(e => e.classList.add('active'));
    document.querySelectorAll('.modal-overlay, .crop-overlay, .confirm-overlay')
      .forEach(e => e.classList.add('open'));
  });
  /* Les TRANSITIONS faussent la mesure : juste après `.focus()`, une
     bordure qui s'anime en 0,2s vaut encore son ancienne valeur, et le
     style calculé paraît inchangé. Huit champs étaient signalés à tort.
     On coupe donc toute animation avant de comparer. */
  await p.addStyleTag({ content:
    '*, *::before, *::after { transition: none !important; animation: none !important; }' });
  await p.waitForTimeout(300);

  const invisibles = await p.evaluate((sigSrc) => {
    const SIGNATURE = eval('(' + sigSrc + ')');
    const out = [];
    const cibles = [...document.querySelectorAll(
      'a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"])')];
    for (const el of cibles) {
      const st = getComputedStyle(el);
      if (st.display === 'none' || st.visibility === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (el.disabled) continue;
      const avant = SIGNATURE(el);
      el.focus({ preventScroll: true });
      if (document.activeElement !== el) continue;      // pas focalisable
      const apres = SIGNATURE(el);
      el.blur();
      if (avant === apres) {
        const nom = (el.getAttribute('aria-label') || el.title ||
                     (el.textContent || '').trim() || el.name || el.type || '').slice(0, 28);
        out.push(el.tagName.toLowerCase() +
          (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' « ' + nom + ' »');
      }
    }
    return [...new Set(out)];
  }, SIGNATURE.toString());

  invisibles.forEach(d => noter('focus-invisible', url, d));
  await ctx.close();
}

/* ══ 2 et 3. Les fenêtres au clavier ══ */
const MODALES = [
  { page:'profil.html', nom:'formulaire de pack', ouvrir:'#btnNouveauPack',
    onglet:'.ptab[data-tab="formations"]', boite:'#packModal' },
  /* « Devenir Créateur ✨ » ne s'affiche QUE si on ne l'est pas encore :
     il faut donc ouvrir cette page avec un profil de simple lecteur.
     Il n'ouvre AUCUNE fenêtre — devenir créateur est gratuit et immédiat —
     mais on vérifie qu'il reçoit bien le clic : un halo décoratif l'avait
     rendu inerte, et c'est la conversion principale du site. */
  { page:'profil.html', nom:'devenir créateur', ouvrir:'#btnOpenPlans',
    onglet:'.ptab[data-tab="mangas"]', lecteur:true, sansFenetre:true },
  /* Le signalement ne fabrique pas une `.modal-overlay` : c'est une
     fenêtre construite à la volée par assets/inkrise-nav.js. */
  { page:'manga.html?id=1', nom:'signalement', ouvrir:'#btnSignalManga',
    boite:'#inkSignalOverlay', volante:true },
];
for (const m of MODALES) {
  const { ctx, p } = await ouvrir(b, m.page, { lecteur: m.lecteur });
  try {
    if (m.onglet) { await p.click(m.onglet); await p.waitForTimeout(400); }
    const decl = p.locator(m.ouvrir);
    /* Un déclencheur introuvable faisait sauter la fenêtre EN SILENCE :
       elle comptait alors comme réussie. On le dit. */
    if (await decl.count() === 0 || !(await decl.isVisible())) {
      noter('fenetre-non-testee', m.page, m.nom + ' — déclencheur ' + m.ouvrir + ' introuvable');
      await ctx.close(); continue;
    }
    /* Le clic part-il vraiment SUR le bouton ? Un élément décoratif posé
       par-dessus l'avale sans un bruit : le clic atterrit sur le voisin et
       il ne se passe rien. C'est ainsi qu'un halo de 200×200px en
       `::before`, sans `pointer-events: none`, rendait inerte « Devenir
       Créateur ✨ » — la conversion principale du site. */
    const recouvert = await p.evaluate(sel => {
      const e = document.querySelector(sel);
      if (!e) return null;
      e.scrollIntoView({ block:'center' });
      const lignes = e.getClientRects();
      const b = lignes.length ? lignes[0] : e.getBoundingClientRect();
      const cy = Math.round(b.top + b.height / 2);
      const points = [0.5, 0.25, 0.75].map(f => [Math.round(b.left + b.width * f), cy]);
      if (points.some(([x, y]) => { const t = document.elementFromPoint(x, y);
                                    return t && (t === e || e.contains(t)); })) return null;
      const d = document.elementFromPoint(points[0][0], cy);
      if (!d) return null;
      return d.tagName.toLowerCase() + (d.id ? '#'+d.id :
        (d.className && typeof d.className === 'string' ? '.'+d.className.trim().split(/\s+/)[0] : ''));
    }, m.ouvrir);
    if (recouvert) {
      noter('commande-recouverte', m.page,
        m.nom + ' — le bouton ' + m.ouvrir + ' est recouvert par ' + recouvert);
      await ctx.close(); continue;
    }
    if (m.sansFenetre) { await ctx.close(); continue; }   // le clic seul suffisait
    await decl.focus();
    await decl.click();
    await p.waitForTimeout(500);
    const ouverte = m.volante
      ? await p.locator(m.boite).count() === 1
      : await p.locator(m.boite + '.open').count() === 1;
    if (!ouverte) {
      noter('fenetre-non-testee', m.page, m.nom + ' — ne s\'ouvre pas au clic');
      await ctx.close(); continue;
    }

    const dedans = await p.evaluate(sel => {
      const b = document.querySelector(sel);
      return !!b && b.contains(document.activeElement);
    }, m.boite);
    if (!dedans) noter('focus-hors-fenetre', m.page, m.nom + ' — le focus reste derrière');

    await p.keyboard.press('Escape');
    await p.waitForTimeout(400);
    const fermee = m.volante
      ? await p.locator(m.boite).count() === 0
      : await p.locator(m.boite + '.open').count() === 0;
    if (!fermee) noter('echap-sans-effet', m.page, m.nom + ' — Échap ne la ferme pas');

    if (fermee) {
      const rendu = await p.evaluate(sel => {
        const d = document.querySelector(sel);
        return !!d && document.activeElement === d;
      }, m.ouvrir);
      if (!rendu) noter('focus-non-rendu', m.page,
        m.nom + ' — le focus ne revient pas sur le bouton d\'ouverture');
    }
  } catch (e) { noter('fenetre-illisible', m.page, m.nom + ' — ' + e.message.slice(0, 60)); }
  await ctx.close();
}

await b.close(); server.close();

console.log('\n═══ NAVIGATION AU CLAVIER ═══\n');
const parGenre = {};
for (const r of releve) {
  (parGenre[r.genre] = parGenre[r.genre] || new Map());
  const m = parGenre[r.genre];
  if (!m.has(r.detail)) m.set(r.detail, new Set());
  m.get(r.detail).add(r.page);
}
const ORDRE = ['commande-recouverte','echap-sans-effet','focus-hors-fenetre','focus-non-rendu','focus-invisible','fenetre-non-testee','fenetre-illisible'];
let total = 0;
for (const g of ORDRE) {
  if (!parGenre[g]) continue;
  const liste = [...parGenre[g].entries()];
  total += liste.length;
  console.log('### ' + g.toUpperCase() + ' (' + liste.length + ')');
  liste.slice(0, 14).forEach(([d, pages]) => {
    console.log('  • ' + d);
    console.log('      ' + [...pages].slice(0, 4).join(', ') + ([...pages].length > 4 ? ' +' + ([...pages].length - 4) : ''));
  });
  if (liste.length > 14) console.log('  … et ' + (liste.length - 14) + ' autres');
  console.log('');
}
console.log('───────────');
console.log(total ? total + ' défaut(s) de navigation au clavier'
                  : '✅ tout se pilote au clavier, et le focus se voit');
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
