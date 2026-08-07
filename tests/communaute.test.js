/* Temps réel du mur communautaire : arrivée de contenu distant, préservation
   de la saisie en cours, stabilité de la lecture, repli si le canal échoue. */
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

const CREATOR = { id:'c1', username:'Mangaka', avatar_url:null, bio:'Bio' };
const VISITOR = { id:'v1', email:'v@x.fr', user_metadata:{ username:'Lecteur' } };

// Base mutable : le test y ajoute du contenu « venu d'ailleurs »
let DB = {
  posts: Array.from({length:6},(_,i)=>({ id:i+1, creator_id:'c1', type:'post',
    contenu:'Post numero '+(i+1), est_epingle:false, image_url:null,
    created_at:new Date(Date.now()-i*3600000).toISOString(), auteur_id:'c1',
    auteur:{ username:'Mangaka', avatar_url:null } })),
  comments: [], reactions: [], options: [], votes: []
};

const BASE = 'http://localhost:' + (Number(process.env.PORT) || 8105);
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

function routeRest(ctx) {
  return ctx.route('**/rest/v1/**', r => {
    const req = r.request(), u = req.url(), m = req.method();
    const j = (b) => r.fulfill({ status:200, contentType:'application/json', body:JSON.stringify(b) });
    if (m === 'POST' || m === 'PATCH' || m === 'DELETE') {
      if (u.includes('commentaires_communaute') && m === 'POST') {
        const b = JSON.parse(req.postData()||'{}');
        DB.comments.push({ id: DB.comments.length+900, ...b,
          created_at:new Date().toISOString(), profiles:{ username:'Lecteur', avatar_url:null } });
      }
      return j([]);
    }
    if (u.includes('/profiles')) return j(u.includes('c1') ? CREATOR : { id:'v1', username:'Lecteur', avatar_url:null });
    if (u.includes('posts_communaute')) return j(DB.posts);
    if (u.includes('commentaires_communaute')) return j(DB.comments);
    if (u.includes('/reactions')) return j(DB.reactions);
    if (u.includes('sondage_options')) return j(DB.options);
    if (u.includes('sondage_votes')) return j(DB.votes);
    return j([]);
  });
}

(async () => {
  await new Promise(r => server.listen(Number(process.env.PORT) || 8105, r));
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const errors = [];
  const ctx = await browser.newContext({ viewport:{width:1100,height:800} });
  await ctx.addInitScript(u => localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({ access_token:'t', refresh_token:'r', token_type:'bearer',
      expires_at: Math.floor(Date.now()/1000)+9999, expires_in:9999, user:u })), VISITOR);
  await ctx.route('https://fonts.googleapis.com/**', r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({ status:200, contentType:'application/json',
    body: JSON.stringify({ ...VISITOR, aud:'authenticated' }) }));
  await routeRest(ctx);
  await ctx.route('**/storage/v1/**', r => r.fulfill({ status:200, contentType:'application/json', body:'[]' }));
  // Le WebSocket temps réel n'est pas joignable ici : on pilotera le
  // rafraîchissement directement, comme le ferait un événement reçu.
  await ctx.route('wss://**', r => r.abort());

  const page = await ctx.newPage();
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(BASE + '/communaute.html?id=c1');
  await page.waitForSelector('.post-card', { timeout: 15000 });

  const posts = () => page.locator('.post-card').count();
  check('mur chargé', (await posts()) === 6, (await posts())+' posts');
  check('temps réel démarré au chargement',
        await page.evaluate(() => typeof startRealtime === 'function' && typeof scheduleRealtimeRefresh === 'function'));

  // ═══ 1. Un commentaire distant arrive pendant qu'on écrit ═══
  console.log('\n▶ Un visiteur commente pendant que j\'écris');
  await page.locator('.comment-toggle-btn[data-post="1"]').click();
  await page.waitForTimeout(200);
  const ta = page.locator('.comment-textarea[data-post="1"]');
  await ta.fill('Mon commentaire à moitié écrit');
  await ta.click();
  check('section commentaires ouverte',
        await page.locator('#comments-1').isVisible());

  // contenu distant + événement
  DB.comments.push({ id: 500, post_id: 1, user_id: 'other', contenu: 'Salut depuis un autre onglet',
                     parent_id: null, created_at: new Date().toISOString(),
                     profiles: { username: 'Autre', avatar_url: null } });
  await page.evaluate(() => refreshFromRealtime());
  await page.waitForTimeout(700);

  check('le commentaire distant apparaît sans recharger',
        (await page.locator('#comments-1').innerText()).includes('Salut depuis un autre onglet'));
  check('MON texte en cours n\'a pas été effacé',
        (await ta.inputValue()) === 'Mon commentaire à moitié écrit',
        JSON.stringify(await ta.inputValue()));
  check('la section est restée ouverte', await page.locator('#comments-1').isVisible());
  check('le curseur est resté dans mon champ',
        await page.evaluate(() => document.activeElement.classList.contains('comment-textarea')));

  // ═══ 2. Un nouveau post arrive pendant la lecture ═══
  console.log('\n▶ Un nouveau post arrive pendant que je lis plus bas');
  await page.evaluate(() => window.scrollTo(0, 700));
  await page.waitForTimeout(250);
  const before = await page.evaluate(() => {
    const c = document.querySelector('.post-card[data-post-id="4"]');
    return c ? Math.round(c.getBoundingClientRect().top) : null;
  });
  DB.posts.unshift({ id: 99, creator_id:'c1', type:'post', contenu:'Tout nouveau post',
    est_epingle:false, image_url:null, created_at:new Date().toISOString(),
    auteur_id:'c1', auteur:{ username:'Mangaka', avatar_url:null } });
  await page.evaluate(() => refreshFromRealtime());
  await page.waitForTimeout(700);
  const after = await page.evaluate(() => {
    const c = document.querySelector('.post-card[data-post-id="4"]');
    return c ? Math.round(c.getBoundingClientRect().top) : null;
  });
  check('le nouveau post est bien arrivé', (await posts()) === 7, (await posts())+' posts');
  check('ma lecture n\'a pas sauté malgré l\'insertion au-dessus',
        before !== null && after !== null && Math.abs(after - before) <= 3,
        before + 'px → ' + after + 'px');

  // ═══ 3. Réponse en cours de rédaction ═══
  console.log('\n▶ Une réponse ouverte survit au rafraîchissement');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.locator('.comment-reply-btn[data-comment="500"]').first().click();
  await page.waitForTimeout(300);
  const ri = page.locator('#reply-slot-500 .reply-input');
  check('formulaire de réponse ouvert', await ri.isVisible());
  await ri.fill('Ma réponse en cours');
  DB.comments.push({ id: 501, post_id: 1, user_id: 'other2', contenu: 'Encore un message',
                     parent_id: null, created_at: new Date().toISOString(),
                     profiles: { username: 'Tiers', avatar_url: null } });
  await page.evaluate(() => refreshFromRealtime());
  await page.waitForTimeout(800);
  check('le formulaire de réponse est toujours ouvert',
        await page.locator('#reply-slot-500 .reply-input').isVisible());
  check('le texte de la réponse est conservé',
        (await page.locator('#reply-slot-500 .reply-input').inputValue()) === 'Ma réponse en cours',
        JSON.stringify(await page.locator('#reply-slot-500 .reply-input').inputValue()));
  check('le nouveau message est bien apparu aussi',
        (await page.locator('#comments-1').innerText()).includes('Encore un message'));

  // ═══ 4. Pas de rechargement en écho de mes propres écritures ═══
  console.log('\n▶ Mes propres actions ne déclenchent pas un double rechargement');
  const echo = await page.evaluate(async () => {
    markLocalRefresh();
    let calledAt = null;
    const orig = window.refreshFromRealtime;
    const t0 = Date.now();
    window.refreshFromRealtime = async () => { if (!calledAt) calledAt = Date.now() - t0; };
    scheduleRealtimeRefresh();
    await new Promise(r => setTimeout(r, 500));
    const early = calledAt;
    await new Promise(r => setTimeout(r, 1000));
    window.refreshFromRealtime = orig;
    return { early, eventual: calledAt };
  });
  check('pas de rechargement immédiat dans la foulée de mon action', echo.early === null);
  check('mais l\'événement est bien traité ensuite (différé, pas perdu)',
        echo.eventual !== null && echo.eventual >= 900,
        echo.eventual === null ? 'jamais traité' : 'traité après ' + echo.eventual + ' ms');

  // ═══ 4b. Deux messages distants coup sur coup ═══
  console.log('\n▶ Deux messages distants rapprochés : aucun ne doit être perdu');
  await page.evaluate(() => { lastLocalRefresh = 0; });
  DB.comments.push({ id: 600, post_id: 1, user_id: 'x1', contenu: 'Premier message rapide',
                     parent_id: null, created_at: new Date().toISOString(),
                     profiles: { username: 'A', avatar_url: null } });
  await page.evaluate(() => refreshFromRealtime());
  await page.waitForTimeout(200);
  DB.comments.push({ id: 601, post_id: 1, user_id: 'x2', contenu: 'Second message rapide',
                     parent_id: null, created_at: new Date().toISOString(),
                     profiles: { username: 'B', avatar_url: null } });
  await page.evaluate(() => scheduleRealtimeRefresh());
  await page.waitForTimeout(900);
  const txt = await page.locator('#comments-1').innerText();
  check('le premier message est là', txt.includes('Premier message rapide'));
  check('le second n\'a pas été étouffé par le premier', txt.includes('Second message rapide'));

  // ═══ 5. Onglet en arrière-plan ═══
  console.log('\n▶ Onglet en arrière-plan : rattrapage au retour');
  const deferred = await page.evaluate(async () => {
    Object.defineProperty(document, 'hidden', { get: () => true, configurable: true });
    await refreshFromRealtime();
    const pending = refreshPending;
    delete document.hidden;
    return pending;
  });
  check('rafraîchissement différé tant que l\'onglet est masqué', deferred === true);

  // ═══ 6. Repli si le canal temps réel échoue ═══
  console.log('\n▶ Repli périodique si le temps réel est indisponible');
  const fallback = await page.evaluate(() => {
    let armed = false;
    const origSet = window.setInterval;
    window.setInterval = (fn, ms) => { if (ms >= 30000) armed = true; return origSet(fn, ms); };
    pollTimer = null;
    startPollingFallback();
    window.setInterval = origSet;
    return armed;
  });
  check('vérification périodique armée en secours', fallback);

  await browser.close(); server.close();
  console.log('\n' + '═'.repeat(58));
  const ko = results.filter(r=>!r.p);
  console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
  if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,150))); }
  if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':''))); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
