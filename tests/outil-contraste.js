/* Balayage exhaustif des contrastes de texte sur toutes les pages rendues.
   Rapporte CHAQUE couple couleur/fond fautif, regroupé, pas seulement le pire. */
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = path.join(__dirname, '..');
const { CHROME } = require('./_chrome');
const MIME = { '.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml' };
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

    let bg = null, stack = [], n = el, gradient = false;
    while (n && n !== document.documentElement) {
      const s2 = getComputedStyle(n);
      if (s2.backgroundImage && s2.backgroundImage !== 'none') { gradient = true; break; }
      const c = s2.backgroundColor.match(/[\d.]+/g);
      if (c) {
        const a = c[3] === undefined ? 1 : +c[3];
        if (a > 0) stack.push([c.slice(0,3).map(Number), a]);
        if (a >= 1) { bg = stack.pop()[0]; break; }
      }
      n = n.parentElement;
    }
    if (gradient) continue;
    if (!bg) bg = [255,255,255];
    for (let i = stack.length-1; i >= 0; i--) {
      const [c2,a] = stack[i];
      bg = bg.map((v,k) => c2[k]*a + v*(1-a));
    }
    const L1 = lum(fg.slice(0,3)), L2 = lum(bg);
    const ratio = (Math.max(L1,L2)+.05)/(Math.min(L1,L2)+.05);
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
  await ctx.route('https://fonts.googleapis.com/**', r => r.fulfill({status:200,contentType:'text/css',body:''}));
  await ctx.route('**/auth/v1/**', r => r.fulfill({status:401, body:'{}'}));
  await ctx.route('**/rest/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  await ctx.route('**/storage/v1/**', r => r.fulfill({status:200,contentType:'application/json',body:'[]'}));
  const page = await ctx.newPage();

  const files = fs.readdirSync(ROOT).filter(f => f.endsWith('.html')).sort();
  const groups = new Map();
  for (const f of files) {
    await page.goto(BASE + '/' + f, { waitUntil:'load' }).catch(()=>{});
    await page.waitForTimeout(500);
    // Le menu latéral est masqué au repos : on l'ouvre pour le mesurer aussi
    await page.evaluate(() => {
      const d = document.getElementById('univDrawer');
      if (d) d.classList.add('open');
    });
    await page.waitForTimeout(150);
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
  console.log(`\n${sorted.length} couples couleur/fond sous le seuil, sur ${files.length} pages\n`);
  for (const g of sorted) {
    console.log(`${String(g.ratio).padStart(5)}:1 (min ${g.need})  texte ${g.fg} sur ${g.bg}`);
    console.log(`          ${g.pages.size} page(s) : ${[...g.pages].slice(0,6).join(', ')}${g.pages.size>6?'…':''}`);
    console.log(`          ex. ${[...g.examples][0]}`);
  }
})().catch(e => { console.error('CRASH', e); server.close(); process.exit(1); });
