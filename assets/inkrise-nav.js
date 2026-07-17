/* Nav du bas partagée — une seule source de vérité pour toutes les pages.
   Usage : <div id="inkriseBottomNav" data-active="accueil"></div>
           <script src="assets/inkrise-nav.js"></script>
   data-active : accueil | tutoriels | communaute | profil (ou vide) */
(function () {
  const ITEMS = [
    { id: 'accueil',    href: 'index.html',      icon: '🏠', label: 'Accueil' },
    { id: 'tutoriels',  href: 'tutoriels.html',  icon: '🎓', label: 'Tutoriels' },
    { id: 'search' },
    { id: 'communaute', href: 'communaute.html', icon: '👥', label: 'Communauté' },
    { id: 'profil',     href: 'profil.html',     icon: '👤', label: 'Profil' },
  ];

  const mount = document.getElementById('inkriseBottomNav');
  if (mount) {
    const active = mount.dataset.active || '';

    const nav = document.createElement('div');
    nav.className = 'univ-bnav';
    nav.innerHTML = ITEMS.map(it => {
      if (it.id === 'search') {
        return '<button class="univ-bnav-search" type="button" title="Rechercher">🔍</button>';
      }
      const cls = 'univ-bnav-item' + (it.id === active ? ' active' : '');
      return '<a href="' + it.href + '" class="' + cls + '">' +
        '<span class="univ-bnav-icon">' + it.icon + '</span>' +
        '<span class="univ-bnav-label">' + it.label + '</span></a>';
    }).join('');
    mount.replaceWith(nav);

    nav.querySelector('.univ-bnav-search').addEventListener('click', function () {
      // Priorité : champ de recherche de la page (nav haut ou hero), sinon page recherche
      if (typeof window.focusSearch === 'function' && document.getElementById('navSearchInput')) {
        window.focusSearch();
        return;
      }
      const hero = document.getElementById('heroSearchInput');
      if (hero) {
        hero.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.location.href = 'recherche.html';
    });
  }

  /* PWA : enregistre le service worker (cache assets + pages, mode hors-ligne) */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* non bloquant */ });
    });
  }

  /* Carte "Notre mission" en bas du menu latéral — visible en permanence,
     sur toutes les pages, connecté ou non. */
  const drawer = document.getElementById('univDrawer');
  if (drawer && !document.getElementById('drawerMission')) {
    const card = document.createElement('a');
    card.id = 'drawerMission';
    card.href = 'upload-manga.html';
    card.style.cssText = 'display:block;margin:16px 14px 20px;padding:14px 16px;border-radius:14px;' +
      'text-decoration:none;background:linear-gradient(135deg,rgba(124,92,252,.12),rgba(255,95,168,.10));' +
      'border:1px solid rgba(124,92,252,.28);';
    card.innerHTML =
      '<div style="font-weight:800;font-size:.72rem;letter-spacing:.6px;color:#7c5cfc;margin-bottom:6px;">💜 NOTRE MISSION</div>' +
      '<div style="font-size:.82rem;line-height:1.5;color:#4a4560;">Tu publies tes mangas sur Inkrise ? Dès que la communauté sera assez grande, jusqu\'à <b>70% des revenus publicitaires</b> te seront reversés <b>selon les vues de tes œuvres</b>.</div>' +
      '<div style="margin-top:8px;font-size:.8rem;font-weight:700;color:#ff5fa8;">Publier mon manga →</div>';
    drawer.appendChild(card);
  }
})();
