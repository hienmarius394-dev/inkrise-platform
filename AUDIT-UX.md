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

## 7.16 Ce qui est replié n'est jamais mesuré

Troisième tour de la même leçon, et la plus productive : **les défauts se
cachent là où la mesure ne va pas**. Après les pages qui redirigent
(§7.13) et les polices jamais chargées (§7.15), voici deux angles morts
de plus — et ils étaient les plus gros.

### `display: none` fait sortir de toute sonde

`profil.html` a **sept onglets dont un seul est affiché**. Chaque page
cache ses modales au repos. Or toutes les sondes du projet écartent ce
qui est en `display: none` — à raison, on ne mesure pas ce qu'on ne voit
pas. Sauf que personne n'ouvrait rien avant de mesurer : on examinait un
septième du profil en croyant l'avoir vu en entier.

Les trois outils déplient désormais tout — onglets, modales, volets —
avant de sonder. Ce qui a fait sortir, entre autres, un bouton **✕ de
28×28 px** : la sortie de secours d'une fenêtre, sous le seuil des 32 px,
et d'autant plus important depuis que le formulaire de pack vit dans une
modale (§7.14).

### La sonde de contraste abandonnait sous un dégradé

Plus grave. En remontant la chaîne des fonds pour composer la couleur
réelle derrière un texte, la sonde faisait `break` dès qu'elle croisait
une image de fond — impossible de connaître la couleur exacte sous un
dégradé, donc on renonce.

Or **le `body` de la page d'accueil porte un dégradé radial décoratif**.
Conséquence : pas un seul texte d'`index.html` n'a jamais été mesuré. La
page la plus vue du site était intégralement hors de portée de l'outil
qui certifiait le site lisible.

La correction ne renonce plus : elle calcule le rapport en supposant le
dégradé **tout noir**, puis **tout blanc**, et ne signale que si les deux
échouent. Un texte qui passe sous l'un des deux extrêmes est peut-être
lisible ; un texte qui échoue sous les deux ne l'est nulle part. Aucun
faux positif possible, et plus aucun angle mort.

### Ce que les deux corrections ont sorti

**Huit couples fautifs de plus en thème sombre**, dont deux séries :

- `index.html` — la modale « Deviens créateur », atteinte par
  `index.html?premium=1` (la destination de l'ancienne redirection
  `/premium.html`), était un panneau **blanc à 92 %** portant du texte
  `#f2f0f7`. Blanc sur blanc, **1,05:1** : rigoureusement illisible.
- `lecteur.html` — **six panneaux « verre dépoli » figés en blanc** : la
  barre du haut, la barre du bas, le volet des chapitres, l'écran de fin
  de chapitre, la section des commentaires et le bandeau des planches.
  Autrement dit, le mode sombre du **lecteur** — le cœur d'un site de
  lecture de mangas — était cassé en six endroits.

Et la raison pour laquelle le test de thème ne l'avait pas vu non plus :
**`lecteur.html` ne figurait pas dans sa liste de pages.** Vingt pages
énumérées, et pas celle-là.

Aucune variable nouvelle n'a été nécessaire : le thème possédait déjà
`--nav-fond`, `--bnav-fond` et `--drawer-fond` pour exactement ces rôles.
Il a fallu ajouter `--teal-link`, dernier survivant du motif « teinte de
fond employée comme couleur de texte » (2,19:1 sur la pastille
« GRATUIT »).

### Les cibles tactiles, du constat au garde-fou

`outil-chasse` relevait depuis longtemps « 71 cibles trop petites » sans
que rien n'en soit fait — un rapport qu'on lit et qu'on oublie. Une fois
tout déplié, elles sont montées à 78, puis redescendues à **45** après
correction des commandes réellement concernées : les trois boutons de
fermeture de modale, les pastilles de genre (31 px), le bouton de
téléchargement hors-ligne, le ✕ de retrait de la bibliothèque, la
vignette de suppression d'image du formulaire de pack (22 px — la
mienne), « Reprendre », « Ne plus suivre », « ✓ Lu » et le bouton qui
change ton rôle sur le site, qui faisait **17 px de haut** parce qu'il
était affiché en `inline`.

Les 45 restantes sont des **liens de texte en ligne** : pied de page,
logo, « Voir tout → » dans un titre de rangée. Un lien dans une phrase a
la hauteur de sa ligne ; l'agrandir reviendrait à réécrire la mise en
page pour un gain douteux. C'est une décision, pas un oubli.

Surtout, le constat est devenu un **garde-fou** : `accessibilite.test.js`
vérifie maintenant qu'aucun `<button>` ne passe sous 32 px sur cinq
pages, **tout déplié**. Éprouvé en rétrécissant le bouton ✕ : trois
échecs ressortent.

---

## 7.17 Personne n'est obligé d'écrire court

Trois pistes suivies, deux qui ont payé.

### 320 px — l'iPhone SE et les Android d'entrée de gamme

C'est à **390 px** qu'on avait trouvé le bouton de menu hors de l'écran
(§7.15). La marge y était donc déjà nulle — or beaucoup de téléphones
sont plus étroits. La sonde balaie désormais **320, 390 et 1280**.

Résultat immédiat : sur `upload-manga.html` — la page où tes créateurs
publient — le titre du chapitre et le bouton de fichier sortaient de
l'écran de 6 px. Piège classique de flexbox : `flex: 1` **sans**
`min-width: 0` ne rétrécit pas sous la largeur minimale de son contenu.

### Les textes longs — 108 débordements

`outil-injection` empoisonne chaque champ avec du **balisage**. Personne
n'avait jamais essayé la **longueur**. Or rien, nulle part, n'obligeait
qui que ce soit à écrire court : `username` était un `TEXT` sans borne,
sans `maxlength` au formulaire ni contrainte en base.

`INKRISE_LONG=1` rejoue tout le balayage avec des textes longs **et sans
espaces** — le pire cas pour une mise en page. Verdict : **108
débordements**. Un pseudo de soixante caractères étirait la page du
profil de **311 px** et celle d'un auteur de **980 px**. La page entière
partait avec.

**Une ligne a réglé 102 d'entre eux :**

```css
body { overflow-wrap: anywhere; }
```

`anywhere` plutôt que `break-word` : les deux coupent un mot trop long,
mais **seul `anywhere` réduit aussi la largeur minimale de l'élément**.
Sans cela, un enfant de flexbox refuse de rétrécir sous son plus long
mot, et c'est la page entière qui déborde. La propriété s'hérite : une
seule déclaration couvre le site.

Les six derniers venaient de `gestion-chapitres.html`, et méritent un
mot. Sous 600 px, son en-tête passe en `flex-direction: column` avec
`align-items: flex-start`. **En colonne, la largeur devient l'axe
transverse** : `flex-start` fait alors prendre aux enfants la largeur de
leur *contenu*, et `min-width: 0` n'y peut rien puisque la contrainte a
changé d'axe. `align-items: stretch` les garde à la largeur du
conteneur, le texte restant aligné à gauche.

### Et la borne, elle, doit vivre en base

Le CSS coupe désormais les mots, mais rien n'empêchait d'écrire cinq
mille caractères. Les titres avaient déjà `maxlength="80"` ; **le pseudo
— le champ le plus affiché du site — n'avait aucune limite**, ni à
l'inscription ni à l'édition du profil.

`maxlength` ne protège que la saisie : une requête directe le contourne.
D'où quatre contraintes `CHECK` sur `profiles.username` (2–24),
`profiles.bio` (500), `mangas.titre` (80) et `packs_tutoriels.titre`
(80).

Elles sont posées **`NOT VALID`** : la contrainte s'applique à toute
écriture future mais ne relit pas les lignes déjà en place. Sans cela un
pseudo existant trop long ferait échouer la commande — et le tronquer
risquerait de créer un doublon, puisque `username` est `UNIQUE`.

Le refus est prouvé, pas supposé : cinq cas de plus dans `outil-rls.js`,
sur un vrai PostgreSQL. 24 caractères passent, 25 sont refusés.

---

## 7.18 Au clavier — et un bouton de conversion rendu inerte par une décoration

Le défaut silencieux par excellence : rien ne plante, rien ne rougit, ça
marche simplement mal pour qui n'utilise pas de souris. Trois choses ont
été mesurées, aucune ne se lit dans le code.

### Le focus se voit-il ?

On focalise chaque commande et on compare son style calculé à son style
au repos. Si rien ne change — ni contour, ni ombre, ni bordure, ni fond —
la personne qui tabule ne sait pas où elle est. Verdict : **le champ de
recherche du bandeau** n'avait aucune règle de focus, seulement un
`outline: none`. Sur toutes les pages. Idem pour le **textarea de la bio**
du profil, dont la règle voisine ne visait que les `input`.

L'anneau se pose sur la **pilule** qui entoure le champ (`:focus-within`),
pas sur l'input nu : c'est le conteneur qui porte la forme visible.

### Les fenêtres se ferment-elles ?

**Aucune modale de `profil.html` ne réagissait à Échap** — ni le
formulaire de pack que je venais d'écrire, ni le recadrage. On ne pouvait
sortir qu'en visant un ✕ à la souris : une impasse. Et le **dialogue de
signalement** d'`assets/inkrise-nav.js` — présent sur chaque page qui
propose de signaler un manga, un commentaire, un post ou un pack — n'avait
ni Échap, ni piège à focus, ni retour du focus. La boîte de confirmation
juste au-dessus de lui, dans le même fichier, faisait déjà tout cela
correctement : il était le seul à ne pas suivre.

Ajouté partout : Échap ferme, le focus reste **piégé** dans la fenêtre
(sinon la tabulation s'échappe dans la page derrière, qu'un voile rend
invisible), et il revient sur le bouton qui l'avait ouverte.

### Le clic atteint-il sa cible ?

Le plus grave, et trouvé par accident : le clic sur **« Devenir Créateur
✨ » expirait**. Le bouton mesure 186×44, il est visible, `display: block`
— et pourtant `document.elementFromPoint` en son centre ne le renvoyait
pas.

La cause : `.creator-banner::before`, **un halo décoratif de 200×200 px**
calé en haut à droite de la bannière, sans `pointer-events: none`. Le
bouton se trouve à droite. Le clic partait donc dans la décoration.

**Le bouton qui transforme un lecteur en créateur — la conversion
principale du site — était inerte sur ordinateur.** Une décoration ne doit
jamais recevoir de pointeur.

### Ce que la chasse a révélé en passant

`openPlans()` et `openModal()` étaient définies dans `profil.html` et
appelées de **nulle part**. La modale « DEVIENS CRÉATEUR » qu'elles
ouvraient — quatorze lignes de balisage, une liste d'avantages, un bouton
d'activation, et 2,3 Ko de CSS — était **inatteignable** depuis que
devenir créateur est gratuit et immédiat (§ backlog n°7). Un vestige de
l'époque des offres payantes, chargé à chaque visite du profil sans
jamais pouvoir s'afficher. Retiré.

### Ce que le test a corrigé chez lui — quatre fois

C'est le tour où l'outil s'est le plus trompé, et chaque erreur était
instructive :

1. **Les transitions.** Juste après `.focus()`, une bordure qui s'anime en
   0,2 s vaut encore son ancienne valeur : le style paraît inchangé. Huit
   champs accusés à tort. On coupe les animations avant de comparer.
2. **L'anneau sur un ancêtre.** Ne regarder que l'élément lui-même
   condamnait un `:focus-within` parfaitement visible. On remonte de deux
   niveaux.
3. **`:focus-visible` ne s'applique pas à un focus posé par script** après
   un clic souris — donc l'anneau que le navigateur dessine tout seul
   n'apparaissait pas, et quatre boutons étaient accusés. La suite **tabule
   pour de vrai** désormais.
4. **`elementFromPoint` seul ne tranche pas.** Sur la barre d'onglets du
   profil il désignait l'ancêtre alors qu'un vrai clic passe très bien ; et
   un lien courant sur deux lignes a un rectangle dont le centre tombe
   *entre* les lignes. Le contrôle a donc quitté `outil-invisible` — trop
   de bruit sans clic réel — pour vivre dans `outil-clavier`, où chaque
   fenêtre est ouverte pour de bon.

Et un dernier, ailleurs : `avis-parametres` a vacillé une fois sous la
charge des vingt-trois autres suites. Elle attendait 2400 ms au chronomètre
là où il fallait attendre l'événement. Un test qui vacille ne protège de
rien.

---

## 7.19 Le réglage « réduire les animations » était ignoré

Les systèmes d'exploitation proposent depuis longtemps de **réduire les
animations**. Ce n'est pas une coquetterie : pour les troubles
vestibulaires, un panneau qui surgit ou une page qui glisse jusqu'à une
ancre provoquent réellement des vertiges et des nausées.

Le site déclarait **30 animations et 183 transitions**, et respectait la
préférence à **deux endroits, dans une seule page** (`lecteur.html`).
Mesuré avec le réglage actif : l'accueil gardait 4 animations et 11
transitions, la fiche manga 17 transitions.

Une règle unique dans `assets/inkrise-theme.css` couvre tout le site.

**Les indicateurs de chargement gardent leur rotation.** Elle dit « ça
travaille », elle est petite, elle ne traverse pas l'écran : ce n'est pas
ce que le réglage cherche à éteindre, et un compteur figé ferait croire à
une panne.

**Ce que le CSS ne peut pas faire.** `scroll-behavior: auto !important`
n'a **aucun effet** sur `scrollIntoView({ behavior: 'smooth' })` :
l'argument passé au code l'emporte sur la feuille de style. Or le site en
compte dix-huit appels — retour en haut d'une liste, saut vers un onglet,
vers un commentaire. Plutôt que de reprendre chaque appel (et d'en
oublier au prochain ajout), `assets/inkrise-theme.js` — chargé en `<head>`
sur les vingt et une pages — **rétrograde le glissement en saut
instantané** tant que la préférence est active. Un seul endroit, valable
aussi pour le code écrit demain.

**Ce que le test a corrigé chez lui :** j'avais écrit
`animation-duration: revert !important` pour rendre aux compteurs leur
rotation. `revert` rend la valeur du **navigateur** — soit `0s` — et non
la règle de l'auteur écrite plus haut : les indicateurs se figeaient. Le
contrôle l'a dit tout de suite. Les durées réelles sont désormais
redonnées explicitement.

Les deux garde-fous ont été éprouvés en retirant chaque correctif : la
règle CSS enlevée, cinq animations ressortent ; la rétrogradation du
défilement enlevée, il glisse de nouveau.

---

## 7.20 Ce qu'entend un lecteur d'écran

Une page peut être parfaitement lisible à l'œil et incompréhensible à
l'oreille. Nouvel outil, `tests/outil-semantique.js`, qui mesure le **DOM
rendu** — beaucoup de titres sont posés par JavaScript, les lire dans le
fichier ne prouverait rien.

**Seize défauts, en trois familles.**

### Treize commandes qui ne disent pas leur nom

Un bouton dont le contenu se réduit à une icône s'annonce « bouton », un
point c'est tout. Le bouton de recherche du bandeau (13 pages), la cloche
de notifications (13), la fermeture du menu (14), l'œil qui révèle le mot
de passe, les trois actions sur un chapitre, les deux interrupteurs de
publication, le réglage de largeur du lecteur, la navigation entre
chapitres. Tous nommés par `aria-label`, l'icône passée en
`aria-hidden`.

### Huit pages sans titre principal

Dont **l'accueil, la bibliothèque, le profil et la communauté**. Le `<h1>`
est la première chose qu'annonce un lecteur d'écran, et le repère qui dit
« voilà de quoi parle cette page ». Sans lui, on atterrit dans le vide.

Leur maquette n'a pas de grand titre visible et en ajouter un changerait
le dessin : d'où un titre **lu mais non vu** (`.sr-uniquement`, en
`clip-path` — `display: none` le retirerait de l'arbre d'accessibilité,
c'est-à-dire du seul endroit où il sert).

Le profil partait de `<h3>` : ajouter un `<h1>` y aurait créé un saut de
niveau. Ses douze titres de section sont donc remontés en `<h2>`.

### Aucune page n'avait de repère « contenu principal »

Sur les vingt et une. Sans `<main>`, impossible de sauter la navigation :
il faut la retraverser à chaque page. Douze pages sont désormais
enveloppées dans un vrai `<main>`, les huit autres portent `role="main"`
sur leur conteneur unique.

### Ce que le test a corrigé chez lui

Ma première version comparait `textContent`, `aria-label` et `title`, et
accusait les **quatre interrupteurs des Paramètres**. Ils sont pourtant
parfaitement nommés : `<button>` est un élément **étiquetable**, et leur
`<label for>` leur donne « Masquer le contenu 18+ », « Garder l'écran
allumé »… L'outil lit désormais `ariaSnapshot()` — le nom **réellement
calculé**, celui qu'un lecteur d'écran prononce.

### Et ce que la batterie a rattrapé chez moi

Remonter les `<h3>` du profil en `<h2>` a cassé le message d'erreur de
« Ma lecture » : le code faisait `vide.querySelector('h3')`, qui rend
`null` — plus aucun message, aucune trace. Un sélecteur couplé au **niveau
de titre**. Il vise maintenant un rôle (`[data-role="titre"]`), stable
quelle que soit la balise.

---

## 7.21 Après une mise en ligne, les gens voyaient l'ancienne feuille de style

Le service worker ne traitait pas les pages et les assets de la même
façon :

- les **pages** étaient servies réseau d'abord — donc toujours fraîches ;
- les **assets** (CSS, JS) étaient servis **depuis le cache**, et
  rafraîchis en arrière-plan pour la fois d'après.

Conséquence, mesurée et reproduite : au premier chargement suivant une
mise en ligne, un visiteur qui revient recevait le **nouveau HTML avec
l'ancienne feuille de style**. Rien ne plantait, rien ne s'affichait en
rouge — la page était simplement dessinée avec le CSS de la veille.

Ce n'est pas théorique. Cet audit a beaucoup touché au CSS partagé : le
jour où j'ai ajouté les titres masqués (§7.20), l'ancienne feuille ne
contenait pas `.sr-uniquement` — donc « Ma bibliothèque », « Mon profil »
et « Communauté » se seraient affichés **en gros titre** en haut de chaque
page, pour tous ceux qui revenaient. Un défaut visible, causé par le
cache, et qu'aucun test ne pouvait voir puisque aucun ne simulait un
déploiement.

**La correction sépare deux natures de fichier :**

| | Poids | Change | Stratégie |
|---|---|---|---|
| CSS et JS de la maison | 87 Ko | à chaque mise en ligne | **réseau d'abord**, cache en secours |
| polices, images, icônes, librairie Supabase | 1,3 Mo | jamais | cache d'abord, rafraîchi en fond |

Le hors-ligne reste entier : quand le réseau ne répond pas, le cache
prend le relais — c'est vérifié dans le même test.

`tests/deploiement.test.js` simule un vrai déploiement : il visite le
site, attend que le service worker prenne le contrôle, change un fichier
**sur le serveur**, revient, et regarde ce qui est réellement appliqué. Le
contrôle a été éprouvé en rétablissant l'ancienne stratégie : il rougit.

---

## 7.22 Ce que lisait quelqu'un quand ça ratait

Cette section vient d'une relecture des **textes affichés**, page par
page, sans lire le code : on regarde ce qui s'écrit à l'écran et on
demande si c'est vrai, compréhensible, et écrit dans la voix du site.

### Le message de la base, en anglais, en pleine figure

Vingt-neuf endroits affichaient tel quel le message renvoyé par
PostgREST :

> `new row violates row-level security policy for table "mangas"`
> `duplicate key value violates unique constraint "profiles_username_key"`
> `Edge Function returned a non-2xx status code`
> `Failed to fetch`

C'est de l'anglais, ça décrit la plomberie interne, et surtout ça ne dit
jamais quoi faire. Le défaut s'aggravait tout seul : les quatre
contraintes de longueur ajoutées en §7.17 font qu'une bio trop longue
répondait désormais `violates check constraint "profiles_bio_len"`.

`auth.html` traduisait déjà ses erreurs à la main — la bonne pratique
existait, elle n'avait simplement jamais quitté cette page.
`window.inkriseErreur(error, repli)` la généralise : une table de seize
familles d'erreurs (contraintes, unicité, droits, session expirée,
réseau, quotas, fichier trop lourd, fonction absente) rend une phrase
française qui dit quoi faire. Le détail technique n'est pas perdu, il
part dans la console — c'est là qu'on en a besoin.

| Avant | Après |
|---|---|
| `new row violates row-level security policy…` | Tu n'as pas les droits pour faire ça. Reconnecte-toi, ou vérifie que ce contenu t'appartient. |
| `duplicate key value violates unique constraint "profiles_username_key"` | Ce pseudo est déjà pris. Choisis-en un autre. |
| `JWT expired` | Ta session a expiré. Reconnecte-toi pour continuer. |
| `Edge Function returned a non-2xx status code` | Le service est momentanément indisponible. Réessaie dans un instant. |

Une `alert()` du navigateur traînait encore dans `upload-manga.html` —
la dernière fenêtre système du site, retirée avec le reste.

### Le site changeait de registre en passant de page en page

Tout Inkrise tutoie, jusque dans les CGU. `communaute.html` vouvoyait :
« Écrivez une réponse », « Vous avez déjà voté », « Partagez quelque
chose avec votre communauté ». Douze occurrences, sur la page où l'on
prend le plus la parole. Corrigées, et tenues par un contrôle statique.

### Des faits inventés au milieu de faits vrais

Trois affirmations ne reposaient sur rien, et empruntaient leur
crédibilité aux chiffres réels posés à côté :

- **`manga.html` — « Format pages : 800 × 1200 px »**, déduit du seul
  type de l'œuvre. Rien ne le mesurait : les planches sont réduites à
  1600 px de côté au dépôt, jamais à 800 × 1200. La ligne annonce
  désormais le **sens de lecture**, qui est choisi par l'auteur et
  réellement appliqué par le lecteur — avec la règle recopiée à
  l'identique de celle du lecteur, pour que l'annonce corresponde au
  comportement.
- **`tutoriels.html` — « HD / Qualité »**, en dur, entre deux
  statistiques calculées. Un pack peut être un PDF, un ZIP ou un lien
  vidéo : rien ne garantit quoi que ce soit. Remplacé par un compte
  vérifiable, le nombre de créateurs qui proposent un pack.
- **`index.html` — « Wave · Orange Money · MTN MoMo · Stripe »**. Stripe
  n'existe nulle part dans le code ; le seul prestataire branché est
  CinetPay. Plus grave, la **politique de confidentialité** et les
  **CGU** nommaient Stripe comme sous-traitant de paiement sans jamais
  citer CinetPay — un document qui engage, et qui désignait le mauvais
  destinataire des données bancaires. Les trois pages nomment maintenant
  le prestataire réel.

### Une valeur brute de la base, affichée telle quelle

`pack.html` écrivait « Niveau : debutant » — sans accent ni majuscule,
la chaîne exacte stockée en base. `manga.html` et `gestion-chapitres.html`
passaient déjà leurs valeurs par une table de libellés ; `pack.html`
était le seul à ne pas le faire.

Le même défaut avait une seconde moitié, invisible : dans le formulaire
d'édition, `select.value = 'debutant'` ne correspondait à aucune option,
le champ s'affichait **vide**, et le premier enregistrement suivant
rétrogradait silencieusement le pack en « Tous niveaux ».

`tests/messages.test.js` (39 contrôles) passe quinze erreurs réelles à la
table de traduction et vérifie qu'aucun jargon n'en ressort, puis pose
trois gardes statiques : plus aucun `error.message` affiché, plus aucune
fenêtre native, plus aucun vouvoiement. Les trois gardes ont été éprouvés
en réinjectant le défaut qu'ils doivent voir — ils rougissent.

---

### Fin du passage — les cinq dernières pages

`auth`, `admin`, `404`, `gestion-chapitres` et les pages légales se
lisent bien. Trois écarts sont ressortis :

- **Un lien de lecture inutilisable renvoyait à l'accueil, sans un mot.**
  Le cas est banal : une messagerie qui coupe l'adresse au « & » garde
  `manga_id` et perd `chapitre`. On atterrissait sur la page d'accueil
  sans comprendre. Or dans ce cas on sait encore de quelle œuvre il
  s'agit — on amène désormais la personne à sa **liste de chapitres**,
  c'est exactement ce qu'elle cherchait ; et à la page 404, qui le dit
  avec des mots, quand l'adresse ne porte plus rien.
- **Les CGU §6 promettaient une information qui n'existait nulle part :**
  « les modalités de remboursement éventuel sont précisées lors de
  l'achat ». Avant de payer, la seule phrase affichée parlait des moyens
  de paiement. La mention dit maintenant ce que le document annonce —
  accès immédiat, renonciation à la rétractation qui en découle, et à
  qui écrire en cas de contenu non conforme.
- **`creators-remuneration.html` était titrée « Gagne de l'argent avec
  tes mangas »**, au présent, alors que la page explique juste dessous
  que le reversement démarrera « dès que la communauté sera assez
  grande ». Le titre reprend celui de l'onglet — « Comment les créateurs
  sont payés » — qui est aussi le nom sous lequel les CGU renvoient à
  cette page.

Les trois contrôles ajoutés ont été éprouvés en rétablissant l'ancien
comportement : ils rougissent.

---

## 7.23 Le premier jour — quand la base est vide

Cette section vient d'un angle mort de la mesure elle-même. **Toutes les
suites remplissent Supabase avant de regarder** : deux mangas, un
chapitre, un pack, un abonné, un avis. C'est commode, et c'est l'inverse
exact de ce que voit quelqu'un qui vient de créer son compte — ou de ce
qu'a vu la toute première personne arrivée sur le site.

`tests/outil-parcours.js` parcourt donc le site avec une **base
entièrement vide**, connecté et déconnecté, et cherche trois choses :
une page qui ne propose **aucune action** hors coquille commune, une page
**muette**, une action qui pointe vers une page **inexistante**.

### L'accueil disait trois fois « rien »

Sans un seul manga publié, la page d'accueil affichait :

> Aucun manga en avant pour l'instant. … Aucun manga populaire pour
> l'instant. … Aucune mise à jour récente.

Trois constats de vide, et trois liens « Voir tout → » menant tous au
même catalogue vide. Un mur de rien, avec trois portes vers la même pièce
vide. Rien n'invitait à publier — alors que c'est la seule chose utile
qu'on puisse faire ce jour-là, et que le titre juste au-dessus dit
« Publie, partage et monétise ta passion manga ».

Quand les **trois** sections reviennent vides, le catalogue l'est
entièrement : ce n'est pas « pas de tendance cette semaine », c'est un
site qui n'a encore rien. On le dit une fois, et on propose de publier.
Sans compte, le bouton passe par l'inscription en conservant la
destination — plutôt que d'ouvrir un formulaire qui redemandera de se
connecter.

### Deux textes qui supposaient ce qui n'existe pas

- `tutoriels.html` annonçait « **Aucun pack dans cette catégorie** »
  alors qu'aucun filtre n'était posé : on accusait le filtre d'un vide
  qui n'avait rien à voir avec lui. Et « **D'autres tutoriels arrivent
  bientôt !** » supposait qu'il en existe déjà, tout en promettant une
  suite que rien ne garantit.
- La même page affichait « **À partir de : Gratuit** » pour un catalogue
  de zéro pack — un prix annoncé pour ce qui n'existe pas.

### Un renvoi muet de plus

`gestion-chapitres.html` renvoyait vers `profil.html` — sans un mot —
quand le manga demandé n'existait pas ou ne vous appartenait pas. On se
retrouvait sur son profil, sur un onglet au hasard, sans comprendre. Le
cas arrive avec un favori devenu caduc ou une œuvre supprimée depuis un
autre appareil. On arrive maintenant sur l'onglet « Mes Mangas » — le
seul endroit utile — et la raison est dite.

### Deux taux pour une seule promesse

En lisant les états vides, le taux de reversement est apparu écrit deux
fois, différemment : `profil.html` promet « **tu gardes 90 % de tes
ventes de packs** » dans le bloc qu'on lit avant de devenir créateur,
tandis que `creators-remuneration.html` — la page vers laquelle les CGU
renvoient comme référence — se contentait de « la grande majorité de
chaque vente ». Le chiffre était donc déjà engagé ; c'est la page
faisant foi qui restait vague. Les deux disent maintenant 90 %.

### Deux pièges dans l'écriture de l'outil

Les deux ont failli produire de fausses accusations, et tous deux tiennent
à la même cause :

1. `innerText` sur un **clone détaché** du document ne connaît plus la
   mise en forme et rend donc aussi les onglets repliés. Le profil
   paraissait contenir 68 000 caractères, et `auteur.html` affichait à la
   fois « Profil introuvable » **et** le profil.
2. `innerText` sur un élément **non rendu** (`display:none`) retombe lui
   aussi sur `textContent`. Une zone principale entièrement masquée
   passait pour pleine de texte — le contrôle « page muette » ne se
   déclenchait jamais.

Les trois règles de l'outil ont ensuite été éprouvées en injectant chacun
des trois défauts : elles les voient. `tests/premier-jour.test.js`
(22 contrôles) fige le résultat, et chacun de ses contrôles a été vérifié
en rétablissant le comportement d'origine.

---

## 7.24 Le site sur un vrai réseau lent

Dernier angle mort de la même famille que §7.15 (« jamais mesuré avec ses
vraies polices ») : **toutes les mesures de cet audit ont été prises en
local**, où une requête revient en une milliseconde. Le public d'Inkrise
lit sur téléphone, en Afrique de l'Ouest et ailleurs : la 3G y est la
norme, pas l'exception.

`tests/outil-lent.js` rejoue trois débits par le protocole de débogage
Chrome — fibre, 3G correcte, 3G médiocre (400 kb/s, 2 s de latence) — plus
un profil « bord de couverture » à 200 kb/s.

**Première correction à faire, sur l'outil lui-même :** mon serveur de
test servait les fichiers non compressés. Vercel envoie tout le texte en
brotli. `assets/supabase.js` pèse 203 Ko sur le disque et **44 Ko sur le
fil** ; `profil.html`, 132 Ko et 28 Ko. Mesurer sans compression aurait
fabriqué un problème inexistant en production.

### Le préchargement des polices coûtait 1,6 seconde

Les 21 pages portaient deux lignes ajoutées lors de l'auto-hébergement des
polices (§7.15) :

```html
<link rel="preload" as="font" href="assets/fonts/syne-latin.woff2" crossorigin />
<link rel="preload" as="font" href="assets/fonts/dmsans-latin.woff2" crossorigin />
```

Elles disent au navigateur : *réclame ces 70 Ko en priorité maximale,
tout de suite*. Sur fibre, c'est gratuit — la capacité est là. Sur un
lien à 400 kb/s, **ça vole le tuyau au HTML et au CSS**, sans lesquels
rien ne peut être peint.

| | Avec préchargement | Sans | Écart |
|---|---|---|---|
| fibre | 742–1066 ms | 883–1035 ms | *indistinguable* |
| 3G | 1807 ms | 1444 ms | −360 ms |
| 3G médiocre | 6321 / 6328 ms | 4618 / 4670 ms | **−1,7 s** |

Sur fibre, la différence est plus petite que la variation d'un essai à
l'autre : le préchargement n'y achetait rien de mesurable. Il est retiré
des 21 pages. `font-display: swap` fait le reste — le texte s'affiche
immédiatement dans la police système, la vraie arrive derrière.

### Deux inquiétudes vérifiées, puis écartées

Il faut savoir ne pas « corriger » ce qui va bien :

- **Le garde-fou anti-page-figée conclut à la panne au bout de 10 s.**
  Au bord de la couverture, `lecteur.html` met 12,3 s. J'ai donc cherché
  la fausse alerte — elle n'existe pas : le garde-fou ne se déclenche que
  si la page *paraît encore vide* (`loaderVisible() || zoneVide()`), et à
  10 s le balisage statique est peint depuis longtemps. Conditionné sur
  ce qui est à l'écran, pas sur une minuterie aveugle.
- **`hero-manga.webp` pèse 110 Ko, 37 % de l'accueil.** Mais `manga.html`,
  qui n'a aucune image, s'affiche en 4 590 ms contre 4 614 ms pour
  l'accueil : l'image n'est pas sur le chemin critique. Le reste du délai
  est le produit de deux allers-retours à 2 s de latence — de
  l'architecture, pas un défaut.

### Un envoi coupé publiait une œuvre amputée

Celui-ci est une vraie faute, et il ne se voit qu'en simulant la coupure.
`upload-manga.html` envoie les planches une par une. Quand l'envoi
échoue, il compte les échecs, prévient l'auteur — et **publie quand
même**. Sur un réseau qui lâche à la moitié d'un chapitre, l'œuvre
partait en ligne avec trois planches sur dix, sans que rien ne le
signale aux lecteurs.

Le brouillon existe exactement pour ça. Si des planches manquent et que
l'œuvre devait être publique, elle est désormais **basculée en
brouillon**, et on le dit :

> « Œuvre interrompue » a été gardé en brouillon : des planches manquent à
> l'appel. Complète-les depuis la gestion des chapitres, puis publie —
> personne ne verra une version incomplète entre-temps.

La contre-épreuve est dans la même suite : un envoi qui réussit publie
toujours normalement. Une règle qui garderait tout en brouillon serait
pire que le défaut qu'elle corrige.

### Le garde des messages bruts avait un trou

En passant, l'envoi interrompu a montré que
`firstPageErrorMsg = pageErr.message` échappait au garde statique de
§7.22 : celui-ci ne surveillait que `error|err|e|e2`, et **`pageErr` n'a
pas de frontière de mot avant « Err »**. Élargi à n'importe quel
`.message` porté par une variable d'allure erreur, il a immédiatement
révélé une seconde fuite réelle — `upErr.message` dans un toast de
`gestion-chapitres.html`.

Deux fausses accusations sont venues avec, et sont traitées comme telles
plutôt qu'en relâchant la règle : `opts.message` (le texte de la boîte de
confirmation) n'est pas une erreur, et le détail technique de
`manga.html` — 11 px, sous un message en français, seul moyen de
diagnostiquer une panne signalée par quelqu'un qui n'ouvre pas les outils
du navigateur — porte maintenant un marqueur `inkrise-diagnostic-assume`.
Une exception écrite noir sur blanc plutôt qu'un trou dans la règle.

### Où en est le site, chiffré

| | 3G | 3G médiocre | bord de couverture |
|---|---|---|---|
| accueil | 4,2 s | 5,4 s | 7,5 s |
| fiche manga | 4,3 s | 7,2 s | 11,3 s |
| lecteur | 4,3 s | 8,3 s | 12,3 s |

Aucune fausse panne, aucune page figée, aucun saut de mise en page.

---

## 7.25 Quand on tape deux fois

Conséquence directe de §7.24. Les chiffres qui viennent d'en sortir — une
page en 4 à 12 secondes, une écriture souvent 2 de plus — décrivent
exactement la situation où **personne n'attend**. On retape. C'est le
geste le plus banal du monde, et il ne se reproduit jamais en local : la
réponse revient avant que le doigt se relève. C'est précisément pour ça
qu'il n'avait jamais été mesuré.

`tests/outil-double.js` ralentit chaque écriture d'une seconde et demie,
tape deux fois à 200 ms d'écart, et compte ce qui atteint vraiment la
base.

### Cinq gestes partaient en double

| Geste | Table | Conséquence du second envoi |
|---|---|---|
| suivre un créateur | `follows` | doublon refusé → **message d'erreur** pour une action réussie |
| s'abonner à un manga | `abonnements_manga` | idem, plus le compteur d'abonnés qui bouge deux fois |
| ajouter à la bibliothèque | `bibliotheque` | `upsert` : la base tient, l'écriture est perdue |
| publier un avis | `avis_mangas` | moyenne et nombre d'avis recalculés deux fois pour rien |
| réagir à un post | `reactions` | doublon refusé → **message d'erreur** ; et au changement d'emoji, un `delete` puis un `insert` entrelacés pouvaient laisser la réaction dans un état incohérent |

Le plus fâcheux n'est pas la base — elle se défend seule avec ses clés.
C'est ce que voit la personne : elle a suivi quelqu'un, ça a marché, et
le site lui répond **« C'est déjà enregistré — inutile de recommencer »**.

Cause commune, visible dans le code : l'état (`isFollowing`,
`isSubscribed`, `inLibrary`) n'est mis à jour qu'**après** l'`await`. Le
second appui, parti 200 ms plus tard, lit encore l'ancienne valeur et
repart dans la même branche.

`auteur.html` faisait déjà les choses correctement — `btn.disabled = true`
en entrée, `false` en sortie. Les cinq autres reprennent ce motif, avec
`try { … } finally` pour que le verrou se lève même en cas d'erreur.

### La contre-épreuve compte autant que le contrôle

Une garde qui resterait fermée serait **pire** que le défaut qu'elle
corrige : plus moyen de se désabonner, de changer d'emoji, de corriger sa
note. `tests/double-appui.test.js` vérifie donc les deux sens — une seule
écriture sur un double appui, et deux écritures sur deux gestes
volontaires espacés.

### Deux corrections sur l'outil, avant de croire ce qu'il disait

- Il a d'abord accusé `lecteur.html` de ne rien montrer pendant l'attente.
  Faux : le code y fait `btn.disabled = true` depuis toujours. C'est mon
  montage qui ne remplissait pas la zone de saisie, donc l'action sortait
  avant d'écrire quoi que ce soit. **Zéro écriture veut dire que le geste
  n'a pas eu lieu** — l'outil le dit maintenant, au lieu d'accuser la
  commande.
- Le jeu d'essai ignorait le filtre `?id=eq.…` et renvoyait toujours le
  premier profil. Le mur communautaire se croyait chez quelqu'un d'autre
  et n'affichait aucun post : on mesurait une page vide en croyant mesurer
  des réactions. C'est en rendant le jeu d'essai fidèle au filtre que le
  défaut des réactions est apparu.

Les dix contrôles ont été éprouvés en retirant les gardes : ils
rougissent tous.

---

## 7.26 Le retour arrière — dernier passage

Sur un téléphone, revenir en arrière n'est pas un bouton dans un coin :
c'est un glissement du pouce depuis le bord, fait cent fois par jour,
souvent sans y penser. C'est **le** geste pour annuler la dernière chose.

Le constat de départ tient en une commande : **aucune page d'Inkrise
n'appelait `history.pushState` ni n'écoutait `popstate`.** Rien n'était
donc inscrit dans l'historique en ouvrant une couche par-dessus l'écran.

### Deux couches ignoraient le geste

- **Le menu latéral**, ouvert depuis les 21 pages. On glissait pour le
  refermer, on quittait la page.
- **La boîte « veux-tu vraiment supprimer ton compte ? »**. Le réflexe
  pour sortir d'une question aussi lourde vous éjectait du site. Échap
  fonctionnait déjà (§7.18) — mais il n'y a pas de touche Échap sur un
  téléphone.

`window.inkriseCouche(fermer)` inscrit une étape dans l'historique à
l'ouverture, et rend la fonction à appeler quand la couche se referme
autrement (bouton, Échap) : elle **consomme alors l'étape ajoutée**, pour
que l'historique reste exactement tel qu'il était. Sans cette symétrie, un
menu fermé par sa croix laissait une étape fantôme et le retour suivant ne
faisait rien du tout — c'est vérifié explicitement dans la suite.

Le mécanisme vit dans `inkrise-nav.js`, donc les trois couches partagées
(menu, boîte de confirmation, fenêtre de signalement) en bénéficient d'un
coup, sur toutes les pages.

### Un arbitrage, écrit noir sur blanc plutôt que corrigé

Changer d'onglet sur le profil quitte encore la page au retour. Les deux
comportements se défendent : empiler sept onglets dans l'historique
obligerait à sept retours pour sortir, ce qui est agaçant autrement. Ce
n'est pas la même situation qu'une couche posée **par-dessus** l'écran, où
le retour est le geste universel de fermeture et où il n'y avait pas
d'arbitrage.

Ce qui a été corrigé là : **l'adresse suit l'onglet**. La page lisait déjà
`?tab=` à l'ouverture — le menu latéral pointe sur
`profil.html?tab=formations` — mais ne l'écrivait jamais. On ouvrait
« Formations », on rechargeait, et on retombait sur « Ma lecture ».
`replaceState` corrige ça sans toucher à l'historique.

Au passage : deux implémentations distinctes du changement d'onglet
coexistaient — le gestionnaire de clic et `goToTab()`. Ma première
correction, posée dans `goToTab` seul, n'a rien changé au clic. Les deux
appellent maintenant la même fonction.

### Deux corrections sur l'outil, encore

- Il a d'abord exigé qu'un **filtre de recherche survive** au retour
  arrière. C'est l'inverse du juste : les filtres sont de vrais liens
  (`recherche.html?genre=Action`), et revenir en arrière **doit** défaire
  le filtre. La page faisait bien son travail ; ma règle était mal
  conçue. Le scénario est gardé comme témoin, avec la bonne attente.
- L'arbitrage sur les onglets faisait rougir l'outil en permanence. Un
  outil toujours rouge finit ignoré : il est désormais rappelé comme
  **choix assumé**, visible mais sans échec.

### Ce que ce dernier passage confirme

Six passages de suite, six fois le même enseignement : **les défauts se
cachent là où la mesure ne va pas.** Ici, la mesure n'allait pas parce
que personne n'avait simulé le geste le plus banal du monde. Et six fois,
l'outil neuf s'est trompé avant de trouver — d'où la règle tenue tout du
long : valider un outil en lui injectant le défaut qu'il doit voir, et
corriger l'outil, pas le site, quand c'est lui qui a tort.

---

## 7.27 Signalé depuis un vrai téléphone : « Chargement… » pour toujours

Celui-ci ne vient pas d'un outil mais d'une capture d'écran envoyée un
matin : le bandeau rouge « Connexion au serveur impossible » s'affichait
bien, et pourtant deux sections de l'accueil restaient sur
« Chargement… » — indéfiniment.

**Le bandeau avait raison** : il ne s'affiche que si une requête vers
Supabase échoue réellement. La connexion du téléphone allait bien ; c'est
le serveur Supabase qui ne répondait pas (un projet du plan gratuit se met
en veille après quelques jours sans activité).

Le défaut est ailleurs, et il a fallu deux reproductions pour le voir :

1. **Serveur qui refuse net** (`abort`) : les « Chargement… »
   disparaissaient en 8 s. Ça ne collait pas à la capture.
2. **Serveur qui accepte la connexion et ne répond jamais** — ce que fait
   un projet en pause. Là, écran identique. Et mesuré : **avant
   correction, il ne se passait rien. Jamais.** Pas de bandeau, pas de
   message, « Chargement… » à l'infini.

Deux mécanismes existaient pourtant, et aucun ne couvrait ce cas :

- `inkrise-reseau.js` n'affiche son bandeau que si une promesse **rejette**.
  Une promesse qui ne se résout jamais ne rejette pas.
- Le garde-fou des dix secondes d'`inkrise-nav.js` (§7.x) ne connaît
  l'accueil ni par ses sélecteurs de chargement (`.empty-state`) ni par sa
  zone principale (`<main id="contenu">`, absent de sa liste). **Il était
  inerte sur la page la plus visitée du site.**

### La correction

- Une requête Supabase encore en attente au bout de **20 secondes** est
  traitée comme un échec. Le seuil est calé sur la mesure de §7.24 : le
  pire cas sur une 3G au bord de la couverture est de 12,3 s.
- Les textes d'attente laissés par une requête qui n'aboutira pas sont
  remplacés par « Indisponible — le serveur n'a pas répondu. »

Ce module s'était explicitement interdit de toucher au contenu, pour ne
jamais effacer ce qui aurait fini par arriver. **La règle tient** : on ne
remplace que le texte d'ATTENTE lui-même, et si la section charge plus
tard, la page réécrit sa zone par-dessus. Un texte d'attente qui ment
n'est pas du contenu à protéger.

### Ce que je n'ai PAS fait, et pourquoi

Rendre le garde-fou des dix secondes plus sensible aurait été le réflexe
— il aurait couvert l'accueil. Mais §7.24 a mesuré des premiers
affichages jusqu'à **12,3 s** sur une connexion réelle : abaisser ou
élargir ce seuil aurait annoncé « le chargement n'aboutit pas » à des
gens dont la connexion fonctionne. On échange alors un silence rare
contre une fausse accusation fréquente. Le délai de 20 s posé sur la
requête elle-même n'a pas ce défaut.

`tests/reseau-lent.test.js` fige les deux sens : à 12 s rien n'est
annoncé, passé 20 s le blocage est dit — et sur une 3G au bord de la
couverture **qui fonctionne**, aucune alerte après 30 s.

---

## 7.28 Quand je ne peux pas mesurer moi-même

La panne de §7.27 a continué après le correctif — normal, celui-ci rend le
blocage lisible, il ne le répare pas. Restait à savoir **où** ça casse.

Et là, un mur : le proxy de l'atelier bloque le domaine Supabase **et** le
domaine Vercel du site. Vérifié, pas supposé :

```
curl https://bsdcpwtimsgxcnaamwip.supabase.co/rest/v1/  → CONNECT tunnel failed, 403
curl https://inkrise-platform.vercel.app/index.html     → CONNECT tunnel failed, 403
```

Aucun chemin réseau vers la production. Toute la méthode de cet audit —
mesurer plutôt que supposer — devenait inapplicable depuis ici.

Ce qui restait vérifiable l'a été : la clé publique du site n'est pas en
cause (émise en 2026, valable jusqu'en 2036).

### Déplacer la mesure là où elle est possible

`diagnostic.html` est une page autonome à ouvrir **depuis le téléphone
concerné**, c'est-à-dire depuis le seul réseau qui compte. Elle teste la
chaîne maillon par maillon — téléphone → site → serveur → clé → données —
et rend un verdict en français avec la marche à suivre.

Deux détails qui comptent :

- Elle **n'inclut pas** `inkrise-reseau.js`. Ce module affiche un bandeau
  dès qu'une requête Supabase échoue ; ici l'échec est précisément ce
  qu'on veut mesurer et raconter proprement.
- Chaque appel a un **délai maximal**. Sans lui, un serveur en veille
  laisserait la page attendre indéfiniment — exactement le défaut corrigé
  en §7.27.

### Une page de diagnostic qui se trompe est pire qu'aucune

Elle envoie réparer ce qui n'est pas cassé. `tests/diagnostic.test.js`
rejoue donc les six situations — serveur en veille, serveur injoignable,
clé refusée, table refusée, téléphone hors ligne, tout va bien — et exige
que chacune produise **son** verdict, pas un autre.

Au passage, une septième situation a été écartée du montage plutôt que
corrigée : couper vraiment le réseau empêchait la page de diagnostic de se
charger elle-même. C'est un artefact du banc d'essai, pas le cas réel — sur
un téléphone, la page est déjà chargée, ou servie par le cache. Le contrôle
simule donc un téléphone qui **se déclare** hors ligne.

---

## Annexe — méthode

```bash
npm test                       # 689/689 ✅  (31 suites)
node tests/outil-contraste.js  # 21 pages RÉELLEMENT atteintes, session simulée
INKRISE_THEME=sombre \
  node tests/outil-contraste.js   # le même relevé, en thème sombre
node tests/outil-invisible.js  # 0 défaut silencieux — 320, 390 et 1280px
INKRISE_LONG=1 \
  node tests/outil-invisible.js   # le même, avec des textes longs et insécables
node tests/outil-rls.js        # 65/65 — PostgreSQL réel, schéma chargé
node tests/outil-injection.js  # 0 contenu utilisateur hors de son cadre
node tests/outil-panne.js      # 0 page muette sur 42 combinaisons
node tests/outil-clavier.js    # focus visible, Échap, piège à focus, retour
                               # du focus, et clic non intercepté
node tests/outil-semantique.js # titres, repère « contenu principal », et nom
                               # accessible RÉEL de chaque commande
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
npm test -- messages           # 39/39 — erreurs traduites, une seule voix
npm test -- premier-jour       # 22/22 — le vide dit et proposé
npm test -- reseau-lent        # 9/9 — 3G, et envoi coupé en brouillon
npm test -- double-appui       # 14/14 — un geste répété, une seule action
npm test -- retour-arriere     # 14/14 — le retour referme la couche
npm test -- diagnostic         # 6/6 — chaque panne, son verdict
node tests/outil-parcours.js   # le PREMIER JOUR : base entièrement vide
node tests/outil-lent.js       # fibre / 3G / 3G médiocre / bord de couverture
node tests/outil-double.js     # ce qui part quand ON TAPE DEUX FOIS
node tests/outil-retour.js     # LE RETOUR ARRIÈRE, geste roi du mobile
node tests/outil-chasse.js     # 21 pages × 2 états, TOUT DÉPLIÉ
URLS=… MODES=… node tests/_txt.js   # texte visible de chaque page, à relire
```

Plus : captures d'écran des 18 pages en 390×844 et 1280×900, connecté et
déconnecté, avec base pleine puis base vide (Supabase simulé) ; mesures DOM
ciblées ; recherche exhaustive des liens entrants par page ; relecture croisée
du SQL, des Edge Functions et du service worker.
