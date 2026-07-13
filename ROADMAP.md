# INKRISE — Roadmap & état des lieux

> Mis à jour le 2026-07-12. Ce document est reconstruit à partir d'un audit complet des 18 pages.

## ⚠️ Important : SQL à exécuter

Toutes les tables, colonnes, policies RLS, buckets et triggers nécessaires sont regroupés dans
**`sql_a_executer.sql`** (idempotent, ré-exécutable sans risque).
👉 **À coller dans Supabase Dashboard → SQL Editor avant de tester les nouvelles fonctionnalités.**
Le site actuel continue de fonctionner sans, mais les nouveautés (abonnements manga, avis packs,
brouillons, reprise de lecture, compteurs de vues…) ne s'activent qu'après.

---

## Vision produit

Inkrise = plateforme pour artistes manga/webtoon :
1. **Lire** — catalogue, fiche manga, lecteur (pages + scroll webtoon), bibliothèque personnelle avec reprise de lecture.
2. **Publier** — upload manga + chapitres + pages (storage), gestion des chapitres, espace créateur (mon-espace).
3. **Communauté** — profils créateurs, follow, murs communautaires par créateur (posts, réactions, sondages, commentaires), notifications.
4. **Monétiser** — packs tutoriels/formations (gratuits ou payants), espace premium créateur, plans (Débutant 0€ / Créateur 8€ / Pro 15€). Paiement réel (Wave, Orange Money, MTN MoMo, Stripe) = phase future ; en attendant, activation « démo » des plans.

## Phases historiques (déjà livrées)

- ✅ Phase 1-2 : pages statiques, auth Supabase, profils
- ✅ Phase 3 : mangas, chapitres, upload, lecteur, packs tutoriels (paiement stub « Phase 3.3 Stripe »)
- ✅ Phase 4 : follows, notifications (partiel), bibliothèque (page cassée)
- ✅ Phase 5.1 : tables communauté (posts, réactions, commentaires, sondages)
- ✅ Harmonisation nav (17 pages) + migration thème clair (incomplète → réparée dans cette passe)

## Chantier en cours (cette passe de code)

### A. Réparations bloquantes
- [x] `mon-espace.html` : client `db` inexistant → page 100 % morte
- [x] `bibliotheque.html` : `supabaseJs` inexistant + embed PostgREST malformé → page 100 % morte
- [x] `tutoriels.html` : mauvais IDs nav → crash utilisateur connecté
- [x] `lecteur.html` : comparaison d'ID chapitre string/number → ouvrait toujours le chapitre 1 ; `doSearch` manquant
- [x] `manga.html` : bouton bibliothèque appelait la lib UMD au lieu du client ; drawer jamais mis à jour (mauvais IDs)
- [x] `openModal()` non défini sur ~9 pages → tous les liens « Premium » morts
- [x] `doLogout()` manquant (upload-manga, lecteur) ; liens morts `upload.html`, `connexion.html`, `notifications.html`

### B. Design system (thème clair terminé)
- [x] Variables CSS manquantes (`--bg-2/3`, `--text-2/3`, `--orange-light`, `--purple2`, `--accent`…) → `:root` standard partout
- [x] Drawer resté sombre avec texte noir illisible → passé en clair sur toutes les pages
- [x] Bottom-nav restée sombre → passée en claire
- [x] Bouton « Connexion » blanc-sur-blanc → lisible
- [x] Polices `Nunito`/`Bebas Neue` utilisées mais jamais importées ; aucune police sur communaute/mon-espace → imports corrigés

### C. Fonctionnalités complétées
- [x] **Accueil** : créateurs dynamiques (fin du « mario » en dur), tabs Originals/Populaires/Nouveaux fonctionnels, tri réel par vues, badge notifications alimenté, boutons de plans branchés
- [x] **Plans créateur** : parcours « devenir créateur » réel (`is_creator`), plans Créateur/Pro = activation démo (`espace_premium`) en attendant le paiement
- [x] **Manga** : abonnement manga persisté (`abonnements_manga` + compteur), vues comptées (table `vues` + trigger), état bibliothèque initialisé
- [x] **Lecteur** : reprise de lecture (chapitre + page sauvegardés/restaurés), nav auth câblée
- [x] **Upload** : options Public/Commentaires/18+ réellement enregistrées, vrai brouillon (`statut='brouillon'`, masqué des listes), redirection vers le manga publié
- [x] **Gestion chapitres** : upload de pages vers le storage implémenté (fonction centrale qui manquait), réordonnancement persisté sur `numero`
- [x] **Communauté** : identité réelle des auteurs de posts/commentaires (fin du bug « tout le monde s'affiche comme moi »), votes de sondage mémorisés + anti-revote, upload image des commentaires
- [x] **Follows** : notification au créateur suivi
- [x] **Bibliothèque** : réécrite — liste + reprise de lecture fonctionnelles
- [x] **Packs** : avis dynamiques (`avis_packs`), objectifs/niveau dynamiques, packs gratuits ajoutés à « mes formations » (`achats_packs`), formulaire d'avis après achat
- [x] **Recherche** : inclut désormais les packs tutoriels
- [x] Nettoyage : `fix_key.py` supprimé (script one-shot obsolète)

## Phases futures (backlog)

1. **Paiement réel** — Stripe + Wave/Orange Money/MTN MoMo : points d'intégration = `pack.html → handleBuy()`, boutons de plans (index/profil), `achats_packs.prix_paye`. Nécessite un backend (Edge Functions Supabase) : ne JAMAIS valider un paiement côté client.
2. **Reset mot de passe + OAuth Google** — le CSS `.or-divider` d'auth.html est déjà prêt.
3. **Packs multi-leçons** — aujourd'hui 1 pack = 1 `contenu_url` ; passer à une table `lecons_packs` + progression.
4. **Analytics créateur** — graphiques d'activité (l'onglet Stats de profil.html affiche un placeholder).
5. **Modération** — signalement de contenus, filtre 18+ par préférence utilisateur.
6. **Pagination / infinite scroll** — createurs.html et les listes chargent tout d'un coup.
7. **PWA / mobile** — manifest + service worker.

## Architecture (rappel)

- **Frontend** : 18 pages HTML autonomes (vanilla JS + CSS inline), déployées sur Vercel.
- **Backend** : Supabase (`bsdcpwtimsgxcnaamwip`) — Auth, Postgres + RLS, Storage (buckets `avatars`, `covers`, `pages`, `community`).
- **Convention** : chaque page embarque son client (`sb` / `supabaseClient`), clé anon publique (protégée par RLS).
