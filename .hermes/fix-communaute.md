TASK: Replace the entire nav/header system in communaute.html with the standard Inkrise navigation.

FILE: C:\Users\HP\Desktop\mini-site\inkrise-platform\communaute.html

WHAT TO DO:
1. Read communaute.html fully
2. Find the existing <header class="univ-header"> element (starts around line 430) and everything between it and the <div class="comm-container"> element
3. REPLACE ALL OF IT with the standard nav system below (top nav + drawer overlay + drawer menu)
4. Find the existing <nav class="univ-bnav"> element (starts around line 452) and replace it with the standard bottom-nav below
5. Add the required CSS and JS functions (they might already exist with different class names - remove the old ones)

STANDARD TOP NAV HTML:
```
<!-- TOP NAV -->
<nav>
  <a href="index.html" class="logo">INKRISE</a>
  <div class="univ-nav-links">
    <a href="index.html" class="univ-nav-link">Accueil</a>
    <a href="manga.html" class="univ-nav-link">Mangas</a>
    <a href="tutoriels.html" class="univ-nav-link">Tutoriels</a>
    <a href="#" class="univ-nav-link" onclick="openModal();return false;">Premium</a>
  </div>
  <div class="univ-search-wrap">
    <input type="text" id="navSearchInput" class="univ-search-input" placeholder="Rechercher..." onkeydown="if(event.key==='Enter')doSearch()" />
    <button class="univ-search-btn" onclick="doSearch()">🔍</button>
  </div>
  <div class="nav-right">
    <a href="auth.html" class="btn-connexion" id="btnConnexion">Connexion</a>
    <a href="profil.html" class="avatar-btn" id="avatarBtn">🧑‍🎨</a>
    <button class="hamburger" onclick="openDrawer()">☰</button>
  </div>
</nav>
```

STANDARD DRAWER HTML:
```
<!-- DRAWER OVERLAY -->
<div class="drawer-overlay" id="drawerOverlay" onclick="closeDrawer()"></div>

<!-- MENU DRAWER -->
<div class="drawer" id="drawer">
  <div class="drawer-header">
    <a href="index.html" class="drawer-logo">INK<span>RISE</span></a>
    <button class="drawer-close" onclick="closeDrawer()">✕</button>
  </div>
  <div class="drawer-section-title">Explorer</div>
  <a href="index.html" class="drawer-item"><div class="drawer-item-icon">🏠</div><span class="drawer-item-label">Accueil</span></a>
  <a href="manga.html" class="drawer-item"><div class="drawer-item-icon">📖</div><span class="drawer-item-label">Manga &amp; BD</span></a>
  <a href="tutoriels.html" class="drawer-item"><div class="drawer-item-icon">🎓</div><span class="drawer-item-label">Tutoriels</span><span class="drawer-item-badge" style="background:rgba(0,201,167,.15);color:#00c9a7;">GRATUIT</span></a>
  <a href="#" class="drawer-item" onclick="openModal();closeDrawer();"><div class="drawer-item-icon">💎</div><span class="drawer-item-label">Premium</span><span class="drawer-item-badge" style="background:rgba(255,107,53,.15);color:#ff6b35;">PRO</span></a>
  <a href="communaute.html" class="drawer-item"><div class="drawer-item-icon">👥</div><span class="drawer-item-label">Communauté</span></a>
  <div class="drawer-divider"></div>
  <div class="drawer-section-title">Mon compte</div>
  <a href="profil.html" class="drawer-item" id="drawerProfil" style="display:none;"><div class="drawer-item-icon">🧑‍🎨</div><span class="drawer-item-label">Mon profil</span></a>
  <a href="upload-manga.html" class="drawer-item" id="drawerPublier" style="display:none;"><div class="drawer-item-icon">📤</div><span class="drawer-item-label">Publier un manga</span></a>
  <a href="auth.html" class="drawer-item" id="drawerConnexion"><div class="drawer-item-icon">🔑</div><span class="drawer-item-label">Connexion / Inscription</span></a>
  <button class="drawer-item" id="drawerLogout" style="display:none;" onclick="logout()"><div class="drawer-item-icon">🚪</div><span class="drawer-item-label" style="color:#ff3d71;">Déconnexion</span></button>
</div>
```

STANDARD BOTTOM NAV HTML:
```
<!-- BOTTOM NAV -->
<div class="bottom-nav">
  <button class="bottom-nav-item" onclick="window.location.href='index.html'"><span class="bottom-nav-icon">🏠</span><span class="bottom-nav-label">Accueil</span></button>
  <button class="bottom-nav-item" onclick="window.location.href='manga.html'"><span class="bottom-nav-icon">📖</span><span class="bottom-nav-label">Manga</span></button>
  <button class="bottom-nav-search" onclick="if(typeof doSearch==='function'){focusSearch()}else{window.location.href='recherche.html'}">🔍</button>
  <a href="tutoriels.html" class="bottom-nav-item"><span class="bottom-nav-icon">🎓</span><span class="bottom-nav-label">Tutoriels</span></a>
  <button class="bottom-nav-item active" onclick="window.location.href='communaute.html'"><span class="bottom-nav-icon">👥</span><span class="bottom-nav-label">Communauté</span></button>
</div>
```

CSS: Add the standard nav styles. The page currently has .univ-header, .univ-nav-logo, .univ-nav-links-d, .univ-bnav CSS classes — REMOVE all of these. The existing bottom-nav CSS in index.html uses classes like .bottom-nav, .bottom-nav-item, .bottom-nav-icon, .bottom-nav-label, .bottom-nav-search — ADD equivalent CSS to communaute.html. Also add CSS for .drawer, .drawer-overlay, .hamburger, .univ-search-wrap, .univ-search-input, .univ-search-btn, .btn-connexion, .avatar-btn, .nav-right, .univ-nav-links, .univ-nav-link, .logo.

Also add these JS functions inside a <script> tag:
```
function openDrawer(){document.getElementById('drawerOverlay').classList.add('open');document.getElementById('drawer').classList.add('open');document.body.style.overflow='hidden'}
function closeDrawer(){document.getElementById('drawerOverlay').classList.remove('open');document.getElementById('drawer').classList.remove('open');document.body.style.overflow=''}
function doSearch(){var q=document.getElementById('navSearchInput').value.trim();if(q)window.location.href='recherche.html?q='+encodeURIComponent(q)}
function focusSearch(){document.getElementById('navSearchInput').focus()}
```

CRITICAL: Do NOT modify or delete any content between <div class="comm-container" id="app"> and the bottom nav section. Only replace the header, drawer, and bottom-nav sections and add their required CSS/JS.