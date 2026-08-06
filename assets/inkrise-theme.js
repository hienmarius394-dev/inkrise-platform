/* ═══ Choix du thème, appliqué avant le premier affichage ═══

   Ce fichier est volontairement minuscule et chargé en <head>, avant tout
   le reste : si le thème était posé plus tard, la page s'afficherait une
   fraction de seconde en clair avant de basculer en sombre — c'est
   précisément le flash blanc qu'on cherche à éviter, la nuit.

   Trois états possibles, mémorisés dans localStorage :
     'clair'  → clair — LE DÉFAUT
     'sombre' → forcé sombre
     'auto'   → suit le réglage du téléphone / de l'ordinateur

   Le défaut est 'clair', pas 'auto' : le clair est l'apparence de
   référence d'Inkrise, et quelqu'un dont le téléphone est en sombre
   découvrirait sinon le site en sombre sans jamais l'avoir vu autrement.
   Le sombre reste à un geste, dans le menu ou dans Paramètres.

   L'attribut posé sur <html> est data-theme="dark" ou "light". Les couleurs
   vivent dans inkrise-theme.css, jamais ici. */
(function () {
  var CLE = 'inkrise_theme';
  var racine = document.documentElement;

  function prefereSombre() {
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function lire() {
    try { return localStorage.getItem(CLE) || 'clair'; }
    catch (e) { return 'clair'; }  // navigation privée stricte
  }

  function resoudre(choix) {
    if (choix === 'sombre') return 'dark';
    if (choix === 'clair') return 'light';
    return prefereSombre() ? 'dark' : 'light';
  }

  function appliquer(choix) {
    var effectif = resoudre(choix);
    racine.setAttribute('data-theme', effectif);
    /* La couleur de la barre système du navigateur suit, sinon on garde un
       bandeau violet clair au-dessus d'une page sombre. */
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', effectif === 'dark' ? '#121016' : '#7c5cfc');
    return effectif;
  }

  appliquer(lire());

  window.inkriseTheme = {
    /* 'auto' | 'clair' | 'sombre' */
    get: lire,
    /* Renvoie le thème réellement appliqué ('dark' | 'light'). */
    effectif: function () { return racine.getAttribute('data-theme') || 'light'; },
    set: function (choix) {
      try { localStorage.setItem(CLE, choix); } catch (e) { /* non bloquant */ }
      var effectif = appliquer(choix);
      window.dispatchEvent(new CustomEvent('inkrise:theme', { detail: { choix: choix, effectif: effectif } }));
      return effectif;
    }
  };

  /* Si la personne est en 'auto' et change le réglage de son appareil,
     la page suit sans qu'il faille la recharger. */
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var suivre = function () { if (lire() === 'auto') appliquer('auto'); };
    if (mq.addEventListener) mq.addEventListener('change', suivre);
    else if (mq.addListener) mq.addListener(suivre);
  }
})();
