/* Chasse aux défauts SILENCIEUX — ceux qui ne plantent rien, n'affichent
   aucune erreur, et passent donc sous le radar des autres outils.
   ─────────────────────────────────────────────────────────────────────
   Chaque contrôle vient d'un vrai bug rencontré pendant l'audit :

   • liens morts        — une redirection JS vers une page supprimée
   • ids fantômes       — getElementById sur un élément retiré du HTML
   • fonctions absentes — onclick="doSearch()" alors que doSearch n'existe plus
   • ids en double      — deux éléments répondent au même getElementById
   • débordement caché  — `overflow-x: clip` masque le contenu rogné
   • colonnes inconnues — une requête lit une colonne absente du schéma
   • pages orphelines   — plus aucun chemin, href OU redirection JS
*/
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png','.txt':'text/plain','.xml':'application/xml'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
const releve = [];
const noter = (genre, page, detail) => releve.push({ genre, page, detail });

/* ══ 1. Liens et redirections vers des pages qui n'existent pas ══ */
for (const f of pages) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const cibles = new Set();
  for (const m of s.matchAll(/href="([a-z0-9_-]+\.html)/gi)) cibles.add(m[1]);
  for (const m of s.matchAll(/location\.href\s*=\s*['"]([a-z0-9_-]+\.html)/gi)) cibles.add(m[1]);
  for (const m of s.matchAll(/location\.replace\(\s*['"]([a-z0-9_-]+\.html)/gi)) cibles.add(m[1]);
  for (const c of cibles) if (!fs.existsSync(path.join(ROOT, c))) noter('lien-mort', f, c);
  // Ressources
  for (const m of s.matchAll(/(?:src|href)="(assets\/[^"?#]+)"/g))
    if (!fs.existsSync(path.join(ROOT, m[1]))) noter('ressource-absente', f, m[1]);
}

/* ══ 2. Pages orphelines — en comptant les redirections JS ══ */
const referencees = new Set(['index.html', '404.html']);
for (const f of pages.concat(fs.readdirSync(path.join(ROOT,'assets')).filter(x=>x.endsWith('.js')).map(x=>'assets/'+x))) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/['"]([a-z0-9_-]+\.html)/gi)) {
    if (m[1] !== path.basename(f)) referencees.add(m[1]);
  }
}
// admin.html n'est volontairement liée nulle part : son adresse n'est connue
// que de la modération, et robots.txt la tient hors des moteurs.
const ORPHELINES_VOULUES = new Set(['admin.html']);
for (const f of pages)
  if (!referencees.has(f) && !ORPHELINES_VOULUES.has(f))
    noter('page-orpheline', f, 'aucun lien ni redirection n\'y mène');

/* ══ 3. Colonnes lues mais absentes du schéma ══ */
const sql = fs.readFileSync(path.join(ROOT, 'sql_a_executer.sql'), 'utf8');
const colonnes = {};              // table → colonnes connues
for (const m of sql.matchAll(/CREATE TABLE IF NOT EXISTS (?:public\.)?(\w+)\s*\(([\s\S]*?)\n\);/g)) {
  colonnes[m[1]] = new Set([...m[2].matchAll(/^\s{2}(\w+)\s+[A-Z]/gm)].map(x => x[1]));
}
for (const m of sql.matchAll(/ALTER TABLE (?:public\.)?(\w+) ADD COLUMN IF NOT EXISTS (\w+)/g)) {
  (colonnes[m[1]] = colonnes[m[1]] || new Set()).add(m[2]);
}
for (const f of pages) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  for (const m of s.matchAll(/\.from\(\s*['"](\w+)['"]\s*\)\s*\n?\s*\.select\(\s*[`'"]([^`'"]*)[`'"]/g)) {
    const [_, table, champs] = m;
    if (!colonnes[table]) { noter('table-inconnue', f, table); continue; }
    if (champs.trim() === '*' || champs.includes('(')) continue;   // embeds : hors de portée
    for (const c of champs.split(',').map(x => x.trim()).filter(Boolean)) {
      if (c === '*' || c.includes(':')) continue;
      if (!colonnes[table].has(c)) noter('colonne-inconnue', f, table + '.' + c);
    }
  }
  // Colonnes utilisées en filtre
  // On découpe d'abord par requête : une fenêtre à longueur fixe traversait
  // la requête suivante et attribuait à une table les colonnes d'une autre.
  const morceaux = s.split(/\.from\(\s*['"]/).slice(1);
  for (const bout of morceaux) {
    const table = (bout.match(/^(\w+)/) || [])[1];
    if (!table || !colonnes[table]) continue;
    const requete = bout.split(/;|\n\s*\n/)[0];         // s'arrête à la fin de l'instruction
    for (const m of requete.matchAll(/\.(?:eq|neq|gt|lt|gte|lte|is|in|ilike|like)\(\s*['"](\w+)['"]/g)) {
      if (!colonnes[table].has(m[1]) && m[1] !== 'id') noter('filtre-colonne-inconnue', f, table + '.' + m[1]);
    }
  }
}

/* ══ 4. Préchargement hors-ligne : fichiers listés mais absents ══
   `sw.js` fait `cache.add(u).catch(() => {})` : un fichier renommé ou
   supprimé disparaît du mode hors-ligne SANS la moindre erreur. */
const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
const bloc = sw.slice(sw.indexOf('const PRECACHE'), sw.indexOf('];', sw.indexOf('const PRECACHE')));
for (const m of bloc.matchAll(/['"]([^'"]+\.(?:html|js|css|png|svg|webmanifest))['"]/g)) {
  if (!fs.existsSync(path.join(ROOT, m[1]))) noter('precache-fantome', 'sw.js', m[1]);
}
// … et l'inverse : une page livrée mais jamais mise en cache
const precachees = new Set([...bloc.matchAll(/['"]([^'"]+\.html)['"]/g)].map(x => x[1]));
for (const f of pages) if (!precachees.has(f)) noter('page-non-hors-ligne', 'sw.js', f);

/* ══ 5. Buckets de stockage utilisés mais jamais créés ══ */
const buckets = new Set();
// `VALUES` est multi-lignes : on prend tout le bloc, pas seulement sa
// première ligne — c'est ce qui faisait passer covers/pages/community
// pour des buckets inconnus alors qu'ils sont bien créés.
const blocBuckets = sql.match(/INSERT INTO storage\.buckets[^;]*;/);
if (blocBuckets) for (const m of blocBuckets[0].matchAll(/\(\s*'([^']+)'\s*,/g)) buckets.add(m[1]);
for (const m of sql.matchAll(/bucket_id\s*=\s*'([^']+)'/g)) buckets.add(m[1]);
for (const m of sql.matchAll(/bucket_id\s+IN\s*\(([^)]*)\)/gi))
  for (const b of m[1].matchAll(/'([^']+)'/g)) buckets.add(b[1]);
if (buckets.size) {
  for (const f of pages.concat(['assets/inkrise-offline.js'])) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of src.matchAll(/storage\s*\.\s*from\(\s*['"](\w+)['"]/g)) {
      if (!buckets.has(m[1])) noter('bucket-inconnu', f, m[1]);
    }
  }
}

/* ══ 6. Destinations autorisées après connexion ══
   auth.html n'accepte qu'une liste blanche de `?next=` : une page qui en
   sort renvoie silencieusement vers l'accueil au lieu de la destination. */
const authSrc = fs.readFileSync(path.join(ROOT, 'auth.html'), 'utf8');
const liste = authSrc.match(/PAGES_AUTORISEES\s*=\s*\[([\s\S]*?)\]/);
if (liste) {
  for (const m of liste[1].matchAll(/'([^']+\.html)'/g)) {
    if (!fs.existsSync(path.join(ROOT, m[1]))) noter('destination-fantome', 'auth.html', m[1]);
  }
}

/* ══ Contrôles qui demandent un vrai rendu ══ */
const SONDE = () => {
  const out = [];
  const vue = document.documentElement.clientWidth;

  // ids en double : getElementById en attrape un au hasard
  const vus = new Map();
  document.querySelectorAll('[id]').forEach(e => {
    vus.set(e.id, (vus.get(e.id) || 0) + 1);
  });
  vus.forEach((n, id) => { if (n > 1) out.push({ g: 'id-en-double', d: '#' + id + ' × ' + n }); });

  // onclick / on* pointant vers une fonction inexistante
  const attrs = ['onclick','onchange','oninput','onsubmit','onkeydown'];
  document.querySelectorAll('*').forEach(e => {
    attrs.forEach(a => {
      const v = e.getAttribute && e.getAttribute(a);
      if (!v) return;
      // (?<![.\w$]) : on écarte les appels de méthode — document.getElementById(),
      // x.click()… — qui ne sont pas des fonctions globales.
      (v.match(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g) || []).forEach(app => {
        const nom = app.replace(/\s*\($/, '').trim();
        if (['if','for','while','switch','return','function','event','this','alert','confirm',
             'typeof','new','document','window','navigator','JSON','Number','String','Array',
             'Object','Math','Date','parseInt','parseFloat','setTimeout','encodeURIComponent'].includes(nom)) return;
        if (typeof window[nom] !== 'function') {
          out.push({ g: 'fonction-absente', d: nom + '() — ' + a + ' sur ' + e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') });
        }
      });
    });
  });

  // débordement masqué : élément dont le bord droit sort de l'écran
  document.querySelectorAll('body *').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.width < 40 || r.height < 12) return;
    const st = getComputedStyle(e);
    if (st.display === 'none' || st.visibility === 'hidden') return;
    // Les halos décoratifs et les éléments sortis du flux débordent par
    // construction : ce ne sont pas des contenus rognés.
    if (st.position === 'fixed' || st.position === 'absolute') return;
    if (st.pointerEvents === 'none') return;
    // On flagge dès qu'un bord sort de l'écran — y compris à gauche, cas
    // d'un contenu trop large dans un conteneur centré, que le garde-fou
    // « left >= 0 » laissait passer.
    if (Math.round(r.right) > vue + 2 || Math.round(r.left) < -2) {
      // on ignore ce qui est explicitement défilable
      let n = e, defilable = false;
      while (n && n !== document.body) {
        const s2 = getComputedStyle(n);
        if (/auto|scroll/.test(s2.overflowX)) { defilable = true; break; }
        n = n.parentElement;
      }
      if (!defilable) {
        const trop = Math.max(Math.round(r.right) - vue, -Math.round(r.left));
        out.push({ g: 'debordement-masque',
          d: e.tagName.toLowerCase() + (e.id ? '#' + e.id : (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : '')) +
             ' déborde de ' + trop + 'px (largeur ' + Math.round(r.width) + ')' });
      }
    }
  });
  return out;
};

const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, bio:'Auteur', is_creator:true, created_at:'2026-01-05T10:00:00Z', pref_masquer_adulte:true, pref_notif_chapitres:true, pref_notif_social:true, pref_notif_push:false };
const MANGA = i => ({ id:i, titre:'Darkworld '+i, synopsis:'S', type:'manga', statut:'en_cours', genres:['Action'], couverture_url:null, auteur_id:'u1', vues:120+i, adulte:false, langue:'fr', sens_lecture:'rl', age_recommande:'12+', commentaires_actifs:true, created_at:'2026-06-01T10:00:00Z', note_moyenne:4.2, nb_avis:3 });
function corps(u){const t=n=>u.includes(n);
  if(t('/profiles'))return[PROFILE];
  if(t('avis_mangas'))return[{id:1,user_id:'u2',note:5,commentaire:'Top',created_at:'2026-07-01T10:00:00Z'}];
  if(t('posts_communaute'))return[{id:1,creator_id:'u1',type:'post',contenu:'Salut',est_epingle:false,image_url:null,created_at:'2026-07-01T10:00:00Z',auteur_id:'u1'}];
  if(t('/mangas'))return[1,2,3].map(MANGA);
  if(t('/chapitres'))return[1,2].map(i=>({id:100+i,numero:i,titre:'Ch '+i,manga_id:1,created_at:'2026-06-11T10:00:00Z'}));
  if(t('packs_tutoriels'))return[{id:1,titre:'Pack',description:'d',prix:5,auteur_id:'u1',couverture_url:null,contenu_url:'x',images:[],niveau:'debutant',objectifs:[],created_at:'2026-05-01T10:00:00Z'}];
  if(t('/bibliotheque'))return[{user_id:'u1',manga_id:1,chapitre:101,page:3,total_pages:12,total_chapitres:3}];
  if(t('/follows'))return[{user_id:'u1',followed_id:'u1'}];
  if(t('/notifications'))return[{id:1,user_id:'u1',message:'x',lu:false,created_at:'2026-07-20T10:00:00Z',lien:'manga.html?id=1'}];
  return[];}

const URLS = ['index.html','recherche.html','manga.html?id=1','bibliotheque.html','profil.html',
 'auteur.html?id=u1','communaute.html?id=u1','communaute.html','tutoriels.html','pack.html?id=1',
 'espace-createur.html','upload-manga.html','gestion-chapitres.html?manga_id=1','auth.html',
 'parametres.html','admin.html','404.html','cgu.html','confidentialite.html','mentions-legales.html',
 'creators-remuneration.html'];

(async()=>{
await new Promise(r=>server.listen(8141,r));
const b=await chromium.launch(CHROME?{executablePath:CHROME}:{});
for (const largeur of [390, 1280]) {
  const ctx=await b.newContext({viewport:{width:largeur,height:900},isMobile:largeur===390,hasTouch:largeur===390});
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})),U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...U,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>{const req=r.request();
    if(req.method()!=='GET')return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    const rows=corps(decodeURIComponent(req.url()));
    const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
    r.fulfill({status:200,contentType:'application/json',headers:{'Content-Range':'0-0/'+rows.length,'Access-Control-Expose-Headers':'Content-Range'},body:JSON.stringify(seul?(rows[0]||null):rows)});});
  await ctx.route('**/storage/v1/object/list/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify([1,2].map(i=>({name:'0'+i+'.jpg'})))}));
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"/>'}));
  for (const u of URLS) {
    const p=await ctx.newPage();
    try {
      await p.goto('http://localhost:8141/'+u,{waitUntil:'load',timeout:20000});
      await p.waitForTimeout(1500);
      (await p.evaluate(SONDE)).forEach(x => noter(x.g, u + (largeur===1280?' (bureau)':''), x.d));
    } catch(e) { noter('page-plantee', u, e.message.slice(0,60)); }
    await p.close();
  }
  await ctx.close();
}
await b.close(); server.close();

/* ══ Rapport ══ */
const parGenre = {};
releve.forEach(r => { const c = r.genre + '|' + r.detail; (parGenre[r.genre] = parGenre[r.genre] || new Map());
  if (!parGenre[r.genre].has(c)) parGenre[r.genre].set(c, { detail: r.detail, pages: new Set() });
  parGenre[r.genre].get(c).pages.add(r.page); });

console.log('\n═══ DÉFAUTS SILENCIEUX ═══\n');
const ORDRE = ['page-plantee','lien-mort','ressource-absente','destination-fantome','precache-fantome',
               'bucket-inconnu','fonction-absente','id-en-double','debordement-masque','table-inconnue',
               'colonne-inconnue','filtre-colonne-inconnue','page-non-hors-ligne','page-orpheline'];
let total = 0;
for (const g of ORDRE) {
  if (!parGenre[g]) continue;
  const liste = [...parGenre[g].values()];
  total += liste.length;
  console.log('### ' + g.toUpperCase() + ' (' + liste.length + ')');
  liste.slice(0, 12).forEach(x => {
    const pg = [...x.pages];
    console.log('  • ' + x.detail);
    console.log('      ' + pg.slice(0,4).join(', ') + (pg.length>4 ? ' +'+(pg.length-4) : ''));
  });
  if (liste.length > 12) console.log('  … et ' + (liste.length-12) + ' autres');
  console.log('');
}
console.log('───────────');
console.log(total === 0 ? '✅ aucun défaut silencieux relevé' : total + ' défaut(s) silencieux relevé(s)');
})();
