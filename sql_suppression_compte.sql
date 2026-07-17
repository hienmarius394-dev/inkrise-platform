-- ============================================================
-- SUPPRESSION DE COMPTE (RGPD) — À exécuter dans l'éditeur SQL Supabase
-- ============================================================
-- L'utilisateur supprime son propre compte auth.users ; le profil et tout
-- son contenu (mangas, packs, commentaires, follows, notifications…)
-- partent en cascade via les ON DELETE CASCADE existants.
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Non authentifié'; END IF;
  DELETE FROM auth.users WHERE id = auth.uid();
END; $$;
REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;
