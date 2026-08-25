/* Dire à l'utilisateur quand le serveur ne répond plus.
   ─────────────────────────────────────────────────────────────────────
   Constat mesuré (tests/outil-panne.js) : réseau coupé, les treize pages
   du site restaient bloquées sur « Chargement… », « Chargement du
   manga… », « Recherche en cours… » — indéfiniment, sans un mot. Chaque
   page a sa propre mécanique de chargement ; plutôt que d'en réécrire
   treize, on écoute les requêtes qui partent vers Supabase et on affiche
   un bandeau dès qu'elles échouent.

   Volontairement limité à ce qu'on peut affirmer : le bandeau dit que la
   connexion au serveur a échoué et propose de réessayer. Il ne touche à
   aucun CONTENU de page — il ne peut donc pas effacer par erreur quelque
   chose qui aurait fini par charger.

   Une seule exception, ajoutée après un signalement depuis un vrai
   téléphone : les textes d'ATTENTE (« Chargement… ») laissés derrière par
   une requête qui n'aboutira jamais. Ce ne sont pas du contenu, ce sont
   des promesses que la page ne tiendra pas ; et si la section finit par
   charger, elle réécrit sa zone par-dessus. */
(function () {
  'use strict';

  var CLE_BANDEAU = 'inkriseBandeauReseau';
  var affiche = false;

  function estSupabase(url) {
    try { return /supabase\.co\/(rest|storage|auth|functions)\//.test(String(url)); }
    catch (e) { return false; }
  }

  function bandeau() {
    var b = document.getElementById(CLE_BANDEAU);
    if (b) return b;
    // Le script est chargé dans <head> : sans <body>, rien à accrocher.
    if (!document.body) return null;
    b = document.createElement('div');
    b.id = CLE_BANDEAU;
    b.setAttribute('role', 'status');
    b.setAttribute('aria-live', 'polite');
    b.style.cssText = [
      'position:fixed', 'left:0', 'right:0', 'top:0', 'z-index:99999',
      'display:flex', 'gap:10px', 'align-items:center', 'justify-content:center',
      'flex-wrap:wrap', 'padding:10px 14px',
      'background:#7a2e2e', 'color:#fff',
      'font-family:inherit', 'font-size:.85rem', 'font-weight:600',
      'box-shadow:0 2px 10px rgba(0,0,0,.25)'
    ].join(';');
    document.body.appendChild(b);
    return b;
  }

  function montrer(texte, avecRechargement) {
    if (affiche) return;
    var b = bandeau();
    if (!b) return;
    affiche = true;
    b.textContent = '';
    var t = document.createElement('span');
    t.textContent = texte;
    b.appendChild(t);
    if (avecRechargement) {
      var bouton = document.createElement('button');
      bouton.type = 'button';
      bouton.textContent = '↻ Réessayer';
      bouton.style.cssText = [
        'background:#fff', 'color:#7a2e2e', 'border:0', 'border-radius:8px',
        'padding:5px 12px', 'font:inherit', 'font-weight:700', 'cursor:pointer'
      ].join(';');
      bouton.addEventListener('click', function () { window.location.reload(); });
      b.appendChild(bouton);
    }
  }

  /* Session expirée : recharger ne sert à rien, il faut se reconnecter —
     et revenir ensuite là où on était. */
  function montrerSession() {
    if (affiche) return;
    var b = bandeau();
    if (!b) return;
    affiche = true;
    b.textContent = '';
    var t = document.createElement('span');
    t.textContent = '🔑 Ta session a expiré.';
    b.appendChild(t);
    var lien = document.createElement('a');
    lien.textContent = 'Se reconnecter';
    lien.href = 'auth.html?next=' + encodeURIComponent(
      location.pathname.split('/').pop() + location.search);
    lien.style.cssText = [
      'background:#fff', 'color:#7a2e2e', 'border-radius:8px',
      'padding:5px 12px', 'font-weight:700', 'text-decoration:none'
    ].join(';');
    b.appendChild(lien);
  }

  function cacher() {
    affiche = false;
    var b = document.getElementById(CLE_BANDEAU);
    if (b) b.remove();
  }

  /* Le navigateur sait déjà qu'il est hors ligne : autant le dire tout de
     suite, sans attendre qu'une requête expire. */
  function surEtatReseau() {
    if (navigator.onLine === false) {
      montrer('📡 Tu es hors ligne. Les chapitres déjà téléchargés restent lisibles.', false);
    } else {
      cacher();
    }
  }
  window.addEventListener('offline', surEtatReseau);
  window.addEventListener('online', function () {
    cacher();
    montrer('✅ Connexion revenue.', true);
  });

  /* ── Les « Chargement… » qui ne finiront jamais ────────────────────
     Signalé depuis un vrai téléphone : le bandeau s'affichait bien, mais
     l'accueil gardait « Chargement… » sous deux sections, indéfiniment.
     Le garde-fou des dix secondes (inkrise-nav.js) ne couvrait pas cette
     page — sa liste de sélecteurs ne connaît pas ces emplacements-là.

     Ce module s'était interdit de toucher au contenu, pour ne jamais
     effacer ce qui aurait fini par arriver. La règle tient toujours : on
     ne remplace QUE le texte d'attente lui-même, et le jour où la section
     charge vraiment, la page réécrit sa zone par-dessus. Un texte
     d'attente qui ment n'est pas du contenu à protéger. */
  var ATTENTE = /^(chargement|chargement…|chargement\.\.\.|recherche en cours|patiente)/i;

  function taireLesAttentes() {
    var tous = document.querySelectorAll('div, span, p, td, li');
    for (var i = 0; i < tous.length; i++) {
      var e = tous[i];
      if (e.children.length) continue;                     // pas une feuille
      if (e.closest('#' + CLE_BANDEAU)) continue;          // pas notre bandeau
      var t = (e.textContent || '').trim();
      if (!t || t.length > 60 || !ATTENTE.test(t)) continue;
      if (!e.getBoundingClientRect().height) continue;     // pas à l'écran
      e.textContent = 'Indisponible — le serveur n\'a pas répondu.';
    }
  }

  /* Une seconde et demie après l'échec : le temps que les autres requêtes
     déjà parties se terminent, pour ne pas effacer une section qui était
     sur le point d'aboutir. */
  var balayagePose = false;
  function poserBalayage() {
    if (balayagePose) return;
    balayagePose = true;
    setTimeout(taireLesAttentes, 1500);
  }

  /* Requêtes vers Supabase : on n'intercepte rien, on observe le résultat
     et on laisse la promesse suivre son cours — le code appelant garde
     exactement le comportement qu'il avait. */
  var fetchOrigine = window.fetch;
  if (typeof fetchOrigine === 'function') {
    window.fetch = function (entree, options) {
      var url = (entree && entree.url) ? entree.url : entree;
      var p = fetchOrigine.apply(this, arguments);
      if (!estSupabase(url)) return p;

      /* Un serveur en pause ne refuse pas toujours la connexion : il
         l'accepte et ne répond jamais. La promesse ne rejette alors pas,
         et la page attend pour toujours. Vingt secondes : le pire cas
         mesuré sur une 3G au bord de la couverture est de 12,3 s
         (AUDIT-UX §7.24), la marge est confortable. */
      var repondu = false;
      setTimeout(function () {
        if (repondu) return;
        montrer('⚠️ Le serveur ne répond pas. Réessaie dans un instant.', true);
        poserBalayage();
      }, 20000);

      return p.then(function (reponse) {
        repondu = true;
        if (!reponse) return reponse;
        if (reponse.status >= 500) {
          montrer('⚠️ Le serveur ne répond pas correctement. Réessaie dans un instant.', true);
          poserBalayage();
        } else if (reponse.status === 401) {
          /* PostgREST ne renvoie 401 que sur un jeton invalide ou expiré :
             un simple refus de politique donne 200 avec zéro ligne, et un
             refus d'écriture donne 403. Une session expirée vidait donc
             les pages en silence — l'utilisateur croyait le site cassé. */
          montrerSession();
          poserBalayage();
        }
        return reponse;
      }, function (erreur) {
        repondu = true;
        montrer(navigator.onLine === false
          ? '📡 Tu es hors ligne. Les chapitres déjà téléchargés restent lisibles.'
          : '⚠️ Connexion au serveur impossible. Vérifie ta connexion internet.', true);
        poserBalayage();
        throw erreur;
      });
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', surEtatReseau);
  } else {
    surEtatReseau();
  }
})();
