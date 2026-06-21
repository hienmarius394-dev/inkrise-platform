"""Inject unified header + bottom nav into gestion-chapitres.html, upload-manga.html, profil.html"""
import re

BASE = r'C:\Users\HP\Desktop\mini-site\inkrise-platform'

# === Unified CSS block to inject ===
UNIV_CSS = """
/* ── NAV LINKS + SEARCH (universel) ── */
.univ-nav-links{display:flex;align-items:center;gap:2px;flex:1;margin:0 8px;}
@media(max-width:680px){.univ-nav-links{display:none;}}
.univ-nav-link{color:rgba(240,239,254,0.6);font-size:.82rem;font-weight:600;text-decoration:none;padding:5px 10px;border-radius:7px;transition:all .2s;white-space:nowrap;font-family:'DM Sans',sans-serif;}
.univ-nav-link:hover{color:#f0effe;background:rgba(255,255,255,0.06);}
.univ-search-wrap{display:flex;align-items:center;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);border-radius:18px;overflow:hidden;max-width:200px;flex-shrink:0;}
@media(max-width:480px){.univ-search-wrap{max-width:120px;}}
.univ-search-input{background:none;border:none;outline:none;color:#f0effe;font-size:.8rem;padding:7px 10px;width:100%;font-family:'DM Sans',sans-serif;}
.univ-search-input::placeholder{color:rgba(240,239,254,.35);}
.univ-search-btn{background:none;border:none;cursor:pointer;padding:6px 8px;font-size:13px;color:rgba(240,239,254,.5);flex-shrink:0;transition:color .2s;}
.univ-search-btn:hover{color:#7c6fef;}
/* ── BOTTOM NAV UNIVERSEL ── */
.univ-bnav{position:fixed;bottom:0;left:0;right:0;z-index:100;background:rgba(10,10,15,.97);border-top:1px solid rgba(255,255,255,.07);display:flex;align-items:center;justify-content:space-around;padding:8px 0 16px;backdrop-filter:blur(14px);}
.univ-bnav-item{display:flex;flex-direction:column;align-items:center;gap:2px;text-decoration:none;color:rgba(240,239,254,.4);padding:0 8px;transition:color .2s;border:none;background:none;cursor:pointer;}
.univ-bnav-item:hover{color:rgba(240,239,254,.9);}
.univ-bnav-icon{font-size:20px;}
.univ-bnav-label{font-size:.6rem;font-weight:800;font-family:'DM Sans',sans-serif;}
.univ-bnav-search{width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,#7c6fef,#5040c8);border:none;display:flex;align-items:center;justify-content:center;font-size:20px;cursor:pointer;margin-top:-18px;box-shadow:0 4px 18px rgba(124,111,239,.5);transition:transform .2s;flex-shrink:0;}
.univ-bnav-search:hover{transform:scale(1.08);}
"""

NAV_HTML = """<!-- TOP NAV -->
<nav>
  <a href="index.html" style="font-family:'Syne',sans-serif;font-weight:800;font-size:1.1rem;text-decoration:none;color:#f0f0f4;white-space:nowrap;flex-shrink:0;">INKRISE</a>
  <div class="univ-nav-links">
    <a href="index.html" class="univ-nav-link">Accueil</a>
    <a href="manga.html" class="univ-nav-link">Mangas</a>
    <a href="#" class="univ-nav-link">Tutoriels</a>
    <a href="#" class="univ-nav-link" onclick="openModal();return false;">Premium</a>
  </div>
  <div class="univ-search-wrap">
    <input type="text" id="navSearchInput" class="univ-search-input" placeholder="Rechercher&hellip;" onkeydown="if(event.key==='Enter')doSearch()" />
    <button class="univ-search-btn" onclick="doSearch()">🔍</button>
  </div>
  <div style="display:flex;align-items:center;gap:8px;">
    <a href="auth.html" id="btnConnexion" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7c6fef,#5040c8);color:#fff;font-size:.8rem;font-weight:700;padding:7px 14px;border-radius:9px;text-decoration:none;flex-shrink:0;transition:transform .2s;font-family:'DM Sans',sans-serif;">Connexion</a>
    <a href="profil.html" id="avatarBtn" style="display:none;width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.1);align-items:center;justify-content:center;text-decoration:none;font-size:1rem;">🧑‍🎨</a>
    <button class="nav-hamburger" onclick="openDrawer()" style="width:34px;height:34px;border-radius:8px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#f0f0f4;font-size:1rem;transition:all .2s;">☰</button>
  </div>
</nav>"""

BNAV_HTML = """<!-- BOTTOM NAV -->
<div class="univ-bnav">
  <a href="index.html" class="univ-bnav-item"><span class="univ-bnav-icon">🏠</span><span class="univ-bnav-label">Accueil</span></a>
  <a href="manga.html" class="univ-bnav-item"><span class="univ-bnav-icon">📖</span><span class="univ-bnav-label">Manga</span></a>
  <button class="univ-bnav-search" onclick="focusSearch()">🔍</button>
  <a href="#" class="univ-bnav-item"><span class="univ-bnav-icon">🎓</span><span class="univ-bnav-label">Tutoriels</span></a>
  <a href="#" class="univ-bnav-item"><span class="univ-bnav-icon">👥</span><span class="univ-bnav-label">Communauté</span></a>
</div>"""

SEARCH_SCRIPTS = """
function doSearch(){
  const q=document.getElementById('navSearchInput');
  if(q&&q.value.trim())window.location.href='manga.html?q='+encodeURIComponent(q.value.trim());
  else if(q)q.focus();
}
function focusSearch(){
  const i=document.getElementById('navSearchInput');
  if(i){i.focus();window.scrollTo({top:0,behavior:"smooth"});}
}"""

def inject_header_in_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # 1. Add CSS before </style>
    content = content.replace('</style>', UNIV_CSS + '\n</style>')
    
    # 2. Replace old nav with new nav
    # Find existing nav
    old_nav_match = re.search(r'<nav[^>]*>.*?</nav>', content, re.DOTALL)
    if old_nav_match:
        content = content.replace(old_nav_match.group(), NAV_HTML)
    else:
        # Try to find just <nav>...</nav>
        old_nav = re.search(r'<nav>.*?</nav>', content, re.DOTALL)
        if old_nav:
            content = content.replace(old_nav.group(), NAV_HTML)
    
    # 3. Add bottom nav before </body>
    content = content.replace('</body>', BNAV_HTML + '\n</body>')
    
    # 4. Add search functions before final </script>
    # Find the last </script> before </body>
    script_end = content.rfind('</script>')
    before_script = content[:script_end]
    after_script = content[script_end:]
    
    # Add functions if not already there
    if 'function doSearch' not in content and 'function focusSearch' not in content:
        content = before_script + SEARCH_SCRIPTS + '\n' + after_script
    
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)
    
    fname = filepath.split('/')[-1].split('\\')[-1]
    print(f"✅ {fname} modifié !")

for fname in ['gestion-chapitres.html', 'upload-manga.html', 'profil.html']:
    fpath = f'{BASE}\\{fname}'
    inject_header_in_file(fpath)
    print(f"Taille: {len(open(fpath, encoding='utf-8').read())} chars")

print("\n🎉 Fini!")
