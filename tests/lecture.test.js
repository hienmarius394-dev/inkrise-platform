/* Profil de lecteur (§2.10 de l'audit).

   Le profil ne parlait que de création : quelqu'un qui vient lire y
   trouvait quatre zéros — Mangas, Vues, Chapitres, Abonnés — et six
   onglets sur la publication.

   Tout ce que montre le nouvel onglet se reconstitue à partir de ce que
   la base contient déjà : bibliothèque, avis, genres des œuvres. Aucune
   colonne ajoutée. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8143;
const BASE = 'http://localhost:' + PORT;
const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

/* Cinq œuvres : deux terminées, deux en cours, une sans total connu —
   ce dernier cas est celui où l'on ne peut RIEN affirmer de la
   progression. */
const BIBLIO = [
  { manga_id:1, chapitre:12, total_chapitres:12, added_at:'2026-08-01T10:00:00Z',
    mangas:{ titre:'Darkworld', couverture_url:null, genres:['Action','Fantasy'] } },
  { manga_id:2, chapitre:8,  total_chapitres:8,  added_at:'2026-07-28T10:00:00Z',
    mangas:{ titre:'Lame de Jade', couverture_url:null, genres:['Action'] } },
  { manga_id:3, chapitre:3,  total_chapitres:20, added_at:'2026-07-20T10:00:00Z',
    mangas:{ titre:'Ciel Fendu', couverture_url:null, genres:['Action','Romance'] } },
  { manga_id:4, chapitre:1,  total_chapitres:9,  added_at:'2026-07-15T10:00:00Z',
    mangas:{ titre:'Encre Noire', couverture_url:null, genres:['Horreur'] } },
  { manga_id:5, chapitre:4,  total_chapitres:0,  added_at:'2026-07-10T10:00:00Z',
    mangas:{ titre:'Sans total', couverture_url:null, genres:['Comédie'] } },
];

async function ouvrir(b, { biblio = BIBLIO, nbAvis = 7, erreur = false } = {}) {
  const ctx = await b.newContext({viewport:{width:900,height:900}});
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({...U,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>{
    const req=r.request(), u=decodeURIComponent(req.url());
    /* `count: 'exact', head: true` envoie un HEAD, pas un GET : le traiter
       comme une écriture renvoyait une réponse sans en-tête Content-Range,
       et le compteur restait à zéro. */
    if (req.method()!=='GET' && req.method()!=='HEAD')
      return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    if (u.includes('/bibliotheque')) {
      if (erreur) return r.fulfill({status:500,contentType:'application/json',
        body:JSON.stringify({message:'boom'})});
      return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(biblio)});
    }
    if (u.includes('avis_mangas'))
      return r.fulfill({status:200,contentType:'application/json',
        headers:{'Content-Range':'0-0/'+nbAvis,'Access-Control-Expose-Headers':'Content-Range'},
        body:'[]'});
    if (u.includes('/profiles')) {
      const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
      const moi={ id:'u1', username:'Marius', avatar_url:null, bio:'', is_creator:false,
                  created_at:'2026-01-05T10:00:00Z' };
      return r.fulfill({status:200,contentType:'application/json',
        body:JSON.stringify(seul?moi:[moi])});
    }
    return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'});
  });
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const p = await ctx.newPage();
  await p.goto(BASE+'/profil.html');
  await p.waitForTimeout(2600);
  return { ctx, p };
}

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Un lecteur trouve enfin quelque chose sur son profil');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  check('« Ma lecture » est le premier onglet',
    await p.locator('.ptab').first().getAttribute('data-tab') === 'lecture',
    await p.locator('.ptab').first().innerText());
  check('  et il est ouvert à l\'arrivée',
    await p.locator('#tab-lecture').isVisible());
  check('les œuvres commencées sont comptées',
    await p.locator('#lecCommencees').innerText() === '5',
    await p.locator('#lecCommencees').innerText());
  check('  les terminées aussi', await p.locator('#lecTerminees').innerText() === '2',
    await p.locator('#lecTerminees').innerText());
  check('  et les avis donnés', await p.locator('#lecAvis').innerText() === '7',
    await p.locator('#lecAvis').innerText());
  await ctx.close();
}

console.log('\n▶ Les genres lus deviennent des chemins');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  const t = await p.locator('#lecGenres').innerText();
  check('les genres sont classés par fréquence',
    t.indexOf('Action') < t.indexOf('Fantasy'), t.replace(/\n/g,' '));
  check('  avec leur nombre d\'œuvres', /Action\s*3/.test(t), t.replace(/\n/g,' '));
  check('  et chacun mène au catalogue filtré',
    await p.locator('#lecGenres a[href="recherche.html?genre=Action"]').count() === 1);
  await ctx.close();
}

console.log('\n▶ Reprendre là où on s\'est arrêté');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  const items = p.locator('.reprise-item');
  check('seules les œuvres non terminées sont proposées',
    await items.count() === 3, await items.count() + ' au lieu de 3');
  const t = await p.locator('#lecEnCours').innerText();
  check('  les terminées n\'y sont plus', !/Darkworld/.test(t) && !/Lame de Jade/.test(t));
  check('  la position est rappelée', /Chapitre 3 sur 20/.test(t), t.replace(/\n/g,' | ').slice(0,80));
  /* Sans nombre total de chapitres, on ne peut rien affirmer : mieux vaut
     ne pas dessiner de jauge que d'en inventer une. */
  check('  aucune jauge inventée quand le total est inconnu',
    await p.locator('.reprise-item', { hasText:'Sans total' }).locator('.reprise-jauge').count() === 0);
  check('  mais l\'œuvre reste listée',
    /Sans total/.test(t));
  await ctx.close();
}

console.log('\n▶ Rien lu, et serveur en panne');
{
  const { ctx, p } = await ouvrir(b, { biblio: [] });
  p.on('pageerror',e=>errors.push(e.message));
  const t = await p.locator('#lectureVide').innerText();
  check('rien lu : la page invite à découvrir',
    /rien lu/i.test(t) && /Découvrir/i.test(t), t.replace(/\n/g,' | '));
  check('  aucun chiffre trompeur affiché',
    !(await p.locator('#lectureContenu').isVisible()));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { erreur:true });
  p.on('pageerror',e=>errors.push(e.message));
  const t = await p.locator('#lectureVide').innerText();
  check('serveur en panne : dit en français, sans jargon',
    /Chargement impossible/i.test(t) && /connexion/i.test(t), t.replace(/\n/g,' | '));
  await ctx.close();
}

console.log('\n▶ Les onglets de création restent accessibles');
{
  const { ctx, p } = await ouvrir(b);
  p.on('pageerror',e=>errors.push(e.message));
  await p.locator('.ptab[data-tab="mangas"]').click();
  await p.waitForTimeout(400);
  check('« Mes Mangas » s\'ouvre toujours', await p.locator('#tab-mangas').isVisible());
  check('  et « Ma lecture » se referme', !(await p.locator('#tab-lecture').isVisible()));
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
