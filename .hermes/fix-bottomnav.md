TASK: Fix bottom nav on remaining Inkrise HTML pages and add missing GRATUIT badges.

WORKING DIRECTORY: C:\Users\HP\Desktop\mini-site\inkrise-platform

### BOTTOM NAV REPLACEMENT

For each page below, find the existing bottom nav HTML block and replace it with the standard bottom nav.

**Pages needing bottom nav replacement** (they use old .univ-bnav-* or other non-standard classes):
1. manga.html
2. tutoriels.html
3. auth.html
4. upload-manga.html
5. gestion-chapitres.html
6. lecteur.html
7. profil.html
8. bibliotheque.html
9. auteur.html
10. recherche.html
11. createurs.html
12. pack.html
13. premium.html
14. lecteur-video.html

**How to identify the old bottom nav:** Search for "univ-bnav" or look for a block near the end of the file containing nav items with class "univ-bnav-item" or "univ-bnav-search" or just plain nav links.

**How to identify the bottom nav location:** It's the last navigation block before </body>. Look for elements with classes like "univ-bnav" or "bottom-nav" or nav links with icons like 🏠, 📖, 🎓, 👥, 🔍, 👤.

**STANDARD BOTTOM NAV HTML to insert:**
```
<!-- BOTTOM NAV -->
<div class="bottom-nav">
  <button class="bottom-nav-item" onclick="window.location.href='index.html'"><span class="bottom-nav-icon">🏠</span><span class="bottom-nav-label">Accueil</span></button>
  <button class="bottom-nav-item" onclick="window.location.href='manga.html'"><span class="bottom-nav-icon">📖</span><span class="bottom-nav-label">Manga</span></button>
  <button class="bottom-nav-search" onclick="if(typeof focusSearch==='function'){focusSearch()}else{window.location.href='recherche.html'}">🔍</button>
  <a href="tutoriels.html" class="bottom-nav-item"><span class="bottom-nav-icon">🎓</span><span class="bottom-nav-label">Tutoriels</span></a>
  <button class="bottom-nav-item" onclick="window.location.href='communaute.html'"><span class="bottom-nav-icon">👥</span><span class="bottom-nav-label">Communauté</span></button>
</div>
```

### MISSING GRATUIT BADGES

For these pages, find the Tutoriels entry in the DRAWER (not the bottom nav) and add the GRATUIT badge:

Pages missing GRATUIT badge:
- upload-manga.html
- gestion-chapitres.html
- lecteur.html
- profil.html
- premium.html
- lecteur-video.html

Look in the drawer menu section for:
```
<a href="tutoriels.html" class="drawer-item"><div class="drawer-item-icon">🎓</div><span class="drawer-item-label">Tutoriels</span>
```
And change it to:
```
<a href="tutoriels.html" class="drawer-item"><div class="drawer-item-icon">🎓</div><span class="drawer-item-label">Tutoriels</span><span class="drawer-item-badge" style="background:rgba(0,201,167,.15);color:#00c9a7;">GRATUIT</span>
```

### CSS

For each page where you replace the bottom nav, ensure the CSS for .bottom-nav, .bottom-nav-item, .bottom-nav-icon, .bottom-nav-label, .bottom-nav-search exists in the page's <style> section. If it doesn't, add it. Also remove any old .univ-bnav-* CSS classes that are no longer needed.

### VERIFICATION
After ALL changes, run: git diff --stat
Report: which files were modified and what changes were made.