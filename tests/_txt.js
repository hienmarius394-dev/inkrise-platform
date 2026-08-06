const { chromium } = require('playwright');
const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/home/user/inkrise-platform';
const {CHROME}=require(ROOT+'/tests/_chrome');
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.webmanifest':'application/json','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png'};
const server=http.createServer((q,r)=>{const p=path.join(ROOT,decodeURIComponent(q.url.split('?')[0]));
 if(!fs.existsSync(p)||fs.statSync(p).isDirectory()){r.writeHead(404);return r.end();}
 r.writeHead(200,{'Content-Type':MIME[path.extname(p)]||'application/octet-stream'});r.end(fs.readFileSync(p));});
const U={id:'u1',email:'m@x.fr',user_metadata:{username:'Marius'}};
const PROFILE={id:'u1',username:'Marius',avatar_url:null,bio:'Auteur',is_creator:true,created_at:'2026-01-05T10:00:00Z',pref_masquer_adulte:false,pref_notif_chapitres:true,pref_notif_social:true,pref_notif_push:false};
const MANGA=i=>({id:i,titre:'Darkworld '+i,synopsis:'Un récit sombre.',type:'manga',statut:'en_cours',genres:['Action'],couverture_url:null,auteur_id:'u1',vues:120+i,adulte:false,langue:'fr',sens_lecture:'rl',age_recommande:'12+',commentaires_actifs:true,created_at:'2026-06-01T10:00:00Z',note_moyenne:4.2,nb_avis:3});
function corps(u){const t=n=>u.includes(n);
 if(t('/profiles'))return[PROFILE];
 if(t('avis_mangas'))return[{id:1,user_id:'u2',note:5,commentaire:'Top',created_at:'2026-07-01T10:00:00Z'}];
 if(t('posts_communaute'))return[{id:1,creator_id:'u1',type:'post',contenu:'Salut',est_epingle:false,image_url:null,created_at:'2026-07-01T10:00:00Z',auteur_id:'u1'}];
 if(t('/mangas'))return[1,2].map(MANGA);
 if(t('/chapitres'))return[{id:101,numero:1,titre:'Ch 1',manga_id:1,created_at:'2026-06-11T10:00:00Z'}];
 if(t('packs_tutoriels'))return[{id:1,titre:'Pack encrage',description:'Apprends.',prix:5,auteur_id:'u1',couverture_url:null,contenu_url:'x',images:[],niveau:'debutant',objectifs:['Trait'],created_at:'2026-05-01T10:00:00Z'}];
 if(t('/bibliotheque'))return[{user_id:'u1',manga_id:1,chapitre:101,page:3,total_pages:12,total_chapitres:3}];
 if(t('/follows'))return[{user_id:'u1',followed_id:'u1'}];
 if(t('achats_packs'))return[{id:1,user_id:'u1',pack_id:1,prix_paye:0}];
 return[];}
const URLS=(process.env.URLS||'index.html,recherche.html,manga.html?id=1,bibliotheque.html,profil.html,tutoriels.html,pack.html?id=1,espace-createur.html,upload-manga.html,communaute.html,auth.html,parametres.html,creators-remuneration.html,404.html').split(',');
(async()=>{await new Promise(r=>server.listen(8519,r));
const b=await chromium.launch(CHROME?{executablePath:CHROME}:{});
for(const mode of (process.env.MODES||'auth,anon').split(',')){
 const ctx=await b.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 if(mode==='auth'){
  await ctx.addInitScript(u=>localStorage.setItem('sb-bsdcpwtimsgxcnaamwip-auth-token',JSON.stringify({access_token:'t',refresh_token:'r',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+9999,expires_in:9999,user:u})),U);
  await ctx.route('**/auth/v1/**',r=>r.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...U,aud:'authenticated'})}));
 } else await ctx.route('**/auth/v1/**',r=>r.fulfill({status:401,body:'{}'}));
 await ctx.route('https://fonts.googleapis.com/**',r=>r.fulfill({status:200,contentType:'text/css',body:''}));
 await ctx.route('**/rest/v1/**',r=>{const req=r.request();
  if(req.method()!=='GET')return r.fulfill({status:200,contentType:'application/json',body:'[]'});
  const rows=corps(decodeURIComponent(req.url()));
  const seul=(req.headers()['accept']||'').includes('vnd.pgrst.object');
  r.fulfill({status:200,contentType:'application/json',headers:{'Content-Range':'0-0/'+rows.length,'Access-Control-Expose-Headers':'Content-Range'},body:JSON.stringify(seul?(rows[0]||null):rows)});});
 await ctx.route('**/storage/v1/object/list/**',r=>r.fulfill({status:200,contentType:'application/json',body:'[{"name":"01.jpg"}]'}));
 await ctx.route('**/storage/v1/**',r=>r.fulfill({status:200,contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg"/>'}));
 for(const u of URLS){
  const p=await ctx.newPage();
  try{await p.goto('http://localhost:8519/'+u,{waitUntil:'load',timeout:20000});await p.waitForTimeout(1500);
   const t=await p.evaluate(()=>document.body.innerText.split('\n').map(l=>l.trim()).filter(Boolean).join(' ⁄ '));
   console.log('\n════ '+u+'  ['+mode+'] ════\n'+t);
  }catch(e){console.log('\n════ '+u+' ['+mode+'] ════\nERREUR '+e.message.slice(0,50));}
  await p.close();
 }
 await ctx.close();
}
await b.close();server.close();})();
