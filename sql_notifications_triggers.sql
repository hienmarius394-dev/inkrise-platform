-- ============================================================
-- NOTIFICATIONS AUTOMATIQUES — À exécuter dans l'éditeur SQL Supabase
-- ============================================================
-- Ces triggers créent les notifications côté serveur (fiable, ne peut
-- pas échouer en silence). Idempotent : peut être relancé sans risque.

-- 1. Abonnement à un créateur → notifie le créateur suivi
CREATE OR REPLACE FUNCTION public.notify_follow()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uname TEXT;
BEGIN
  IF NEW.user_id = NEW.followed_id THEN RETURN NEW; END IF;
  SELECT username INTO uname FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, message, lu)
  VALUES (NEW.followed_id, 'follow', '@' || COALESCE(uname, 'Quelqu''un') || ' te suit désormais !', false);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_follow ON follows;
CREATE TRIGGER trg_notify_follow AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION public.notify_follow();

-- 2. Commentaire sur un manga → notifie l'auteur du manga
CREATE OR REPLACE FUNCTION public.notify_comment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE aid UUID; mtitre TEXT; uname TEXT;
BEGIN
  SELECT auteur_id, titre INTO aid, mtitre FROM mangas WHERE id = NEW.manga_id;
  IF aid IS NULL OR aid = NEW.user_id THEN RETURN NEW; END IF;
  SELECT username INTO uname FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, message, manga_id, lu)
  VALUES (aid, 'comment', '@' || COALESCE(uname, 'Quelqu''un') || ' a commenté "' || COALESCE(mtitre, 'ton manga') || '"', NEW.manga_id, false);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_comment ON commentaires;
CREATE TRIGGER trg_notify_comment AFTER INSERT ON commentaires
  FOR EACH ROW EXECUTE FUNCTION public.notify_comment();

-- 3. Like d'un commentaire → notifie l'auteur du commentaire
CREATE OR REPLACE FUNCTION public.notify_comment_like()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cauthor UUID; uname TEXT;
BEGIN
  SELECT user_id INTO cauthor FROM commentaires WHERE id = NEW.commentaire_id;
  IF cauthor IS NULL OR cauthor = NEW.user_id THEN RETURN NEW; END IF;
  SELECT username INTO uname FROM profiles WHERE id = NEW.user_id;
  INSERT INTO notifications (user_id, type, message, lu)
  VALUES (cauthor, 'like', '❤️ @' || COALESCE(uname, 'Quelqu''un') || ' a aimé ton commentaire', false);
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
  INSERT INTO notifications (user_id, type, message, lu)
  VALUES (aid, 'avis', '⭐ Nouvel avis (' || NEW.note || '/5) sur "' || COALESCE(ptitre, 'ton pack') || '"', false);
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_avis ON avis_packs;
CREATE TRIGGER trg_notify_avis AFTER INSERT ON avis_packs
  FOR EACH ROW EXECUTE FUNCTION public.notify_avis();
