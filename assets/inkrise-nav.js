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
  if (!mount) return;
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
})();
