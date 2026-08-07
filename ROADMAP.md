# INKRISE — Roadmap & état des lieux

> Mis à jour le 2026-08-05, après l'audit complet et ses trois sprints.
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

- **Frontend** : 21 pages HTML autonomes (vanilla JS + CSS en ligne),
  déployées sur Vercel. Socle partagé dans `assets/` :
  `inkrise-theme.css` (couleurs, thème sombre), `inkrise-theme.js` (choix
  du thème, en `<head>`), `inkrise-config.js` (clés publiques),
  `inkrise-nav.js` (barre du bas, menu, garde-fous, partage),
  `inkrise-offline.js`, `inkrise-img.js`.
- **Backend** : Supabase — Auth, Postgres + RLS, Storage (`avatars`,
  `covers`, `pages`, `community`).
- **Serveur** : `api/og.js` (aperçus de lien, Vercel) et
  `supabase/functions/` (paiement CinetPay, envoi des notifications push).
- **Tests** : 12 suites Playwright, ~291 vérifications. Voir `tests/README.md`.

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
3. **Confort du lecteur** — double page sur tablette, signets, défilement
   automatique pour le webtoon. *(Écran maintenu allumé, plein écran et
   zoom : ✅ livrés.)*
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
10. **Fusionner `espace-createur.html` dans `profil.html`** — deux tableaux
    de bord pour la même personne.
11. **Polices auto-hébergées** — supprimerait deux allers-retours réseau et
    la dépendance RGPD à Google Fonts.
