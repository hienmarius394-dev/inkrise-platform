/* ═══ Réglages du site ═══
   Le seul fichier à éditer pour activer les notifications push et la
   mesure d'audience. Tout est désactivé tant qu'il reste vide : aucune
   de ces deux fonctions ne s'allume toute seule, et rien ne casse si tu
   n'y touches jamais.

   ⚠️ Ce fichier est PUBLIC (il part dans le navigateur). N'y mets que des
   valeurs publiques. La clé privée VAPID reste côté serveur, dans les
   secrets Supabase — jamais ici. */
(function () {

  /* ── Notifications push ─────────────────────────────────────────────
     Colle ici la clé PUBLIQUE VAPID. Pour la générer :

         npx web-push generate-vapid-keys

     Deux valeurs sortent. La « Public Key » va ici. La « Private Key »
     va dans Supabase → Edge Functions → Secrets, sous le nom
     VAPID_PRIVATE_KEY (voir NOTIFICATIONS_PUSH.md).

     Tant que cette chaîne est vide, la page Paramètres n'affiche pas
     d'interrupteur — plutôt qu'un bouton qui ne pourrait rien faire. */
  window.INKRISE_VAPID_PUBLIC = '';

  /* ── Mesure d'audience ──────────────────────────────────────────────
     Sans mesure, on décide à l'aveugle : impossible de savoir quelles
     pages servent, ni où les gens abandonnent.

     Deux outils sans cookie ni traçage publicitaire, cohérents avec la
     page Confidentialité qui promet de ne pas suivre les visiteurs :

       Plausible → domaine  : 'inkrise-platform.vercel.app'
                   script   : 'https://plausible.io/js/script.js'
       Umami     → domaine  : ton identifiant de site
                   script   : l'URL de ton script Umami

     Laisse vide pour ne rien charger du tout. */
  window.INKRISE_ANALYTICS = {
    script: '',
    domaine: ''
  };

  /* ── Connexion Google ───────────────────────────────────────────────
     Passe à `true` UNE FOIS que le fournisseur Google est activé dans
     Supabase → Authentication → Providers, avec l'URL de redirection du
     site enregistrée côté Google Cloud.

     Tant que c'est `false`, le bouton n'apparaît pas. Un bouton
     « Continuer avec Google » qui renvoie une erreur de configuration
     coûte plus cher que pas de bouton du tout : la personne croit que le
     site est cassé, et repart. */
  window.INKRISE_GOOGLE = false;

  /* Chargement différé et non bloquant : la mesure d'audience ne doit
     jamais retarder l'affichage de la page pour la personne qui lit. */
  var a = window.INKRISE_ANALYTICS;
  if (a && a.script && a.domaine) {
    window.addEventListener('load', function () {
      var s = document.createElement('script');
      s.defer = true;
      s.src = a.script;
      s.setAttribute('data-domain', a.domaine);
      document.head.appendChild(s);
    });
  }
})();
