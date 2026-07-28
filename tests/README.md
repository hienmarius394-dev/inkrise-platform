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

## Deux outils de diagnostic (hors suites)

```bash
node tests/outil-contraste.js   # relève tout texte sous le seuil de lisibilité
node tests/outil-chasse.js      # parcourt les 21 pages : erreurs JS, textes
                                # cassés, débordements, cibles tactiles trop
                                # petites, champs sans étiquette
```

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
