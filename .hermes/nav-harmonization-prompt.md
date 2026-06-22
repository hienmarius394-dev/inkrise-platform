## TASK: Unify navigation across ALL 17 Inkrise HTML pages

### CONTEXT
Inkrise is a vanilla HTML/CSS/JS project (17 pages) at C:\Users\HP\Desktop\mini-site\inkrise-platform\. It's deployed on Vercel. Currently there are **3 different navigation systems** across the pages, causing visual inconsistency.

### MY ROLE (what to do)
Read each of the 17 HTML files, identify its nav/bottom-nav/drawer structure, and rewrite it to match the STANDARD defined below.

### THE STANDARD (use this EXACTLY on every page)

#### 1. TOP NAV — HTML structure (insert right after <body>, before any content)
Replace any existing <nav>, <header>, or banner element with this:

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

#### 2. DRAWER / MENU LATERAL (insert right after top nav)
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
  <a href="index.html" class="drawer-item">
    <div class="drawer-item-icon">🏠</div>
    <span class="drawer-item-label">Accueil</span>
  </a>
  <a href="manga.html" class="drawer-item">
    <div class="drawer-item-icon">📖</div>
    <span class="drawer-item-label">Manga &amp; BD</span>
  </a>
  <a href="tutoriels.html" class="drawer-item">
    <div class="drawer-item-icon">🎓</div>
    <span class="drawer-item-label">Tutoriels</span>
    <span class="drawer-item-badge" style="background:rgba(0,201,167,.15);color:#00c9a7;">GRATUIT</span>
  </a>
  <a href="#" class="drawer-item" onclick="openModal();closeDrawer();">
    <div class="drawer-item-icon">💎</div>
    <span class="drawer-item-label">Premium</span>
    <span class="drawer-item-badge" style="background:rgba(255,107,53,.15);color:#ff6b35;">PRO</span>
  </a>
  <a href="communaute.html" class="drawer-item">
    <div class="drawer-item-icon">👥</div>
    <span class="drawer-item-label">Communauté</span>
  </a>

  <div class="drawer-divider"></div>
  <div class="drawer-section-title">Mon compte</div>

  <a href="profil.html" class="drawer-item" id="drawerProfil" style="display:none;">
    <div class="drawer-item-icon">🧑‍🎨</div>
    <span class="drawer-item-label">Mon profil</span>
  </a>
  <a href="upload-manga.html" class="drawer-item" id="drawerPublier" style="display:none;">
    <div class="drawer-item-icon">📤</div>
    <span class="drawer-item-label">Publier un manga</span>
  </a>
  <a href="auth.html" class="drawer-item" id="drawerConnexion">
    <div class="drawer-item-icon">🔑</div>
    <span class="drawer-item-label">Connexion / Inscription</span>
  </a>
  <button class="drawer-item" id="drawerLogout" style="display:none;" onclick="logout()">
    <div class="drawer-item-icon">🚪</div>
    <span class="drawer-item-label" style="color:#ff3d71;">Déconnexion</span>
  </button>
</div>
```

#### 3. BOTTOM NAV (insert right before </body>, after all content)
```
<!-- BOTTOM NAV -->
<div class="bottom-nav">
  <button class="bottom-nav-item active" onclick="window.location.href='index.html'">
    <span class="bottom-nav-icon">🏠</span>
    <span class="bottom-nav-label">Accueil</span>
  </button>
  <button class="bottom-nav-item" onclick="window.location.href='manga.html'">
    <span class="bottom-nav-icon">📖</span>
    <span class="bottom-nav-label">Manga</span>
  </button>
  <button class="bottom-nav-search" onclick="if(typeof doSearch==='function'){focusSearch()}else{window.location.href='recherche.html'}">🔍</button>
  <a href="tutoriels.html" class="bottom-nav-item">
    <span class="bottom-nav-icon">🎓</span>
    <span class="bottom-nav-label">Tutoriels</span>
  </a>
  <button class="bottom-nav-item" onclick="window.location.href='communaute.html'">
    <span class="bottom-nav-icon">👥</span>
    <span class="bottom-nav-label">Communauté</span>
  </button>
</div>
```

#### 4. CSS — ensure these style blocks exist in each page's <style>

For the nav/bottom-nav/drawer CSS, verify that each page already has these CSS sections. If a page uses DIFFERENT class names (like .univ-header, .univ-nav-logo, .univ-nav-links-d, .univ-bnav, .univ-bnav-icon, .bnav-icon), REPLACE them with the standard classes.

Pages that definitely need CSS replacement: communaute.html, mon-espace.html

#### 5. JAVASCRIPT — ensure these functions exist in each page's <script>

For pages that don't already have them, add these JS functions:
- openDrawer() - opens the drawer menu
- closeDrawer() - closes the drawer menu  
- doSearch() - navigates to recherche.html with query
- focusSearch() - focuses the search input

Use this minimal implementation:
```
function openDrawer(){document.getElementById('drawerOverlay').classList.add('open');document.getElementById('drawer').classList.add('open');document.body.style.overflow='hidden'}
function closeDrawer(){document.getElementById('drawerOverlay').classList.remove('open');document.getElementById('drawer').classList.remove('open');document.body.style.overflow=''}
function doSearch(){var q=document.getElementById('navSearchInput').value.trim();if(q)window.location.href='recherche.html?q='+encodeURIComponent(q)}
function focusSearch(){document.getElementById('navSearchInput').focus()}
```

### SPECIAL CASES

**communaute.html**:
- Currently has DIFFERENT nav: <header class="univ-header"> with <nav class="univ-nav-links-d">, logo "InkRise", no drawer, no search, different bottom nav <nav class="univ-bnav">
- FULL REPLACEMENT NEEDED: replace entire <header> with standard top nav + drawer
- FULL REPLACEMENT NEEDED: replace <nav class="univ-bnav"> with standard bottom-nav
- KEEP all community-specific content and CSS

**mon-espace.html**:
- Currently has <header class="univ-header"> with <nav> and logo "InkRise"
- Different bottom nav <nav class="univ-bnav">
- FULL REPLACEMENT NEEDED: replace entire <header> with standard top nav + drawer
- FULL REPLACEMENT NEEDED: replace <nav class="univ-bnav"> with standard bottom-nav
- KEEP all dashboard/content sections

**auth.html**:
- Hide the "Connexion" button: add style="display:none" to #btnConnexion on this page only
- Keep #drawerConnexion visible in drawer

**tutoriels.html**:
- Change badge text from "NOUVEAU" to "GRATUIT" in the drawer

### ALL 17 FILES TO MODIFY

Read and update EACH ONE:
1. index.html
2. manga.html
3. tutoriels.html
4. auth.html
5. upload-manga.html
6. gestion-chapitres.html
7. lecteur.html
8. profil.html
9. bibliotheque.html
10. auteur.html
11. recherche.html
12. createurs.html
13. pack.html
14. premium.html
15. lecteur-video.html
16. communaute.html (FULL nav replacement)
17. mon-espace.html (FULL nav replacement)

### VERIFICATION
After ALL changes, run: git diff --stat
Do NOT commit. Just report the changes.

IMPORTANT: Do NOT change any page content, layout, or functionality beyond the navigation system. Keep ALL existing page content, scripts, and styles intact — only replace the nav/header/bottom-nav/drawer sections and their associated CSS/JS.