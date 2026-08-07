/* Compter une lecture, y compris sans compte.
   ─────────────────────────────────────────────────────────────────────
   Avant : le site insérait lui-même une ligne dans `vues`, et seulement
   pour les gens connectés — la politique de sécurité exige
   `user_id = auth.uid()`. Sur un site de lecture public, c'est
   l'essentiel du trafic qui n'était pas compté.

   Maintenant l'enregistrement passe par une fonction serveur. Ouvrir la
   table `vues` en écriture aux visiteurs anonymes aurait permis à
   n'importe qui d'y déverser autant de lignes qu'il veut.

   L'empreinte est un nombre tiré au hasard, rangé dans le stockage local
   du navigateur : pas d'adresse IP, pas d'empreinte matérielle, rien qui
   désigne une personne. Elle sert uniquement à ne pas compter dix fois le
   même appareil. Effacer les données du navigateur l'efface. */
(function () {
  'use strict';

  var CLE = 'inkrise_appareil';

  function empreinte() {
    try {
      var v = localStorage.getItem(CLE);
      if (v && v.length >= 16) return v;
      v = (crypto && crypto.randomUUID)
        ? crypto.randomUUID().replace(/-/g, '')
        : String(Date.now()) + Math.random().toString(36).slice(2).padEnd(16, '0');
      localStorage.setItem(CLE, v);
      return v;
    } catch (e) {
      /* Navigation privée stricte : pas de stockage, donc pas de mémoire
         d'un passage à l'autre. On rend tout de même une empreinte pour
         que la lecture soit comptée au moins une fois. */
      return 'ephemere' + Math.random().toString(36).slice(2).padEnd(16, '0');
    }
  }

  /* Le site est déployé dès la fusion, alors que la mise à jour de la base
     attend qu'on la lance à la main. Entre les deux, `enregistrer_vue`
     n'existe pas encore — PostgREST répond alors PGRST202. Plutôt que de
     ne plus rien compter du tout pendant cette fenêtre, on retombe sur
     l'ancien chemin, qui reste valide : il ne compte que les personnes
     connectées, mais c'est exactement ce que faisait le site avant. */
  const FONCTION_ABSENTE = e =>
    !!e && (e.code === 'PGRST202' ||
            /find the function|does not exist/i.test(e.message || ''));

  async function reserve(sb, mangaId) {
    try {
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;                       // l'ancien chemin exigeait un compte
      await sb.from('vues').upsert(
        { manga_id: Number(mangaId), user_id: session.user.id },
        { onConflict: 'manga_id,user_id', ignoreDuplicates: true }
      );
    } catch (e) { /* sans effet sur la lecture */ }
  }

  /* Volontairement silencieuse : un compteur de vues n'a aucune raison
     d'interrompre une lecture. Le serveur écarte de lui-même l'auteur qui
     relit son œuvre et les empreintes fantaisistes. */
  async function compter(sb, mangaId) {
    if (!sb || !mangaId) return;
    try {
      const { error } = await sb.rpc('enregistrer_vue', {
        p_manga_id: Number(mangaId),
        p_empreinte: empreinte()
      });
      if (FONCTION_ABSENTE(error)) await reserve(sb, mangaId);
    } catch (e) { /* sans effet sur la lecture */ }
  }

  window.inkriseVue = { compter: compter, empreinte: empreinte,
                        fonctionAbsente: FONCTION_ABSENTE };
})();
