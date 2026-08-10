/* Ce que lit quelqu'un quand ça rate.
   Vingt-neuf endroits du site affichaient le message brut de la base :
   « new row violates row-level security policy for table "mangas" »,
   « duplicate key value violates unique constraint », « Failed to fetch ».
   C'est en anglais, ça décrit la plomberie et ça ne dit pas quoi faire.
   Ce fichier vérifie deux choses :
     1. la table de traduction rend bien la bonne phrase pour chaque famille
        d'erreur — testée en injectant de vrais messages PostgREST ;
     2. plus aucune page n'interpole error.message dans un texte visible. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = {'.woff2':'font/woff2','.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.png':'image/png'};
const PORT = Number(process.env.PORT) || 8523;
const BASE = 'http://localhost:' + PORT;
const server = http.createServer((q, r) => {
  const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end('404'); }
  r.writeHead(200, {'Content-Type': MIME[path.extname(p)] || 'application/octet-stream'});
  r.end(fs.readFileSync(p));
});
const U = {id:'u1',email:'m@x.fr',user_metadata:{username:'Marius'}};
const results = [];
const check = (n, p, d = '') => { results.push({n,p,d}); console.log(`${p?'  ✅':'  ❌'} ${n}${d?' — '+d:''}`); };

/* Messages réellement renvoyés par PostgREST / GoTrue / le navigateur.
   Chaque ligne : [erreur telle qu'elle arrive, morceau attendu de la phrase]. */
const CAS = [
  [{message:'new row for relation "profiles" violates check constraint "profiles_bio_len"'}, /bio est trop longue/i],
  [{message:'new row for relation "profiles" violates check constraint "profiles_username_len"'}, /pseudo doit faire entre 2 et 24/i],
  [{message:'new row for relation "mangas" violates check constraint "mangas_titre_len"'}, /titre est trop long/i],
  [{message:'duplicate key value violates unique constraint "profiles_username_key"', code:'23505'}, /pseudo est déjà pris/i],
  [{message:'duplicate key value violates unique constraint "reactions_pkey"', code:'23505'}, /déjà enregistré/i],
  [{message:'new row violates row-level security policy for table "mangas"', code:'42501'}, /droits pour faire ça/i],
  [{message:'JWT expired'}, /session a expiré/i],
  [{message:'insert or update on table "commentaires" violates foreign key constraint', code:'23503'}, /n'existe plus/i],
  [{message:'JSON object requested, multiple (or no) rows returned', code:'PGRST116'}, /introuvable/i],
  [{message:'Could not find the function public.delete_my_account', code:'PGRST202'}, /pas encore activée/i],
  [{message:'Failed to fetch'}, /connexion perdue/i],
  [{message:'Request rate limit reached', code:'429'}, /trop de tentatives/i],
  [{message:'The object exceeded the maximum allowed size'}, /trop lourd/i],
  [{message:'canceling statement due to statement timeout', code:'57014'}, /trop de temps/i],
  [{message:'Edge Function returned a non-2xx status code'}, /momentanément indisponible/i]
];

/* Aucun de ces mots ne doit jamais atteindre un écran. */
const JARGON = /\b(violates|constraint|relation "|duplicate key|row-level security|policy for table|Failed to fetch|non-2xx|Edge Function|JWT|PGRST|null value|invalid input syntax|permission denied for)\b/i;

(async () => {
await new Promise(r => server.listen(PORT, r));
const b = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const errors = [];
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true });
await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
await ctx.route('**/auth/v1/**', r => r.fulfill({status:401,body:'{}'}));
await ctx.route('**/rest/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
await ctx.route('**/storage/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
const p = await ctx.newPage();
p.on('pageerror', e => errors.push(e.message));
await p.goto(BASE + '/bibliotheque.html');
await p.waitForFunction(() => typeof window.inkriseErreur === 'function', null, { timeout: 8000 });

console.log('\n▶ Traduction des erreurs techniques');
check('inkriseErreur est disponible sur la page',
      await p.evaluate(() => typeof window.inkriseErreur === 'function'));

for (const [err, attendu] of CAS) {
  const rendu = await p.evaluate(e => window.inkriseErreur(e), err);
  check('« ' + err.message.slice(0, 46) + '… » est traduit',
        attendu.test(rendu), rendu);
}

console.log('\n▶ Aucun jargon ne ressort de la traduction');
for (const [err] of CAS) {
  const rendu = await p.evaluate(e => window.inkriseErreur(e), err);
  check('pas de jargon pour « ' + err.message.slice(0, 32) + '… »', !JARGON.test(rendu), rendu);
}

/* Une erreur inconnue ne doit pas laisser passer son texte anglais : on
   veut le repli, pas le message d'origine. */
const inconnu = await p.evaluate(() =>
  window.inkriseErreur({ message: 'some brand new backend explosion' }, 'Impossible de faire ça.'));
check('une erreur inconnue tombe sur le repli fourni',
      inconnu === 'Impossible de faire ça.', inconnu);
const sansRepli = await p.evaluate(() => window.inkriseErreur({ message: 'zzz unknown zzz' }));
check('sans repli, une phrase française générique',
      /réessaie/i.test(sansRepli) && !/zzz/.test(sansRepli), sansRepli);
check('un appel sans erreur du tout ne casse pas',
      typeof (await p.evaluate(() => window.inkriseErreur(null))) === 'string');

/* Le détail technique reste accessible : sans lui on ne peut plus
   diagnostiquer une panne signalée par quelqu'un. */
const journal = [];
p.on('console', m => journal.push(m.text()));
await p.evaluate(() => window.inkriseErreur({ message: 'JWT expired' }));
await p.waitForTimeout(150);
check('le message technique part quand même dans la console',
      journal.some(t => /erreur technique/.test(t)));

await ctx.close();

/* ── Garde statique : plus aucun error.message dans un texte visible ── */
console.log('\n▶ Plus aucune page n\'affiche le message brut');
const FICHIERS = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))
  .concat(fs.readdirSync(path.join(ROOT, 'assets')).filter(f => f.endsWith('.js')).map(f => 'assets/' + f));
const SORTIES = /(showToast|showMsg|dire|alert)\s*\(|\.(textContent|innerText|innerHTML)\s*=/;
const coupables = [];
for (const f of FICHIERS) {
  const lignes = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lignes.forEach((l, i) => {
    if (!/\b(error|err|e|e2)\.message\b/.test(l)) return;
    if (/console\.|\/\/|^\s*\*|inkriseErreur|\.test\(|match\(|test\(/.test(l)) return;
    if (SORTIES.test(l)) coupables.push(`${f}:${i + 1}`);
  });
}
check('aucun message brut de la base n\'est affiché', coupables.length === 0, coupables.join(' '));

/* auth.html traduisait déjà ses erreurs à la main : ce travail-là ne doit
   pas être écrasé par la table générique. */
const authTxt = fs.readFileSync(path.join(ROOT, 'auth.html'), 'utf8');
check('les traductions faites main d\'auth.html sont conservées',
      /Cet email est déjà utilisé/.test(authTxt) && /Ce pseudo est déjà pris/.test(authTxt));

/* Les fenêtres natives du navigateur cassent l'identité du site : on n'en
   veut aucune, sauf le repli de partage qui n'a pas d'alternative. */
const natives = [];
for (const f of FICHIERS) {
  fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((l, i) => {
    /* `\([^)]` : un vrai appel passe un argument. « confirm() » sans rien
       entre les parenthèses, c'est une prose de commentaire, pas du code. */
    if (/(^|[^.\w])(alert|confirm)\s*\([^)]/.test(l) && !/inkriseConfirm|\/\//.test(l))
      natives.push(`${f}:${i + 1}`);
  });
}
check('plus aucune fenêtre alert()/confirm() du navigateur', natives.length === 0, natives.join(' '));

/* ── Une seule voix ──
   Tout Inkrise tutoie, jusque dans les CGU. communaute.html vouvoyait :
   « Écrivez une réponse », « Vous avez déjà voté », « votre communauté ».
   On changeait de registre en passant d'une page à l'autre, comme si le
   site était écrit par deux personnes qui ne se parlent pas. */
console.log('\n▶ Le site tutoie partout');
const VOUVOIEMENT = /\b(vous|votre|vos)\b|\b(Écrivez|Choisissez|Cliquez|Sélectionnez|Entrez|Saisissez|Remplissez|Partagez|Ajoutez|Réessayez|Connectez-vous|Inscrivez-vous)\b/;
const vouvoie = [];
for (const f of FICHIERS) {
  fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n').forEach((l, i) => {
    /* On ne juge que du texte destiné à l'écran : libellés, placeholders,
       messages. Les commentaires de code et les noms de variables anglais
       n'ont rien à voir avec le registre employé avec le public. */
    const visible = (l.match(/>[^<>{}]{6,}</g) || [])
      .concat(l.match(/placeholder="[^"]+"/g) || [])
      .concat(l.match(/(showToast|showMsg|dire)\([^)]*/g) || [])
      .concat(l.match(/(title|message|confirmLabel):\s*'[^']+'/g) || []);
    if (visible.some(t => VOUVOIEMENT.test(t))) vouvoie.push(`${f}:${i + 1}`);
  });
}
check('aucune page ne vouvoie', vouvoie.length === 0, vouvoie.slice(0, 6).join(' '));

await b.close(); server.close();
console.log('\n' + '═'.repeat(56));
const ko = results.filter(r => !r.p);
console.log(`${results.length - ko.length}/${results.length} vérifications OK`);
if (errors.length) { console.log('\n⚠️  Erreurs JS :'); [...new Set(errors)].forEach(e => console.log('   ' + e.slice(0, 130))); }
if (ko.length) { console.log('\n❌ Échecs :'); ko.forEach(r => console.log('   - ' + r.n + (r.d ? ' — ' + r.d : ''))); process.exit(1); }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
