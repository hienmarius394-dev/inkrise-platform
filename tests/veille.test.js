/* Écran qui reste allumé pendant la lecture (API Wake Lock).

   En lecture verticale on fait défiler sans jamais toucher l'écran : le
   téléphone s'éteignait en plein chapitre (§2.8 de l'audit).

   L'API n'existe pas dans Chromium sans affichage : on la remplace par un
   double qui note tout ce qu'on lui demande. Ce qui est vérifié, c'est le
   comportement du site — quand il demande le verrou, quand il ne le
   demande pas, et s'il pense à le redemander au retour d'arrière-plan. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME={'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end('404');}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});

const PORT = Number(process.env.PORT) || 8131;
const BASE = 'http://localhost:' + PORT;
const U = { id:'u1', email:'m@x.fr', user_metadata:{ username:'Marius' } };
const MANGA = { id:1, titre:'Darkworld', type:'manga', sens_lecture:'rl',
                age_recommande:'tout_public', commentaires_actifs:true, auteur_id:'u1' };
const results=[]; const check=(n,p,d='')=>{results.push({n,p,d});
  console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`);};

/* Double de navigator.wakeLock : compte les demandes, les refus et les
   libérations, et reproduit la règle du vrai navigateur — une demande
   faite alors que la page est cachée est refusée. */
const DOUBLE = () => {
  window.__veille = { demandes: 0, refus: 0, liberations: 0, actifs: 0 };
  const vivants = [];
  Object.defineProperty(navigator, 'wakeLock', {
    configurable: true,
    value: {
      request: function () {
        window.__veille.demandes++;
        if (document.visibilityState !== 'visible') {
          window.__veille.refus++;
          return Promise.reject(new DOMException('hidden', 'NotAllowedError'));
        }
        window.__veille.actifs++;
        const cibles = [];
        const s = {
          released: false,
          addEventListener: (t, f) => { if (t === 'release') cibles.push(f); },
          release: function () {
            if (s.released) return Promise.resolve();
            s.released = true;
            window.__veille.liberations++;
            window.__veille.actifs--;
            cibles.forEach(f => f());
            return Promise.resolve();
          }
        };
        vivants.push(s);
        return Promise.resolve(s);
      }
    }
  });
  /* Le vrai navigateur relâche le verrou de lui-même dès que l'onglet
     passe en arrière-plan. Sans reproduire ça, le double laissait croire
     que le verrou tenait tout seul et le ré-armement n'était jamais mis à
     l'épreuve. Ce gestionnaire est posé avant ceux de la page, donc il
     libère avant que le site ne réagisse — comme en vrai. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState !== 'visible') vivants.forEach(s => s.release());
  });
};

const PAGES = 4;
const svg = n => `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600"><text x="200" y="300">P${n}</text></svg>`;

async function ouvrir(b, { avecPages = true, reglage = null, sansApi = false } = {}) {
  const ctx = await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  if (sansApi) {
    await ctx.addInitScript(() => {
      window.__veille = { demandes:0, refus:0, liberations:0, actifs:0 };
      try { delete navigator.wakeLock; } catch (e) {}
      Object.defineProperty(navigator, 'wakeLock', { configurable:true, value: undefined });
    });
  } else {
    await ctx.addInitScript(DOUBLE);
  }
  if (reglage !== null) {
    await ctx.addInitScript(v => localStorage.setItem('inkrise_ecran_allume', v), reglage);
  }
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',
    JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',
      expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})), U);
  await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({...U,aud:'authenticated'})}));
  await ctx.route('**/rest/v1/**',r=>{
    const u = r.request().url();
    if (r.request().method()!=='GET') return r.fulfill({status:200,contentType:'application/json',body:'[]'});
    if (u.includes('/mangas')) return r.fulfill({status:200,contentType:'application/json',body:JSON.stringify(MANGA)});
    if (u.includes('/chapitres')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify([{id:10,numero:1,titre:'Ouverture',manga_id:1}])});
    if (u.includes('/profiles')) return r.fulfill({status:200,contentType:'application/json',
      body:JSON.stringify({id:'u1',username:'Marius',avatar_url:null,pref_masquer_adulte:false,
        pref_mode_lecture:null,pref_notif_chapitres:true,pref_notif_social:true,pref_notif_push:false})});
    return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  });
  /* Playwright donne la priorité à la route enregistrée EN DERNIER : le
     fourre-tout doit venir avant la route précise, sinon il l'avale et la
     liste des planches revient vide — le lecteur n'affiche rien et le
     verrou n'est jamais demandé. */
  await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:svg(1)}));
  await ctx.route('**/storage/v1/object/list/**',r=>r.fulfill({status:200,contentType:'application/json',
    body: avecPages ? JSON.stringify(Array.from({length:PAGES},(_,i)=>({name:(i+1)+'.jpg'}))) : '[]'}));
  const p = await ctx.newPage();
  return { ctx, p };
}

const etat = p => p.evaluate(() => window.__veille);

(async()=>{
await new Promise(r=>server.listen(PORT,r));
const b=await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors=[];

console.log('\n▶ Lire un chapitre garde l\'écran allumé');
{
  const { ctx, p } = await ouvrir(b, {});
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2500);
  const e = await etat(p);
  check('le verrou d\'écran est demandé', e.demandes >= 1, JSON.stringify(e));
  check('  et il est bien tenu', e.actifs === 1, JSON.stringify(e));
  check('  une seule fois, pas en boucle', e.demandes === 1, e.demandes + ' demandes');
  await ctx.close();
}

console.log('\n▶ Rien à lire : rien à garder allumé');
{
  const { ctx, p } = await ouvrir(b, { avecPages:false });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2500);
  const e = await etat(p);
  check('chapitre sans planche : aucune demande', e.demandes === 0, JSON.stringify(e));
  await ctx.close();
}

console.log('\n▶ Le réglage de l\'utilisateur est respecté');
{
  const { ctx, p } = await ouvrir(b, { reglage:'0' });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2500);
  const e = await etat(p);
  check('réglage désactivé : aucune demande', e.demandes === 0, JSON.stringify(e));
  await ctx.close();
}
{
  const { ctx, p } = await ouvrir(b, { reglage:'1' });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2500);
  check('réglage activé : le verrou est demandé', (await etat(p)).demandes === 1);
  await ctx.close();
}

console.log('\n▶ Retour d\'arrière-plan : le verrou est ré-armé');
{
  const { ctx, p } = await ouvrir(b, {});
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2500);
  /* Le navigateur relâche le verrou dès que l'onglet passe derrière. Sans
     ré-armement, il ne protégerait que la première minute de lecture. */
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable:true, get:()=>'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(200);
  await p.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable:true, get:()=>'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await p.waitForTimeout(500);
  const e = await etat(p);
  check('une seconde demande est faite au retour', e.demandes >= 2, JSON.stringify(e));
  check('  sans empiler les verrous', e.actifs === 1, JSON.stringify(e));
  await ctx.close();
}

console.log('\n▶ Navigateur sans l\'API : la lecture marche quand même');
{
  const { ctx, p } = await ouvrir(b, { sansApi:true });
  p.on('pageerror',e=>errors.push('sansApi: '+e.message));
  await p.goto(BASE+'/lecteur.html?manga_id=1&chapitre=10');
  await p.waitForTimeout(2500);
  check('les planches s\'affichent', await p.locator('.scroll-page').count() === PAGES,
    (await p.locator('.scroll-page').count()) + ' planches');
  check('  aucune erreur JavaScript', !errors.some(x=>x.startsWith('sansApi:')),
    errors.filter(x=>x.startsWith('sansApi:'))[0] || '');
  await ctx.close();
}

console.log('\n▶ Le réglage est proposé dans les Paramètres');
{
  const { ctx, p } = await ouvrir(b, {});
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/parametres.html');
  await p.waitForTimeout(2200);
  const bouton = p.locator('#prefEcran');
  check('l\'interrupteur est présent', await bouton.count() === 1);
  check('  activé par défaut', await bouton.getAttribute('aria-checked') === 'true');
  await bouton.click();
  await p.waitForTimeout(300);
  check('  le clic le désactive', await bouton.getAttribute('aria-checked') === 'false');
  check('  et le choix est retenu',
    await p.evaluate(()=>localStorage.getItem('inkrise_ecran_allume')) === '0');
  await ctx.close();
}
{
  // Navigateur sans l'API : un interrupteur sans effet vaut moins que rien
  const { ctx, p } = await ouvrir(b, { sansApi:true });
  p.on('pageerror',e=>errors.push(e.message));
  await p.goto(BASE+'/parametres.html');
  await p.waitForTimeout(2200);
  check('masqué là où le navigateur ne sait pas le faire',
    await p.locator('#prefEcran').count() === 0);
  check('  le reste des réglages de lecture reste là',
    await p.locator('#prefMode').count() === 1);
  await ctx.close();
}

await b.close(); server.close();
console.log('\n'+'═'.repeat(56));
const ko=results.filter(r=>!r.p);
console.log(`${results.length-ko.length}/${results.length} vérifications OK`);
if(errors.length){console.log('\n⚠️  Erreurs JS :');[...new Set(errors)].forEach(e=>console.log('   '+e.slice(0,130)));}
if(ko.length){console.log('\n❌ Échecs :');ko.forEach(r=>console.log('   - '+r.n+(r.d?' ('+r.d+')':'')));process.exit(1);}
})().catch(e=>{console.error('CRASH',e);server.close();process.exit(1);});
