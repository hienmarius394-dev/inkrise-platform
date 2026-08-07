/* Balayage exhaustif des contrastes de texte sur toutes les pages rendues.
   Rapporte CHAQUE couple couleur/fond fautif, regroupé, pas seulement le pire. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2', '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml' };
const server = http.createServer((req,res)=>{
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){res.writeHead(404);return res.end('404');}
  res.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});
  res.end(fs.readFileSync(p));});

const PROBE = () => {
  const lin = v => { v/=255; return v<=.03928 ? v/12.92 : Math.pow((v+.055)/1.055,2.4); };
  const lum = ([r,g,b]) => .2126*lin(r)+.7152*lin(g)+.0722*lin(b);
  const hex = c => '#' + c.map(v => Math.round(v).toString(16).padStart(2,'0')).join('');
  const out = [];
  for (const el of document.querySelectorAll('body *')) {
    const hasText = [...el.childNodes].some(n => n.nodeType===3 && n.textContent.trim().length>1);
    if (!hasText) continue;
    const st = getComputedStyle(el);
    if (st.visibility==='hidden' || st.display==='none' || +st.opacity < .5) continue;
    const fg = st.color.match(/[\d.]+/g).map(Number);
    if (fg[3] !== undefined && fg[3] < .5) continue;
    if (st.webkitTextFillColor === 'rgba(0, 0, 0, 0)') continue;  // texte en dégradé

    /* DÉGRADÉS. La sonde abandonnait dès qu'elle en croisait un en
       remontant la chaîne — et le `body` de l'accueil porte un dégradé
       radial décoratif. Résultat : PAS UN SEUL texte de la page la plus
       vue du site n'était mesuré, et une modale blanche en thème sombre y
       a survécu à tout l'audit.

       On ne peut pas connaître la couleur exacte sous un dégradé. Mais on
       peut être rigoureux autrement : calculer le rapport en supposant le
       dégradé TOUT NOIR, puis TOUT BLANC, et ne signaler que si les deux
       échouent. Un texte qui passe sous l'un des deux extrêmes est
       peut-être lisible ; un texte qui échoue sous les deux l'est nulle
       part. Aucun faux positif possible. */
    let bg = null, stack = [], n = el, sousDegrade = false;
    while (n && n !== document.documentElement) {
      const s2 = getComputedStyle(n);
      if (s2.backgroundImage && s2.backgroundImage !== 'none') { sousDegrade = true; break; }
      const c = s2.backgroundColor.match(/[\d.]+/g);
      if (c) {
        const a = c[3] === undefined ? 1 : +c[3];
        if (a > 0) stack.push([c.slice(0,3).map(Number), a]);
        if (a >= 1) { bg = stack.pop()[0]; break; }
      }
      n = n.parentElement;
    }
    const composer = (fond) => {
      let b2 = fond.slice();
      for (let i = stack.length-1; i >= 0; i--) {
        const [c2,a] = stack[i];
        b2 = b2.map((v,k) => c2[k]*a + v*(1-a));
      }
      return b2;
    };
    const L1 = lum(fg.slice(0,3));
    const rapport = fond => {
      const L2 = lum(fond);
      return (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
    };

    let ratio, bgAffiche;
    if (bg) {
      bgAffiche = composer(bg); ratio = rapport(bgAffiche);
    } else if (sousDegrade) {
      /* Sous un dégradé de couleur inconnue : les deux extrêmes. */
      const surNoir = composer([0,0,0]), surBlanc = composer([255,255,255]);
      const rN = rapport(surNoir), rB = rapport(surBlanc);
      ratio = Math.max(rN, rB);           // on retient le cas le plus favorable
      bgAffiche = rN >= rB ? surNoir : surBlanc;
    } else {
      bgAffiche = composer([255,255,255]); ratio = rapport(bgAffiche);
    }
    bg = bgAffiche;
    const fs2 = parseFloat(st.fontSize);
    const big = fs2 >= 24 || (fs2 >= 18.66 && +st.fontWeight >= 700);
    const need = big ? 3 : 4.5;
    if (ratio < need) {
      out.push({ fg: hex(fg.slice(0,3)), bg: hex(bg), ratio: Math.round(ratio*100)/100,
                 need, sel: el.tagName.toLowerCase() + (el.className && typeof el.className === 'string'
                   ? '.' + el.className.trim().split(/\s+/).slice(0,2).join('.') : ''),
                 txt: el.textContent.trim().slice(0,28) });
    }
  }
  return out;
};

const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8108);
(async () => {
  await new Promise(r => server.listen(Number(process.env.PORT) || 8108, r));
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const ctx = await browser.newContext({ viewport:{width:1280,height:1000} });
  /* INKRISE_THEME=sombre relève les contrastes du thème sombre. */
  if (process.env.INKRISE_THEME) {
    await ctx.addInitScript(t => { try { localStorage.setItem('inkrise_theme', t); } catch (e) {} },
                            process.env.INKRISE_THEME);
  }
  /* SESSION SIMULÉE. Sans elle, sept pages sur vingt et une — profil,
     bibliothèque, paramètres, espace créateur, upload, gestion des
     chapitres, admin — renvoient aussitôt vers auth.html. L'outil mesurait
     donc auth.html sept fois en croyant mesurer sept pages, et annonçait
     « 21 pages » en n'en ayant vraiment vu que quatorze. Les cartes de
     profil, précisément, n'ont jamais été relevées. */
  const U = { id:'u1', email:'m@x.fr', aud:'authenticated',
              user_metadata:{ username:'Marius' } };
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), U);
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({status:200,contentType:'application/json',
    body: JSON.stringify(U)}));
  await ctx.route('**/rest/v1/**', r => {
    const req = r.request();
    /* Un profil complet : sans lui, la page s'arrête sur un écran de
       chargement et les cartes ne sont jamais peintes. */
    if (decodeURIComponent(req.url()).includes('/profiles'))
      return r.fulfill({status:200,contentType:'application/json',
        headers:{'Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},
        body: JSON.stringify((req.headers()['accept']||'').includes('vnd.pgrst.object')
          ? { id:'u1', username:'Marius', bio:'Dessinateur', avatar_url:null,
              is_creator:true, created_at:'2026-01-05T10:00:00Z' }
          : [{ id:'u1', username:'Marius', bio:'Dessinateur', avatar_url:null,
              is_creator:true, created_at:'2026-01-05T10:00:00Z' }])});
    /* Sans manga ni chapitre, le lecteur renvoie vers la fiche : il
       faut de quoi lire pour mesurer ses couleurs. */
    const u = decodeURIComponent(req.url());
    if (u.includes('/mangas')) return r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify({ id:1, titre:'Darkworld', type:'manga', sens_lecture:'rl',
        age_recommande:'tout_public', commentaires_actifs:true, auteur_id:'u1' })});
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body: JSON.stringify([{ id:10, numero:1, titre:'Ouverture', manga_id:1 }])});
    return r.fulfill({status:200,contentType:'application/json',
      headers:{'Content-Range':'0-0/0','Access-Control-Expose-Headers':'Content-Range'},body:'[]'});
  });
  await ctx.route('**/storage/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const pageConnectee = await ctx.newPage();

  /* Certaines pages ont besoin d'un paramètre pour afficher autre chose
     qu'une redirection vers l'accueil. */
  const PARAMS = {
    'lecteur.html': '?manga_id=1&chapitre=10',
    'gestion-chapitres.html': '?manga_id=1',
    'manga.html': '?id=1', 'pack.html': '?id=1',
    'auteur.html': '?id=u1', 'recherche.html': '?q=a',
  };
  /* Et auth.html ne s'affiche QUE déconnecté : avec une session elle
     renvoie vers l'accueil. On la mesure donc dans son propre contexte. */
  const SANS_SESSION = new Set(['auth.html']);

  const ctxAnon = await browser.newContext({ viewport:{width:1280,height:1000} });
  if (process.env.INKRISE_THEME) {
    await ctxAnon.addInitScript(t => { try { localStorage.setItem('inkrise_theme', t); } catch (e) {} },
                                process.env.INKRISE_THEME);
  }
  await ctxAnon.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctxAnon.route('**/auth/v1/**', r => r.fulfill({status:401, body:'{}'}));
  await ctxAnon.route('**/rest/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await ctxAnon.route('**/storage/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const pageAnon = await ctxAnon.newPage();

  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
  const groups = new Map();
  const detournees = [];
  for (const f of files) {
    const page = SANS_SESSION.has(f) ? pageAnon : pageConnectee;
    await page.goto(BASE + '/' + f + (PARAMS[f] || ''), { waitUntil:'load' }).catch(()=>{});
    await page.waitForTimeout(900);
    /* On vérifie qu'on est BIEN sur la page demandée. Une redirection
       silencieuse fausserait tout le relevé — c'était le défaut. */
    if (!page.url().includes('/' + f)) {
      /* On la signale ET on passe : la mesurer quand même attribuerait à
         cette page les couleurs d'une autre. */
      detournees.push(f + ' → ' + page.url().split('/').pop().slice(0, 40));
      continue;
    }
    /* Le menu latéral et les MODALES sont masqués au repos. Tant qu'on ne
       les ouvre pas, tout un pan d'interface — formulaires de pack, offres
       créateur, recadrage, boîtes de confirmation — n'est jamais mesuré.
       C'est exactement l'angle mort qui laissait passer les pages
       protégées : ce qui ne s'affiche pas ne se contrôle pas. */
    await page.evaluate(() => {
      const d = document.getElementById('univDrawer');
      if (d) d.classList.add('open');
      document.querySelectorAll('.modal-overlay, .crop-overlay, .confirm-overlay')
        .forEach(m => m.classList.add('open'));
    });
    await page.waitForTimeout(250);
    let rows = [];
    try { rows = await page.evaluate(PROBE); } catch (e) {}
    for (const r of rows) {
      const key = `${r.fg} sur ${r.bg}`;
      if (!groups.has(key)) groups.set(key, { ...r, pages: new Set(), examples: new Set() });
      groups.get(key).pages.add(f);
      groups.get(key).examples.add(r.sel + ' « ' + r.txt + ' »');
    }
  }
  await browser.close(); server.close();

  const sorted = [...groups.values()].sort((a,b) => a.ratio - b.ratio);
  if (detournees.length) {
    console.log(`\n⚠️  ${detournees.length} page(s) n'ont pas été mesurées — redirection :`);
    detournees.forEach(d => console.log('   ' + d));
  }
  console.log(`\n${sorted.length} couples couleur/fond sous le seuil, sur ${files.length - detournees.length} pages réellement atteintes\n`);
  for (const g of sorted) {
    console.log(`${String(g.ratio).padStart(5)}:1 (min ${g.need})  texte ${g.fg} sur ${g.bg}`);
    console.log(`          ${g.pages.size} page(s) : ${[...g.pages].slice(0,6).join(', ')}${g.pages.size>6?'…':''}`);
    console.log(`          ex. ${[...g.examples][0]}`);
  }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
