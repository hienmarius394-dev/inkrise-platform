/* Double page sur tablette et ordinateur (§2.8 de l'audit).

   Sur un écran large, une planche seule au milieu laissait les deux tiers
   de la largeur vides — alors qu'un manga se lit naturellement par paires.

   Trois pièges, tous vérifiés ici :
   - le SENS DE LECTURE : en manga japonais, la planche de droite se lit
     en premier. L'ordre visuel s'inverse, l'ordre logique non ;
   - le PAS : sans avancer de deux, la paire glisserait d'un cran et on
     relirait la moitié de ce qu'on vient de voir ;
   - le ZOOM : les deux planches doivent être agrandies ENSEMBLE, sinon
     agrandir séparerait la paire. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8147;
const BASE = 'http://localhost:' + PORT;
const PAGES = 5;                 // impair : la dernière paire est bancale
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};
const svg = n => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><text x="200" y="300">P${n}</text></svg>`;

const MANGA = sens => ({ id:1, titre:'Darkworld', type:'manga', sens_lecture:sens,
  age_recommande:'tout_public', commentaires_actifs:true, auteur_id:'u1' });

async function ouvrir(b, { largeur = 1280, sens = 'rl', double = true } = {}) {
  const ctx = await b.newContext({ viewport:{ width:largeur, height:900 } });
  if (double !== null) await ctx.addInitScript(v =>
    localStorage.setItem('inkrise_double_page', v), double ? '1' : '0');
  await ctx.addInitScript(() => localStorage.setItem('inkrise_read_mode', 'pages'));
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>{
    const u=r.request().url();
    if (u.includes('/mangas')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify(MANGA(sens))});
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{id:10,numero:1,titre:'Ouverture',manga_id:1}])});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  // Fourre-tout d'abord : Playwright donne la priorité à la dernière route.
  await ctx.route('**/storage/v1/**',r=>{
    const m = r.request().url().match(/(\d+)\.jpg/);
    return r.fulfill({status:200,contentType:'image/svg+xml',body:svg(m?m[1]:0)});
  });
  await ctx.route('**/storage/v1/object/list/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(Array.from({length:PAGES},(_,i)=>({name:(i+1)+'.jpg'})))}));
  const p = await ctx.newPage();
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2200);
  const sensOk = p.locator('#gateDirectionOk');
  if (await sensOk.isVisible().catch(()=>false)) { await sensOk.click(); await p.waitForTimeout(400); }
  await p.waitForTimeout(700);
  return { ctx, p };
}

/* Ordre RÉELLEMENT vu à l'écran, de gauche à droite — pas l'ordre du DOM.
   C'est toute la question du sens de lecture. */
const ordreVisuel = p => p.evaluate(() =>
  [...document.querySelectorAll('#pageZoom img')]
    .filter(i => i.style.display !== 'none' && i.getAttribute('src'))
    .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
    .map(i => (i.getAttribute('src').match(/(\d+)\.jpg/) || [])[1]));

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Deux planches à la fois sur écran large');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  check('le bouton double page est proposé', await p.locator('#btnDouble').isVisible());
  check('  et il annonce son état', await p.locator('#btnDouble').getAttribute('aria-pressed') === 'true');
  check('deux planches sont affichées', (await ordreVisuel(p)).length === 2,
    JSON.stringify(await ordreVisuel(p)));
  check('  le compteur dit bien qu\'on en voit deux',
    (await p.locator('#pageNum').innerText()) === '1–2',
    await p.locator('#pageNum').innerText());
  await ctx.close();
}

console.log('\n▶ Le sens de lecture décide de la place des planches');
{
  const { ctx, p } = await ouvrir(b, { sens:'rl' });
  p.on('pageerror',e=>errors.push(e.message));
  const ordre = await ordreVisuel(p);
  check('manga japonais : la planche 1 est à DROITE',
    ordre[0] === '2' && ordre[1] === '1', 'de gauche à droite : ' + ordre.join(', '));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { sens:'lr' });
  p.on('pageerror',e=>errors.push(e.message));
  const ordre = await ordreVisuel(p);
  check('BD occidentale : la planche 1 est à GAUCHE',
    ordre[0] === '1' && ordre[1] === '2', 'de gauche à droite : ' + ordre.join(', '));
  await ctx.close();
}

console.log('\n▶ On avance de deux, pas d\'une');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.evaluate(()=>nextPage());
  await p.waitForTimeout(700);
  check('la paire suivante est 3–4, pas 2–3',
    (await p.locator('#pageNum').innerText()) === '3–4',
    await p.locator('#pageNum').innerText());
  await p.evaluate(()=>prevPage());
  await p.waitForTimeout(700);
  check('  et on revient bien à 1–2',
    (await p.locator('#pageNum').innerText()) === '1–2',
    await p.locator('#pageNum').innerText());
  await ctx.close();
}
{
  /* Cinq planches : la dernière est seule. Mieux vaut une moitié vide
     qu'une image cassée ou qu'un chapitre qu'on ne peut pas finir. */
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.evaluate(()=>{ nextPage(); });
  await p.waitForTimeout(600);
  await p.evaluate(()=>{ nextPage(); });
  await p.waitForTimeout(700);
  check('nombre impair : la dernière planche s\'affiche seule',
    (await ordreVisuel(p)).length === 1, JSON.stringify(await ordreVisuel(p)));
  check('  et le compteur ne promet pas de paire',
    (await p.locator('#pageNum').innerText()) === '5',
    await p.locator('#pageNum').innerText());
  await ctx.close();
}

console.log('\n▶ Le zoom agrandit la paire, pas une moitié');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.keyboard.press('+');
  await p.waitForTimeout(400);
  const t = await p.evaluate(() => {
    const lu = e => new DOMMatrixReadOnly(getComputedStyle(e).transform).a;
    return { zone: lu(document.getElementById('pageZoom')),
             img1: lu(document.getElementById('pageImg')),
             img2: lu(document.getElementById('pageImg2')) };
  });
  check('le conteneur est agrandi', t.zone > 1, '×' + t.zone);
  check('  les deux planches suivent ensemble', t.img1 === 1 && t.img2 === 1,
    'aucune transformation propre : ' + JSON.stringify(t));
  check('  et elles sont toujours côte à côte',
    (await ordreVisuel(p)).length === 2);
  await ctx.close();
}

console.log('\n▶ Un écran étroit revient à une planche');
{
  const { ctx, p } = await ouvrir(b, { largeur:700 });
  p.on('pageerror',e=>errors.push(e.message));
  check('écran étroit : le bouton disparaît', !(await p.locator('#btnDouble').isVisible()));
  check('  une seule planche est affichée', (await ordreVisuel(p)).length === 1,
    JSON.stringify(await ordreVisuel(p)));
  check('  et le compteur redevient simple',
    (await p.locator('#pageNum').innerText()) === '1',
    await p.locator('#pageNum').innerText());
  await ctx.close();
}
{
  // Rétrécir en cours de lecture doit reprendre la main de lui-même
  const { ctx, p } = await ouvrir(b, { largeur:1280 });
  p.on('pageerror',e=>errors.push(e.message));
  check('large : deux planches', (await ordreVisuel(p)).length === 2);
  await p.setViewportSize({ width:700, height:900 });
  await p.waitForTimeout(900);
  check('  rétréci : une seule, sans rien toucher', (await ordreVisuel(p)).length === 1,
    JSON.stringify(await ordreVisuel(p)));
  await ctx.close();
}

console.log('\n▶ Le choix est respecté et retenu');
{
  const { ctx, p } = await ouvrir(b, { double:false });
  p.on('pageerror',e=>errors.push(e.message));
  check('désactivé : une seule planche', (await ordreVisuel(p)).length === 1);
  await p.locator('#btnDouble').click();
  await p.waitForTimeout(700);
  check('  un clic l\'active', (await ordreVisuel(p)).length === 2,
    JSON.stringify(await ordreVisuel(p)));
  check('  et le choix est retenu',
    (await p.evaluate(()=>localStorage.getItem('inkrise_double_page'))) === '1');
  await ctx.close();
}
{
  // En lecture verticale, la double page n'a aucun sens
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.locator('#btnModeScroll').click();
  await p.waitForTimeout(900);
  check('lecture verticale : le bouton disparaît', !(await p.locator('#btnDouble').isVisible()));
  check('  et les planches défilent normalement',
    await p.locator('.scroll-page').count() === PAGES,
    await p.locator('.scroll-page').count() + ' planches');
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
