-- ================================================================
-- INKRISE — SQL CONSOLIDÉ (tables, colonnes, triggers, RLS, storage)
-- À coller dans Supabase Dashboard → SQL Editor, puis Run.
-- Idempotent : ré-exécutable sans risque (IF NOT EXISTS partout).
-- Couvre TOUT ce que le frontend utilise après la passe de code
-- du 2026-07-12. Voir ROADMAP.md.
-- ================================================================

-- ─────────────────────────────────────────────
-- 1. PROFILES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE,
  bio TEXT,
  avatar_url TEXT,
  cover_url TEXT,
  is_creator BOOLEAN NOT NULL DEFAULT false,
  espace_premium BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_creator BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS espace_premium BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cover_url TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS social_links JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Auto-création du profil à l'inscription (fiabilise auth.html,
-- notamment quand la confirmation email est activée)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────
-- 2. MANGAS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mangas (
  id BIGSERIAL PRIMARY KEY,
  auteur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  synopsis TEXT,
  type TEXT DEFAULT 'manga',            -- manga|manhwa|manhua|webtoon|bd|roman
  statut TEXT DEFAULT 'en_cours',       -- en_cours|termine|pause|brouillon
  genres TEXT[] DEFAULT '{}',
  couverture_url TEXT,
  vues BIGINT NOT NULL DEFAULT 0,       -- compteur entretenu par trigger (table vues)
  abonnes BIGINT NOT NULL DEFAULT 0,    -- compteur entretenu par trigger (abonnements_manga)
  adulte BOOLEAN NOT NULL DEFAULT false,
  commentaires_actifs BOOLEAN NOT NULL DEFAULT true,
  langue TEXT NOT NULL DEFAULT 'fr',
  sens_lecture TEXT NOT NULL DEFAULT 'rl',
  age_recommande TEXT NOT NULL DEFAULT 'tout_public',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS auteur_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS synopsis TEXT;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'manga';
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS statut TEXT DEFAULT 'en_cours';
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS couverture_url TEXT;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS vues BIGINT DEFAULT 0;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS abonnes BIGINT DEFAULT 0;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS adulte BOOLEAN DEFAULT false;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS commentaires_actifs BOOLEAN DEFAULT true;
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS genres TEXT[] DEFAULT '{}';
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS langue TEXT DEFAULT 'fr';
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS sens_lecture TEXT DEFAULT 'rl';
ALTER TABLE mangas ADD COLUMN IF NOT EXISTS age_recommande TEXT DEFAULT 'tout_public';
CREATE INDEX IF NOT EXISTS idx_mangas_auteur ON mangas(auteur_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mangas_vues ON mangas(vues DESC);

-- ─────────────────────────────────────────────
-- 3. CHAPITRES
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chapitres (
  id BIGSERIAL PRIMARY KEY,
  manga_id BIGINT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  titre TEXT,
  numero INT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Complète une table "chapitres" pré-existante avec un schéma différent
-- (colonnes ajoutées SANS NOT NULL : une table déjà remplie casserait sinon).
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS manga_id BIGINT REFERENCES mangas(id) ON DELETE CASCADE;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS numero INT DEFAULT 1;
ALTER TABLE chapitres ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_chapitres_manga ON chapitres(manga_id, numero);

-- ─────────────────────────────────────────────
-- 4. VUES (1 ligne = 1 lecteur unique par manga) + compteur auto
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vues (
  id BIGSERIAL PRIMARY KEY,
  manga_id BIGINT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE vues ADD COLUMN IF NOT EXISTS manga_id BIGINT REFERENCES mangas(id) ON DELETE CASCADE;
ALTER TABLE vues ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE vues ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
-- Index unique NON partiel : requis pour que l'upsert onConflict(manga_id,user_id)
-- du frontend fonctionne (un index partiel n'est pas inférable par ON CONFLICT,
-- ce qui faisait échouer silencieusement le comptage des vues).
DROP INDEX IF EXISTS uniq_vues_manga_user;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_vues_pair ON vues(manga_id, user_id);

CREATE OR REPLACE FUNCTION public.bump_manga_vues()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE mangas SET vues = vues + 1 WHERE id = NEW.manga_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_bump_manga_vues ON vues;
CREATE TRIGGER trg_bump_manga_vues
  AFTER INSERT ON vues FOR EACH ROW EXECUTE FUNCTION public.bump_manga_vues();

-- ─────────────────────────────────────────────
-- 5. ABONNEMENTS MANGA (bouton « S'abonner ») + compteur auto
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS abonnements_manga (
  id BIGSERIAL PRIMARY KEY,
  manga_id BIGINT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(manga_id, user_id)
);
ALTER TABLE abonnements_manga ADD COLUMN IF NOT EXISTS manga_id BIGINT REFERENCES mangas(id) ON DELETE CASCADE;
ALTER TABLE abonnements_manga ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE abonnements_manga ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE OR REPLACE FUNCTION public.bump_manga_abonnes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE mangas SET abonnes = abonnes + 1 WHERE id = NEW.manga_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE mangas SET abonnes = GREATEST(abonnes - 1, 0) WHERE id = OLD.manga_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_bump_manga_abonnes ON abonnements_manga;
CREATE TRIGGER trg_bump_manga_abonnes
  AFTER INSERT OR DELETE ON abonnements_manga
  FOR EACH ROW EXECUTE FUNCTION public.bump_manga_abonnes();

-- ─────────────────────────────────────────────
-- 6. FOLLOWS (suivre un créateur)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS follows (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, followed_id)
);
ALTER TABLE follows ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE follows ADD COLUMN IF NOT EXISTS followed_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE follows ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_follows_followed ON follows(followed_id);

-- ─────────────────────────────────────────────
-- 7. BIBLIOTHEQUE (mangas sauvegardés + reprise de lecture)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bibliotheque (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  manga_id BIGINT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  chapitre INT DEFAULT 1,
  page INT DEFAULT 1,
  total_chapitres INT DEFAULT 1,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, manga_id)
);
ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS manga_id BIGINT REFERENCES mangas(id) ON DELETE CASCADE;
ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS page INT DEFAULT 1;
ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS chapitre INT DEFAULT 1;
ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS total_chapitres INT DEFAULT 1;
ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS total_pages INT DEFAULT 0;
ALTER TABLE bibliotheque ADD COLUMN IF NOT EXISTS added_at TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────
-- 8. NOTIFICATIONS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT DEFAULT 'info',            -- chapitre|follow|achat|info
  message TEXT NOT NULL,
  manga_id BIGINT REFERENCES mangas(id) ON DELETE CASCADE,
  lu BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'info';
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS message TEXT;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS manga_id BIGINT REFERENCES mangas(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lu BOOLEAN DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
-- Certaines installations ont une colonne "titre" NOT NULL héritée d'un
-- schéma antérieur : on lui donne un défaut pour ne jamais faire échouer
-- un insert qui ne la renseigne pas.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS titre TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ALTER COLUMN titre SET DEFAULT '';
-- URL exacte où l'action notifiée a eu lieu, pour un clic direct dessus.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lien TEXT;
-- Qui a fait l'action (pour afficher sa photo de profil sur la notif).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acteur_id UUID;
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, lu, created_at DESC);

-- ─────────────────────────────────────────────
-- 9. COMMENTAIRES (lecteur de chapitres) + likes
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS commentaires (
  id BIGSERIAL PRIMARY KEY,
  manga_id BIGINT NOT NULL REFERENCES mangas(id) ON DELETE CASCADE,
  chapitre_id BIGINT REFERENCES chapitres(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  parent_id BIGINT REFERENCES commentaires(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE commentaires ADD COLUMN IF NOT EXISTS manga_id BIGINT REFERENCES mangas(id) ON DELETE CASCADE;
ALTER TABLE commentaires ADD COLUMN IF NOT EXISTS chapitre_id BIGINT REFERENCES chapitres(id) ON DELETE CASCADE;
ALTER TABLE commentaires ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE commentaires ADD COLUMN IF NOT EXISTS contenu TEXT;
ALTER TABLE commentaires ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES commentaires(id) ON DELETE CASCADE;
ALTER TABLE commentaires ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_commentaires_chapitre ON commentaires(chapitre_id, created_at DESC);

-- Neutralise les colonnes-résidus NOT NULL d'un ancien schéma "commentaires"
-- (ex : colonne "cle") qui bloquent les insertions du frontend actuel.
DO $$
DECLARE col RECORD;
BEGIN
  FOR col IN
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'commentaires'
      AND is_nullable = 'NO' AND column_default IS NULL
      AND column_name NOT IN ('id', 'manga_id', 'user_id', 'contenu', 'created_at')
  LOOP
    EXECUTE format('ALTER TABLE commentaires ALTER COLUMN %I DROP NOT NULL', col.column_name);
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS commentaire_likes (
  id BIGSERIAL PRIMARY KEY,
  commentaire_id BIGINT NOT NULL REFERENCES commentaires(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(commentaire_id, user_id)
);
ALTER TABLE commentaire_likes ADD COLUMN IF NOT EXISTS commentaire_id BIGINT REFERENCES commentaires(id) ON DELETE CASCADE;
ALTER TABLE commentaire_likes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE commentaire_likes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────
-- 10. PACKS TUTORIELS + ACHATS + AVIS
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS packs_tutoriels (
  id BIGSERIAL PRIMARY KEY,
  auteur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  auteur_nom TEXT,
  titre TEXT NOT NULL,
  description TEXT,
  prix NUMERIC NOT NULL DEFAULT 0,
  image_url TEXT,
  contenu_url TEXT,
  objectifs TEXT[] DEFAULT '{}',        -- « Ce que tu vas apprendre »
  niveau TEXT DEFAULT 'Tous niveaux',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS auteur_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS auteur_nom TEXT;
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS prix NUMERIC DEFAULT 0;
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS contenu_url TEXT;
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS objectifs TEXT[] DEFAULT '{}';
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS niveau TEXT DEFAULT 'Tous niveaux';
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';   -- contenu du pack (croquis, planches, pages d'ebook…)
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS ventes INT NOT NULL DEFAULT 0;      -- compteur public entretenu par trigger (achats_packs)
ALTER TABLE packs_tutoriels ADD COLUMN IF NOT EXISTS limite_ventes INT;                  -- NULL = ventes illimitées

CREATE TABLE IF NOT EXISTS achats_packs (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  pack_id BIGINT NOT NULL REFERENCES packs_tutoriels(id) ON DELETE CASCADE,
  prix_paye NUMERIC DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, pack_id)
);
ALTER TABLE achats_packs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE achats_packs ADD COLUMN IF NOT EXISTS pack_id BIGINT REFERENCES packs_tutoriels(id) ON DELETE CASCADE;
ALTER TABLE achats_packs ADD COLUMN IF NOT EXISTS prix_paye NUMERIC DEFAULT 0;
ALTER TABLE achats_packs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Compteur public de ventes : entretenu par trigger (la RLS d'achats_packs
-- interdit aux visiteurs de compter les achats directement)
CREATE OR REPLACE FUNCTION public.bump_pack_ventes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE packs_tutoriels SET ventes = ventes + 1 WHERE id = NEW.pack_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_bump_pack_ventes ON achats_packs;
CREATE TRIGGER trg_bump_pack_ventes
  AFTER INSERT ON achats_packs FOR EACH ROW EXECUTE FUNCTION public.bump_pack_ventes();
-- Initialise le compteur avec les achats déjà en base
UPDATE packs_tutoriels p SET ventes = (SELECT COUNT(*) FROM achats_packs a WHERE a.pack_id = p.id);

CREATE TABLE IF NOT EXISTS avis_packs (
  id BIGSERIAL PRIMARY KEY,
  pack_id BIGINT NOT NULL REFERENCES packs_tutoriels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  note INT NOT NULL CHECK (note BETWEEN 1 AND 5),
  commentaire TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(pack_id, user_id)
);
ALTER TABLE avis_packs ADD COLUMN IF NOT EXISTS pack_id BIGINT REFERENCES packs_tutoriels(id) ON DELETE CASCADE;
ALTER TABLE avis_packs ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE avis_packs ADD COLUMN IF NOT EXISTS commentaire TEXT;
ALTER TABLE avis_packs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

-- Paiements CinetPay (1 ligne = 1 tentative de paiement d'un pack).
-- Le webhook (edge function) passe le statut à 'paye' et crée l'achat.
CREATE TABLE IF NOT EXISTS paiements (
  id BIGSERIAL PRIMARY KEY,
  transaction_id TEXT UNIQUE NOT NULL,
  pack_id BIGINT NOT NULL REFERENCES packs_tutoriels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  montant NUMERIC NOT NULL,
  statut TEXT NOT NULL DEFAULT 'en_attente',   -- en_attente|paye|refuse
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE paiements ENABLE ROW LEVEL SECURITY;
-- Chacun ne voit que ses propres paiements ; personne n'écrit depuis le
-- navigateur (seules les edge functions, en service_role, écrivent).
DROP POLICY IF EXISTS "paiements select own" ON paiements;
CREATE POLICY "paiements select own" ON paiements FOR SELECT TO authenticated USING (user_id = auth.uid());
GRANT SELECT ON paiements TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

CREATE TABLE IF NOT EXISTS pack_lecons (
  id BIGSERIAL PRIMARY KEY,
  pack_id BIGINT NOT NULL REFERENCES packs_tutoriels(id) ON DELETE CASCADE,
  titre TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  module TEXT,
  ordre INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS pack_id BIGINT REFERENCES packs_tutoriels(id) ON DELETE CASCADE;
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS titre TEXT;
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS video_url TEXT;
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS module TEXT;
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS ordre INT DEFAULT 0;
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'video';          -- video|images|fichier
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS images TEXT[] DEFAULT '{}';         -- pack d'images (croquis, planches…)
ALTER TABLE pack_lecons ADD COLUMN IF NOT EXISTS fichier_url TEXT;                   -- ressource téléchargeable (PDF, ZIP…)

CREATE TABLE IF NOT EXISTS pack_progression (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  lecon_id BIGINT NOT NULL REFERENCES pack_lecons(id) ON DELETE CASCADE,
  termine BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, lecon_id)
);
ALTER TABLE pack_progression ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE pack_progression ADD COLUMN IF NOT EXISTS lecon_id BIGINT REFERENCES pack_lecons(id) ON DELETE CASCADE;
ALTER TABLE pack_progression ADD COLUMN IF NOT EXISTS termine BOOLEAN DEFAULT true;
ALTER TABLE pack_progression ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- ─────────────────────────────────────────────
-- 11. COMMUNAUTÉ (phase 5.1 — repris tel quel, idempotent)
-- ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS posts_communaute (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  auteur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  image_url TEXT,
  type TEXT NOT NULL DEFAULT 'post' CHECK (type IN ('post', 'sondage', 'annonce')),
  est_epingle BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Migration : autoriser le type 'annonce' sur les bases existantes
ALTER TABLE posts_communaute DROP CONSTRAINT IF EXISTS posts_communaute_type_check;
ALTER TABLE posts_communaute ADD CONSTRAINT posts_communaute_type_check CHECK (type IN ('post', 'sondage', 'annonce'));
ALTER TABLE posts_communaute ADD COLUMN IF NOT EXISTS creator_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE posts_communaute ADD COLUMN IF NOT EXISTS auteur_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE posts_communaute ADD COLUMN IF NOT EXISTS contenu TEXT;
ALTER TABLE posts_communaute ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE posts_communaute ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'post';
ALTER TABLE posts_communaute ADD COLUMN IF NOT EXISTS est_epingle BOOLEAN DEFAULT false;
ALTER TABLE posts_communaute ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS reactions (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts_communaute(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('heart', 'clap', 'fire', 'surprise')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS post_id BIGINT REFERENCES posts_communaute(id) ON DELETE CASCADE;
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE reactions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS commentaires_communaute (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts_communaute(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  image_url TEXT,
  parent_id BIGINT REFERENCES commentaires_communaute(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE commentaires_communaute ADD COLUMN IF NOT EXISTS post_id BIGINT REFERENCES posts_communaute(id) ON DELETE CASCADE;
ALTER TABLE commentaires_communaute ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE commentaires_communaute ADD COLUMN IF NOT EXISTS contenu TEXT;
ALTER TABLE commentaires_communaute ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE commentaires_communaute ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES commentaires_communaute(id) ON DELETE CASCADE;
ALTER TABLE commentaires_communaute ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE TABLE IF NOT EXISTS sondage_options (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts_communaute(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);
ALTER TABLE sondage_options ADD COLUMN IF NOT EXISTS post_id BIGINT REFERENCES posts_communaute(id) ON DELETE CASCADE;
ALTER TABLE sondage_options ADD COLUMN IF NOT EXISTS option_text TEXT;
ALTER TABLE sondage_options ADD COLUMN IF NOT EXISTS position INT DEFAULT 0;

CREATE TABLE IF NOT EXISTS sondage_votes (
  id BIGSERIAL PRIMARY KEY,
  option_id BIGINT NOT NULL REFERENCES sondage_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE sondage_votes ADD COLUMN IF NOT EXISTS option_id BIGINT REFERENCES sondage_options(id) ON DELETE CASCADE;
ALTER TABLE sondage_votes ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES profiles(id) ON DELETE CASCADE;
ALTER TABLE sondage_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
-- Anti-revote : un seul vote par option et par user (le « 1 vote par
-- sondage » est garanti côté client en vérifiant les votes existants)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_sondage_vote ON sondage_votes(option_id, user_id);

CREATE INDEX IF NOT EXISTS idx_posts_communaute_creator ON posts_communaute(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_commentaires_communaute_post ON commentaires_communaute(post_id);
CREATE INDEX IF NOT EXISTS idx_sondage_options_post ON sondage_options(post_id);
CREATE INDEX IF NOT EXISTS idx_sondage_votes_option ON sondage_votes(option_id);

-- ─────────────────────────────────────────────
-- 12. STORAGE — buckets publics
-- ─────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public) VALUES
  ('avatars',   'avatars',   true),
  ('covers',    'covers',    true),
  ('pages',     'pages',     true),
  ('community', 'community', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "Lecture publique storage inkrise" ON storage.objects;
CREATE POLICY "Lecture publique storage inkrise" ON storage.objects
  FOR SELECT USING (bucket_id IN ('avatars','covers','pages','community'));
DROP POLICY IF EXISTS "Upload authentifie storage inkrise" ON storage.objects;
CREATE POLICY "Upload authentifie storage inkrise" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id IN ('avatars','covers','pages','community'));
DROP POLICY IF EXISTS "Update proprietaire storage inkrise" ON storage.objects;
CREATE POLICY "Update proprietaire storage inkrise" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id IN ('avatars','covers','pages','community') AND owner = auth.uid());
DROP POLICY IF EXISTS "Delete proprietaire storage inkrise" ON storage.objects;
CREATE POLICY "Delete proprietaire storage inkrise" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id IN ('avatars','covers','pages','community') AND owner = auth.uid());

-- ─────────────────────────────────────────────
-- 13. RLS — activation + policies sur toutes les tables
-- ─────────────────────────────────────────────
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE mangas                ENABLE ROW LEVEL SECURITY;
ALTER TABLE chapitres             ENABLE ROW LEVEL SECURITY;
ALTER TABLE vues                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE abonnements_manga     ENABLE ROW LEVEL SECURITY;
ALTER TABLE follows               ENABLE ROW LEVEL SECURITY;
ALTER TABLE bibliotheque          ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;
ALTER TABLE commentaires          ENABLE ROW LEVEL SECURITY;
ALTER TABLE commentaire_likes     ENABLE ROW LEVEL SECURITY;
ALTER TABLE packs_tutoriels       ENABLE ROW LEVEL SECURITY;
ALTER TABLE achats_packs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE avis_packs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_lecons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE pack_progression      ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts_communaute      ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE commentaires_communaute ENABLE ROW LEVEL SECURITY;
ALTER TABLE sondage_options       ENABLE ROW LEVEL SECURITY;
ALTER TABLE sondage_votes         ENABLE ROW LEVEL SECURITY;

-- PROFILES
DROP POLICY IF EXISTS "profiles select public" ON profiles;
CREATE POLICY "profiles select public" ON profiles FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "profiles insert own" ON profiles;
CREATE POLICY "profiles insert own" ON profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles update own" ON profiles;
CREATE POLICY "profiles update own" ON profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
DROP POLICY IF EXISTS "profiles delete own" ON profiles;
CREATE POLICY "profiles delete own" ON profiles FOR DELETE TO authenticated USING (auth.uid() = id);

-- MANGAS (les brouillons ne sont visibles que par leur auteur)
DROP POLICY IF EXISTS "mangas select public" ON mangas;
CREATE POLICY "mangas select public" ON mangas FOR SELECT TO anon, authenticated
  USING (statut IS DISTINCT FROM 'brouillon' OR auteur_id = auth.uid());
DROP POLICY IF EXISTS "mangas insert own" ON mangas;
CREATE POLICY "mangas insert own" ON mangas FOR INSERT TO authenticated WITH CHECK (auteur_id = auth.uid());
DROP POLICY IF EXISTS "mangas update own" ON mangas;
CREATE POLICY "mangas update own" ON mangas FOR UPDATE TO authenticated USING (auteur_id = auth.uid());
DROP POLICY IF EXISTS "mangas delete own" ON mangas;
CREATE POLICY "mangas delete own" ON mangas FOR DELETE TO authenticated USING (auteur_id = auth.uid());

-- CHAPITRES (écriture réservée à l'auteur du manga)
DROP POLICY IF EXISTS "chapitres select public" ON chapitres;
CREATE POLICY "chapitres select public" ON chapitres FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "chapitres write auteur" ON chapitres;
CREATE POLICY "chapitres write auteur" ON chapitres FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM mangas m WHERE m.id = manga_id AND m.auteur_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM mangas m WHERE m.id = manga_id AND m.auteur_id = auth.uid()));

-- VUES
DROP POLICY IF EXISTS "vues select public" ON vues;
CREATE POLICY "vues select public" ON vues FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "vues insert own" ON vues;
CREATE POLICY "vues insert own" ON vues FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- ABONNEMENTS MANGA
DROP POLICY IF EXISTS "abo select public" ON abonnements_manga;
CREATE POLICY "abo select public" ON abonnements_manga FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "abo insert own" ON abonnements_manga;
CREATE POLICY "abo insert own" ON abonnements_manga FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "abo delete own" ON abonnements_manga;
CREATE POLICY "abo delete own" ON abonnements_manga FOR DELETE TO authenticated USING (user_id = auth.uid());

-- FOLLOWS
DROP POLICY IF EXISTS "follows select public" ON follows;
CREATE POLICY "follows select public" ON follows FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "follows insert own" ON follows;
CREATE POLICY "follows insert own" ON follows FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "follows delete own" ON follows;
CREATE POLICY "follows delete own" ON follows FOR DELETE TO authenticated USING (user_id = auth.uid());

-- BIBLIOTHEQUE (strictement personnelle)
DROP POLICY IF EXISTS "biblio all own" ON bibliotheque;
CREATE POLICY "biblio all own" ON bibliotheque FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- NOTIFICATIONS (l'insert par d'autres utilisateurs connectés est
-- nécessaire : nouveau chapitre → notifie les followers, etc.)
DROP POLICY IF EXISTS "notif select own" ON notifications;
CREATE POLICY "notif select own" ON notifications FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif insert authenticated" ON notifications;
CREATE POLICY "notif insert authenticated" ON notifications FOR INSERT TO authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "notif update own" ON notifications;
CREATE POLICY "notif update own" ON notifications FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "notif delete own" ON notifications;
CREATE POLICY "notif delete own" ON notifications FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- NOTIFICATIONS AUTOMATIQUES (triggers server-side, fiables)
-- Créées par la base elle-même (SECURITY DEFINER) dès qu'une action
-- se produit — plus robuste qu'un insert côté navigateur qui peut
-- échouer en silence. Jamais de notification pour soi-même.
-- ─────────────────────────────────────────────

-- 1. Abonnement à un créateur → notifie le créateur suivi
CREATE OR REPLACE FUNCTION public.notify_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  IF NEW.user_id = NEW.followed_id THEN RETURN NEW; END IF;
  SELECT username INTO uname FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, titre, message, lien, acteur_id, lu)
  VALUES (NEW.followed_id, 'follow', 'Nouvel abonné', '@' || COALESCE(uname, 'Quelqu''un') || ' te suit désormais !', 'auteur.html?id=' || NEW.user_id, NEW.user_id, false);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_follow ON follows;
CREATE TRIGGER trg_notify_follow AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_follow();

-- 2. Commentaire sur un manga → notifie l'auteur du manga
CREATE OR REPLACE FUNCTION public.notify_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid UUID; mtitre TEXT; uname TEXT; clien TEXT;
BEGIN
  SELECT auteur_id, titre INTO aid, mtitre FROM mangas WHERE id = NEW.manga_id;
  IF aid IS NULL OR aid = NEW.user_id THEN RETURN NEW; END IF;
  SELECT username INTO uname FROM profiles WHERE id = NEW.user_id;
  IF NEW.chapitre_id IS NOT NULL THEN
    clien := 'lecteur.html?manga_id=' || NEW.manga_id || '&chapitre=' || NEW.chapitre_id || '#comment-' || NEW.id;
  ELSE
    clien := 'manga.html?id=' || NEW.manga_id;
  END IF;
  INSERT INTO notifications (user_id, type, titre, message, manga_id, lien, acteur_id, lu)
  VALUES (aid, 'comment', 'Nouveau commentaire', '@' || COALESCE(uname, 'Quelqu''un') || ' a commenté "' || COALESCE(mtitre, 'ton manga') || '"', NEW.manga_id, clien, NEW.user_id, false);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_comment ON commentaires;
CREATE TRIGGER trg_notify_comment AFTER INSERT ON commentaires
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment();

-- 3. Like d'un commentaire → notifie l'auteur du commentaire
CREATE OR REPLACE FUNCTION public.notify_comment_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cauthor UUID; uname TEXT; cmanga BIGINT; cchapitre BIGINT; clien TEXT;
BEGIN
  SELECT user_id, manga_id, chapitre_id INTO cauthor, cmanga, cchapitre FROM commentaires WHERE id = NEW.commentaire_id;
  IF cauthor IS NULL OR cauthor = NEW.user_id THEN RETURN NEW; END IF;
  SELECT username INTO uname FROM profiles WHERE id = NEW.user_id;
  IF cchapitre IS NOT NULL THEN
    clien := 'lecteur.html?manga_id=' || cmanga || '&chapitre=' || cchapitre || '#comment-' || NEW.commentaire_id;
  ELSIF cmanga IS NOT NULL THEN
    clien := 'manga.html?id=' || cmanga;
  END IF;
  INSERT INTO notifications (user_id, type, titre, message, manga_id, lien, acteur_id, lu)
  VALUES (cauthor, 'like', 'J''aime reçu', '❤️ @' || COALESCE(uname, 'Quelqu''un') || ' a aimé ton commentaire', cmanga, clien, NEW.user_id, false);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_comment_like ON commentaire_likes;
CREATE TRIGGER trg_notify_comment_like AFTER INSERT ON commentaire_likes
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment_like();

-- 4. Avis sur un pack → notifie l'auteur du pack
CREATE OR REPLACE FUNCTION public.notify_avis()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid UUID; ptitre TEXT;
BEGIN
  SELECT auteur_id, titre INTO aid, ptitre FROM packs_tutoriels WHERE id = NEW.pack_id;
  IF aid IS NULL OR aid = NEW.user_id THEN RETURN NEW; END IF;
  INSERT INTO notifications (user_id, type, titre, message, lien, acteur_id, lu)
  VALUES (aid, 'avis', 'Nouvel avis', '⭐ Nouvel avis (' || NEW.note || '/5) sur "' || COALESCE(ptitre, 'ton pack') || '"', 'pack.html?id=' || NEW.pack_id, NEW.user_id, false);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_avis ON avis_packs;
CREATE TRIGGER trg_notify_avis AFTER INSERT ON avis_packs
  FOR EACH ROW EXECUTE FUNCTION public.notify_avis();

-- COMMENTAIRES + LIKES
DROP POLICY IF EXISTS "comm select public" ON commentaires;
CREATE POLICY "comm select public" ON commentaires FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "comm insert own" ON commentaires;
CREATE POLICY "comm insert own" ON commentaires FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "comm update own" ON commentaires;
CREATE POLICY "comm update own" ON commentaires FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "comm delete own" ON commentaires;
CREATE POLICY "comm delete own" ON commentaires FOR DELETE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "clikes select public" ON commentaire_likes;
CREATE POLICY "clikes select public" ON commentaire_likes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "clikes insert own" ON commentaire_likes;
CREATE POLICY "clikes insert own" ON commentaire_likes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "clikes delete own" ON commentaire_likes;
CREATE POLICY "clikes delete own" ON commentaire_likes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- PACKS TUTORIELS
DROP POLICY IF EXISTS "packs select public" ON packs_tutoriels;
CREATE POLICY "packs select public" ON packs_tutoriels FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "packs write auteur" ON packs_tutoriels;
CREATE POLICY "packs write auteur" ON packs_tutoriels FOR ALL TO authenticated
  USING (auteur_id = auth.uid()) WITH CHECK (auteur_id = auth.uid());

-- ACHATS PACKS (l'auteur du pack peut voir qui a acheté, pour ses stats)
DROP POLICY IF EXISTS "achats select own ou auteur" ON achats_packs;
CREATE POLICY "achats select own ou auteur" ON achats_packs FOR SELECT TO authenticated
  USING (user_id = auth.uid()
     OR EXISTS (SELECT 1 FROM packs_tutoriels p WHERE p.id = pack_id AND p.auteur_id = auth.uid()));
DROP POLICY IF EXISTS "achats insert own" ON achats_packs;
CREATE POLICY "achats insert own" ON achats_packs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- AVIS PACKS (avis réservé aux acheteurs)
DROP POLICY IF EXISTS "avis select public" ON avis_packs;
CREATE POLICY "avis select public" ON avis_packs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "avis insert acheteur" ON avis_packs;
CREATE POLICY "avis insert acheteur" ON avis_packs FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM achats_packs a WHERE a.pack_id = avis_packs.pack_id AND a.user_id = auth.uid()));
DROP POLICY IF EXISTS "avis update own" ON avis_packs;
CREATE POLICY "avis update own" ON avis_packs FOR UPDATE TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "avis delete own" ON avis_packs;
CREATE POLICY "avis delete own" ON avis_packs FOR DELETE TO authenticated USING (user_id = auth.uid());

-- LEÇONS DE PACK (visibles par tous, éditables par l'auteur du pack)
DROP POLICY IF EXISTS "lecons select public" ON pack_lecons;
CREATE POLICY "lecons select public" ON pack_lecons FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "lecons write auteur" ON pack_lecons;
CREATE POLICY "lecons write auteur" ON pack_lecons FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM packs_tutoriels p WHERE p.id = pack_id AND p.auteur_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM packs_tutoriels p WHERE p.id = pack_id AND p.auteur_id = auth.uid()));

-- PROGRESSION (chacun voit/modifie uniquement sa propre progression)
DROP POLICY IF EXISTS "progression select own" ON pack_progression;
CREATE POLICY "progression select own" ON pack_progression FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS "progression write own" ON pack_progression;
CREATE POLICY "progression write own" ON pack_progression FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- COMMUNAUTÉ
DROP POLICY IF EXISTS "posts select public" ON posts_communaute;
CREATE POLICY "posts select public" ON posts_communaute FOR SELECT TO anon, authenticated USING (true);
-- Communauté privée : seul le créateur du mur peut y publier (auteur_id = creator_id = soi-même)
DROP POLICY IF EXISTS "posts insert own" ON posts_communaute;
CREATE POLICY "posts insert own" ON posts_communaute FOR INSERT TO authenticated
  WITH CHECK (auteur_id = auth.uid() AND creator_id = auth.uid());
DROP POLICY IF EXISTS "posts update creator" ON posts_communaute;
CREATE POLICY "posts update creator" ON posts_communaute FOR UPDATE TO authenticated
  USING (creator_id = auth.uid() OR auteur_id = auth.uid());
DROP POLICY IF EXISTS "posts delete creator ou auteur" ON posts_communaute;
CREATE POLICY "posts delete creator ou auteur" ON posts_communaute FOR DELETE TO authenticated
  USING (creator_id = auth.uid() OR auteur_id = auth.uid());

DROP POLICY IF EXISTS "reactions select public" ON reactions;
CREATE POLICY "reactions select public" ON reactions FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "reactions insert own" ON reactions;
CREATE POLICY "reactions insert own" ON reactions FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "reactions delete own ou creator" ON reactions;
CREATE POLICY "reactions delete own ou creator" ON reactions FOR DELETE TO authenticated
  USING (user_id = auth.uid()
     OR EXISTS (SELECT 1 FROM posts_communaute p WHERE p.id = post_id AND p.creator_id = auth.uid()));

DROP POLICY IF EXISTS "commc select public" ON commentaires_communaute;
CREATE POLICY "commc select public" ON commentaires_communaute FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "commc insert own" ON commentaires_communaute;
CREATE POLICY "commc insert own" ON commentaires_communaute FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "commc delete own ou creator" ON commentaires_communaute;
CREATE POLICY "commc delete own ou creator" ON commentaires_communaute FOR DELETE TO authenticated
  USING (user_id = auth.uid()
     OR EXISTS (SELECT 1 FROM posts_communaute p WHERE p.id = post_id AND p.creator_id = auth.uid()));

DROP POLICY IF EXISTS "sopt select public" ON sondage_options;
CREATE POLICY "sopt select public" ON sondage_options FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "sopt write auteur post" ON sondage_options;
CREATE POLICY "sopt write auteur post" ON sondage_options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM posts_communaute p WHERE p.id = post_id AND (p.auteur_id = auth.uid() OR p.creator_id = auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM posts_communaute p WHERE p.id = post_id AND (p.auteur_id = auth.uid() OR p.creator_id = auth.uid())));

DROP POLICY IF EXISTS "svotes select public" ON sondage_votes;
CREATE POLICY "svotes select public" ON sondage_votes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "svotes insert own" ON sondage_votes;
CREATE POLICY "svotes insert own" ON sondage_votes FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "svotes delete own" ON sondage_votes;
CREATE POLICY "svotes delete own" ON sondage_votes FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ─────────────────────────────────────────────
-- 14. DROITS (RLS filtre les lignes, mais anon/authenticated ont aussi
-- besoin du GRANT au niveau table — sinon "permission denied for table")
-- ─────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
