# Audit complet Inkrise — expérience utilisateur

> Réalisé le 2026-08-04 sur la branche `claude/inkrise-audit-complet-qa6ys7`.
> Chaque constat marqué **[vérifié]** a été reproduit dans un vrai navigateur
> (Playwright + Chromium, Supabase simulé) ou mesuré dans le DOM. Les constats
> marqués **[produit]** sont des jugements de conception, pas des défauts.
>
> **✅ Sprint 1 livré** — les 5 correctifs de la partie 1 (§1.1, §1.3, §1.4,
> §1.5, §1.6, §1.7) sont appliqués et vérifiés. Voir la note en fin de §1.
> **✅ Sprint 2 livré** — mode sombre (§2.1), partage + aperçus de lien
> (§2.3), fil et découverte communautaires (§2.2).
> **✅ Sprint 3 livré** — notes et avis sur les mangas + recommandations
> (§2.4), page Paramètres avec filtre 18+ et export RGPD (§2.6),
> notifications push (§2.7), crochet de mesure d'audience (§2.12).
>
> ⚠️ **Deux actions manuelles restent à faire :**
> 1. Coller `sql_a_executer.sql` dans Supabase → SQL Editor → Run
>    (correctif d'inscription, §1.3). Le fichier est idempotent.
> 2. Rien à faire pour `api/og.js` : Vercel déploie tout seul le dossier
>    `api/`. Vérifie l'aperçu en collant un lien manga dans WhatsApp.

---

## 0. État de santé — ce qui va bien

| Contrôle | Résultat |
|---|---|
| Suites de tests (`npm test`) | **291/291** ✅ (173 à l'audit, + 118 ajoutées depuis) |
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

### 1.2 ✅ ~~La barre du bas change de forme selon la page~~ — fait (§3.5)

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

### 1.8 ✅ ~~Focus clavier invisible et pas de lien d'évitement~~ — fait

`:focus-visible` n'est déclaré que dans `gestion-chapitres.html`,
`lecteur.html`, `recherche.html` et `upload-manga.html`. Ailleurs, l'outline
par défaut est souvent neutralisé par les `border: none` des boutons.

Aucune page n'a de lien « Aller au contenu » : au clavier, il faut traverser
logo + 4 liens + recherche + avatar + cloche + burger avant d'atteindre le
contenu, **sur chaque page**.

**Correctif** : une règle `:focus-visible` unique dans `inkrise-theme.css` +
un skip-link partagé injecté par `inkrise-nav.js`.

### 1.9 ✅ ~~`ROADMAP.md` est périmé~~ — réécrit

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

### 2.1 ✅ ~~Pas de mode sombre~~ — **livré**

C'est le manque n°1. Le public lit des mangas, sur mobile, souvent le soir.
Le lecteur (`lecteur.html`) est déjà sombre — donc **chaque sortie du lecteur
projette un mur blanc dans les yeux**. Le site était sombre à l'origine et a
migré en clair ; le retour n'a jamais été rendu optionnel.

**Livré** : `assets/inkrise-theme.js` pose `data-theme` sur `<html>` depuis
le `<head>`, avant le premier affichage ; la palette sombre vit dans
`inkrise-theme.css` en `:root[data-theme="dark"]`, dont la spécificité (0,2,0)
l'emporte sur les seize `:root` locaux sans toucher à aucun ; un basculeur
Clair / Sombre / Auto est injecté dans le menu latéral par `inkrise-nav.js`,
donc présent sur toutes les pages qui en ont un. Par défaut on suit le
réglage de l'appareil, et on le suit encore s'il change en cours de route.
126 littéraux de couleur écrits en dur ont été remplacés par quatre nouvelles
variables de texte (`--purple-link`, `--danger-link`, `--success-link`,
`--orange-link`) — le thème clair est inchangé, valeur pour valeur.
Vérifié par `tests/theme.test.js` (14 contrôles) : **0 zone claire** sur 19
pages et **0 défaut de contraste** sur 21 pages en sombre.

### 2.2 ✅ ~~« Communauté » est un onglet sans issue~~ — **livré**

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

**Livré** : `communaute.html` sans `?id=` ne redirige plus. Deux onglets :
- **Mon fil** — les publications des créateurs suivis, chacune renvoyant au
  mur concerné, avec la mention « chez X » quand l'auteur n'est pas le maître
  du mur (le fil mélange plusieurs espaces).
- **Découvrir** — les espaces classés par activité récente, avec nombre de
  publications, dernière activité et pastille « SUIVI ». **On peut enfin
  atteindre le mur d'un créateur qu'on ne connaît pas.**

Qui ne suit personne ouvre directement sur Découvrir plutôt que sur un fil
vide ; sans compte, les espaces restent consultables (les murs sont publics
en lecture) et le fil invite à se connecter. Vérifié par
`tests/communaute-fil.test.js` (23 contrôles), y compris la non-régression du
mur d'un créateur.

*Reste du §2.4 : un lien « Espace communautaire » depuis chaque fiche manga.*

### 2.3 ✅ ~~Un lien partagé ne montre jamais l'œuvre~~ — **livré**

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

**Livré** :
- `window.inkrisePartager()` dans `inkrise-nav.js` : feuille de partage native
  sur mobile, copie du lien ailleurs, et saisie manuelle si le presse-papier
  est refusé. Fermer la feuille n'est pas traité comme un échec. Boutons
  ajoutés sur la fiche manga, la fiche pack et le profil créateur.
- `api/og.js` (fonction serverless Vercel) rend de vraies balises Open Graph —
  titre réel, synopsis résumé sur un mot, couverture en image. Les `rewrites`
  de `vercel.json` ne l'appellent que pour les robots d'aperçu
  (WhatsApp, Facebook, Twitter, Discord, Telegram, LinkedIn, Slack…) : les
  visiteurs et Googlebot reçoivent la page statique inchangée, ce qui écarte
  la question du cloaking. Un brouillon ne produit aucun aperçu, et toute
  panne renvoie vers la page normale — jamais un lien cassé.
- Vérifié par `tests/partage.test.js` (30 contrôles), dont l'échappement des
  titres, la non-divulgation des brouillons et les trois modes de repli.

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

### 2.6 ✅ ~~Aucun réglage utilisateur~~ — **livré** (`parametres.html`)

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

### 2.7 ✅ ~~Les notifications ne peuvent pas ramener personne~~ — **livré**

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

### 2.12 🟡 Mesure d'audience — **crochet livré, à activer**

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

**Fait** : `preconnect` vers Google Fonts et Supabase sur les 21 pages, et
`supabase.js` descendu du `<head>` vers le corps sur 16 pages.

> ⚠️ **Correction de l'audit.** J'avais conseillé « `defer` sur `supabase.js`
> partout ». C'est faux ici : un script `defer` s'exécute après l'analyse de
> tout le document, donc **après** les scripts en ligne des pages — qui
> trouvaient alors `supabase` indéfini. Essayé, mesuré : les 21 pages
> tombaient en erreur. Descendre la balise en bas du corps donne le même
> gain d'affichage sans casser l'ordre d'exécution.

*Reste* : héberger les deux polices localement (supprimerait deux
allers-retours et la dépendance RGPD à Google).

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

### 3.1 ✅ ~~`mon-espace.html`~~ — supprimé

> ⚠️ **Correction de l'audit.** J'avais écrit « aucune page du site ne pointe
> vers lui », en m'appuyant sur une recherche des `href="mon-espace.html"`.
> C'était faux : la page était atteinte par **trois redirections JavaScript**
> (`index.html:672`, `profil.html:1453` et `:1732`) — c'était l'écran
> d'arrivée après « devenir créateur ». Elle n'était pas morte, seulement
> absente de tous les menus, donc sans retour possible.

Elle n'apparaissait dans aucun menu.

C'est pourtant un tableau de bord créateur complet, encore maintenu, encore
**préchargé par le service worker** (il pèse donc sur chaque installation), et
il duplique `profil.html`. Ses chiffres divergent d'ailleurs de ceux de
`profil.html` pour le même compte — deux requêtes différentes pour la même
donnée.

**Fait** : les trois redirections mènent désormais à `profil.html` (le seul
tableau de bord présent dans le menu), la page est retirée du préchargement
hors-ligne et de la liste des destinations autorisées après connexion, et le
fichier est supprimé. La suite de tests qui s'exerçait dessus a été recentrée
sur `auteur.html`, qui porte les deux symptômes surveillés par le garde-fou.

### 3.2 ✅ ~~Trois pages pour « mon espace »~~ — traité autrement que prévu

Après suppression de `mon-espace.html`, il reste deux tableaux de bord :

| Page | Rôle réel |
|---|---|
| `profil.html` (103 Ko) | profil public + mes mangas + mes formations + stats |
| `espace-createur.html` (58 Ko) | mes packs tutoriels |

> ⚠️ **Correction de l'audit.** J'écrivais « `espace-createur.html` n'est
> qu'un onglet de plus ». En regardant le contenu : **1272 lignes**, un CRUD
> complet avec recadreur d'image et galerie, et **65 classes CSS dont 10
> définies différemment** de celles de `profil.html` (`.modal`,
> `.modal-overlay`, `.empty-state`, `.section-title`, `.stat-num`…). Une
> fusion naïve aurait cassé silencieusement l'affichage des deux pages ; une
> fusion propre demandait de renommer 65 classes à travers le CSS, le HTML et
> les gabarits JS — sur le parcours qui gère les ventes.

Le vrai problème n'était pas l'existence de la page, mais **l'absence de
chemin** : l'onglet « Formations » du profil mélangeait dans une seule grille
les packs achetés et les packs créés, sans distinction ni moyen de les
modifier. Il fallait deviner que l'édition se passait ailleurs.

**Fait**, sans toucher au CRUD :
- L'onglet Formations sépare **✏️ Mes créations** (avec le prix de vente) et
  **🎓 Mes achats**.
- Chaque création porte un bouton **« Gérer »** qui ouvre directement son
  formulaire d'édition — `espace-createur.html?edit=<id>` savait déjà le
  faire, personne n'y menait.
- `espace-createur.html` cesse de se présenter comme un second tableau de
  bord (« Bienvenue, Marius ✨ » + statistiques doublant celles du profil) et
  redevient l'atelier des packs, avec un retour vers le profil.
- La page sort du `sitemap.xml` : elle renvoyait les robots vers la page de
  connexion.

Vérifié par `tests/formations.test.js` (16 contrôles), dont le parcours
complet profil → clic « Gérer » → formulaire pré-rempli..

### 3.3 ✅ ~~La barre du bas sur ordinateur~~ — fait (§1.1)

Voir §1.1 — à retirer purement et simplement au-delà de 680 px.

### 3.4 ✅ ~~Le champ de recherche en double~~ — fait

Sur `recherche.html`, la nav du haut porte un champ de recherche **et** la page
en affiche un second, plus grand, juste en dessous. Deux champs pour la même
action, à 100 px l'un de l'autre. Masquer celui de la nav sur cette page.

### 3.5 ✅ ~~21 copies du même CSS de navigation~~ — fait

Mesuré avant correction : **683 lignes recopiées sur 15 pages**, et *chaque*
sélecteur avait divergé — jusqu'à **10 variantes** d'un même `.univ-nav-lk`,
7 de `.univ-bnav-item`, 8 de `.univ-nav-hbg`. C'est cette dérive qui a produit
§1.2 et §1.4.

**Fait** : socle unique dans `assets/inkrise-theme.css` (variante majoritaire,
réécrite avec les variables du thème), **709 lignes retirées** de 14 pages.
`index.html` garde son bloc — la page d'accueil a une identité « verre » qui
fait partie de la marque — mais prend désormais ses *teintes* du thème via
`--nav-fond`, `--bnav-fond` et `--drawer-fond`, en gardant sa *géométrie*.

Vérifié par comparaison pixel à pixel de **72 captures** (21 pages × clair et
sombre × mobile et bureau) avant/après. Les seuls écarts restants sont des
corrections : la loupe de la barre du bas retrouve son cercle violet sur
`espace-createur.html`, et le texte d'invite des champs devient lisible.
Effet de bord mesuré : **0 défaut de contraste dans les deux thèmes**, contre
2 en clair auparavant.

### 3.6 ✅ ~~`.hermes/`~~ — supprimé

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

### ✅ Sprint 2 — les trois gros manques — **livré**
6. ✅ §2.1 — mode sombre (clair / sombre / auto, sans flash)
7. ✅ §2.3 — bouton Partager + Open Graph rendus côté serveur
8. ✅ §2.2 — fil des créateurs suivis + onglet Découvrir

### ✅ Sprint 3 — retenir les gens — **livré**
9. ✅ §2.4 — notes et avis sur les mangas, tri « Mieux notés », « À découvrir aussi »
10. ✅ §2.7 — notifications push *(clés VAPID à générer — voir `NOTIFICATIONS_PUSH.md`)*
11. ✅ §2.6 — page Paramètres (18+, mode de lecture, notifications, export RGPD, suppression)
12. ✅ §2.12 — crochet de mesure d'audience *(à activer dans `assets/inkrise-config.js`)*

### Ménage — en continu
13. §3.1 supprimer `mon-espace.html` · §3.2 fusionner `espace-createur.html`
14. §3.5 centraliser le CSS de navigation · §1.8 focus clavier + skip-link
15. §2.13 `defer` + `preconnect` + polices locales
16. §1.9 remettre `ROADMAP.md` à jour

---

## 5. Relecture du texte affiché — ce que la lecture à voix haute a trouvé

Après les trois sprints, une passe différente : au lieu de chercher des
erreurs, dumper le **texte visible** de chaque page (`tests/_txt.js`),
connecté et déconnecté, et le relire comme un visiteur. Rien de ce qui suit
ne plantait ; tout était faux, contradictoire ou en cul-de-sac.

| Où | Ce que la page disait | Corrigé en |
|---|---|---|
| `pack.html` | « par **Créateur** » en en-tête, le vrai pseudo dans la carte du bas — `auteur_nom` n'existe pas en base | l'en-tête est renseigné par le profil chargé |
| `pack.html` | « 🔒 Paiement sécurisé » sous « Télécharger le pack » — pack gratuit, déjà acheté, ou le sien | affiché seulement quand un paiement reste à faire |
| `pack.html` | l'auteur voyait « Laisser un avis » sur son propre pack — refusé par la règle RLS | il lit les avis reçus, sans formulaire |
| `gestion-chapitres.html` | menu latéral proposant « Connexion / Inscription » sur une page qui **exige** une session, sans profil, ni paramètres, ni déconnexion | menu et cloche branchés sur la session |
| `creators-remuneration.html` | « **À FIGER avant l'ouverture des paiements** » — note interne publiée aux visiteurs | passée en commentaire HTML |
| `lecteur.html` | « 1 sur 0 » à côté de « aucune page disponible » | « — Aucune page » dans les deux modes |
| `tutoriels.html` | filtres « Dessin (0) », « Digital (0) »… qui menaient à une grille vide | filtres vides masqués ; rangée entière retirée quand un seul thème existe |
| 15 pages | badge `GRATUIT` (et `NOUVEAU` sur une page) à côté de « Tutoriels », alors que les packs sont surtout payants | badge retiré |
| `confidentialite.html`, `cgu.html` | l'export RGPD, le thème mémorisé et l'abonnement push n'y figuraient pas | sections 2, 6 et 7 mises à jour |

**Deux fausses pistes, pas corrigées** : le niveau brut `debutant` sur la
page pack et « Auteur inconnu » sur la fiche manga venaient tous deux des
**données simulées des tests**, pas du site. Vérifié avant de toucher quoi
que ce soit.

Deux contrôles ajoutés à `tests/outil-invisible.js`, chacun validé en
réinjectant le défaut d'origine :

- **`menu-desaccorde`** — page rendue avec une session ouverte dont le menu
  latéral affirme le contraire. C'est ce contrôle qui a isolé
  `gestion-chapitres.html`, et lui seul.
- **`jointure-sans-cle`** — `profiles!auteur_id(username)` sans clé
  étrangère correspondante ne plante pas : PostgREST renvoie `null` et la
  page affiche « Auteur inconnu » pour tout le monde. Les 13 jointures du
  site sont désormais vérifiées contre le schéma, colonnes jointes
  comprises.

---

## 6. Les politiques RLS confrontées à ce que le site fait vraiment

Dernier angle, et le plus payant : monter un vrai PostgreSQL, y charger
`sql_a_executer.sql`, puis rejouer **chaque écriture que le site tente**
sous l'identité qui convient (`tests/outil-rls.js`). Trois politiques
étaient plus larges que ce que l'interface offre — les trois exploitables
depuis la console du navigateur, sans outil.

| Faille | Ce qu'elle permettait | Correctif |
|---|---|---|
| `profiles update own` sans restriction de colonne | `PATCH {"is_admin": true}` sur sa propre ligne → lire tous les signalements et les classer | déclencheur `trg_proteger_champs_profil` |
| `achats insert own` : `WITH CHECK (user_id = auth.uid())` | insérer une ligne d'achat → débloquer n'importe quel pack **payant** gratuitement | la politique exige désormais un pack à prix nul ; les achats réels passent par `cinetpay-webhook` (clé de service, hors RLS) |
| `notif insert authenticated` : `WITH CHECK (true)` | déposer un message et un **lien cliquable** dans la boîte de n'importe qui (« Ton compte va être suspendu, clique ici ») | trois déclencheurs remplacent les insertions faites depuis le navigateur, puis la politique se referme sur `user_id = auth.uid()` |

Les deux pages qui écrivaient chez autrui (`gestion-chapitres.html` pour
les abonnés, `communaute.html` pour le créateur du mur) passent maintenant
par des déclencheurs, comme les six autres notifications du site le
faisaient déjà. L'outil vérifie les deux côtés : la faille est fermée
**et** la notification légitime part toujours.

**Deux fois où l'outil a crié au loup** — les deux corrigés dans l'outil,
pas dans le site :

- **RLS ne fait pas échouer un UPDATE interdit.** `USING` filtre les
  lignes, la commande réussit, zéro ligne est touchée. Quatre faux
  positifs venaient de là. On compte désormais les lignes affectées. Le
  navigateur voit exactement la même chose : Supabase renvoie
  `error: null`, et un code qui ne lit que ça affiche un succès pour une
  opération qui n'a rien fait.
- **Compter les notifications existantes ne prouve pas qu'un déclencheur a
  tiré.** Le jeu d'essai crée un abonnement, lequel en produit une au
  passage : trois vérifications passaient en réalité pour la mauvaise
  raison, déclencheurs débranchés. Elles comparent maintenant avant/après.

Relu dans les deux sens : correctif appliqué, 41/41 ; correctif retiré,
six écarts ressortent. Le fichier SQL a aussi été rejoué trois fois de
suite — un changement de nom de politique le rendait non rejouable au
second passage.

---

## 7. Échappement et pannes — les deux angles restants

### 7.1 Échappement : rien à corriger, et c'est vérifié

Presque tout le site se rend avec `innerHTML` et des gabarits `${}`. Plutôt
que de relire les gabarits, `tests/outil-injection.js` empoisonne **chaque
champ texte** servi par Supabase — pseudo, titre, synopsis, commentaire,
avis, bio, message de notification — et cherche les traces dans le DOM :
une balise devenue élément, un attribut apparu, du code exécuté.

**Zéro défaut.** Les treize fonctions d'échappement font leur travail.

Deux helpers divergeaient tout de même des onze autres, sans que rien ne
les exploite aujourd'hui — alignés par précaution :

- `espace-createur.html` ne neutralisait pas l'apostrophe, et appelait
  `.replace` directement sur son argument (un nombre le faisait planter).
  Un attribut écrit `title='${escHtml(x)}'` aurait suffi à ouvrir la porte.
- `gestion-chapitres.html` faisait `String(s)` sans repli : un chapitre
  sans titre affichait « null ».

L'outil a d'abord été **inutile sans qu'on le voie** : tous les champs
image étaient à `null`, donc aucun contexte d'attribut (`src`, `alt`,
`style`) n'était éprouvé — précisément là où l'échappement se rate. La
première tentative de validation a échoué pour la même raison : le défaut
injecté se trouvait derrière `if (manga.couverture_url)`. Corrigé, puis les
trois familles de détection validées en cassant un échappement de chaque
sorte.

### 7.2 Pannes : les treize pages tournaient dans le vide

`tests/outil-panne.js` rejoue trois pannes sur chaque page : erreur serveur
(500), session expirée (401), réseau coupé.

| Panne | Ce que voyait l'utilisateur |
|---|---|
| réseau coupé | **les 13 pages** restaient sur « Chargement… », « Chargement du manga… », « Recherche en cours… » — indéfiniment, sans un mot |
| session expirée (401) | pages vides, sans rien indiquer : on croyait le site cassé alors qu'il suffisait de se reconnecter |
| serveur en erreur (500) | `internal server error` et `JWT expired` recopiés à l'écran sur `communaute.html` et `tutoriels.html` |

Chaque page a sa propre mécanique de chargement ; plutôt que d'en réécrire
treize, `assets/inkrise-reseau.js` observe les requêtes vers Supabase et
affiche un bandeau dès qu'elles échouent — trois messages selon le cas,
avec « Réessayer » ou « Se reconnecter ». Il n'efface aucun contenu : il ne
peut donc pas faire disparaître par erreur quelque chose qui aurait fini
par charger.

`manga.html` faisait **déjà** ce qu'il fallait — message français, bouton
Réessayer, détail technique relégué en petit. L'outil le dénonçait à tort :
la règle est devenue « du jargon servi comme explication, sans phrase
française pour l'accompagner ».

Deux autres réglages, tous deux dus à l'outil et non au site :

- `offsetParent` vaut `null` sur un élément `position: fixed` — et le
  bandeau l'est. Il était jugé invisible alors qu'il mesurait 45 pixels.
- Quarante-deux combinaisons page × panne se disputent le processeur : une
  page correcte se faisait dénoncer une fois sur trois, jamais la même,
  alors qu'elle passait huit fois sur huit en isolation. Toute page mise en
  cause est désormais revérifiée avant d'être signalée.

Relu dans les deux sens : module retiré de deux pages, l'outil ressort
exactement ces deux pages sur les trois pannes, et rien d'autre.

---

## Annexe — méthode

```bash
npm test                       # 347/347 ✅  (14 suites)
node tests/outil-contraste.js  # 0 couple sous le seuil, clair et sombre
node tests/outil-invisible.js  # 0 défaut silencieux
node tests/outil-rls.js        # 41/41 — PostgreSQL réel, schéma chargé
node tests/outil-injection.js  # 0 contenu utilisateur hors de son cadre
node tests/outil-panne.js      # 0 page muette sur 42 combinaisons
node tests/outil-chasse.js     # 21 pages × 2 états
URLS=… MODES=… node tests/_txt.js   # texte visible de chaque page, à relire
```

Plus : captures d'écran des 18 pages en 390×844 et 1280×900, connecté et
déconnecté, avec base pleine puis base vide (Supabase simulé) ; mesures DOM
ciblées ; recherche exhaustive des liens entrants par page ; relecture croisée
du SQL, des Edge Functions et du service worker.
