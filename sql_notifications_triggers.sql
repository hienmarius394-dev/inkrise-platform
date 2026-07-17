-- ============================================================
-- NOTIFICATIONS AUTOMATIQUES — À exécuter dans l'éditeur SQL Supabase
-- ============================================================
-- Ces triggers créent les notifications côté serveur (fiable, ne peut
-- pas échouer en silence). Idempotent : peut être relancé sans risque.

-- Filet de sécurité : certaines installations ont une colonne "titre"
-- NOT NULL sur notifications qui n'est pas dans notre schéma de base.
-- On lui donne un défaut pour que les inserts qui ne la renseignent pas
-- (ancien code front, autres triggers) ne fassent jamais échouer la
-- transaction qui les déclenche.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS titre TEXT NOT NULL DEFAULT '';
ALTER TABLE notifications ALTER COLUMN titre SET DEFAULT '';

-- Colonne générique "lien" : l'URL exacte où l'action notifiée a eu lieu,
-- pour que cliquer sur une notification y emmène directement.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS lien TEXT;

-- Qui a fait l'action : permet d'afficher sa photo de profil sur la notif.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS acteur_id UUID;

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

-- ─────────────────────────────────────────────
-- Pose des triggers : uniquement sur les tables réellement présentes,
-- pour ne jamais échouer si une table (avis_packs, commentaire_likes…)
-- n'existe pas encore sur cette installation.
-- ─────────────────────────────────────────────
DO $$
BEGIN
  IF to_regclass('public.follows') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_notify_follow ON follows;
    CREATE TRIGGER trg_notify_follow AFTER INSERT ON follows
      FOR EACH ROW EXECUTE FUNCTION public.notify_follow();
  END IF;
  IF to_regclass('public.commentaires') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_notify_comment ON commentaires;
    CREATE TRIGGER trg_notify_comment AFTER INSERT ON commentaires
      FOR EACH ROW EXECUTE FUNCTION public.notify_comment();
  END IF;
  IF to_regclass('public.commentaire_likes') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_notify_comment_like ON commentaire_likes;
    CREATE TRIGGER trg_notify_comment_like AFTER INSERT ON commentaire_likes
      FOR EACH ROW EXECUTE FUNCTION public.notify_comment_like();
  END IF;
  IF to_regclass('public.avis_packs') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_notify_avis ON avis_packs;
    CREATE TRIGGER trg_notify_avis AFTER INSERT ON avis_packs
      FOR EACH ROW EXECUTE FUNCTION public.notify_avis();
  END IF;
END $$;

-- ─────────────────────────────────────────────
-- RATTRAPAGE des notifications créées avant les colonnes lien/acteur_id :
-- on retrouve l'acteur via le username contenu dans le message.
-- ─────────────────────────────────────────────
UPDATE notifications n
SET acteur_id = p.id,
    lien = COALESCE(n.lien, 'auteur.html?id=' || p.id)
FROM profiles p
WHERE n.type = 'follow' AND n.acteur_id IS NULL
  AND p.username = substring(n.message from '^@(.+) te suit désormais !$');

UPDATE notifications n
SET acteur_id = p.id
FROM profiles p
WHERE n.type = 'comment' AND n.acteur_id IS NULL
  AND p.username = substring(n.message from '^@(.+) a commenté "');

UPDATE notifications n
SET acteur_id = p.id
FROM profiles p
WHERE n.type = 'like' AND n.acteur_id IS NULL
  AND p.username = substring(n.message from '^❤️ @(.+) a aimé ton commentaire$');

-- Les vieilles notifs liées à un manga mais sans lien pointent vers sa page.
UPDATE notifications
SET lien = 'manga.html?id=' || manga_id
WHERE lien IS NULL AND manga_id IS NOT NULL;
