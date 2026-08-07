/* Chasse aux défauts : charge chaque page avec des données plausibles, en
   visiteur connecté puis déconnecté, et relève tout ce qui cloche —
   erreurs JS, texte cassé (undefined/NaN/[object Object]), débordement
   horizontal, cibles tactiles trop petites, images sans alternative,
   champs sans étiquette, pages restées vides. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2', '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json' };
const server = http.createServer((q,r)=>{
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
  r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});
  r.end(fs.readFileSync(p));});

const U = { id:'u1', email:'moi@x.fr', user_metadata:{ username:'Marius' } };
const PROFILE = { id:'u1', username:'Marius', avatar_url:null, bio:'Auteur de Darkworld',
                  is_creator:true, espace_premium:false, couverture_url:null, created_at:'2026-01-05T10:00:00Z' };
const MANGA = (i)=>({ id:i, titre:'Darkworld '+i, synopsis:'Un récit sombre.', type:'manga',
  statut:'en_cours', genres:['Action','Drame'], couverture_url:null, auteur_id:'u1',
  vues:120+i, adulte:false, langue:'fr', sens_lecture:'rl', age_recommande:'12+',
  commentaires_actifs:true, created_at:'2026-06-0'+((i%9)+1)+'T10:00:00Z' });
const CHAP = (i)=>({ id:100+i, numero:i, titre:'Chapitre '+i, manga_id:1,
  created_at:'2026-06-1'+((i%9))+'T10:00:00Z' });
const PACK = (i)=>({ id:i, titre:'Pack encrage '+i, description:'Apprends l\'encrage.',
  prix: i%2 ? 0 : 5, auteur_id:'u1', couverture_url:null, contenu_url:'https://x/f.pdf',
  images:[], niveau:'debutant', objectifs:['Maîtriser le trait'], created_at:'2026-05-01T10:00:00Z' });

function body(url) {
  const t = (n)=>url.includes(n);
  if (t('/profiles'))              return [PROFILE];
  if (t('posts_communaute'))       return [{ id:1, creator_id:'u1', type:'post', contenu:'Salut !',
      est_epingle:false, image_url:null, created_at:'2026-07-01T10:00:00Z', auteur_id:'u1',
      auteur:{username:'Marius',avatar_url:null} }];
  if (t('commentaires_communaute'))return [];
  if (t('/mangas'))                return [1,2,3,4].map(MANGA);
  if (t('/chapitres'))             return [1,2,3].map(CHAP);
  if (t('packs_tutoriels'))        return [1,2].map(PACK);
  if (t('/bibliotheque'))          return [{ user_id:'u1', manga_id:1, chapitre:101, page:3,
      total_pages:12, total_chapitres:3 }];
  if (t('/notifications'))         return [{ id:1, user_id:'u1', message:'Nouveau chapitre !',
      lu:false, created_at:'2026-07-20T10:00:00Z', lien:'manga.html?id=1' }];
  if (t('achats_packs'))           return [{ id:1, user_id:'u1', pack_id:1, prix_paye:0 }];
  if (t('avis_packs'))             return [{ id:1, pack_id:1, user_id:'u1', note:5,
      commentaire:'Top', created_at:'2026-06-01T10:00:00Z', profiles:{username:'Marius'} }];
  if (t('/follows'))               return [{ follower_id:'u1', creator_id:'u1' }];
  if (t('abonnements_manga'))      return [];
  if (t('/reactions'))             return [];
  if (t('sondage'))                return [];
  if (t('/vues'))                  return [];
  if (t('signalements'))           return [];
  return [];
}

const PAGES = ['index.html','recherche.html','manga.html?id=1','bibliotheque.html','profil.html',
  'auteur.html?id=u1','communaute.html?id=u1','tutoriels.html','pack.html?id=1',
  'espace-createur.html','mon-espace.html','upload-manga.html','gestion-chapitres.html?manga_id=1',
  'auth.html','404.html','cgu.html','confidentialite.html','mentions-legales.html',
  'creators-remuneration.html','admin.html'];

const SONDE = () => {
  const out = [];
  const txt = document.body.innerText || '';
  ['undefined','NaN','[object Object]','null,','Infinity'].forEach(bad => {
    if (txt.includes(bad)) {
      const el = [...document.querySelectorAll('body *')].find(e =>
        [...e.childNodes].some(n => n.nodeType===3 && n.textContent.includes(bad)));
      out.push({ k:'texte-casse', d:`« ${bad} » affiché`, w: el ? (el.tagName+'.'+String(el.className||'').slice(0,30)) : '?' });
    }
  });
  if (document.documentElement.scrollWidth > window.innerWidth + 2)
    out.push({ k:'debordement', d:`la page déborde de ${document.documentElement.scrollWidth - window.innerWidth}px`, w:'' });

  document.querySelectorAll('button, a[href], [onclick], input[type=checkbox]').forEach(el => {
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width === 0 || st.display==='none' || st.visibility==='hidden') return;
    if (r.width < 32 || r.height < 32) {
      const label = (el.getAttribute('aria-label') || el.title || el.textContent || '').trim().slice(0,24);
      out.push({ k:'cible-petite', d:`${Math.round(r.width)}×${Math.round(r.height)}px`, w: label || el.tagName });
    }
  });

  document.querySelectorAll('img').forEach(img => {
    if (!img.hasAttribute('alt')) out.push({ k:'img-sans-alt', d: (img.src||'').slice(-40), w: img.className });
  });

  document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea, select').forEach(el => {
    const st = getComputedStyle(el);
    if (st.display==='none' || st.visibility==='hidden') return;
    const hasLabel = (el.id && document.querySelector('label[for="'+CSS.escape(el.id)+'"]')) ||
                     el.closest('label') || el.getAttribute('aria-label') ||
                     el.getAttribute('aria-labelledby') || el.getAttribute('placeholder');
    if (!hasLabel) out.push({ k:'champ-sans-nom', d: el.tagName+(el.id?'#'+el.id:''), w:'' });
  });

  const main = document.querySelector('#app, #mainContent, main, .main-wrap, .container');
  if (main && main.innerText.trim().length < 20)
    out.push({ k:'page-vide', d:'contenu principal quasi vide', w:'' });

  return out;
};

const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8109);
(async () => {
  await new Promise(r => server.listen(Number(process.env.PORT) || 8109, r));
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const findings = new Map();
  const add = (page, mode, f) => {
    const key = `${f.k}|${f.d}|${f.w}`;
    if (!findings.has(key)) findings.set(key, { ...f, pages:new Set() });
    findings.get(key).pages.add(page + (mode==='anon' ? ' (déconnecté)' : ''));
  };

  for (const mode of ['auth','anon']) {
    const ctx = await browser.newContext({ viewport:{width:390,height:844}, hasTouch:true, isMobile:true });
    if (mode === 'auth') {
      await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
        JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
          expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
      await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
        body: JSON.stringify({ ...U, aud:'authenticated' }) }));
    } else {
      await ctx.route('**/auth/v1/**', r => r.fulfill({ status:401, body:'{}' }));
    }
    await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
    await ctx.route('**/rest/v1/**', r => {
      const req = r.request(), u = req.url();
      if (req.method() !== 'GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
      const rows = body(u);
      const single = (req.headers()['accept']||'').includes('vnd.pgrst.object');
      return r.fulfill({ status:200, contentType:'application/json',
        headers:{'Content-Range':'0-'+Math.max(0,rows.length-1)+'/'+rows.length,
                 'Access-Control-Expose-Headers':'Content-Range'},
        body: JSON.stringify(single ? (rows[0] || null) : rows) });
    });
    await ctx.route('**/storage/v1/object/list/**', r => r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify([1,2,3].map(i=>({name:'0'+i+'.jpg'})))}));
    await ctx.route('**/storage/v1/**', r => r.fulfill({status:200,contentType:'image/svg+xml',
      body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><rect width="100%" height="100%" fill="#ddd"/></svg>'}));

    for (const p of PAGES) {
      const page = await ctx.newPage();
      const errs = [];
      page.on('pageerror', e => errs.push(e.message));
      page.on('console', m => { if (m.type()==='error' && !/Failed to load resource/.test(m.text())) errs.push('console: '+m.text()); });
      try {
        await page.goto(BASE + '/'+p, { waitUntil:'load', timeout:20000 });
        await page.waitForTimeout(1400);
        const rows = await page.evaluate(SONDE);
        rows.forEach(f => add(p, mode, f));
        [...new Set(errs)].forEach(e => add(p, mode, { k:'erreur-js', d:e.slice(0,110), w:'' }));
      } catch (e) {
        add(p, mode, { k:'page-plantee', d: String(e.message).slice(0,90), w:'' });
      }
      await page.close();
    }
    await ctx.close();
  }
  await browser.close(); server.close();

  const byKind = {};
  [...findings.values()].forEach(f => { (byKind[f.k] = byKind[f.k] || []).push(f); });
  const ORDER = ['page-plantee','erreur-js','page-vide','texte-casse','debordement','cible-petite','champ-sans-nom','img-sans-alt'];
  console.log('\n═══ RELEVÉ ═══\n');
  ORDER.forEach(k => {
    const list = byKind[k]; if (!list) return;
    console.log(`\n### ${k.toUpperCase()} (${list.length})`);
    list.slice(0,14).forEach(f => {
      console.log(`  • ${f.d}${f.w ? '  [' + f.w + ']' : ''}`);
      console.log(`      ${[...f.pages].slice(0,5).join(', ')}${f.pages.size>5?` +${f.pages.size-5}`:''}`);
    });
    if (list.length > 14) console.log(`  … et ${list.length-14} autres`);
  });
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
