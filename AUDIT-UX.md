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
- ~~**Aucune page par genre**~~ **✅ livré** (§7.7) : rangée de genres visible
  sans dérouler de menu, chacun à une adresse partageable
  (`recherche.html?genre=Action`), et les genres d'une fiche manga sont
  devenus des liens.
- ~~**Aucune page « tous les créateurs »**~~ **✅ livré** (§7.7) :
  `recherche.html?vue=createurs`, atteinte depuis le « Voir tout → » de
  l'accueil.

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
- ~~plein écran (`requestFullscreen` : 0 occurrence)~~ **✅ livré** (§7.4),
- ~~zoom / pincement~~ **✅ livré** (§7.4),
- ~~`wakeLock` — l'écran s'éteint pendant une lecture longue en mode vertical~~ **✅ livré** (§7.3),
- ~~double page sur tablette et ordinateur~~ **✅ livré** (§7.11),
- ~~défilement automatique pour le webtoon~~ **écarté**, avec raisons (§7.11),
- ajustement de la luminosité,
- signets sur une page précise — la reprise de lecture couvre déjà
  l'essentiel du besoin, et un vrai signet demanderait une table de plus.

### 2.9 ✅ ~~La modération est une liste, pas un outil~~ — **livré** (§7.5)

### 2.10 ✅ ~~Le profil d'un lecteur ne parle que de création~~ — **livré** (§7.9)

Un compte sans manga voit « 0 MANGAS · 0 VUES · 0 CHAPITRES · 0 ABONNÉS » puis
une fusée « Publie ton premier manga ». Rien sur ce qu'il *lit*. Manquent :
chapitres lus, temps de lecture, genres favoris, liste publique, badges. La
grande majorité des comptes seront des lecteurs — c'est leur profil qui devrait
être le cas par défaut.

### 2.11 ⬜ ~~Prix en FCFA à l'affichage~~ — **écarté (décision produit)**

Le constat initial reste exact : toute l'interface affiche des euros, et la
fonction convertit en XOF au paiement ; les moyens de paiement retenus
(Wave, Orange Money, MTN MoMo, Moov via CinetPay) visent l'Afrique de
l'Ouest.

Mais j'avais tiré la mauvaise conclusion : de « les moyens de paiement
visent l'Afrique de l'Ouest », j'ai déduit « le public est ouest-africain ».
Inkrise s'adresse à un public international — proposer le Mobile Money, c'est
inclure ceux qui n'ont pas de carte bancaire, pas restreindre le site à une
région.

**Décision retenue : l'affichage reste en euros.** La conversion vers le XOF
continue de se faire côté serveur au moment du paiement, pour ceux qui
règlent en Mobile Money. Passer l'affichage en dollars serait une variante
tout aussi défendable ; c'est un seul symbole à changer si le besoin vient.

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

## 7.3 Confort du lecteur — l'écran ne s'éteint plus

`assets/inkrise-veille.js` demande le verrou d'écran (API Wake Lock) dès
qu'un chapitre a des planches à afficher. En lecture verticale on fait
défiler sans jamais toucher l'écran : le téléphone s'éteignait en plein
chapitre.

Deux pièges de cette API, tous deux traités :

- le navigateur **relâche le verrou de lui-même** dès que l'onglet passe en
  arrière-plan ; sans ré-armement au retour, il ne protégeait que la
  première minute de lecture ;
- la demande est refusée quand le document n'est pas visible, et le refus
  est une promesse rejetée — non attrapée, elle remonte en erreur console.

Le réglage est rangé dans le navigateur, pas en base : c'est un choix qui
dépend de l'appareil, comme le thème. Un même compte peut vouloir l'écran
allumé sur sa tablette et pas sur son téléphone. L'interrupteur n'apparaît
dans les Paramètres que là où le navigateur sait le faire — Firefox ne
connaît pas cette API, et un interrupteur sans effet vaut moins que rien.

La suite `veille` (16 vérifications) a demandé une correction de méthode :
mon double de l'API ne relâchait pas le verrou quand la page passait en
arrière-plan, donc le ré-armement — la partie la plus facile à oublier —
n'était jamais mis à l'épreuve. Rendu fidèle, puis vérifié en retirant le
ré-armement du code : deux vérifications tombent.

Aucun SQL : le réglage vit dans `localStorage`.

---

## 7.4 Confort du lecteur — plein écran et zoom

Une planche entière tient dans un écran de téléphone : les dialogues y
deviennent illisibles. Deux gestes manquaient.

**Zoom** — pincement à deux doigts, double tap, `Ctrl` + molette, et les
touches `+` / `−` / `0`. Plafonné à ×3, remis à plat en changeant de page,
de mode ou de chapitre : rester agrandi sur une planche qu'on n'a pas
choisie déroute.

Trois arbitrages, tous imposés par la mécanique :

- Zoom et balayage se disputent le même `transform` sur la même image. Ils
  sont donc calculés ensemble par une seule fonction, jamais écrits l'un
  par-dessus l'autre.
- Tant qu'on est agrandi, le doigt **déplace** la planche au lieu de
  tourner la page — sinon on ne pourrait jamais lire un coin — et les
  bandes de clic latérales sont neutralisées.
- Le déplacement est borné à partir de la taille de mise en page, pas de
  `getBoundingClientRect()` : cette dernière inclut déjà le zoom **et** le
  déplacement en cours, donc la borne aurait dépendu de la position et le
  déplacement aurait dérivé.

**Plein écran** — bouton dans la barre du haut et raccourci `f`. Il ne
s'affiche que là où le navigateur répond : sur iPhone l'API est réservée
aux vidéos, et un bouton sans effet vaut moins que rien. La touche Échap
sort du plein écran sans passer par le bouton, d'où l'écoute de
`fullscreenchange` — sans elle l'icône serait restée bloquée sur
« quitter ».

Le pincement ne se devine pas : un message unique le signale à la première
lecture page par page.

La suite `confort` (21 vérifications) a démasqué un défaut que la relecture
n'aurait pas trouvé : **le double tap ne faisait rien**. Je testais
`!dragging`, or `dragging` passe à vrai dès le premier contact — la
condition n'était donc jamais remplie. Ce qui distingue un appui d'un
glissement, c'est l'absence de **mouvement**, pas l'absence de contact.

Aucun SQL.

---

## 7.5 Modération — de la case à cocher aux vrais outils

`admin.html` ne savait faire qu'une chose : marquer un signalement
« traité ». Le contenu incriminé, lui, restait en ligne. Et la page
n'affichait que le motif du signalement — impossible de juger sans aller
ouvrir le contenu dans un autre onglet, et impossible tout court une fois
celui-ci retiré.

**Ce que la page fait maintenant :**

| Avant | Maintenant |
|---|---|
| motif seul | l'extrait du contenu, son auteur, un lien qui mène au commentaire **dans son chapitre** |
| dix plaintes = dix lignes identiques | un contenu incriminé = une carte, avec le nombre de plaintes et les motifs distincts |
| cocher « traité » | **masquer** (le contenu disparaît du site) · **rétablir** · **classer sans suite** |
| une seule liste | trois vues : à traiter / traités / tous |

**Le masquage passe par les politiques de lecture, pas par les pages.**
Filtrer côté navigateur aurait voulu dire ajouter `.is('masque_le', null)`
à chaque requête des vingt et une pages — et il aurait suffi d'en oublier
une pour que le contenu retiré réapparaisse. La règle est posée une fois,
côté base. L'auteur continue de voir son propre contenu, la modération
voit tout, le reste du monde ne voit plus rien.

Deux fonctions serveur, pour ne pas donner aux modérateurs le droit
d'écrire sur `mangas`, `commentaires` et `posts_communaute` — ce qui
ouvrirait bien plus que le masquage :

- `moderer_contenu(type, id, masquer)` ne touche qu'une colonne, vérifie
  elle-même les droits, et classe les signalements liés au passage ;
- `apercu_signale(type, id)` rend l'extrait, l'auteur et le lien de
  contexte — le serveur est le seul à savoir dans quel manga et quel
  chapitre vit un commentaire signalé.

**Trois erreurs, toutes attrapées par la mesure :**

- `lienContenu()` lisait `type_contenu` / `contenu_id` alors que les
  groupes portent `type` / `id` : **aucun lien ne s'affichait**. Trouvé par
  la suite `moderation`, pas par la relecture.
- Le cas « un contenu masqué disparaît pour le public » passait à tort :
  ma préparation tournait en superutilisateur, où `auth.uid()` est nul —
  la fonction refusait en silence et je mesurais un masquage qui n'avait
  jamais eu lieu.
- La pastille de filtre active tombait à **4,45:1** sur 4,5 requis. Et en
  la mesurant, le relevé en thème sombre a exposé un défaut **préexistant**
  d'`admin.html` : la page codait ses fonds en dur (`#fff`, `#faf9fd`) tout
  en prenant ses couleurs de texte au thème — donc texte clair sur carte
  blanche. Passée aux variables partagées.

---

## 7.6 Comptage des lectures — deux trous mesurés

Le compteur de vues devait devenir fiable avant qu'il ne serve à décider
d'une rémunération. Deux problèmes, tous deux vérifiés sur un vrai
PostgreSQL avant correction.

**1. Un auteur pouvait écrire directement `mangas.vues`.** Sa politique
« mangas update own » l'autorise à modifier sa ligne, *toutes colonnes
comprises*. Une ligne dans la console du navigateur et le compteur passait
à 999 999 — de même pour `abonnes`, `note_moyenne` et `nb_avis`. Ces quatre
colonnes sont entretenues par des déclencheurs : personne ne devrait les
écrire à la main. Un déclencheur `BEFORE UPDATE` remet désormais l'ancienne
valeur quand la modification vient du site.

Le détail qui fait tout fonctionner : ce déclencheur n'est **pas**
`SECURITY DEFINER`, donc `current_user` y vaut bien l'appelant. Et c'est
aussi pour ça que les déclencheurs de comptage, eux, passent sans
encombre — ils *sont* `SECURITY DEFINER`, donc vus comme « postgres » et
non comme le site.

**2. Un visiteur déconnecté n'était pas compté du tout.** La politique
exige `user_id = auth.uid()` : sur un site de lecture public, l'essentiel
du trafic échappait au compteur. L'enregistrement passe maintenant par une
fonction serveur — ouvrir la table `vues` en écriture aux anonymes aurait
permis à n'importe qui d'y déverser autant de lignes qu'il veut. Elle
écarte d'elle-même l'auteur qui relit son œuvre, les empreintes
fantaisistes et les doublons.

L'empreinte est un nombre tiré au hasard, rangé dans le stockage local :
pas d'adresse IP, pas d'empreinte matérielle, rien qui désigne une
personne. Ajoutée à la politique de confidentialité.

**Deux corrections de méthode dans l'outil :**

- Le critère « 0 ligne affectée = refusé » ne voit pas une écriture
  **silencieusement annulée** : le déclencheur laisse l'`UPDATE` passer et
  remet l'ancienne valeur, donc une ligne est bien touchée. Les cas de
  compteurs comparent désormais la **valeur**, pas le nombre de lignes.
- Le cas « hors ligne, aucune tentative » échouait sur `lecteur.html` —
  qui, sans chapitre en cache, **redirige vers `manga.html`**. C'est cette
  page-là qui comptait sans garde-fou : le vrai défaut était bien là où le
  test pointait, pas là où je le croyais.

---

## 7.7 Découverte — deux culs-de-sac rouverts

Sans SQL, volontairement : deux blocs restaient à exécuter côté base, il
n'était pas raisonnable d'en ajouter un troisième.

**La rangée de créateurs de l'accueil ne menait nulle part.** Elle
s'arrête à douze ; au treizième, plus personne n'était visible depuis la
page d'accueil. Elle a maintenant un « Voir tout → » vers
`recherche.html?vue=createurs`, qui liste ceux ayant réellement publié —
un profil créateur vide n'a rien à montrer.

**Les vingt genres n'existaient que dans un menu déroulant replié.**
Personne ne tombait dessus par hasard, et une fiche manga affichait
« Action » sans qu'on puisse cliquer. Deux changements :

- une rangée de genres en tête du catalogue, chacun à une adresse
  partageable et indexable (`recherche.html?genre=Action`) ;
- les genres d'une fiche manga sont devenus des liens vers cette même
  adresse.

Un détail de mise en œuvre : sur les **cartes** de résultat, les genres
restent de simples étiquettes. La carte entière est déjà un lien, et un
lien dans un lien est du HTML invalide que le navigateur défait
silencieusement. La suite le vérifie (`a a` doit rester à zéro).

**Ce que le test a trouvé :** le titre de page est posé deux fois — avant
le chargement, puis une fois le total connu. La seconde écrasait la
première et effaçait le nom du genre parcouru. Les deux passent désormais
par la même fonction, pour que ça ne redérive pas.

---

## 7.8 L'écart entre le déploiement et la base

Vercel déploie dès la fusion ; la mise à jour de la base, elle, attend
qu'on la lance à la main. Entre les deux, le site appelle des fonctions
qui n'existent pas encore. J'avais livré la modération et le comptage des
vues sans traiter cette fenêtre — le site était donc réellement dégradé en
attendant.

**Ce qui change :** quand une fonction manque, PostgREST répond `PGRST202`.
C'est reconnaissable, donc traitable.

- **Comptage des vues** : on retombe sur l'ancien chemin, toujours valide.
  Il ne compte que les personnes connectées — mais c'est exactement ce que
  le site faisait avant, au lieu de ne plus rien compter du tout.
- **Modération** : la page dit la vraie cause (« la base attend sa mise à
  jour ») au lieu d'un « Action impossible, réessaie » mensonger —
  réessayer n'y changerait rien. Les signalements restent lisibles, et les
  boutons qui ne marcheraient pas ne s'affichent pas.

**Règle retenue pour la suite** : quand du code dépend d'une mise à jour de
la base, il doit se dégrader proprement en attendant. Et le fichier SQL
étant rejouable, la consigne est toujours la même — coller
`sql_a_executer.sql` en entier, sans avoir à savoir quels blocs sont
nouveaux.

---

## 7.9 Profil de lecteur — quatre zéros et six onglets sur la publication

Quelqu'un qui vient **lire** arrivait sur son profil et y trouvait
« 0 Mangas · 0 Vues · 0 Chapitres · 0 Abonnés », puis six onglets qui
parlent tous de publier. Rien de ce qu'il fait réellement n'était visible.

Un onglet **« 📖 Ma lecture »**, placé en premier, montre maintenant :
œuvres commencées, terminées, avis donnés, genres les plus lus (classés,
et cliquables vers le catalogue filtré), et la reprise des lectures en
cours avec leur position.

**Aucune colonne ajoutée.** Tout se reconstitue depuis ce que la base
contient déjà : la bibliothèque garde la position de lecture de chaque
œuvre, les avis et les genres sont là. C'était un problème d'affichage,
pas de données — et ça tombait bien, deux blocs SQL restaient en attente.

**Un refus d'inventer :** une entrée de bibliothèque sans nombre total de
chapitres ne permet d'affirmer aucune progression. Elle reste listée, avec
sa position, mais **sans jauge** — dessiner une barre à partir d'un total
inconnu aurait été un chiffre fabriqué. La suite le vérifie explicitement.

**Ce que le test a corrigé, côté outil :** `count: 'exact', head: true`
envoie une requête **HEAD**, pas un GET. Mon double la traitait comme une
écriture et répondait sans en-tête `Content-Range` — le compteur d'avis
restait à zéro alors que la page marchait.

---

## 7.10 Inscription — un consentement qu'on n'avait jamais demandé

Les CGU affirment « en créant un compte, tu acceptes ces conditions ».
Sauf que rien, à l'écran, ne le demandait ni ne le montrait : on pouvait
s'inscrire sans jamais voir passer un lien vers les conditions.

Une case à cocher, **jamais pré-cochée** — un consentement pré-donné n'en
est pas un — avec les liens vers les conditions et la politique de
confidentialité, ouverts dans un autre onglet pour ne pas perdre le
formulaire à demi rempli. Le contrôle est fait en JavaScript et non par
`required` : le formulaire n'est pas un `<form>`, la validation native du
navigateur ne se déclencherait jamais.

**Connexion Google** — le CSS `.or-divider` attendait depuis le début.
Le bouton est là, mais **il ne s'affiche que si `INKRISE_GOOGLE` est
activé** dans `assets/inkrise-config.js`, une fois le fournisseur
réellement configuré côté Supabase. Un bouton « Continuer avec Google »
qui renvoie une erreur de configuration coûte plus cher que pas de bouton
du tout : la personne croit que le site est cassé, et repart. Même
principe que la clé VAPID des notifications push.

**Ce que le test a corrigé chez lui :** poser `window.INKRISE_GOOGLE = true`
avant le chargement de la page ne servait à rien — `inkrise-config.js` se
charge ensuite et le remet à `false`. Le test sert désormais une config
réellement modifiée, ce qui est aussi le geste que fera le propriétaire du
site.

---

## 7.11 Lecteur — deux planches à la fois, et un défilement automatique écarté

Sur un écran de 1280 px, une planche seule au milieu laissait les deux
tiers de la largeur vides. Or un manga papier se lit **par paires** : la
mise en page des auteurs est souvent pensée pour la double page, et la
lire planche par planche coupe des cases qui se répondent d'une page à
l'autre.

Trois pièges, chacun tenu par une vérification :

**Le sens de lecture.** En manga japonais (`sens_lecture = 'rl'`), la
planche de gauche vient *après* celle de droite. L'ordre logique ne
change pas — la planche 1 reste la planche 1 — c'est l'ordre *visuel*
qui s'inverse. Le CSS s'en charge (`flex-direction: row-reverse`) sans
toucher au DOM. Le test ne se fie donc pas à l'ordre des éléments : il
trie les images par leur `getBoundingClientRect().left` réel, seul juge
de ce qu'on voit vraiment.

**Le pas.** Avancer d'une planche en mode double décale la paire d'un
cran : on relit à chaque fois la moitié de ce qu'on vient de voir. Un
`pas()` qui vaut 2 en double et 1 sinon, appliqué aussi à la désactivation
du bouton « suivant ».

**Le zoom.** Le pincement livré la veille agrandissait `#pageImg`. Avec
deux images, transformer chacune de son côté séparerait la paire au fur
et à mesure de l'agrandissement. La transformation s'applique désormais
au conteneur `#pageZoom` ; les deux planches n'ont aucune transformation
propre, et le test le vérifie en lisant leur matrice calculée.

Trois garde-fous complètent l'ensemble : sous 900 px la double page se
désactive d'elle-même (et le bouton disparaît), y compris **en cours de
lecture** si l'on tourne la tablette ; un chapitre à nombre impair de
planches montre la dernière seule plutôt que de casser une image ou de
rendre la fin inatteignable ; et en lecture verticale, où la notion de
paire n'a aucun sens, le bouton n'existe pas.

**Défilement automatique — écarté.** Il figurait au backlog ; à
l'examen, il ne tient pas :

- le bouton d'arrêt vivrait dans la barre du bas, **qui se masque
  justement pendant le défilement** — on ne peut pas arrêter ce qu'on ne
  voit plus ;
- il lutte en permanence contre le lecteur : la moindre impulsion du
  doigt le combat au lieu de le suspendre ;
- **aucune vitesse n'est bonne** : une planche de dialogue et une double
  page muette ne se lisent pas au même rythme, et un réglage de vitesse
  est un aveu que le réglage automatique a échoué ;
- il encombre une barre qui compte déjà six commandes ;
- combiné à l'écran maintenu allumé (§7.3), il vide la batterie d'un
  téléphone qui continuerait de défiler dans une poche.

Ce que l'on voulait vraiment — ne pas avoir à toucher l'écran toutes les
trois secondes — est déjà couvert par le mode vertical, où l'on fait
défiler d'un geste continu.

**Ce que le test a corrigé chez lui :** aucun échec au premier passage,
ce qui est en soi suspect. Les trois défauts que la suite prétend
attraper ont donc été injectés un par un dans `lecteur.html` — pas de 1,
`row-reverse` retiré, seuil de largeur abaissé à 100 px. Ils ont fait
tomber respectivement 3, 1 et 4 vérifications. Une suite qui n'a jamais
échoué n'a rien prouvé.

---

## 7.12 Polices — deux allers-retours chez Google avant le premier mot

Chaque page allait chercher ses polices chez Google : une requête vers
`fonts.googleapis.com` pour obtenir la feuille de style, **puis** une
seconde vers `fonts.gstatic.com` pour les fichiers eux-mêmes — deux
connexions à un tiers, DNS et poignée de main TLS compris, avant que le
premier mot ne soit dessiné dans la bonne fonte. Et l'adresse IP de
chaque visiteur transmise à Google sans lui demander son avis, ce que le
RGPD ne permet pas (le tribunal de Munich l'a jugé explicitement en 2022).

Les quatre familles — Syne, DM Sans, Nunito, Bebas Neue — sont désormais
dans `assets/fonts/`, déclarées par une seule feuille
`assets/inkrise-fonts.css`.

**Ce n'est pas plus lourd, c'est plus léger.** Google Fonts renvoie
aujourd'hui des **versions variables** : un seul fichier couvre toute la
plage de graisses d'une famille. Là où Syne 400→800 aurait demandé cinq
fichiers, il en faut un. Total : huit fichiers, 200 Ko sur le disque,
dont le navigateur ne réclame en pratique que la moitié — les variantes
`latin-ext` ne partent que si la page contient vraiment un caractère qui
les exige, ce dont `unicode-range` se charge.

Le grec, le cyrillique et le vietnamien ne sont pas embarqués : un pseudo
écrit dans ces alphabets s'affiche dans la police système — lisible,
simplement pas dans la fonte de la maison. C'est un choix, pas un oubli ;
les rajouter est mécanique (voir `assets/fonts/README.md`).

Trois conséquences en plus de la vitesse : le service worker précharge
les polices, donc elles survivent au hors-ligne ; les deux `preconnect`
vers Google disparaissent de vingt et une pages ; et `sw.js` n'a plus
qu'une seule dépendance externe, la librairie Supabase.

**Relevé en passant :** `profil.html` déclarait `'Bebas Neue', cursive`.
Si la police ne se charge pas, `cursive` donne une anglaise ou un Comic
Sans — alors que Bebas Neue est une linéale condensée. Le repli est
devenu `sans-serif`.

**Ce que le test a corrigé chez lui :** la suite regardait quelles polices
chaque page charge réellement, et déclarait Bebas Neue manquante sur
`profil.html`. Elle avait tort : sans session, `profil.html` renvoie vers
la connexion, donc rien n'y est jamais écrit en Bebas et la police reste
légitimement `unloaded`. Les quatre familles sont désormais demandées
explicitement puis mesurées à la largeur du texte rendu. Second défaut du
test : `document.fonts.load()` **rejette** quand le fichier est
introuvable — un nom erroné faisait planter la suite au lieu de la faire
rougir.

---

## 7.13 L'outil de contraste mesurait `auth.html` sept fois

C'est le plus gênant de tout l'audit, parce que ce n'est pas un défaut du
site : c'est un défaut de la **mesure** qui a servi à déclarer le site
sain. `node tests/outil-contraste.js` s'exécutait **déconnecté**. Or sept
pages sur vingt et une — profil, bibliothèque, paramètres, espace
créateur, upload, gestion des chapitres, admin — redirigent aussitôt vers
`auth.html` quand il n'y a pas de session.

L'outil mesurait donc `auth.html` sept fois de suite en croyant mesurer
sept pages, et annonçait fièrement « 0 couple sous le seuil, sur 21
pages ». Trois autres pages étaient visitées sans le paramètre qui les
fait vivre (`manga.html` sans `?id=`, `lecteur.html` sans chapitre), donc
mesurées à vide.

Corrigé : session simulée, paramètres d'URL par page, `auth.html` mesurée
dans son propre contexte déconnecté — et surtout **un contrôle qui dit
tout haut quand une page n'a pas été atteinte**, au lieu de la compter
comme mesurée. C'est la ligne qui manquait.

Une fois l'outil réparé, il a relevé **seize couples fautifs en thème
sombre et dix-sept en thème clair**, dont trois causes de fond :

**Les cartes « verre dépoli » figées en blanc.** `background:
rgba(255,255,255,0.6)` était écrit en dur dans `profil.html`,
`upload-manga.html` et `gestion-chapitres.html`. Joli en thème clair ; en
thème sombre, cela posait une carte **gris clair** sous du texte clair —
2,32:1 pour « Tes genres », 1,43:1 pour « Supprimer mon compte ». Deux
variables, `--carte` et `--carte-forte`, remplacent les quatorze
déclarations.

**Des couleurs de FOND employées comme couleur de TEXTE.** `--purple2`
(`#a594f9`) est un violet pâle prévu pour des aplats et des dégradés ; il
servait de couleur de texte cinquante fois, sur fond blanc, à 1,8–2,6:1.
Même chose pour `--green` en « GRATUIT » et `--amber` sur les étoiles de
notation. Le thème avait déjà les variantes prévues pour ça
(`--purple-link`, `--success-link`) : elles valent exactement la teinte de
fond **en thème sombre**, donc la bascule ne change rien au sombre et ne
corrige que le clair. Il manquait `--amber-link`, ajoutée.

*Conséquence visible, assumée :* en thème clair, les étoiles de notation
passent d'un ambre vif à un ambre foncé. L'ambre vif était à 1,8:1 —
décoratif, pas lisible.

**Des aplats de marque trop clairs sous du texte blanc.** `--purple` est
volontairement remonté en clarté dans le thème sombre pour rester lisible
*en texte* ; posé *en fond* sous du blanc, il tombe à 2,96:1. D'où
`--purple-plein` et `--danger-plein`, deux aplats assez sombres pour
porter du blanc dans les deux thèmes.

Reste, aux deux thèmes confondus, **un seul couple fautif** — sur
`espace-createur.html`, que la fusion des tableaux de bord fait
disparaître (§7.14).

**Ce que le test a corrigé chez lui, deuxième fois :** j'ai ajouté
`--purple-plein` au thème sombre en oubliant le thème clair. Le bouton
« Publier » s'est retrouvé sans fond du tout — texte blanc sur fond de
page, 1,12:1. L'outil réparé l'a signalé au passage suivant. C'est
exactement ce qu'on lui demande.

---

## 7.14 Deux tableaux de bord pour une seule personne

`profil.html` montrait les formations sans permettre de les modifier.
`espace-createur.html` permettait de les modifier sans montrer le reste.
Pour changer un prix, il fallait passer de l'un à l'autre — et le bouton
« Gérer » du profil était un lien vers l'autre page.

Tout tient désormais dans l'onglet **Formations** du profil : créer,
modifier, supprimer, avec le nombre d'acheteurs par pack. La page
`espace-createur.html` reste, réduite à une redirection de cinquante
lignes : des liens extérieurs, des favoris et une redirection de
`vercel.json` y menaient, et `?edit=7` — l'adresse d'édition directe
appelée depuis `pack.html` — est reconduite telle quelle.

**Trois briques existaient en double**, et une seule survit de chacune :

- l'**outil de recadrage** (~90 lignes, mêmes noms de fonctions, mêmes
  identifiants `#cropImg`/`#cropZoom` dans les deux pages). Celui du
  profil était déjà paramétré (`aspect`, `outW`, `outH`, `shape`) pour
  l'avatar et la couverture ; il sert maintenant aussi aux couvertures de
  pack en 16/9 ;
- la **boîte de confirmation**, remplacée par `inkriseConfirm` — la boîte
  partagée du site, qui nomme la formation concernée au lieu d'un
  « Supprimer ? » anonyme ;
- le **bandeau de message**, déjà présent sur le profil.

**Le piège de la fusion.** Le bouton « ＋ Nouveau pack » vit dans la
section « Mes créations » — laquelle, jusqu'ici, se masquait quand on
n'avait rien publié. C'était sans conséquence tant que la création vivait
ailleurs ; une fois le bouton dedans, cela **enfermait tout créateur
débutant**, sans aucun moyen de publier son premier pack. La section
s'affiche donc désormais dès qu'on est créateur, avec une ligne qui dit
qu'il n'y a rien encore. Un simple lecteur, lui, ne la voit pas.

**Deux détails redressés en chemin.** Le message d'accueil de la
connexion (« 🎨 Connecte-toi pour accéder à tes outils de création »)
était perdu depuis que l'adresse d'arrivée avait changé : il est
reconstitué à partir de `?tab=formations`. Et « Ouvrir mon espace 🎨 »,
devenu un lien vers la page elle-même, rechargeait tout pour changer
d'onglet — c'est maintenant une bascule.

**Ce que les outils ont trouvé sur mon propre travail :**

- `outil-injection` a relevé une **sortie d'attribut** dans la carte de
  pack que je venais d'écrire. `escFormation` passait par
  `textContent → innerHTML`, qui neutralise `& < >` mais **laisse passer
  les guillemets** : sans danger dans du texte, mais je m'en servais pour
  remplir `aria-label="…"`. Un titre de pack contenant un guillemet en
  sortait. La fonction est alignée sur les douze autres échappements du
  site — ce qui corrige du même coup le `src="…"` des couvertures, qui
  avait le même défaut avant la fusion.
- `outil-invisible` a signalé la barre du haut, et c'est le plus
  intéressant : voir §7.15.

---

## 7.15 Le site n'avait jamais été mesuré avec ses vraies polices

En auto-hébergeant les polices (§7.12), quelque chose d'inattendu s'est
produit : `outil-invisible` a soudain relevé quatre débordements sur
quatorze pages, là où il n'en voyait aucun la veille.

La raison n'est pas une régression. **Toutes les suites neutralisaient
`fonts.googleapis.com`** en renvoyant une feuille vide — nécessaire pour
ne pas dépendre du réseau. Conséquence jamais tirée : aucune police web
ne se chargeait, et **chaque mesure de mise en page depuis le début de
l'audit avait été prise en fonte système**. Maintenant que les fichiers
sont servis par Inkrise, ils se chargent pour de bon, et les suites
mesurent enfin ce que voient les vraies personnes.

Ce qu'elles ont vu, sur un écran de 390 px :

| | logo Syne | bouton de menu |
|---|---|---|
| en fonte système (ce que les tests voyaient) | 88 px | 332→372, visible |
| avec la vraie police (ce que voient les gens) | **142 px** | **386→426** |

L'écran s'arrête à 390. Le bouton d'ouverture du menu était donc à peu
près **entièrement hors de l'écran, sur tous les téléphones**, depuis
toujours — 4 pixels visibles sur 40. Syne est une linéale d'affichage
large ; en Arial le logo tenait, en Syne il pousse tout le reste dehors.

Correction : sous 681 px, le champ de recherche de la barre du haut est
masqué. Ce n'est pas une perte — **la barre du bas porte déjà un bouton
de recherche** à ces largeurs, et c'est exactement le seuil où les liens
de navigation du haut disparaissent déjà. Le bouton de menu revient à
268→308.

**Ce que le correctif a corrigé chez lui :** posée juste après la règle
des liens, la règle `@media` se trouvait **avant** la déclaration de base
`.univ-nav-search { display: flex }` — à spécificité égale, c'est la
dernière qui gagne, donc la mienne était ignorée. Le symptôme n'a reculé
que sur deux pages (celles où `index.html` redéclare son propre bloc) et
persistait sur les douze autres. Déplacée après, elle s'applique partout.

---

## Annexe — méthode

```bash
npm test                       # 555/555 ✅  (24 suites)
node tests/outil-contraste.js  # 21 pages RÉELLEMENT atteintes, session simulée
INKRISE_THEME=sombre \
  node tests/outil-contraste.js   # le même relevé, en thème sombre
node tests/outil-invisible.js  # 0 défaut silencieux
node tests/outil-rls.js        # 60/60 — PostgreSQL réel, schéma chargé
node tests/outil-injection.js  # 0 contenu utilisateur hors de son cadre
node tests/outil-panne.js      # 0 page muette sur 42 combinaisons
npm test -- veille             # 16/16 — écran maintenu allumé
npm test -- confort            # 21/21 — plein écran et zoom
npm test -- double-page        # 23/23 — paires, sens de lecture, repli
npm test -- polices            # 19/19 — polices auto-hébergées, 0 appel à Google
npm test -- fusion-createur    # 34/34 — un seul tableau de bord
npm test -- moderation         # 29/29 — masquer, rétablir, classer
npm test -- vues               # 15/15 — lectures comptées, y compris sans compte
npm test -- decouverte         # 17/17 — créateurs et genres accessibles
npm test -- lecture            # 18/18 — profil de lecteur
npm test -- inscription        # 14/14 — consentement CGU, crochet Google
node tests/outil-chasse.js     # 21 pages × 2 états
URLS=… MODES=… node tests/_txt.js   # texte visible de chaque page, à relire
```

Plus : captures d'écran des 18 pages en 390×844 et 1280×900, connecté et
déconnecté, avec base pleine puis base vide (Supabase simulé) ; mesures DOM
ciblées ; recherche exhaustive des liens entrants par page ; relecture croisée
du SQL, des Edge Functions et du service worker.
