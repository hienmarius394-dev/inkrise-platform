/* Partage d'une œuvre : le bouton côté navigateur, et l'aperçu de lien
   rendu côté serveur pour les robots des réseaux sociaux.

   Les deux moitiés répondent au même constat d'audit (§2.3) : on pouvait
   signaler une œuvre mais pas la recommander, et tout lien partagé
   s'affichait avec le même titre générique. */
const path = require('path');
const ROOT = path.join(__dirname, '..');
process.env.SITE_URL = 'https://inkrise-platform.vercel.app';

const DONNEES = {
  'mangas': [{ id: 12, titre: 'Darkworld', synopsis: '  Dans une ville où les ombres parlent, un jeune encreur découvre que ses dessins prennent vie la nuit et bouleversent le destin de tous ceux qu\'il croise, pour le meilleur comme pour le pire, sans qu\'il puisse rien y faire.  ', couverture_url: 'https://x.supabase.co/storage/v1/object/public/covers/12.webp', statut: 'en_cours', type: 'manga', auteur_id: 'u1', profiles: { username: 'Marius' } }],
  'mangas_brouillon': [{ id: 13, titre: 'Secret', synopsis: 'x', couverture_url: null, statut: 'brouillon', type: 'manga', auteur_id: 'u1', profiles: { username: 'Marius' } }],
  'packs_tutoriels': [{ id: 3, titre: 'Encrage <pro>', description: 'Apprends l\'encrage & le "trait".', couverture_url: null, prix: 5 }],
  'profiles': [{ id: 'u1', username: 'Marius', bio: 'Auteur de Darkworld', avatar_url: 'https://x.supabase.co/av.png' }],
};

global.fetch = async (url) => {
  let rows = [];
  if (url.includes('/mangas?')) rows = url.includes('id=eq.13') ? DONNEES.mangas_brouillon : (url.includes('id=eq.99') ? [] : DONNEES.mangas);
  else if (url.includes('packs_tutoriels?')) rows = url.includes('id=eq.99') ? [] : DONNEES.packs_tutoriels;
  else if (url.includes('profiles?')) rows = url.includes('id=eq.zz') ? [] : DONNEES.profiles;
  if (process.env.PANNE === '1') return { ok: false, status: 500, json: async () => [] };
  return { ok: true, status: 200, json: async () => rows };
};

const og = require(path.join(ROOT, 'api/og.js'));

function appeler(query) {
  return new Promise((resolve) => {
    const headers = {};
    const res = {
      statusCode: 200, _body: '', _headers: headers,
      setHeader: (k, v) => { headers[k.toLowerCase()] = v; },
      writeHead: function (c, h) { this.statusCode = c; Object.assign(headers, Object.fromEntries(Object.entries(h||{}).map(([k,v])=>[k.toLowerCase(),v]))); return this; },
      end: function (b) { this._body = b || ''; resolve({ status: this.statusCode, headers, body: this._body }); },
    };
    og({ url: '/api/og' + query, headers: {} }, res);
  });
}

const R = []; const check = (n, p, d='') => { R.push({n,p}); console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`); };

(async () => {
console.log('\n▶ Fiche manga');
{
  const r = await appeler('?type=manga&id=12');
  check('répond en HTML', r.status === 200 && /text\/html/.test(r.headers['content-type']||''), 'statut='+r.status);
  check('le vrai titre est dans og:title',
    /<meta property="og:title" content="Darkworld — Inkrise"/.test(r.body));
  check('la couverture réelle est dans og:image',
    /og:image" content="https:\/\/x\.supabase\.co\/storage\/v1\/object\/public\/covers\/12\.webp"/.test(r.body));
  const d = (r.body.match(/og:description" content="([^"]*)"/)||[])[1] || '';
  check('la description est résumée sous 201 caractères', d.length <= 201, d.length + ' caractères');
  check('  coupée sur un mot, pas au milieu', /…$/.test(d) && !/\s…$/.test(d), JSON.stringify(d.slice(-28)));
  check('couverture verticale → carte « summary »',
    /twitter:card" content="summary"/.test(r.body));
  check('lien canonique vers la page réelle',
    r.body.includes('<link rel="canonical" href="https://inkrise-platform.vercel.app/manga.html?id=12"'));
  check('un humain qui atterrit ici est renvoyé', /location\.replace/.test(r.body) && /http-equiv="refresh"/.test(r.body));
  check('mise en cache courte côté CDN', /s-maxage=300/.test(r.headers['cache-control']||''));
}

console.log('\n▶ Échappement');
{
  const r = await appeler('?type=pack&id=3');
  check('les chevrons du titre sont échappés',
    /og:title" content="Encrage &lt;pro&gt; — Inkrise"/.test(r.body), (r.body.match(/og:title[^>]*/)||[])[0]);
  check('les guillemets de la description n\'ouvrent pas l\'attribut',
    !/content="[^"]*"[a-z]/.test(r.body) && /&quot;trait&quot;/.test(r.body));
  check('le prix est indiqué', /5 €/.test(r.body));
  check('pas de couverture → bannière paysage + summary_large_image',
    /og:image" content="https:\/\/inkrise-platform\.vercel\.app\/assets\/hero-manga\.jpg"/.test(r.body)
    && /twitter:card" content="summary_large_image"/.test(r.body));
}

console.log('\n▶ Profil créateur');
{
  const r = await appeler('?type=auteur&id=u1');
  check('pseudo dans le titre', /og:title" content="Marius — Inkrise"/.test(r.body));
  check('bio dans la description', /og:description" content="Auteur de Darkworld"/.test(r.body));
}

console.log('\n▶ Ce qui ne doit PAS fuiter, et les pannes');
{
  const r = await appeler('?type=manga&id=13');
  check('un brouillon ne produit pas d\'aperçu', r.status === 302, 'statut='+r.status);
  check('  et son titre n\'apparaît nulle part', !/Secret/.test(r.body || ''));

  const r2 = await appeler('?type=manga&id=99');
  check('contenu introuvable → renvoi vers la page normale',
    r2.status === 302 && r2.headers.location === '/manga.html?id=99', r2.headers.location);

  const r3 = await appeler('?type=manga');
  check('sans identifiant → renvoi, pas de plantage', r3.status === 302);

  const r4 = await appeler('?type=nimporte&id=1');
  check('type inconnu → renvoi vers l\'accueil', r4.status === 302 && /index\.html/.test(r4.headers.location));

  process.env.PANNE = '1';
  const r5 = await appeler('?type=manga&id=12');
  check('base injoignable → renvoi vers la page normale (aperçu générique)',
    r5.status === 302 && r5.headers.location === '/manga.html?id=12', 'statut='+r5.status);
  process.env.PANNE = '0';
}

await navigateur();

console.log('\n' + '═'.repeat(56));
const ko = R.filter(r => !r.p);
console.log(`${R.length - ko.length}/${R.length} vérifications OK`);
if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.n)); process.exit(1); }
})();

/* ── Le bouton, dans un vrai navigateur ── */
async function navigateur() {
  const { chromium } = require('playwright');
  const http = require('http'); const fs = require('fs');
  const { CHROME } = require('./_chrome');
  const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
  const server = http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
    if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
    r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});
  const PORT = Number(process.env.PORT) || 8117;
  await new Promise(r=>server.listen(PORT,r));
  const BASE = 'http://localhost:' + PORT;
  const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});

  const MANGA = { id:12, titre:'Darkworld', synopsis:'Un récit sombre.', type:'manga', statut:'en_cours',
    genres:['Action'], couverture_url:null, auteur_id:'u1', vues:120, adulte:false, langue:'fr',
    sens_lecture:'rl', commentaires_actifs:true, created_at:'2026-06-01T10:00:00Z',
    profiles:{ username:'Marius', avatar_url:null } };

  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
  await ctx.route('**/rest/v1/**',r=>{
    const u=r.request().url();
    const rows = u.includes('/mangas') ? [MANGA] : (u.includes('/chapitres') ? [{id:101,numero:1,titre:'Ch 1',manga_id:12}] : []);
    const single=(r.request().headers()['accept']||'').includes('vnd.pgrst.object');
    r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
      body:JSON.stringify(single?(rows[0]||null):rows)});});
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[]'}));

  console.log('\n▶ Bouton Partager (feuille native disponible)');
  {
    const p = await ctx.newPage();
    // On remplace navigator.share pour observer ce qui lui est réellement passé.
    await p.addInitScript(()=>{ window.__partages=[];
      navigator.share = (d)=>{ window.__partages.push(d); return Promise.resolve(); }; });
    await p.goto(BASE+'/manga.html?id=12'); await p.waitForTimeout(1500);
    check('le bouton existe sur la fiche manga', await p.locator('#btnPartagerManga').count()===1);
    await p.locator('#btnPartagerManga').click();
    await p.waitForTimeout(300);
    const d = (await p.evaluate(()=>window.__partages))[0] || {};
    check('la feuille de partage native est appelée', !!d.url, JSON.stringify(d));
    check('  avec le titre réel de l\'œuvre', /Darkworld/.test(d.title||''), d.title);
    check('  avec le nom du créateur dans le texte', /Marius/.test(d.text||''), d.text);
    check('  avec l\'URL canonique, sans paramètres parasites',
      d.url === BASE + '/manga.html?id=12', d.url);
    await p.close();
  }

  console.log('\n▶ Repli quand le partage natif n\'existe pas');
  {
    const p = await ctx.newPage();
    await p.addInitScript(()=>{
      delete navigator.share;
      window.__copie = null;
      Object.defineProperty(navigator,'clipboard',{value:{writeText:(t)=>{window.__copie=t;return Promise.resolve();}},configurable:true});
    });
    await p.goto(BASE+'/manga.html?id=12'); await p.waitForTimeout(1500);
    await p.locator('#btnPartagerManga').click();
    await p.waitForTimeout(400);
    check('le lien est copié dans le presse-papier',
      await p.evaluate(()=>window.__copie) === BASE + '/manga.html?id=12');
    const dit = await p.evaluate(()=>document.body.innerText.includes('Lien copié'));
    check('  et on le dit à la personne', dit);
    await p.close();
  }

  console.log('\n▶ Fermer la feuille de partage n\'est pas une panne');
  {
    const p = await ctx.newPage();
    await p.addInitScript(()=>{
      navigator.share = ()=>Promise.reject(Object.assign(new Error('annulé'),{name:'AbortError'}));
      window.__copie=null;
      Object.defineProperty(navigator,'clipboard',{value:{writeText:(t)=>{window.__copie=t;return Promise.resolve();}},configurable:true});
    });
    await p.goto(BASE+'/manga.html?id=12'); await p.waitForTimeout(1500);
    await p.locator('#btnPartagerManga').click();
    await p.waitForTimeout(400);
    check('annuler ne déclenche pas la copie de secours',
      await p.evaluate(()=>window.__copie) === null);
    check('  et n\'affiche pas de « lien copié » mensonger',
      !(await p.evaluate(()=>document.body.innerText.includes('Lien copié'))));
    await p.close();
  }

  await ctx.close(); await b.close(); server.close();
}
