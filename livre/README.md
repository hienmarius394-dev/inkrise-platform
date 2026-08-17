# Dompter son cerveau

**Manuel pratique : les techniques pour ne plus négocier avec son cerveau et réaliser son rêve.**

---

## Ce qu'est ce livre

Un manuel de méthode. Pas une autobiographie, pas un recueil de citations motivantes.

Chaque chapitre donne :
- un mécanisme (ce qui se passe réellement dans la tête),
- un protocole (ce qu'il faut faire, étape par étape),
- les erreurs classiques (comment on rate le protocole),
- un cas validé (quelqu'un qui l'a appliqué à haute dose : Goggins, Cuban, etc.),
- un exercice à exécuter.

## La thèse

Le cerveau ne dit presque jamais « non ». Il **négocie**.

Il ne t'interdit pas d'aller courir : il propose « demain, tu seras plus frais ».
Il ne t'interdit pas de travailler : il propose « d'abord, il faut trouver la bonne méthode ».

Tu perds toujours cette négociation, parce que ton cerveau joue à domicile : c'est lui qui écrit les arguments *et* qui décide s'ils sont convaincants.

Conclusion opérationnelle du livre : **on ne gagne pas la négociation, on la supprime.** On ne discipline pas un cerveau par la force de volonté — on le prive de l'occasion de négocier.

## Structure du dépôt

```
livre/
├── PLAN.md                  Architecture complète + statut de chaque chapitre
├── METHODE-DE-TRAVAIL.md    Comment on écrit ce livre ensemble
├── manuscrit/               Le livre lui-même, un fichier par chapitre
├── recherche/               Fiches de cas, science, sources vérifiées
├── fiches/                  Applications personnelles, une page à imprimer
└── outils/                  Composition du PDF, schémas, statistiques
```

## Démarrage rapide

```bash
# Voir où on en est
cat livre/PLAN.md

# Compter les mots du manuscrit
bash livre/outils/statistiques.sh

# Composer le livre en PDF
bash livre/outils/export.sh pdf

# Composer les fiches d'application (une page chacune)
python3 livre/fiches/construire-fiches.py
```

## Statut

Projet en cours d'écriture. Voir `PLAN.md` pour l'état chapitre par chapitre.
