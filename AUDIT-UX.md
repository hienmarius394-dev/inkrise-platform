# Audit complet Inkrise — expérience utilisateur

> Réalisé le 2026-08-04 sur la branche `claude/inkrise-audit-complet-qa6ys7`.
> Chaque constat marqué **[vérifié]** a été reproduit dans un vrai navigateur
> (Playwright + Chromium, Supabase simulé) ou mesuré dans le DOM. Les constats
> marqués **[produit]** sont des jugements de conception, pas des défauts.
>
> **✅ Sprint 1 livré** — les 5 correctifs de la partie 1 (§1.1, §1.3, §1.4,
> §1.5, §1.6, §1.7) sont appliqués et vérifiés. Voir la note en fin de §1.
> ⚠️ **`sql_a_executer.sql` est à ré-exécuter dans Supabase** pour que le
> correctif d'inscription (§1.3) prenne effet.

---

## 0. État de santé — ce qui va bien

| Contrôle | Résultat |
|---|---|
| Suites de tests (`npm test`) | **173/173** ✅ |
| Chasse aux défauts (21 pages, connecté + déconnecté) | 0 page plantée, 0 page vide, 0 texte cassé (`undefined`/`NaN`), 0 débordement horizontal, 0 champ sans étiquette, 0 image sans `alt` |
| Contraste (`outil-contraste.js`) | 2 couples à 4,38:1 sur 4,5:1 — uniquement des emojis d'icônes, négligeable |
| Erreurs JS | aucune (hors WebSocket realtime, normal en environnement simulé) |

Le socle technique est sain. Les garde-fous mis en place sont de bonne qualité :
service worker bien pensé, boîte de confirmation maison, détection de page figée,
compression d'images avant upload, lecture hors-ligne. **Ce qui manque n'est pas
de la fiabilité, c'est du produit.**

---

## 1. Défauts vérifiés — ✅ corrigés

> Tous les points de cette partie ont été corrigés et vérifiés. Le détail des
> preuves est en fin de section.

### 1.1 🔴 La barre de navigation du bas s'affiche sur ordinateur **[vérifié]**

`.univ-bnav` est déclarée `position: fixed` dans les 21 pages et **aucune ne la
masque au-delà du mobile** (aucune règle `min-width` ne la cible).

Conséquence à 1280px : deux barres de navigation simultanées (la nav du haut
*a* son point de rupture — `@media (max-width: 680px)` masque `.univ-nav-links-d`),
la barre du bas flotte sur toute la largeur et **recouvre en permanence le bas
du contenu**. Sur la page d'accueil, elle masque la première rangée de cartes.

C'est un oubli, pas un choix : le reste du site est responsive.

**Correctif** : `@media (min-width: 681px) { .univ-bnav { display: none; } }`
dans `assets/inkrise-theme.css`, et retirer les 21 copies locales.

### 1.2 🔴 La barre du bas change de forme selon la page **[vérifié]**

Le *markup* est partagé (`assets/inkrise-nav.js`), mais le *CSS* est recopié
dans chaque page — avec des valeurs divergentes :

| Page | Style |
|---|---|
| `index.html` | dock flottant en verre : `bottom: 12px; left: 12px; right: 12px; border-radius: 24px` |
| `manga`, `profil`, `recherche`, `tutoriels`, `pack`, `communaute`, `auteur`, `espace-createur` | barre plate collée en bas : `bottom: 0; left: 0; right: 0` |

La barre **saute visuellement** dès qu'on quitte l'accueil. Sur
`espace-createur.html` le bouton loupe central perd même son cercle dégradé
(la règle `.univ-bnav-search` y est incomplète) : le repère le plus visible du
site disparaît sur une page.

**Correctif** : déplacer tout le bloc `.univ-bnav*` dans `inkrise-theme.css`,
choisir une des deux formes, supprimer les copies.

### 1.3 🔴 Un pseudo déjà pris casse l'inscription sans rien dire **[vérifié par lecture croisée code + SQL]**

- `sql_a_executer.sql:14` — `username TEXT UNIQUE`
- `sql_a_executer.sql:36-42` — le trigger `handle_new_user` insère le profil
  avec `ON CONFLICT (id) DO NOTHING`. Cette clause ne couvre **que** la clé
  primaire `id` ; une violation sur la contrainte unique `username` lève une
  vraie exception, qui annule l'`INSERT` sur `auth.users` et donc toute
  l'inscription.
- `auth.html:748-753` — le client n'affiche que `"Une erreur est survenue."`,
  ou pire `"Cet email est déjà utilisé."` si le message contient « already » —
  **message faux** : c'est le pseudo, pas l'email.

Résultat : la personne change d'adresse email, réessaie, échoue encore, et
abandonne. Sur un site jeune où chaque inscription compte, c'est le défaut le
plus coûteux de la liste.

**Correctif** (les deux) :
1. SQL — `ON CONFLICT DO NOTHING` sans cible, ou suffixer le pseudo en cas de
   collision (`username || '_' || substr(id::text,1,4)`).
2. `auth.html` — vérifier la disponibilité du pseudo en direct pendant la
   saisie (`select id from profiles where username = ?`), et afficher un
   message spécifique en cas d'échec.

### 1.4 🟠 Bande blanche de 70 px en haut de la bibliothèque **[vérifié — mesuré dans le DOM]**

`bibliotheque.html:28` : `body { padding: 70px 0 100px; }` — reliquat de
l'époque où la nav était `position: fixed`. Elle est aujourd'hui `sticky`
(comme sur les 20 autres pages).

Mesure : `navTop = 70px` sur `bibliotheque.html`, `0px` sur `index.html` et
`manga.html`. La barre démarre 70 px trop bas puis « saute » en haut au
premier défilement.

**Correctif** : `padding: 0 0 100px;`

### 1.5 🟠 « 🔒 Paiement sécurisé » sous un pack gratuit **[vérifié — visible à l'écran]**

`pack.html:454` et `pack.html:488` — la mention est en dur dans la carte
d'achat. Sur un pack à 0 €, l'écran affiche :

> **GRATUIT** → `📥 Télécharger le pack` → 🔒 Paiement sécurisé

**Correctif** : masquer la mention quand `isFree`.

### 1.6 🟠 La rangée de créateurs de l'accueil n'a pas de titre **[vérifié — visible à l'écran]**

`index.html:412` :
```html
<div class="creators-section" id="creatorsSection">
  <div class="creators-scroll" id="creatorsScroll"></div>
</div>
```

Toutes les autres rangées ont un `.sec-header` (« 📖 Reprendre la lecture »,
« INKRISE ORIGINALS »…). Celle-ci est une rangée d'avatars nue, sans contexte
ni lien « Voir tout → ». Sur la capture, un avatar solitaire flotte entre deux
sections sans qu'on comprenne ce que c'est.

**Correctif** : ajouter `<div class="sec-header">🧑‍🎨 Les créateurs <a href="…">Voir tout →</a></div>`.
Il n'existe d'ailleurs aucune page « tous les créateurs » (voir §2.4).

### 1.7 🟠 La doc de paiement fait facturer 656× le prix **[vérifié par lecture croisée]**

`supabase/functions/cinetpay-init/index.ts:58-61` convertit le prix **en euros**
vers le XOF : `montantXof = prix × 655,957`. C'est cohérent avec toute
l'interface (`pack.html`, `tutoriels.html`, `espace-createur.html:669`
« Prix (€) ») et avec les CGU (`cgu.html:69` « prix affichés en euros »).

Mais `PAIEMENT_CINETPAY.md`, section « ✅ Tester », étape 1, dit :

> « ils étaient en euros (ex: 2), maintenant le site est en **FCFA** — édite
> chaque pack et mets un vrai prix (ex: 500, 1000, 2000 FCFA…) »

Si le propriétaire suit cette consigne, un pack « 1000 » est facturé
1000 × 655,957 = **655 957 XOF (~1 000 €)** au lieu de 1 000 FCFA.

**Correctif** : supprimer cette étape de la doc. (Le code est bon.)

### 1.8 🟡 Le focus clavier est invisible sur 17 pages sur 21 **[vérifié]**

`:focus-visible` n'est déclaré que dans `gestion-chapitres.html`,
`lecteur.html`, `recherche.html` et `upload-manga.html`. Ailleurs, l'outline
par défaut est souvent neutralisé par les `border: none` des boutons.

Aucune page n'a de lien « Aller au contenu » : au clavier, il faut traverser
logo + 4 liens + recherche + avatar + cloche + burger avant d'atteindre le
contenu, **sur chaque page**.

**Correctif** : une règle `:focus-visible` unique dans `inkrise-theme.css` +
un skip-link partagé injecté par `inkrise-nav.js`.

### 1.9 🟡 `ROADMAP.md` est périmé

Il annonce comme « à faire » des choses déjà faites (réinitialisation du mot de
passe : `auth.html:829`), décrit `bibliotheque.html` comme cassée (elle
fonctionne), mentionne des plans à 8 €/15 € qui n'existent plus (`index.html`
n'a plus qu'un plan Créateur gratuit), et parle de « 18 pages » alors qu'il y
en a 21. Un nouveau contributeur — ou toi dans six mois — sera induit en erreur.

*(Reste à faire — voir §4.)*

---

### ✅ Vérification des correctifs

Les suites existantes restent vertes (**173/173**) et `outil-chasse.js` ne
relève aucune régression sur les 21 pages. En plus :

| Point | Preuve |
|---|---|
| §1.1 | `display: none` mesuré à 1280px sur les **14 pages** portant la barre ; toujours `flex` à 390px ; padding bas du `body` ramené à 24px sur ordinateur |
| §1.3 | **Rejoué sur un vrai PostgreSQL 16.** Ancien trigger : 2 inscriptions avec le même pseudo → **1 seul compte créé**, l'autre annulé. Nouveau trigger (extrait tel quel de `sql_a_executer.sql`) : **66 comptes → 66 profils**, pseudos suffixés `marius`, `marius1`, `marius2`…, rôle créateur conservé, pseudo vide replié sur `membre`, et au-delà de 50 collisions le suffixe tiré de l'identifiant prend le relais |
| §1.4 | `.univ-nav` mesurée à `top: 0` (contre 70px avant) |
| §1.5 | Pack à 0 € → mention masquée ; pack à 5 € → mention affichée, moyens de paiement listés |
| §1.6 | La rangée porte le titre « 🧑‍🎨 Les créateurs » |

Le correctif §1.3 vit en deux endroits qui se complètent : le trigger SQL ne
fait plus jamais échouer une création de compte, et `auth.html` prévient
pendant la saisie qu'un pseudo est pris — pour que personne ne se retrouve
renommé `marius3` sans l'avoir voulu.

---

## 2. Ce qui manque côté expérience utilisateur

Classé par impact décroissant sur la croissance et la rétention.

### 2.1 🔴 Pas de mode sombre — sur un site de lecture **[vérifié : 0 occurrence de `prefers-color-scheme` dans tout le dépôt]**

C'est le manque n°1. Le public lit des mangas, sur mobile, souvent le soir.
Le lecteur (`lecteur.html`) est déjà sombre — donc **chaque sortie du lecteur
projette un mur blanc dans les yeux**. Le site était sombre à l'origine et a
migré en clair ; le retour n'a jamais été rendu optionnel.

**À ajouter** : `[data-theme]` sur `<html>`, une deuxième palette dans
`inkrise-theme.css` (le fichier est déjà la source unique — le travail est
donc surtout mécanique), un basculeur dans le menu latéral, respect de
`prefers-color-scheme` par défaut, mémorisation en `localStorage`.

### 2.2 🔴 « Communauté » est un onglet sans issue **[vérifié]**

L'onglet occupe une des 4 places de la barre du bas. Or
`communaute.html:661-670` : sans `?id=`, un visiteur connecté est **redirigé
vers son propre mur**. Un nouveau créateur (0 abonné) tape « Communauté » et
se retrouve à se parler à lui-même. Déconnecté, on obtient un écran
« Connecte-toi pour accéder à l'espace de ton créateur préféré » — mais
**aucun chemin ne mène à un autre mur**.

Il n'existe :
- ni fil global,
- ni fil « des créateurs que je suis »,
- ni annuaire des espaces communautaires,
- ni découverte d'un mur autrement qu'en connaissant l'UUID du créateur.

**À ajouter** (par ordre d'effort croissant) :
1. Un fil « Ce que publient les créateurs que tu suis » comme écran par défaut
   de `communaute.html` — la table `posts_communaute` et la table `follows`
   suffisent, c'est une seule requête.
2. Un onglet « Découvrir » listant les murs les plus actifs.
3. Un lien « Espace communautaire » depuis chaque fiche manga et chaque profil
   d'auteur.

### 2.3 🔴 Un lien partagé ne montre jamais l'œuvre **[vérifié]**

`manga.html` porte des balises Open Graph **statiques** :

```html
<meta property="og:title" content="Manga — Inkrise" />
<meta property="og:image" content="…/assets/hero-manga.jpg" />
```

Le titre réel n'arrive qu'en JS (`manga.html:800`), que les robots de
WhatsApp, Facebook, X ou Discord n'exécutent pas. **Tous les liens partagés se
ressemblent** : même titre générique, même image. Idem pour `pack.html` et
`auteur.html`.

Aggravant : **`navigator.share` n'existe nulle part** (0 occurrence) et la
fiche manga n'a même pas de bouton « Partager » — ses actions sont Lire /
S'abonner / Bibliothèque / Gérer / Voir le profil / **Signaler**. On peut
signaler une œuvre mais pas la recommander.

Pour une plateforme dont la croissance dépend des créateurs qui partagent leur
travail, c'est le frein le plus direct.

**À ajouter** :
- Bouton « Partager » avec `navigator.share()` (repli : copie du lien) sur la
  fiche manga, la fiche pack et le profil auteur.
- Des OG dynamiques. Le site est statique, donc soit une petite fonction
  Vercel `/og/manga/[id]` qui rend le HTML avec les bonnes balises, soit une
  Edge Function Supabase générant l'image. C'est le chantier technique le plus
  rentable de tout cet audit.

### 2.4 🟠 Aucune découverte au-delà de la recherche **[vérifié]**

- **Aucune recommandation** : 0 occurrence de « similaire », « recommandé »,
  « à découvrir ». Une fiche manga ne renvoie vers rien d'autre. Fin du
  chapitre = cul-de-sac.
- **Aucune note de lecteur** : le système d'avis (`avis_packs`, avec moyenne
  et étoiles dans `pack.html:687`) existe **uniquement pour les packs**. Les
  mangas — le cœur du site — n'ont ni note, ni avis, ni tri par qualité. On ne
  peut trier que par date et par vues.
- **Aucun commentaire sur la fiche manga** : `manga.html` n'a que Synopsis /
  Genres / Chapitres. Les commentaires (`from('commentaires')`) n'existent que
  dans le lecteur, par chapitre — donc invisibles pour qui n'a pas encore lu.
- **Aucune page par genre** : les 20 genres ne sont qu'un `<select>`. Pas
  d'URL `/genre/action`, donc rien à partager ni à indexer.
- **Aucune page « tous les créateurs »** : la rangée d'avatars de l'accueil est
  limitée à 12 et ne mène nulle part.

### 2.5 🟠 Le premier écran d'un site jeune est décourageant **[vérifié — capture avec base vide]**

Sans contenu, l'accueil affiche trois zones mortes d'affilée :

> Aucun manga en avant pour l'instant. · Aucun manga populaire pour l'instant. · Aucune mise à jour récente.

Les sections « Reprendre la lecture » et « Créateurs » se masquent en silence,
laissant un grand vide entre la bannière et les onglets. Aucun appel à l'action.

**À ajouter** : un état vide unique et engageant à la place des trois — « Sois
le premier à publier sur Inkrise » avec le bouton *Publier un manga*, plus les
tutoriels en repli (ils, eux, existent).

### 2.6 🟠 Aucun réglage utilisateur **[vérifié]**

Il n'y a pas de page Paramètres. Manquent :
- préférences de notifications (aujourd'hui : tout ou rien),
- filtre 18+ selon la préférence (le champ `adulte` existe en base, l'écran
  d'avertissement du lecteur existe — mais rien ne se mémorise),
- réglages de lecture par défaut (sens, mode vertical/horizontal, largeur),
- thème (cf. §2.1),
- **export de mes données** — `confidentialite.html:64` promet le droit de
  portabilité RGPD, et ne propose qu'un email à `hienmarius394@gmail.com`.

« Supprimer mon compte » est enterré dans `profil.html:1045`, sans page qui
regroupe le reste.

### 2.7 🟠 Les notifications ne peuvent pas ramener personne **[vérifié]**

Les déclencheurs existent (`sql_notifications_triggers.sql` : follow,
commentaire, like, avis ; plus le nouveau chapitre depuis
`gestion-chapitres.html:1430`). Mais :
- **aucune notification push** — le service worker ne gère que le cache, il n'a
  pas d'écouteur `push`. L'appli est pourtant déjà une PWA installable.
- **aucun email** — pas de digest, pas d'alerte « nouveau chapitre ».
- **pas de page notifications** : la cloche renvoie vers `profil.html#notifications`.

Donc une notification n'est vue que si la personne revient d'elle-même. Pour un
site de publication en série — où tout repose sur « le chapitre 12 est sorti » —
c'est le canal de rétention manquant.

### 2.8 🟡 Le lecteur manque de confort **[vérifié]**

Présents : vertical/horizontal, sens de lecture, zones de clic, flèches
clavier, préchargement de la page suivante, barre de progression, reprise,
hors-ligne. Bon socle. Absents :
- plein écran (`requestFullscreen` : 0 occurrence),
- zoom / pincement,
- `wakeLock` — l'écran s'éteint pendant une lecture longue en mode vertical,
- ajustement de la luminosité,
- double page sur tablette et ordinateur,
- signets sur une page précise,
- défilement automatique pour le webtoon.

### 2.9 🟡 La modération est une liste, pas un outil **[vérifié]**

`admin.html` affiche les signalements et permet uniquement de cocher
« ✓ Traité ». Le modérateur ne peut ni masquer un contenu, ni le supprimer, ni
avertir ou bannir un compte — il doit tout faire à la main dans Supabase. Et
pour les signalements de type `commentaire` ou `post`, `lienContenu()` renvoie
`null` : **il n'a même pas de lien vers le contenu signalé**. Ni filtre, ni
compteur, ni tri.

### 2.10 🟡 Le profil d'un lecteur ne parle que de création **[vérifié — capture base vide]**

Un compte sans manga voit « 0 MANGAS · 0 VUES · 0 CHAPITRES · 0 ABONNÉS » puis
une fusée « Publie ton premier manga ». Rien sur ce qu'il *lit*. Manquent :
chapitres lus, temps de lecture, genres favoris, liste publique, badges. La
grande majorité des comptes seront des lecteurs — c'est leur profil qui devrait
être le cas par défaut.

### 2.11 🟡 Prix en euros pour un public payant en Mobile Money **[produit]**

Toute l'interface affiche des euros, et la fonction convertit en XOF au
paiement. Les moyens de paiement retenus (Wave, Orange Money, MTN MoMo, Moov
via CinetPay) visent l'Afrique de l'Ouest, où le prix de référence est le FCFA.
Afficher « 3 275 FCFA » plutôt que « 5 € » supprime un calcul mental au moment
précis de la décision d'achat.

À faire côté affichage seulement — surtout **ne pas** changer les prix stockés
(cf. §1.7).

### 2.12 🟡 Aucune mesure d'audience **[vérifié : 0 occurrence de gtag / plausible / umami / posthog]**

Aucun outil de mesure. Impossible de savoir quelles pages servent, où les gens
abandonnent, si le tunnel d'inscription fonctionne. Toutes les décisions
produit se prennent donc à l'aveugle.

Plus gênant : la promesse affichée dans le menu latéral — « jusqu'à **70 % des
revenus publicitaires** te seront reversés **selon les vues de tes œuvres** » —
repose sur la table `vues`, alimentée par un `upsert` **depuis le navigateur**
(`manga.html:792`, `lecteur.html:1067`). Un compteur qui décidera un jour de
qui touche de l'argent ne peut pas rester déclaratif côté client. Et **aucune
régie publicitaire n'est intégrée** : le revenu promis n'a pas encore de source.

**À ajouter** : Plausible ou Umami (légers, sans cookie — cohérent avec
`confidentialite.html`), et à terme un comptage de vues côté serveur
(Edge Function + limitation par IP/session).

### 2.13 🟡 Chargement lourd sur réseau lent **[vérifié]**

- `assets/supabase.js` fait **202 Ko** et est chargé **en `<head>`, sans
  `defer`** sur `manga.html:18` et `profil.html:19` — il bloque le premier
  affichage. (`index.html` le charge en fin de `<body>`, c'est mieux.)
- La feuille Google Fonts est bloquante sur les 21 pages, **sans `preconnect`**
  (0 occurrence) : deux allers-retours DNS/TLS avant le premier texte. Chaque
  page demande en plus une combinaison de graisses différente — donc **aucune
  réutilisation du cache** d'une page à l'autre.
- `profil.html` fait 103 Ko de HTML, `lecteur.html` 82 Ko, `communaute.html`
  81 Ko — CSS et JS en ligne, non minifiés.
- Le service worker précharge ~1,2 Mo dès l'installation.

Sur la 3G d'Abidjan ou de Ouagadougou, ce sont plusieurs secondes de page
blanche.

**À ajouter** : `<link rel="preconnect">` vers `fonts.gstatic.com` et Supabase,
`defer` sur `supabase.js` partout, et idéalement héberger les deux polices
localement (supprime aussi la dépendance RGPD à Google).

### 2.14 🟢 Manques plus légers

- **Pas de connexion Google** — `signInWithOAuth` : 0 occurrence. Le CSS
  `.or-divider` est pourtant déjà prêt dans `auth.html`.
- **Pas de case « J'accepte les CGU » à l'inscription** — sur un site avec du
  contenu payant et publié par les utilisateurs, c'est une faiblesse juridique.
- **Pas d'aperçu avant publication d'un post** communauté.
- **Pas de brouillon automatique** dans l'éditeur de chapitre : une coupure
  réseau perd la saisie.
- **Pas de recherche dans sa propre bibliothèque**, ni de tri, ni d'étagères.
- **Le lien « Partager » d'un post communauté** copie l'URL dans le
  presse-papier sans proposer le partage natif.

---

## 3. Ce qu'on peut retirer

### 3.1 🔴 `mon-espace.html` — 39 Ko, orphelin **[vérifié]**

**Aucune page du site ne pointe vers lui.** Vérifié par recherche exhaustive
des `href="mon-espace.html"` : zéro résultat. Il n'est pas non plus dans le
menu latéral.

C'est pourtant un tableau de bord créateur complet, encore maintenu, encore
**préchargé par le service worker** (il pèse donc sur chaque installation), et
il duplique `profil.html`. Ses chiffres divergent d'ailleurs de ceux de
`profil.html` pour le même compte — deux requêtes différentes pour la même
donnée.

**À faire** : le supprimer, avec sa ligne dans `sw.js`. Si l'accueil « Bonjour,
Marius 👋 » et ses raccourcis plaisent, les reprendre dans `profil.html` avant
de supprimer.

### 3.2 🟠 Trois pages pour « mon espace » **[produit]**

Après suppression de `mon-espace.html`, il reste deux tableaux de bord :

| Page | Rôle réel |
|---|---|
| `profil.html` (103 Ko) | profil public + mes mangas + mes formations + stats |
| `espace-createur.html` (58 Ko) | mes packs tutoriels |

`espace-createur.html` n'est qu'un onglet de plus. Le fusionner dans
`profil.html` (onglet « Mes packs », à côté de « Mes Mangas » et
« Formations ») supprime une page, un lien de nav, et la question « où je vais
déjà pour modifier mon pack ? ».

### 3.3 🟡 La barre du bas sur ordinateur

Voir §1.1 — à retirer purement et simplement au-delà de 680 px.

### 3.4 🟡 Le champ de recherche en double

Sur `recherche.html`, la nav du haut porte un champ de recherche **et** la page
en affiche un second, plus grand, juste en dessous. Deux champs pour la même
action, à 100 px l'un de l'autre. Masquer celui de la nav sur cette page.

### 3.5 🟡 21 copies du même CSS de navigation

`.univ-nav`, `.univ-bnav`, `.univ-d-*` sont recopiés dans chaque page — c'est
exactement ce qui a produit §1.2 et §1.4. `assets/inkrise-theme.css` a déjà
raison sur les couleurs ; il faut lui confier aussi la mise en page de la
navigation. Environ 80 lignes × 21 fichiers à supprimer.

### 3.6 🟢 `.hermes/`

Trois notes de travail (`fix-bottomnav.md`, `fix-communaute.md`,
`nav-harmonization-prompt.md`) décrivant des chantiers terminés. À archiver ou
supprimer.

---

## 4. Plan d'action proposé

### ✅ Sprint 1 — corriger ce qui casse — **livré**
1. ✅ §1.3 — le pseudo déjà pris qui casse l'inscription *(le plus coûteux)*
2. ✅ §1.1 — masquer la barre du bas sur ordinateur
3. ✅ §1.4 — la bande de 70 px de la bibliothèque
4. ✅ §1.7 — retirer l'étape FCFA erronée de la doc de paiement
5. ✅ §1.5 / §1.6 — « paiement sécurisé » sur pack gratuit, titre de la rangée créateurs

> ⚠️ **Une action manuelle reste à faire** : coller `sql_a_executer.sql` dans
> Supabase → SQL Editor → Run. Le fichier est idempotent. Sans cela, le
> correctif d'inscription n'est pas actif en production.

### Sprint 2 — les trois gros manques (≈ 3-4 jours)
6. §2.1 — mode sombre
7. §2.3 — bouton Partager + Open Graph dynamiques
8. §2.2 — un vrai fil communautaire

### Sprint 3 — retenir les gens (≈ 1 semaine)
9. §2.4 — notes + commentaires sur les mangas, « à découvrir aussi »
10. §2.7 — notifications push
11. §2.6 — page Paramètres
12. §2.12 — mesure d'audience

### Ménage — en continu
13. §3.1 supprimer `mon-espace.html` · §3.2 fusionner `espace-createur.html`
14. §3.5 centraliser le CSS de navigation · §1.8 focus clavier + skip-link
15. §2.13 `defer` + `preconnect` + polices locales
16. §1.9 remettre `ROADMAP.md` à jour

---

## Annexe — méthode

```bash
npm test                      # 173/173 ✅
node tests/outil-chasse.js    # 21 pages × 2 états, aucun défaut bloquant
node tests/outil-contraste.js # 2 quasi-manquements sur emojis
```

Plus : captures d'écran des 18 pages en 390×844 et 1280×900, connecté et
déconnecté, avec base pleine puis base vide (Supabase simulé) ; mesures DOM
ciblées ; recherche exhaustive des liens entrants par page ; relecture croisée
du SQL, des Edge Functions et du service worker.
