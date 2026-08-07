/* Polices auto-hébergées (backlog n°11).

   Chaque page allait chercher ses polices chez Google : une requête vers
   fonts.googleapis.com pour la feuille de style, une seconde vers
   fonts.gstatic.com pour les fichiers. Deux allers-retours vers un tiers
   avant le premier mot correctement dessiné — et l'adresse IP de chaque
   visiteur transmise à Google sans lui demander son avis.

   Ce qui est vérifié ici, ce n'est pas la présence des balises — c'est le
   RÉSULTAT : aucune requête ne part vers Google, et le texte est
   RÉELLEMENT dessiné dans la bonne fonte, mesuré à la largeur du texte
   rendu (une police non chargée donne une largeur différente).

   Vérifié aussi : la liste de préchargement du service worker. Un nom de
   fichier erroné y serait avalé sans bruit — `cache.add(u).catch(() => {})`
   — et le site perdrait le hors-ligne sans que rien ne le dise. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const servis = [];
const server=http.createServer((q,r)=>{const rel=decodeURIComponent(q.url.split('?')[0]);
 const p=path.join(ROOT,rel);
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 const ct=MIME[path.extname(p)]||'application/octet-stream';
 servis.push({ rel, ct });
 r.writeHead(200,{'Content-Type':ct});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8148;
const BASE = 'http://localhost:' + PORT;
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

/* Toutes les pages du site, pas un échantillon : l'intérêt de la manœuvre
   est qu'il ne reste NULLE PART un appel oublié. */
const PAGES = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();

async function ouvrir(b, url, { casser = false } = {}) {
  const ctx = await b.newContext({ viewport:{ width:1280, height:900 } });
  const tiers = [];
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if (u.hostname.endsWith('googleapis.com') || u.hostname.endsWith('gstatic.com')
        || u.hostname.endsWith('google.com')) { tiers.push(u.href); return r.abort(); }
    if (u.hostname !== 'localhost') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    // Panne simulée : les fichiers de police ne répondent plus.
    if (casser && u.pathname.endsWith('.woff2')) return r.abort('failed');
    return r.continue();
  });
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + url);
  await p.evaluate(() => document.fonts.ready).catch(()=>{});
  await p.waitForTimeout(400);
  return { ctx, p, tiers };
}

/* Largeur d'un texte dessiné dans une famille donnée. Si la police n'est
   pas chargée, le navigateur retombe sur la fonte système et la largeur
   change — c'est la seule preuve qu'elle est vraiment appliquée. */
const largeur = (p, famille) => p.evaluate(f => {
  const mesure = fam => {
    const s = document.createElement('span');
    s.textContent = 'Inkrise — chapitre 12 · Éàûö';
    s.style.cssText = `position:absolute;left:-9999px;font-size:48px;white-space:pre;font-family:${fam}`;
    document.body.appendChild(s);
    const w = s.getBoundingClientRect().width; s.remove(); return w;
  };
  return { police: mesure(`'${f}', monospace`), repli: mesure('monospace') };
}, famille);

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Plus rien ne part chez Google');
{
  const fuites = [];
  for (const page of PAGES) {
    const { ctx, p, tiers } = await ouvrir(b, page);
    p.on('pageerror',e=>errors.push(e.message));
    if (tiers.length) fuites.push(page + ' → ' + tiers[0]);
    await ctx.close();
  }
  check(`aucune des ${PAGES.length} pages n'appelle un domaine Google`,
    fuites.length === 0, fuites.join(' ; ') || 'aucune fuite');
}

console.log('\n▶ Les quatre familles sont réellement dessinables');
{
  /* On ne se contente pas de regarder ce qu'une page charge par hasard :
     `profil.html` renvoie vers la connexion quand on n'a pas de session,
     donc rien n'y est jamais écrit en Bebas Neue et la police resterait
     `unloaded` sans que ce soit un défaut. On demande donc explicitement
     chaque famille, puis on compare la largeur du texte rendu à celle de
     la fonte système : deux largeurs identiques = police non appliquée. */
  const { ctx, p } = await ouvrir(b, 'index.html');
  p.on('pageerror',e=>errors.push(e.message));
  for (const [famille, graisse] of
       [['Syne',700], ['DM Sans',400], ['Nunito',800], ['Bebas Neue',400]]) {
    /* `load()` REJETTE si le fichier est introuvable — un nom erroné dans
       inkrise-fonts.css ferait planter la suite au lieu de rougir. On
       attrape, et le 0 devient un échec lisible. */
    const charge = await p.evaluate(
      ([f, g]) => document.fonts.load(`${g} 48px '${f}'`).then(l => l.length, () => 0),
      [famille, graisse]);
    const { police, repli } = await largeur(p, famille);
    check(`${famille} ${graisse} — chargée et appliquée`,
      charge > 0 && police !== repli,
      `${charge} fonte(s), ${Math.round(police)}px contre ${Math.round(repli)}px en fonte système`);
  }
  await ctx.close();
}

console.log('\n▶ Chaque page charge bien les familles qu\'elle emploie');
{
  const manquantes = [];
  for (const page of ['index.html', 'cgu.html', 'lecteur.html', 'communaute.html']) {
    const { ctx, p } = await ouvrir(b, page);
    p.on('pageerror',e=>errors.push(e.message));
    const utilisees = await p.evaluate(() => {
      const vues = new Set();
      for (const f of document.fonts) if (f.status === 'loaded') vues.add(f.family);
      return [...vues];
    });
    for (const f of utilisees) {
      const { police, repli } = await largeur(p, f);
      if (police === repli) manquantes.push(page + ' : ' + f);
    }
    check(`${page} — ${utilisees.length} famille(s) dessinée(s)`,
      utilisees.length > 0, utilisees.join(', '));
    await ctx.close();
  }
  check('  aucune n\'est restée en fonte système',
    manquantes.length === 0, manquantes.join(' ; ') || 'largeur ≠ fonte système partout');
}

console.log('\n▶ Les fichiers sont servis pour ce qu\'ils sont');
{
  servis.length = 0;
  const { ctx, p } = await ouvrir(b, 'index.html');
  p.on('pageerror',e=>errors.push(e.message));
  const polices = servis.filter(s => s.rel.endsWith('.woff2'));
  check('des .woff2 sont bien demandés', polices.length > 0, polices.length + ' fichier(s)');
  check('  avec le type font/woff2 (nosniff est actif en production)',
    polices.every(s => s.ct === 'font/woff2'),
    [...new Set(polices.map(s=>s.ct))].join(', '));
  check('  et servis par Inkrise, depuis assets/fonts/',
    polices.every(s => s.rel.startsWith('/assets/fonts/')),
    [...new Set(polices.map(s=>s.rel))].join(', '));
  await ctx.close();
}

console.log('\n▶ Si les polices ne répondent plus, le texte reste lisible');
{
  /* font-display: swap — le texte s'affiche tout de suite en fonte
     système plutôt que de rester invisible en attendant. */
  const { ctx, p } = await ouvrir(b, 'index.html', { casser:true });
  p.on('pageerror',e=>errors.push(e.message));
  const texte = (await p.locator('body').innerText()).trim();
  check('polices injoignables : la page reste écrite', texte.length > 200,
    texte.length + ' caractères visibles');
  check('  et rien n\'est resté invisible',
    await p.evaluate(() => {
      const t = [...document.querySelectorAll('h1,h2,p,a')].filter(e => e.innerText.trim());
      return t.length > 0 && t.every(e => getComputedStyle(e).visibility !== 'hidden');
    }));
  await ctx.close();
}

console.log('\n▶ La liste hors-ligne du service worker ne ment pas');
{
  /* `cache.add(u).catch(() => {})` avale les 404 : un nom erroné passerait
     inaperçu et le site perdrait le hors-ligne sans un mot. */
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const bloc = sw.match(/const PRECACHE = \[([\s\S]*?)\];/);
  /* Les commentaires du bloc sont écrits en français : leurs apostrophes
     ressemblent à des chaînes. On les retire avant de lire la liste. */
  const sansCommentaires = bloc ? bloc[1].replace(/\/\/[^\n]*/g, '') : '';
  const listes = [...sansCommentaires.matchAll(/'([^']+)'/g)].map(m => m[1]);
  const absents = listes.filter(u => !fs.existsSync(path.join(ROOT, u)));
  check(`les ${listes.length} entrées préchargées existent vraiment`,
    listes.length > 0 && absents.length === 0, absents.join(', ') || 'toutes présentes');
  check('  les polices en font partie',
    listes.filter(u => u.endsWith('.woff2')).length === 4,
    listes.filter(u => u.endsWith('.woff2')).join(', '));
  check('  et la feuille qui les déclare aussi',
    listes.includes('assets/inkrise-fonts.css'));
  check('  le numéro de cache a changé (sinon les anciennes URL Google restent)',
    /const CACHE = 'inkrise-v(1[1-9]|[2-9]\d)'/.test(sw),
    (sw.match(/const CACHE = '[^']+'/) || [])[0]);
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
