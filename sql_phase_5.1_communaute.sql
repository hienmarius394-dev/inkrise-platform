-- =============================================
-- INKRISE — Phase 5.1 : Tables Communauté
-- Colle ça dans Supabase Dashboard → SQL Editor
-- =============================================

-- 1. Posts de la communauté
CREATE TABLE IF NOT EXISTS posts_communaute (
  id BIGSERIAL PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  auteur_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  image_url TEXT,
  type TEXT NOT NULL DEFAULT 'post' CHECK (type IN ('post', 'sondage')),
  est_epingle BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Réactions (❤️ 👏 🔥 😮)
CREATE TABLE IF NOT EXISTS reactions (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts_communaute(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('heart', 'clap', 'fire', 'surprise')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, user_id)
);

-- 3. Commentaires de la communauté
CREATE TABLE IF NOT EXISTS commentaires_communaute (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts_communaute(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contenu TEXT NOT NULL,
  image_url TEXT,
  parent_id BIGINT REFERENCES commentaires_communaute(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Options de sondage
CREATE TABLE IF NOT EXISTS sondage_options (
  id BIGSERIAL PRIMARY KEY,
  post_id BIGINT NOT NULL REFERENCES posts_communaute(id) ON DELETE CASCADE,
  option_text TEXT NOT NULL,
  position INT NOT NULL DEFAULT 0
);

-- 5. Votes aux sondages
CREATE TABLE IF NOT EXISTS sondage_votes (
  id BIGSERIAL PRIMARY KEY,
  option_id BIGINT NOT NULL REFERENCES sondage_options(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index pour performances
CREATE INDEX IF NOT EXISTS idx_posts_communaute_creator ON posts_communaute(creator_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reactions_post ON reactions(post_id);
CREATE INDEX IF NOT EXISTS idx_commentaires_communaute_post ON commentaires_communaute(post_id);
CREATE INDEX IF NOT EXISTS idx_sondage_options_post ON sondage_options(post_id);
CREATE INDEX IF NOT EXISTS idx_sondage_votes_option ON sondage_votes(option_id);

-- Droits pour le service_role
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- Recharger le schéma PostgREST
NOTIFY pgrst, 'reload schema';