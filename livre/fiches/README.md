# Fiches

Systèmes personnels dérivés de la méthode du livre. **Ce n'est pas du contenu du
manuscrit** — ce sont des applications à un cas réel, faites pour être imprimées
et affichées là où se produit le déclencheur.

## Règle de format

**Une fiche tient sur une page.** Sans exception.

Une fiche qui déborde n'est plus consultable d'un coup d'œil au moment où on en
a besoin, donc elle ne sert plus à rien. Le script de composition échoue si une
fiche dépasse une page — c'est volontaire.

## Ce que contient une fiche

Toujours les mêmes blocs, dans cet ordre :

1. **La règle** — déclencheur filmable, action binaire et minimale (ch. 5, 6).
2. **Le plancher** — le minimum, ses conditions d'activation, la clause des deux
   jours consécutifs (ch. 9).
3. **Les plans si-alors** — un lancement, des obstacles visant nommément les voix
   dominantes, un repli (ch. 3, 6).
4. **La mesure** — ce qui rend visible un bénéfice invisible (ch. 18).
5. **Le suivi du mois** — une case par jour, et le seuil qui déclenche une
   révision de la règle.

## Fiches existantes

| Fiche | Pour quoi | Chapitres appliqués |
|---|---|---|
| `contrat-du-soir` | Production de contenu : le bloc du soir qui alimente le matin | 5, 6, 9, 17, 18 |

## Composer les PDF

```bash
python3 livre/fiches/construire-fiches.py
```

Chaque `*.html` du dossier devient un `*.pdf` du même nom. Le script signale
toute fiche qui déborde sur une seconde page.

## Écrire une nouvelle fiche

Pars d'une copie de `contrat-du-soir.html` : la feuille de style y est intégrée
et reprend la charte du livre (Charter pour le texte, DejaVu Sans pour les
titres, un seul accent rouille qui tient aussi en niveaux de gris).

Deux erreurs à éviter, ce sont les mêmes que dans le livre :

- **Une action non binaire.** « Faire de la recherche » n'est pas une tâche,
  c'est une catégorie — elle ne peut être ni finie ni ratée, donc elle ne sera
  pas commencée.
- **Un déclencheur qui est une période.** « Le soir » s'étire jusqu'à minuit
  puis disparaît. Il faut un événement qu'une caméra pourrait filmer.
