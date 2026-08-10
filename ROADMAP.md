# INKRISE — Roadmap & état des lieux

> Mis à jour le 2026-08-07, après l'audit complet et ses sprints.
> Le détail des constats et des preuves est dans **`AUDIT-UX.md`**.

## ⚠️ Important : SQL à exécuter

Tout le schéma (tables, colonnes, policies RLS, buckets, triggers) est
regroupé dans **`sql_a_executer.sql`**, idempotent et ré-exécutable sans
risque. 👉 **À coller dans Supabase → SQL Editor avant de tester une
nouveauté.**

---

## Vision produit

Inkrise = plateforme pour artistes manga/webtoon :

1. **Lire** — catalogue, fiche manga, lecteur (pages + scroll webtoon),
   bibliothèque personnelle avec reprise de lecture, lecture hors-ligne.
2. **Publier** — upload manga + chapitres + pages, gestion des chapitres,
   espace créateur.
3. **Communauté** — profils créateurs, follow, fil des créateurs suivis,
   murs communautaires (posts, réactions, sondages, commentaires),
   notifications.
4. **Monétiser** — packs tutoriels gratuits ou payants. Paiement réel via
   CinetPay (Wave, Orange Money, MTN MoMo, Moov, carte) : le code est prêt,
   voir `PAIEMENT_CINETPAY.md`. Devenir créateur est **gratuit**, sans
   abonnement.

## Architecture

- **Frontend** : 20 pages HTML autonomes (vanilla JS + CSS en ligne) —
  `espace-createur.html` n'est plus qu'une redirection vers le profil —
  déployées sur Vercel. Socle partagé dans `assets/` :
  `inkrise-theme.css` (couleurs, thème sombre), `inkrise-theme.js` (choix
  du thème, en `<head>`), `inkrise-config.js` (clés publiques),
  `inkrise-nav.js` (barre du bas, menu, garde-fous, partage),
  `inkrise-fonts.css` + `fonts/` (les quatre polices, auto-hébergées),
  `inkrise-offline.js`, `inkrise-img.js`.
- **Backend** : Supabase — Auth, Postgres + RLS, Storage (`avatars`,
  `covers`, `pages`, `community`).
- **Serveur** : `api/og.js` (aperçus de lien, Vercel) et
  `supabase/functions/` (paiement CinetPay, envoi des notifications push).
- **Tests** : 25 suites Playwright, 573 vérifications, plus huit outils de
  diagnostic (contraste, défauts silencieux, RLS sur PostgreSQL réel,
  échappement, pannes, chasse aux zones cliquables, navigation au clavier,
  structure pour lecteurs d'écran).
  Voir `tests/README.md`.

## Livré lors de l'audit (3 sprints)

**Sprint 1 — réparations**
- Inscription : un pseudo déjà pris n'annule plus la création du compte
- Barre du bas masquée sur ordinateur ; bande blanche de la bibliothèque
- « Paiement sécurisé » retiré des packs gratuits ; titre de la rangée créateurs
- Doc CinetPay : consigne de prix erronée corrigée

**Sprint 2 — les gros manques**
- Mode sombre complet (clair / sombre / auto, sans flash)
- Bouton Partager + aperçus de lien rendus côté serveur pour les réseaux
- Communauté : fil des créateurs suivis + onglet Découvrir

**Sprint 3 — rétention**
- Notes et avis sur les mangas, tri « Mieux notés », « À découvrir aussi »
- Page Paramètres : filtre 18+, mode de lecture, notifications, export RGPD
- Notifications push (service worker + envoi serveur)
- Crochet de mesure d'audience

## Backlog

~~1. **Page « tous les créateurs »**~~ — ✅ livré :
   `recherche.html?vue=createurs`, atteinte depuis le « Voir tout → » de
   l'accueil.
~~2. **Pages par genre**~~ — ✅ livré : rangée de genres visible sans
   dérouler de menu, adresses partageables (`recherche.html?genre=Action`),
   et genres cliquables sur les fiches manga.
~~3. **Confort du lecteur**~~ — ✅ livré pour l'essentiel : écran maintenu
   allumé, plein écran, zoom au pincement, et **double page** sur tablette
   et ordinateur (sens de lecture respecté, pas de deux, repli automatique
   sous 900 px). Restent volontairement de côté :
   - **défilement automatique** — **écarté** : son bouton d'arrêt vivrait
     dans la barre du bas, qui se masque justement pendant le défilement ;
     il lutte contre le lecteur au moindre geste ; aucune vitesse ne
     convient à la fois à une planche de dialogue et à une double page
     muette ; et combiné à l'écran maintenu allumé il vide la batterie
     d'un téléphone resté dans une poche. Le mode vertical couvre déjà le
     besoin réel.
   - **signets** — la reprise de lecture couvre déjà le cas courant ; un
     vrai signet demanderait une table supplémentaire.
   - **luminosité** — le navigateur ne donne pas la main dessus ; un voile
     sombre par-dessus les planches fausserait les couleurs des auteurs.
~~4. **Modération**~~ — ✅ livré : masquer / rétablir / classer sans suite,
   aperçu du contenu incriminé, regroupement des plaintes, lien vers le
   commentaire dans son chapitre.
~~5. **Profil de lecteur**~~ — ✅ livré : onglet « Ma lecture » (œuvres
   commencées et terminées, avis donnés, genres les plus lus, reprise des
   lectures en cours). Sans nouvelle colonne.
~~6. **Prix en FCFA à l'affichage**~~ — **écarté**. Inkrise s'adresse à un
   public international, pas seulement ouest-africain : l'affichage reste
   en euros. La conversion vers le XOF continue de se faire côté serveur au
   moment du paiement, pour ceux qui règlent en Mobile Money.
~~7. **Connexion Google**~~ — ✅ livré, en veille : le bouton n'apparaît
   qu'une fois `INKRISE_GOOGLE` activé dans `assets/inkrise-config.js`,
   après configuration du fournisseur côté Supabase.
~~8. **Case « J'accepte les CGU »**~~ — ✅ livré : case jamais
   pré-cochée, liens vers les conditions et la confidentialité.
~~9. **Comptage des vues côté serveur**~~ — ✅ livré : les compteurs ne
   s'écrivent plus à la main (un auteur pouvait mettre ses vues à 999 999),
   et les lecteurs déconnectés sont enfin comptés.
~~10. **Fusionner `espace-createur.html` dans `profil.html`**~~ — ✅ livré.
    Le profil montrait les formations sans permettre de les modifier ;
    l'espace créateur permettait de les modifier sans montrer le reste.
    Tout tient maintenant dans l'onglet **Formations** : créer, modifier,
    supprimer, avec le nombre d'acheteurs par pack. `espace-createur.html`
    subsiste en redirection de cinquante lignes (les favoris, les liens
    extérieurs et `?edit=7` continuent de fonctionner). Trois briques qui
    existaient en double disparaissent : l'outil de recadrage, la boîte de
    confirmation et le bandeau de message.
~~11. **Polices auto-hébergées**~~ — ✅ livré : les quatre familles (Syne,
    DM Sans, Nunito, Bebas Neue) sont servies depuis `assets/fonts/`. Plus
    aucun appel à `fonts.googleapis.com` ni `fonts.gstatic.com` sur les 21
    pages, donc plus d'adresse IP transmise à Google — et deux
    allers-retours réseau en moins avant le premier mot correctement
    dessiné. Grâce aux **versions variables**, huit fichiers suffisent
    (200 Ko, dont la moitié n'est téléchargée que si un pseudo l'exige) là
    où il en aurait fallu seize en graisses fixes. Le service worker les
    précharge, donc elles tiennent hors-ligne. Voir `assets/fonts/README.md`
    pour la mise à jour.

12. **Trou de mesure refermé** — `tests/outil-contraste.js` s'exécutait
    déconnecté : les sept pages protégées redirigeaient vers `auth.html`,
    qu'il mesurait sept fois en croyant mesurer sept pages. Il annonçait
    « 0 couple sous le seuil sur 21 pages » en n'en ayant vraiment vu que
    quatorze. Réparé (session simulée, paramètres d'URL, et un avertissement
    quand une page n'est pas atteinte), il a relevé **33 couples fautifs**
    entre les deux thèmes, tous corrigés à la racine : deux variables pour
    les cartes « verre dépoli » figées en blanc, les variantes de texte
    déjà prévues par le thème à la place des teintes de fond, et deux
    aplats assez sombres pour porter du texte blanc.

13. **Deux autres angles morts refermés** — même leçon, deux tours plus
    loin. (a) Les sondes écartent ce qui est en `display:none`, et
    personne ne dépliait rien avant de mesurer : on examinait **un onglet
    sur sept** du profil, et aucune modale. (b) La sonde de contraste
    **abandonnait dès qu'elle croisait un dégradé** en remontant la chaîne
    des fonds — or le `body` de l'accueil en porte un, donc **pas un seul
    texte de la page la plus vue du site n'avait jamais été mesuré**. Elle
    calcule désormais le rapport sous les deux extrêmes (tout noir, tout
    blanc) et ne signale que si les deux échouent.

    Ce que ça a sorti : la modale « Deviens créateur » de l'accueil,
    **blanche sur blanc à 1,05:1** en thème sombre ; et **six panneaux du
    lecteur** figés en blanc — barre du haut, barre du bas, volet des
    chapitres, écran de fin, commentaires, bandeau des planches. Le mode
    sombre du lecteur, cœur du site, était cassé en six endroits. Au
    passage : `lecteur.html` ne figurait pas dans la liste de pages du
    test de thème.

14. **Cibles tactiles** — le rapport « 71 cibles trop petites » traînait
    sans suite. Ramené à **45** en corrigeant les commandes réellement
    concernées (boutons de fermeture de modale à 28 px, pastilles de
    genre, téléchargement hors-ligne, ✕ de la bibliothèque, et le bouton
    qui change ton rôle, haut de **17 px** parce qu'affiché en `inline`).
    Les 45 restantes sont des liens de **texte en ligne** — pied de page,
    logo, « Voir tout → » : les agrandir voudrait dire réécrire la mise en
    page. Décision assumée. Le constat est devenu un garde-fou dans
    `accessibilite.test.js`.

16. **Navigation au clavier** — nouvel outil `tests/outil-clavier.js`.
    Trois manques, dont un grave :
    - **le focus ne se voyait pas** sur le champ de recherche du bandeau
      (aucune règle de focus, seulement `outline: none`, sur toutes les
      pages) ni sur le textarea de la bio ;
    - **aucune modale de `profil.html` ne réagissait à Échap**, et le
      dialogue de **signalement** partagé n'avait ni Échap, ni piège à
      focus, ni retour du focus — alors que la boîte de confirmation juste
      au-dessus de lui, dans le même fichier, faisait tout cela ;
    - ⚠️ **« Devenir Créateur ✨ » ne recevait pas le clic.** Un halo
      décoratif de 200×200 px en `::before`, sans `pointer-events: none`,
      l'interceptait. Le bouton qui transforme un lecteur en créateur — la
      conversion principale du site — était **inerte sur ordinateur**.

    Relevé en passant : la modale « DEVIENS CRÉATEUR » de `profil.html`
    était **inatteignable** — `openPlans()` définie, appelée de nulle part
    depuis que devenir créateur est gratuit et immédiat. Retirée, avec ses
    2,3 Ko de CSS.

17. **Réglage « réduire les animations »** — il était ignoré. 30
    animations et 183 transitions déclarées, la préférence respectée à
    deux endroits dans une seule page. Ce n'est pas une coquetterie : pour
    les troubles vestibulaires, un panneau qui surgit ou une page qui
    glisse jusqu'à une ancre donnent réellement la nausée. Une règle
    unique couvre désormais tout le site — les indicateurs de chargement
    exceptés, leur rotation informe et un compteur figé ferait croire à
    une panne. Et comme `scroll-behavior: auto !important` ne peut rien
    contre `scrollIntoView({behavior:'smooth'})`, le glissement est
    rétrogradé en saut depuis `inkrise-theme.js`, chargé sur les 21 pages.

18. **Ce qu'entend un lecteur d'écran** — nouvel outil
    `tests/outil-semantique.js`. Seize défauts : **treize commandes sans
    nom** (le bouton de recherche du bandeau, la cloche, la fermeture du
    menu, l'œil du mot de passe, les actions sur un chapitre…, toutes
    annoncées « bouton » et rien d'autre) ; **huit pages sans `<h1>`**,
    dont l'accueil, la bibliothèque, le profil et la communauté ; et
    **aucune page** ne portait de repère « contenu principal », donc
    impossible de sauter la navigation.

19. **Contenu périmé après une mise en ligne** — le service worker servait
    les pages réseau d'abord (fraîches) mais le CSS et le JS **depuis le
    cache**. Au premier chargement suivant un déploiement, un visiteur qui
    revenait recevait donc le **nouveau HTML avec l'ancienne feuille de
    style**. Le jour des titres masqués, cela aurait affiché « Ma
    bibliothèque » ou « Mon profil » en gros titre sur chaque page.
    Corrigé en séparant les 87 Ko de CSS/JS maison (réseau d'abord, cache
    en secours) des 1,3 Mo de polices, images et librairie (cache d'abord).
    Le hors-ligne reste entier.

15. **Personne n'est obligé d'écrire court** — l'outil de défauts
    silencieux balaie désormais **320 px** (iPhone SE) en plus de 390 et
    1280, et sait rejouer tout le site avec des **textes longs et sans
    espaces** (`INKRISE_LONG=1`). Verdict : **108 débordements**. Un pseudo
    de soixante caractères étirait la page du profil de 311 px et celle
    d'un auteur de 980 px. Une ligne en a réglé 102 —
    `body { overflow-wrap: anywhere }`, `anywhere` et pas `break-word`
    parce que seul lui réduit aussi la largeur minimale d'un enfant de
    flexbox. Les six derniers venaient d'un `align-items: flex-start` en
    colonne, où la largeur devient l'axe transverse.

    Et la borne manquait aussi en base : `username` était un `TEXT` sans
    limite, sans `maxlength` au formulaire. ⚠️ **Nouveau SQL à exécuter** —
    quatre contraintes `CHECK`, posées `NOT VALID` pour ne pas rejeter les
    lignes existantes.
