/* Garder l'écran allumé pendant la lecture.
   ─────────────────────────────────────────────────────────────────────
   En lecture verticale, on fait défiler sans toucher l'écran : au bout
   d'une trentaine de secondes le téléphone s'éteint en plein chapitre.
   L'API Wake Lock résout exactement ça — encore faut-il tenir compte de
   ses deux pièges :

   • le verrou est libéré d'office dès que l'onglet passe en arrière-plan ;
     il faut le redemander au retour, sinon il ne tient qu'une fois ;
   • la demande échoue si le document n'est pas visible, et le refus est
     une promesse rejetée — non attrapée, elle remonte en erreur console.

   Réglage volontairement rangé dans le navigateur et non en base : c'est
   un choix qui dépend de l'appareil, comme le thème. Un même compte peut
   vouloir l'écran allumé sur sa tablette et pas sur son téléphone. */
(function () {
  'use strict';

  var CLE = 'inkrise_ecran_allume';
  var verrou = null;
  var voulu = false;

  function supporte() {
    return typeof navigator !== 'undefined' &&
           navigator.wakeLock && typeof navigator.wakeLock.request === 'function';
  }

  function actif() {
    try { return localStorage.getItem(CLE) !== '0'; }   // allumé par défaut
    catch (e) { return true; }                          // navigation privée stricte
  }

  function definir(v) {
    try { localStorage.setItem(CLE, v ? '1' : '0'); } catch (e) {}
    if (!v) liberer(); else if (voulu) acquerir();
  }

  function acquerir() {
    voulu = true;
    if (!supporte() || !actif() || verrou) return;
    if (document.visibilityState !== 'visible') return;
    navigator.wakeLock.request('screen').then(function (v) {
      verrou = v;
      // Le navigateur peut le relâcher seul (batterie faible, onglet caché).
      v.addEventListener('release', function () { verrou = null; });
    }).catch(function () {
      /* Refus normal et fréquent : onglet en arrière-plan, batterie
         faible, réglage système. On n'insiste pas et on ne dit rien —
         l'écran s'éteindra, comme avant. */
    });
  }

  function liberer() {
    voulu = false;
    if (!verrou) return;
    try { verrou.release(); } catch (e) {}
    verrou = null;
  }

  /* Revenir de l'écran d'accueil doit ré-armer le verrou, sinon il ne
     protège que la première minute de lecture. */
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible' && voulu) acquerir();
  });

  window.inkriseVeille = {
    supporte: supporte,
    actif: actif,
    definir: definir,
    acquerir: acquerir,
    liberer: liberer,
    // exposé pour les tests : reflète l'état réel, pas l'intention
    verrouille: function () { return !!verrou; }
  };
})();
