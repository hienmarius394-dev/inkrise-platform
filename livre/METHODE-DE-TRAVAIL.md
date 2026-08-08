# Méthode de travail

Comment on écrit ce livre ensemble, session après session.

---

## Le principe

Tu n'as pas besoin de savoir écrire du Markdown, ni de gérer Git. Tu ouvres une
session, tu dis ce que tu veux, ça s'écrit dans les fichiers, et l'historique se
conserve tout seul.

Ce document existe pour une seule raison : **qu'une session qui démarre à froid
sache exactement où on en est.** Chaque nouvelle session commence par lire
`PLAN.md` (l'état des chapitres) et ce fichier (les décisions déjà prises).

---

## Les commandes utiles

Dis simplement, en français :

| Ce que tu veux | Ce que tu dis |
|---|---|
| Écrire un chapitre | « Écris le chapitre 6 sur les déclencheurs si-alors » |
| Revoir un chapitre | « Relis le chapitre 3, il est trop long, coupe 30 % » |
| Vérifier un fait | « Vérifie que la citation de Cuban est exacte » |
| Voir l'avancement | « Où on en est ? » |
| Exporter en PDF | « Sors-moi le PDF » (`bash livre/outils/export.sh pdf`) |
| Changer le plan | « Ajoute un chapitre sur le sommeil entre le 9 et le 10 » |

---

## Le cycle par chapitre

1. **Cadrage** — on fixe l'idée-force en une phrase. Si elle ne tient pas en une
   phrase, le chapitre n'est pas prêt à être écrit.
2. **Recherche** — si le chapitre s'appuie sur un cas réel ou une étude, la
   vérification se fait *avant* la rédaction, et le résultat va dans
   `recherche/`. Rien ne rentre dans le manuscrit sans être passé par là.
3. **Rédaction** — premier jet complet, jamais partiel.
4. **Coupe** — deuxième passage, uniquement pour retirer. Un chapitre gagne
   presque toujours à perdre 20 %.
5. **Mise à jour du `PLAN.md`** — le statut passe à ✅.

---

## Le gabarit d'un chapitre

Tous les chapitres suivent la même structure. C'est ce qui fait qu'un manuel se
lit comme un outil et pas comme un essai.

```markdown
# Chapitre N — Titre

> **L'idée en une phrase :** …

## Le problème
Ce que le lecteur vit concrètement. Écrit de façon reconnaissable.

## Le mécanisme
Ce qui se passe réellement. C'est ici que va la matière vérifiée.

## Le protocole
Étapes numérotées. Exécutables. Aucune étape floue.

## Les erreurs classiques
Comment on rate le protocole en croyant l'appliquer.

## Cas validé
Une personne, une application concrète, des faits vérifiés.

## L'exercice
Ce que le lecteur fait dans les 24 h. Durée précise.

---
**Ce que tu sais maintenant :** …
**Ce qui vient :** …
```

---

## Décisions éditoriales déjà prises

Ne pas les rouvrir sans raison — et surtout pas en cours de rédaction.

- **Le livre ne parle pas de l'auteur.** Pas d'autobiographie, pas de récit
  personnel en fil rouge. C'est un manuel de méthode. Les exemples viennent de
  cas publics et vérifiables.
- **Tutoiement**, ton direct, phrases courtes.
- **Format court et dense — décision de l'auteur.** ~28 000 mots, ~110 pages.
  Une information par phrase. Pas d'histoires qui servent d'illustration
  décorative : un cas n'entre que s'il apporte un mécanisme. En cas de doute
  sur un paragraphe, il saute.
- **Trois registres explicitement distingués** : validé par la recherche /
  heuristique de terrain / position de l'auteur. Le lecteur doit toujours
  savoir où il est.
- **Aucun fait sur une personne réelle sans source.** À défaut : `[À VÉRIFIER]`,
  et ça ne part pas en publication.
- **Chaque chapitre finit par une action exécutable.** Sinon on réécrit.
- **Aucune image décorative — décision de l'auteur.** Pas de photos
  « inspirantes » : un livre qui démontre que la motivation ne produit rien ne
  peut pas s'illustrer comme un livre de motivation. Les seuls visuels sont des
  schémas fonctionnels qui expliquent un mécanisme (`outils/diagrammes.py`).
  Un schéma qui ne fait qu'illustrer joliment est retiré.
- **La science honnête est un argument de vente.** L'*ego depletion* n'a pas
  survécu aux réplications : on le dit, et on s'en sert. Ne jamais citer une
  étude fragile comme si elle était établie — un lecteur qui vérifie et trouve
  une erreur ne revient pas.

---

## Ce qui manque encore et qu'il faudra trancher

- [ ] **Titre définitif** — « Dompter son cerveau » est un titre de travail.
- [ ] **Public prioritaire** — entrepreneurs / sportifs / étudiants / large ?
      Ça change le choix des exemples, pas la méthode.
- [ ] **Voie de publication** — auto-édition (KDP), éditeur classique, ou
      diffusion sur Inkrise. Ça détermine le format d'export final.
- [x] ~~**Cas à ajouter**~~ — réglé. Quatre cas volontairement dissemblables :
      Goggins, Cuban, Murakami, Morrison. Un cinquième reste souhaitable, hors
      sphère occidentale et hors écriture/sport.

---

## Où va quoi

| Dossier | Contenu |
|---|---|
| `manuscrit/` | Le livre. Un fichier par chapitre, préfixé du numéro. |
| `recherche/` | Fiches de cas, notes scientifiques, `SOURCES.md`. |
| `outils/` | Composition du PDF, schémas, statistiques. |
| `PLAN.md` | L'architecture et l'état d'avancement. La source de vérité. |
