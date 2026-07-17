-- ============================================================
-- SIGNALEMENTS — À exécuter dans l'éditeur SQL Supabase
-- ============================================================
-- Idempotent : peut être relancé sans risque.

-- Qui a le droit de modérer (à activer à la main pour ton compte, voir en bas)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS signalements (
  id BIGSERIAL PRIMARY KEY,
  type_contenu TEXT NOT NULL,          -- manga | commentaire | post | pack | profil
  contenu_id TEXT NOT NULL,
  raison TEXT NOT NULL,
  signale_par UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  statut TEXT NOT NULL DEFAULT 'nouveau',   -- nouveau | traite
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Un même utilisateur ne peut signaler un même contenu qu'une fois
CREATE UNIQUE INDEX IF NOT EXISTS uq_signalement ON signalements(type_contenu, contenu_id, signale_par);
CREATE INDEX IF NOT EXISTS idx_signalements_statut ON signalements(statut, created_at DESC);

ALTER TABLE signalements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "signalement insert own" ON signalements;
CREATE POLICY "signalement insert own" ON signalements FOR INSERT TO authenticated
  WITH CHECK (signale_par = auth.uid());
DROP POLICY IF EXISTS "signalement select admin" ON signalements;
CREATE POLICY "signalement select admin" ON signalements FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin));
DROP POLICY IF EXISTS "signalement update admin" ON signalements;
CREATE POLICY "signalement update admin" ON signalements FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin));

-- ⚠️ À personnaliser : donne-toi les droits de modération (remplace le pseudo)
-- UPDATE profiles SET is_admin = true WHERE username = 'TON_PSEUDO';
