/* Confort de lecture : plein écran et zoom (§2.8 de l'audit).

   Une planche entière tient dans un écran de téléphone — les dialogues y
   deviennent illisibles. Deux gestes manquaient : pincer pour agrandir, et
   récupérer les pixels que les barres du navigateur mangent.

   Ce qui est vérifié, c'est la transformation réellement appliquée à
   l'image, pas la présence du code. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8135;
const BASE = 'http://localhost:' + PORT;
const PAGES = 4;
const MANGA = { id:1, titre:'Darkworld', type:'manga', sens_lecture:'rl',
                age_recommande:'tout_public', commentaires_actifs:true, auteur_id:'u1' };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};
const svg = n => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="400" height="600" fill="#eee"/><text x="200" y="300">P${n}</text></svg>`;

async function ouvrir(b, { sansPleinEcran = false } = {}) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  if (sansPleinEcran) {
    /* Reproduit un iPhone : l'API plein écran n'y existe pas pour autre
       chose qu'une vidéo. */
    await ctx.addInitScript(() => {
      delete Element.prototype.requestFullscreen;
      delete Element.prototype.webkitRequestFullscreen;
    });
  }
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>{
    const u = r.request().url();
    if (u.includes('/mangas')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MANGA)});
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{id:10,numero:1,titre:'Ouverture',manga_id:1}])});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  // Le fourre-tout d'abord : Playwright donne la priorité à la route
  // enregistrée en dernier, et la liste des planches doit gagner.
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:svg(1)}));
  await ctx.route('**/storage/v1/object/list/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify(Array.from({length:PAGES},(_,i)=>({name:(i+1)+'.jpg'})))}));
  const p = await ctx.newPage();
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2200);
  // Un manga japonais ouvre sur l'écran de sens de lecture : il faut le
  // passer, sinon il intercepte tous les clics.
  const sens = p.locator('#gateDirectionOk');
  if (await sens.isVisible().catch(()=>false)) { await sens.click(); await p.waitForTimeout(400); }
  await p.locator('#btnModePage').click();      // le zoom vit en mode pages
  await p.waitForTimeout(900);
  return { ctx, p };
}

/* Facteur d'échelle réellement appliqué, lu dans la matrice calculée. */
const echelle = p => p.evaluate(() => {
  const m = new DOMMatrixReadOnly(getComputedStyle(document.getElementById('pageImg')).transform);
  return Math.round(m.a * 1000) / 1000;
});
const deplacement = p => p.evaluate(() => {
  const m = new DOMMatrixReadOnly(getComputedStyle(document.getElementById('pageImg')).transform);
  return { x: Math.round(m.e), y: Math.round(m.f) };
});

/* Pincement : deux doigts qui s'écartent. Le lecteur lit e.touches, des
   TouchEvent synthétiques reproduisent donc fidèlement le geste. */
async function pincer(p, facteur) {
  await p.evaluate(async (f) => {
    const el = document.getElementById('pagesViewer');
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const doigt = (x, y) => new Touch({ identifier: Math.random(), target: el, clientX: x, clientY: y });
    const ev = (t, ecart) => new TouchEvent(t, { bubbles: true, cancelable: true,
      touches: t === 'touchend' ? [] : [doigt(cx - ecart, cy), doigt(cx + ecart, cy)] });
    const depart = 60, arrivee = 60 * f;
    el.dispatchEvent(ev('touchstart', depart));
    for (let i = 1; i <= 5; i++) {
      el.dispatchEvent(ev('touchmove', depart + (arrivee - depart) * i / 5));
      await new Promise(r => setTimeout(r, 12));
    }
    el.dispatchEvent(ev('touchend', arrivee));
  }, facteur);
  await p.waitForTimeout(250);
}

async function tapDouble(p) {
  await p.evaluate(async () => {
    const el = document.getElementById('pagesViewer');
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const ev = t => new TouchEvent(t, { bubbles: true, cancelable: true,
      touches: t === 'touchend' ? [] : [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })],
      changedTouches: [new Touch({ identifier: 1, target: el, clientX: x, clientY: y })] });
    for (let i = 0; i < 2; i++) {
      el.dispatchEvent(ev('touchstart'));
      el.dispatchEvent(ev('touchend'));
      await new Promise(r => setTimeout(r, 90));
    }
  });
  await p.waitForTimeout(350);
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Pincer agrandit la planche');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  check('au départ, la planche est à sa taille', await echelle(p) === 1, String(await echelle(p)));
  await pincer(p, 2);
  const z = await echelle(p);
  check('après un pincement, elle est agrandie', z > 1.4, '×' + z);
  check('  le zoom est plafonné', z <= 3, '×' + z);
  await ctx.close();
}

console.log('\n▶ Le double tap agrandit puis remet à plat');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await tapDouble(p);
  const z1 = await echelle(p);
  check('un double tap agrandit', z1 > 1.5, '×' + z1);
  await tapDouble(p);
  const z2 = await echelle(p);
  check('  le suivant remet à plat', z2 === 1, '×' + z2);
  await ctx.close();
}

console.log('\n▶ Agrandi, le doigt déplace la planche au lieu de tourner la page');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  const avant = await p.locator('#pageNum').innerText();
  await tapDouble(p);
  check('la planche est agrandie', await echelle(p) > 1.5);
  check('  les bandes latérales ne tournent plus la page',
    await p.evaluate(()=>getComputedStyle(document.querySelector('.click-zone')).pointerEvents) === 'none');
  await p.evaluate(async () => {
    const el = document.getElementById('pagesViewer');
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2, x0 = r.left + r.width / 2;
    const mk = (t, x) => new TouchEvent(t, { bubbles:true, cancelable:true,
      touches: t === 'touchend' ? [] : [new Touch({ identifier:1, target:el, clientX:x, clientY:y })],
      changedTouches: [new Touch({ identifier:1, target:el, clientX:x, clientY:y })] });
    el.dispatchEvent(mk('touchstart', x0));
    for (let i = 1; i <= 4; i++) { el.dispatchEvent(mk('touchmove', x0 + 30 * i)); await new Promise(r=>setTimeout(r,12)); }
    el.dispatchEvent(mk('touchend', x0 + 120));
  });
  await p.waitForTimeout(250);
  check('  la page n\'a pas changé', await p.locator('#pageNum').innerText() === avant,
    avant + ' → ' + await p.locator('#pageNum').innerText());
  check('  la planche, elle, a bougé', (await deplacement(p)).x > 0,
    JSON.stringify(await deplacement(p)));
  await ctx.close();
}

console.log('\n▶ La planche ne peut pas sortir de l\'écran');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await tapDouble(p);
  const large = await p.evaluate(()=>document.getElementById('pageImg').clientWidth);
  await p.evaluate(async () => {
    const el = document.getElementById('pagesViewer');
    const r = el.getBoundingClientRect();
    const y = r.top + r.height / 2, x0 = r.left + 10;
    const mk = (t, x) => new TouchEvent(t, { bubbles:true, cancelable:true,
      touches: t === 'touchend' ? [] : [new Touch({ identifier:1, target:el, clientX:x, clientY:y })],
      changedTouches: [new Touch({ identifier:1, target:el, clientX:x, clientY:y })] });
    el.dispatchEvent(mk('touchstart', x0));
    for (let i = 1; i <= 6; i++) { el.dispatchEvent(mk('touchmove', x0 + 400 * i)); await new Promise(r=>setTimeout(r,10)); }
    el.dispatchEvent(mk('touchend', x0 + 2400));
  });
  await p.waitForTimeout(250);
  const d = await deplacement(p), z = await echelle(p);
  const limite = Math.ceil(large * (z - 1) / 2) + 2;
  check('un geste démesuré est borné', d.x <= limite,
    'déplacement ' + d.x + 'px, limite ' + limite + 'px');
  await ctx.close();
}

console.log('\n▶ Changer de page remet la planche à plat');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await tapDouble(p);
  check('la planche est agrandie', await echelle(p) > 1.5);
  await p.evaluate(()=>nextPage());
  await p.waitForTimeout(400);
  check('  la page suivante repart à plat', await echelle(p) === 1, '×' + await echelle(p));
  await ctx.close();
}

console.log('\n▶ Clavier : +, − et 0');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.keyboard.press('+'); await p.waitForTimeout(250);
  check('« + » agrandit', await echelle(p) > 1, '×' + await echelle(p));
  await p.keyboard.press('0'); await p.waitForTimeout(250);
  check('« 0 » remet à plat', await echelle(p) === 1, '×' + await echelle(p));
  await p.keyboard.press('-'); await p.waitForTimeout(250);
  check('« − » ne réduit pas sous la taille normale', await echelle(p) === 1,
    '×' + await echelle(p));
  await ctx.close();
}

console.log('\n▶ Plein écran');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  const bouton = p.locator('#btnPleinEcran');
  check('le bouton est proposé', await bouton.isVisible());
  check('  il annonce son état', await bouton.getAttribute('aria-pressed') === 'false');
  check('  et il est décrit pour les lecteurs d\'écran',
    (await bouton.getAttribute('aria-label') || '').length > 5,
    await bouton.getAttribute('aria-label'));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { sansPleinEcran:true });
  p.on('pageerror',e=>errors.push('sansPleinEcran: '+e.message));
  check('masqué là où le navigateur ne sait pas le faire (iPhone)',
    !(await p.locator('#btnPleinEcran').isVisible()));
  check('  la lecture fonctionne quand même',
    await p.locator('#pageImg').isVisible());
  check('  et le zoom aussi', await (async()=>{ await tapDouble(p); return await echelle(p) > 1.5; })());
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
