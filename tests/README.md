# Tests

Ces suites pilotent le site dans un vrai navigateur (Playwright + Chromium)
avec les réponses Supabase simulées. Elles vérifient donc le comportement
réellement rendu à l'écran, pas la lecture du code — et elles n'ont besoin
d'aucun accès à la base de production.

## Lancer

```bash
npm install          # une seule fois
npm test             # toutes les suites
node tests/run.js lecteur    # une seule, par motif
```

Le navigateur est cherché automatiquement (`PLAYWRIGHT_BROWSERS_PATH`,
`/opt/pw-browsers`, `~/.cache/ms-playwright`). Pour en imposer un :

```bash
INKRISE_CHROME=/chemin/vers/chrome npm test
```

## Ce que couvre chaque suite

| Suite | Vérifie |
|---|---|
| `lecteur` | Écrans d'avant-lecture (âge, sens de lecture), modes vertical et horizontal, glissement du doigt dans le bon sens, bandeau de pages, repli si `age_recommande` manque au schéma |
| `createur` | Sens de lecture et classification corrigeables après publication, boutons d'aperçu, réglage de largeur en lecture verticale |
| `accessibilite` | Réordonnancement des chapitres au doigt et au clavier, cartes de sélection du contenu, menu latéral (état annoncé, focus, Échap) |
| `recherche` | Filtres genre/format/statut, tri, pagination « Voir plus », état vide dû aux filtres, contraste du texte réellement affiché |
| `communaute` | Temps réel : arrivée de contenu distant sans effacer la saisie en cours, lecture qui ne saute pas, écho différé et non perdu, repli périodique |
| `confirmation` | Boîte de confirmation partagée : action destructrice, saisie exigée pour supprimer un compte, Échap, focus rendu |
| `connexion` | Retour à la page voulue après connexion, et refus des destinations extérieures |
| `theme` | Thème clair/sombre/auto : réglage système suivi, choix mémorisé, script de thème synchrone en `<head>` (invariant anti-flash), et aucune zone restée claire sur 20 pages en sombre |
| `partage` | Feuille de partage native et ses replis ; `api/og.js` réellement exécuté — vrais titres, échappement, brouillon non divulgué, renvoi en cas de panne |
| `communaute-fil` | Fil des créateurs suivis et onglet Découvrir sans `?id=` : filtrage, classement par activité, quatre états vides, non-régression du mur d'un créateur |
| `avis-parametres` | Notes et avis sur les mangas (affichage, saisie, refus de noter sa propre œuvre), recommandations, page Paramètres, export RGPD, et effet réel du filtre 18+ sur les requêtes |
| `push` | Le service worker face à un push complet, vide ou illisible ; et la page Paramètres selon que la clé VAPID est configurée ou non |
| `pack` | Page d'un pack tutoriel : nom d'auteur réel, mention « paiement sécurisé » retirée quand rien n'est à payer, pas de formulaire d'avis sur son propre pack |
| `formations` | Onglet Formations du profil : créations et achats séparés, chemin direct vers l'édition d'un pack |
| `veille` | Écran maintenu allumé : quand le verrou est demandé, quand il ne l'est pas, et sa reprise au retour d'arrière-plan |
| `confort` | Plein écran et zoom au pincement — la transformation réellement appliquée, pas la présence du code |
| `double-page` | Deux planches côte à côte : sens de lecture (position mesurée à l'écran), pas de deux, zoom sur la paire entière, repli sous 900 px, nombre impair de planches |
| `moderation` | `admin.html` : ce qu'elle montre du contenu signalé, ce qu'elle envoie, ce qu'elle fait des réponses |
| `vues` | Comptage des lectures : ce que le navigateur envoie, quand, et son repli si la fonction serveur n'est pas encore déployée |
| `decouverte` | Rangée de créateurs qui mène quelque part, genres visibles et cliquables, adresses partageables |
| `lecture` | Onglet « Ma lecture » du profil : œuvres commencées et terminées, avis donnés, genres les plus lus, reprise |
| `inscription` | Case CGU jamais pré-cochée et bloquante, bouton Google affiché seulement si le fournisseur est configuré |

## Six outils de diagnostic (hors suites)

```bash
node tests/outil-invisible.js   # traque les défauts SILENCIEUX : liens morts,
                                # fonctions disparues, ids en double, contenu
                                # rogné sans erreur, colonnes absentes du
                                # schéma, jointures sans clé étrangère, menu
                                # en désaccord avec la session, pages orphelines
node tests/outil-rls.js         # confronte les politiques RLS aux écritures
                                # que le site tente vraiment (PostgreSQL réel)
node tests/outil-injection.js   # empoisonne chaque champ texte servi par
                                # Supabase et regarde si le navigateur en
                                # fait du balisage
node tests/outil-panne.js       # rejoue trois pannes (500, session expirée,
                                # réseau coupé) et vérifie que chaque page
                                # le dit à l'utilisateur
node tests/outil-contraste.js   # relève tout texte sous le seuil de lisibilité
INKRISE_THEME=sombre \
  node tests/outil-contraste.js   # le même relevé, en thème sombre
node tests/outil-chasse.js      # parcourt les pages : erreurs JS, textes
                                # cassés, débordements, cibles tactiles trop
                                # petites, champs sans étiquette
URLS=… MODES=auth,anon \
  node tests/_txt.js            # texte visible de chaque page, à relire
```

`outil-invisible.js` mérite un mot : chacun de ses contrôles vient d'un vrai
bug rencontré pendant l'audit — un qui ne plantait rien, n'affichait aucune
erreur, et passait donc sous le radar de tout le reste. Une redirection vers
une page supprimée, un `getElementById` sur un élément retiré, du contenu
rogné que `overflow-x: clip` cachait. Il a été éprouvé en y injectant
délibérément un défaut de chaque famille : toutes sont ressorties.

`outil-rls.js` est le seul à avoir besoin d'une vraie base : il monte un
PostgreSQL jetable, y charge `sql_a_executer.sql`, puis rejoue chaque geste
de l'interface sous l'identité qui convient. Deux pièges y ont déjà fait
crier au loup, tous deux corrigés dans l'outil :

- **RLS ne fait pas échouer un UPDATE interdit.** La clause `USING` filtre
  les lignes, la commande réussit, zéro ligne est touchée — et Supabase
  renvoie `error: null`. On compte donc les lignes affectées, pas les
  erreurs. C'est aussi ce que voit le navigateur : un code qui ne lit que
  `error` annonce un succès pour une opération qui n'a rien fait.
- **Compter les lignes existantes ne prouve pas qu'un déclencheur a tiré.**
  Les vérifications de notification comparent avant / après dans la même
  transaction.

Il se relit dans les deux sens : correctif appliqué, 41/41 ; correctif
retiré, six écarts ressortent.

`outil-injection.js` ne relit aucun gabarit : il sert des charges utiles à
la place des vraies données et cherche leurs traces dans le DOM rendu — une
balise `<inkrise-injection>` devenue élément, un attribut `x-inkrise-attr`
apparu, du code exécuté. Première version : tous les champs image à `null`,
donc aucun contexte d'attribut (`src`, `alt`, `style`) n'était éprouvé —
exactement là où l'échappement se rate. Les trois familles ont ensuite été
validées en cassant délibérément un échappement de chaque sorte.

`outil-panne.js` rejoue trois pannes sur chaque page. Deux réglages ont été
nécessaires pour qu'il dise vrai :

- « Chargement impossible » contient le mot « chargement » mais annonce
  justement la fin des opérations — le compter revenait à reprocher à une
  page d'avoir bien fait son travail.
- `offsetParent` vaut `null` sur un élément `position: fixed`, et le
  bandeau réseau l'est : il était donc jugé invisible alors qu'il occupait
  45 pixels de haut.

Quarante-deux combinaisons page × panne finissent par se disputer le
processeur : une page correcte se faisait dénoncer environ une fois sur
trois, jamais la même, alors qu'elle passait huit fois sur huit en
isolation. Toute page mise en cause est donc revérifiée avant d'être
signalée.

## Écrire une nouvelle suite

Le motif est toujours le même : un petit serveur statique sert le dépôt,
`ctx.route()` simule Supabase, puis on pilote la page et on vérifie ce qui
est **affiché**. Terminer par la ligne `N/N vérifications OK` — c'est elle
que le lanceur compte. Sortir en code non nul si quelque chose échoue.

Deux pièges rencontrés, à garder en tête :

- **Le total d'une requête paginée** ne traverse pas le CORS sans
  `Access-Control-Expose-Headers: Content-Range`. Sans cet en-tête, le
  compteur « X sur Y » paraît cassé alors que le site va bien.
- **Une feuille de style distante en attente** bloque l'exécution des
  scripts de la page. Les polices Google doivent être neutralisées, sinon
  les attentes à durée fixe échouent de façon aléatoire.
