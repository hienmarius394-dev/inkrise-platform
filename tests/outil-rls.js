#!/usr/bin/env node
/* Confronte les politiques RLS aux écritures que le site tente vraiment.
   ─────────────────────────────────────────────────────────────────────
   Une écriture refusée par RLS ne plante pas le navigateur : PostgREST
   répond 403 (ou 0 ligne affectée), et un code qui ne lit pas `error`
   affiche un joli message de succès pour une opération qui n'a rien fait.
   L'inverse existe aussi : une politique trop large laisse passer ce que
   l'interface n'offre à personne.

   Chaque cas décrit une intention en français, l'exécute sur un vrai
   PostgreSQL chargé avec sql_a_executer.sql, et compare au résultat
   attendu. Un écart = une ligne dans le rapport.

   Usage :  node tests/outil-rls.js
   Un PostgreSQL jetable est créé au premier lancement (voir preparer()),
   avec juste ce qu'il faut de Supabase : auth.users, auth.uid(), les rôles
   anon / authenticated, et les deux tables de storage. */
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const SOCKET = process.env.PGSOCKET || '/var/tmp/inkrise-pg';
const PORT = process.env.PGPORT || '5433';
const BIN = '/usr/lib/postgresql/16/bin';
const psql = (sql, { role = 'postgres' } = {}) => {
  try {
    const out = execFileSync('psql', ['-h', SOCKET, '-p', PORT, '-U', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-tAq', '-c', sql],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (e) {
    return { ok: false, err: ((e.stderr || '') + (e.stdout || '')).trim() };
  }
};

/* Exécute `sql` comme le ferait PostgREST : rôle `authenticated` (ou `anon`)
   et auth.uid() renseigné depuis le jeton.

   ⚠️ Piège central de cet outil, et raison pour laquelle il a d'abord crié
   au loup sur quatre cas : RLS ne fait PAS échouer un UPDATE ou un DELETE
   interdit. La clause USING filtre les lignes, la commande réussit, et zéro
   ligne est touchée. « Aucune erreur » ne veut donc pas dire « permis ».
   On compte les lignes réellement affectées (RETURNING), et zéro vaut refus.
   C'est aussi exactement ce que voit le navigateur : Supabase renvoie
   `error: null`, et un code qui n'en lit que ça annonce un succès. */
function commeUtilisateur(uid, sql) {
  const prologue = uid
    ? `SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${uid}';`
    : `SET LOCAL ROLE anon; SET LOCAL request.jwt.claim.sub = '';`;
  const compte = /^\s*(UPDATE|DELETE|INSERT)/i.test(sql)
    ? sql.replace(/;\s*$/, '') + ' RETURNING 1;'
    : sql;
  const r = psql(`BEGIN; ${prologue} ${compte} ROLLBACK;`);
  if (!r.ok) return r;
  if (compte !== sql) {
    const lignes = r.out.split('\n').filter(l => l.trim() === '1').length;
    if (lignes === 0) return { ok: false, err: 'ERROR: 0 ligne affectée (filtrée par USING, sans erreur)' };
  }
  return r;
}

const AUTEUR  = '11111111-1111-1111-1111-111111111111';
const LECTEUR = '22222222-2222-2222-2222-222222222222';
const TIERS   = '33333333-3333-3333-3333-333333333333';
const ADMIN   = '44444444-4444-4444-4444-444444444444';

const releve = [];
const noter = (gravite, quoi, detail) => releve.push({ gravite, quoi, detail });
const resultats = [];

/* attendu : 'permis' ou 'refusé' */
function cas(intention, uid, sql, attendu, gravite = 'moyen') {
  const r = commeUtilisateur(uid, sql);
  const obtenu = r.ok ? 'permis' : 'refusé';
  const conforme = obtenu === attendu;
  resultats.push({ intention, conforme });
  console.log(`${conforme ? '  ✅' : '  ❌'} ${intention} → ${obtenu}` +
              (conforme ? '' : ` (attendu : ${attendu})`));
  if (!conforme) {
    const cause = r.ok ? 'la politique laisse passer' : premiereLigne(r.err);
    noter(gravite, intention, `attendu ${attendu}, obtenu ${obtenu} — ${cause}`);
  }
  return conforme;
}
const premiereLigne = t => (t || '').split('\n').find(l => /ERROR|error/.test(l)) || (t || '').split('\n')[0];

/* ══ Serveur jetable ══ */
const SHIM = `
CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS storage;
CREATE TABLE IF NOT EXISTS auth.users (
  id UUID PRIMARY KEY, email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW());
-- Même source que Supabase : le « sub » du jeton, posé par PostgREST.
CREATE OR REPLACE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $fn$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid; $fn$;
CREATE OR REPLACE FUNCTION auth.role() RETURNS TEXT LANGUAGE sql STABLE AS $fn$
  SELECT COALESCE(NULLIF(current_setting('request.jwt.claim.role', true), ''), 'anon'); $fn$;
CREATE TABLE IF NOT EXISTS storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN DEFAULT false);
CREATE TABLE IF NOT EXISTS storage.objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT REFERENCES storage.buckets(id),
  name TEXT, owner UUID, created_at TIMESTAMPTZ DEFAULT NOW());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DO $do$ BEGIN CREATE ROLE anon NOLOGIN;          EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
DO $do$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $do$;
GRANT USAGE ON SCHEMA public, auth, storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon, authenticated;
`;

function preparer() {
  if (psql('SELECT 1').ok) return;                      // déjà debout
  if (!fs.existsSync(BIN)) {
    console.error('PostgreSQL 16 introuvable dans ' + BIN + ' — outil ignoré.');
    process.exit(0);
  }
  const base = SOCKET;
  const sh = c => execFileSync('sh', ['-c', c], { stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    sh(`rm -rf ${base} && mkdir -p ${base} && chown postgres:postgres ${base} && chmod 700 ${base}`);
    sh(`su postgres -c "${BIN}/initdb -D ${base}/data -U postgres -A trust"`);
    sh(`su postgres -c "${BIN}/pg_ctl -D ${base}/data -o '-p ${PORT} -k ${base}' -l ${base}/pg.log start"`);
  } catch (e) {
    console.error('Impossible de démarrer PostgreSQL :\n' + (e.stderr || e.message));
    process.exit(1);
  }
  for (let i = 0; i < 20 && !psql('SELECT 1').ok; i++) execFileSync('sleep', ['0.5']);
  const shim = psql(SHIM);
  if (!shim.ok) { console.error('Faux Supabase :\n' + shim.err); process.exit(1); }
  const schema = psql(`\\i ${path.join(__dirname, '..', 'sql_a_executer.sql')}`);
  if (!schema.ok) { console.error('Chargement du schéma :\n' + schema.err); process.exit(1); }
  console.log('PostgreSQL jetable prêt, schéma chargé depuis sql_a_executer.sql');
}

/* ══ Jeu d'essai ══ */
function semer() {
  const r = psql(`
    TRUNCATE auth.users CASCADE;
    INSERT INTO auth.users (id, email) VALUES
      ('${AUTEUR}','auteur@x.fr'), ('${LECTEUR}','lecteur@x.fr'),
      ('${TIERS}','tiers@x.fr'),   ('${ADMIN}','admin@x.fr');
    INSERT INTO profiles (id, username, is_creator) VALUES
      ('${AUTEUR}','Auteur',true), ('${LECTEUR}','Lecteur',false),
      ('${TIERS}','Tiers',false),  ('${ADMIN}','Admin',false)
      ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username;
    UPDATE profiles SET is_admin = true WHERE id = '${ADMIN}';
    INSERT INTO mangas (id, titre, auteur_id) VALUES (1,'Darkworld','${AUTEUR}')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO chapitres (id, manga_id, numero, titre) VALUES (10,1,1,'Ch 1')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO packs_tutoriels (id, titre, prix, auteur_id) VALUES
      (5,'Pack payant',12,'${AUTEUR}'), (6,'Pack offert',0,'${AUTEUR}')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO follows (user_id, followed_id) VALUES ('${TIERS}','${AUTEUR}')
      ON CONFLICT DO NOTHING;
    INSERT INTO posts_communaute (id, creator_id, auteur_id, contenu) VALUES (1,'${AUTEUR}','${AUTEUR}','Salut')
      ON CONFLICT (id) DO NOTHING;
    INSERT INTO achats_packs (user_id, pack_id) VALUES ('${LECTEUR}',5)
      ON CONFLICT DO NOTHING;
    /* Sans ligne à toucher, un UPDATE légitime rend « 0 ligne affectée » —
       indiscernable d'un refus. Chaque cas d'UPDATE a donc sa donnée. */
    INSERT INTO notifications (user_id, message) VALUES ('${LECTEUR}','Nouveau chapitre')
      ON CONFLICT DO NOTHING;
    /* Les ids semés à la main n'avancent pas les séquences : sans ça, le
       premier INSERT sans id retombe sur une ligne existante et l'échec
       ressemble à un refus de RLS. On se cale sur le plus grand id présent
       — un nombre fixe se ferait rattraper par les lignes que les
       déclencheurs viennent d'écrire. */
    DO $seq$
    DECLARE t TEXT; s TEXT; m BIGINT;
    BEGIN
      FOREACH t IN ARRAY ARRAY['mangas','chapitres','packs_tutoriels','posts_communaute',
                               'commentaires','commentaires_communaute','reactions',
                               'notifications','signalements','avis_mangas','avis_packs',
                               'achats_packs','bibliotheque'] LOOP
        s := pg_get_serial_sequence(t, 'id');
        CONTINUE WHEN s IS NULL;
        EXECUTE format('SELECT COALESCE(MAX(id), 0) FROM %I', t) INTO m;
        PERFORM setval(s, GREATEST(1000, m + 1));
      END LOOP;
    END $seq$;
  `);
  if (!r.ok) { console.error('Impossible de semer :\n' + r.err); process.exit(1); }
}

/* ══ Cas ══ */
(function () {
  preparer();
  semer();

  console.log('\n▶ Ce qu\'un créateur doit pouvoir faire sur SON œuvre');
  cas('publier un chapitre sur son manga', AUTEUR,
      `INSERT INTO chapitres (manga_id, numero, titre) VALUES (1, 2, 'Ch 2');`, 'permis', 'grave');
  cas('corriger le sens de lecture de son manga', AUTEUR,
      `UPDATE mangas SET sens_lecture='lr' WHERE id=1;`, 'permis', 'grave');
  cas('supprimer un de ses chapitres', AUTEUR,
      `DELETE FROM chapitres WHERE id=10;`, 'permis', 'grave');
  cas('modifier son pack', AUTEUR,
      `UPDATE packs_tutoriels SET prix=20 WHERE id=5;`, 'permis', 'grave');

  console.log('\n▶ Ce que personne d\'autre ne doit pouvoir faire');
  cas('un tiers publie un chapitre sur le manga d\'un autre', TIERS,
      `INSERT INTO chapitres (manga_id, numero, titre) VALUES (1, 9, 'Pirate');`, 'refusé', 'grave');
  cas('un tiers modifie le manga d\'un autre', TIERS,
      `UPDATE mangas SET titre='Volé' WHERE id=1;`, 'refusé', 'grave');
  cas('un tiers supprime le pack d\'un autre', TIERS,
      `DELETE FROM packs_tutoriels WHERE id=5;`, 'refusé', 'grave');
  cas('un tiers change le pseudo de quelqu\'un', TIERS,
      `UPDATE profiles SET username='Piraté' WHERE id='${AUTEUR}';`, 'refusé', 'grave');

  console.log('\n▶ Avis : seulement après achat / lecture');
  cas('un acheteur note le pack qu\'il a acheté', LECTEUR,
      `INSERT INTO avis_packs (pack_id, user_id, note) VALUES (5,'${LECTEUR}',5);`, 'permis', 'grave');
  cas('un non-acheteur note le pack', TIERS,
      `INSERT INTO avis_packs (pack_id, user_id, note) VALUES (5,'${TIERS}',1);`, 'refusé', 'moyen');
  cas('l\'auteur note son propre pack', AUTEUR,
      `INSERT INTO avis_packs (pack_id, user_id, note) VALUES (5,'${AUTEUR}',5);`, 'refusé', 'moyen');
  cas('un lecteur note un manga', LECTEUR,
      `INSERT INTO avis_mangas (manga_id, user_id, note) VALUES (1,'${LECTEUR}',4);`, 'permis', 'grave');
  cas('un lecteur note au nom de quelqu\'un d\'autre', LECTEUR,
      `INSERT INTO avis_mangas (manga_id, user_id, note) VALUES (1,'${TIERS}',1);`, 'refusé', 'grave');

  console.log('\n▶ Bibliothèque, abonnements, commentaires');
  cas('ajouter un manga à SA bibliothèque', LECTEUR,
      `INSERT INTO bibliotheque (user_id, manga_id) VALUES ('${LECTEUR}',1);`, 'permis', 'grave');
  cas('ajouter un manga à la bibliothèque d\'un autre', LECTEUR,
      `INSERT INTO bibliotheque (user_id, manga_id) VALUES ('${TIERS}',1);`, 'refusé', 'moyen');
  cas('s\'abonner à un créateur', LECTEUR,
      `INSERT INTO follows (user_id, followed_id) VALUES ('${LECTEUR}','${AUTEUR}');`, 'permis', 'grave');
  cas('abonner quelqu\'un d\'autre de force', LECTEUR,
      `INSERT INTO follows (user_id, followed_id) VALUES ('${TIERS}','${AUTEUR}');`, 'refusé', 'moyen');
  cas('commenter un chapitre', LECTEUR,
      `INSERT INTO commentaires (manga_id, chapitre_id, user_id, contenu) VALUES (1,10,'${LECTEUR}','Super');`,
      'permis', 'grave');
  cas('commenter sous l\'identité d\'un autre', LECTEUR,
      `INSERT INTO commentaires (manga_id, chapitre_id, user_id, contenu) VALUES (1,10,'${AUTEUR}','Faux');`,
      'refusé', 'grave');

  console.log('\n▶ Visiteur déconnecté : lecture oui, écriture non');
  cas('lire la liste des mangas', null, `SELECT count(*) FROM mangas;`, 'permis', 'grave');
  cas('lire les chapitres', null, `SELECT count(*) FROM chapitres;`, 'permis', 'grave');
  cas('lire les avis d\'un pack', null, `SELECT count(*) FROM avis_packs;`, 'permis', 'moyen');
  cas('publier un manga sans compte', null,
      `INSERT INTO mangas (titre, auteur_id) VALUES ('Anonyme','${AUTEUR}');`, 'refusé', 'grave');
  cas('commenter sans compte', null,
      `INSERT INTO commentaires (manga_id, chapitre_id, user_id, contenu) VALUES (1,10,'${LECTEUR}','x');`,
      'refusé', 'grave');

  console.log('\n▶ Modération');
  cas('signaler un contenu', LECTEUR,
      `INSERT INTO signalements (signale_par, type_contenu, contenu_id, raison) VALUES ('${LECTEUR}','manga','1','plagiat');`,
      'permis', 'grave');
  cas('signaler au nom de quelqu\'un d\'autre', LECTEUR,
      `INSERT INTO signalements (signale_par, type_contenu, contenu_id, raison) VALUES ('${TIERS}','manga','1','x');`,
      'refusé', 'moyen');
  cas('un modérateur lit les signalements', ADMIN, `SELECT count(*) FROM signalements;`, 'permis', 'grave');
  cas('un utilisateur ordinaire lit les signalements', LECTEUR,
      `SELECT 1/count(*) FROM signalements;`, 'refusé', 'grave');
  cas('un utilisateur ordinaire classe un signalement', LECTEUR,
      `UPDATE signalements SET statut='traite' WHERE 1=1;`, 'refusé', 'grave');

  console.log('\n▶ Paiements et notifications — les points sensibles');
  cas('s\'offrir un pack payant sans passer par le paiement', TIERS,
      `INSERT INTO achats_packs (user_id, pack_id) VALUES ('${TIERS}',5);`, 'refusé', 'grave');
  cas('récupérer un pack réellement gratuit', TIERS,
      `INSERT INTO achats_packs (user_id, pack_id, prix_paye) VALUES ('${TIERS}',6,0);`, 'permis', 'grave');
  cas('écrire une notification dans la boîte de quelqu\'un d\'autre', TIERS,
      `INSERT INTO notifications (user_id, message, lien) VALUES ('${LECTEUR}','Compte suspendu','http://x');`,
      'refusé', 'grave');
  cas('lire les notifications d\'un autre', TIERS,
      `SELECT 1/count(*) FROM notifications WHERE user_id='${LECTEUR}';`, 'refusé', 'grave');
  cas('marquer ses propres notifications comme lues', LECTEUR,
      `UPDATE notifications SET lu=true WHERE user_id='${LECTEUR}';`, 'permis', 'moyen');

  console.log('\n▶ Réglages et données personnelles');
  cas('changer ses propres préférences', LECTEUR,
      `UPDATE profiles SET pref_masquer_adulte=true WHERE id='${LECTEUR}';`, 'permis', 'grave');
  cas('lire l\'abonnement push d\'un autre', TIERS,
      `SELECT 1/count(*) FROM push_subscriptions WHERE user_id='${LECTEUR}';`, 'refusé', 'moyen');
  cas('se déclarer administrateur', TIERS,
      `UPDATE profiles SET is_admin=true WHERE id='${TIERS}';`, 'refusé', 'grave');

  /* ══ Les notifications viennent-elles bien des déclencheurs ? ══
     Fermer la politique ne suffit pas : si les gestes correspondants ne
     produisent plus rien, on a troqué une faille contre un silence. */
  console.log('\n▶ Les notifications légitimes partent toujours');
  /* On compare AVANT / APRÈS dans la même transaction. Compter les
     notifications existantes suffisait à faire passer le test alors que le
     déclencheur était débranché : `semer()` crée un abonnement, lequel en
     produit une au passage. Un test qui passe pour la mauvaise raison ne
     protège de rien. */
  function partDe(intention, uid, geste, destinataire) {
    const compte = `SELECT count(*) FROM notifications WHERE user_id = '${destinataire}';`;
    const r = psql(`BEGIN;
      ${compte}
      SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '${uid}';
      ${geste}
      RESET ROLE; RESET request.jwt.claim.sub;
      ${compte}
      ROLLBACK;`);
    const chiffres = r.ok ? r.out.split('\n').map(x => x.trim()).filter(x => /^\d+$/.test(x)) : [];
    const n = chiffres.length >= 2
      ? Number(chiffres[chiffres.length - 1]) - Number(chiffres[0]) : -1;
    const ok = n > 0;
    resultats.push({ intention, conforme: ok });
    console.log(`${ok ? '  ✅' : '  ❌'} ${intention} → ${ok ? n + ' notification(s)' : (r.ok ? 'aucune' : premiereLigne(r.err))}`);
    if (!ok) noter('grave', intention, 'le déclencheur ne produit rien — ' + (r.ok ? '0 notification' : premiereLigne(r.err)));
  }
  // Le lecteur a déjà une notification semée : on cible un abonné neuf.
  partDe('publier un chapitre prévient les abonnés', AUTEUR,
         `INSERT INTO chapitres (manga_id, numero, titre) VALUES (1, 3, 'Ch 3');`, TIERS);
  partDe('commenter sur un mur prévient le créateur', TIERS,
         `INSERT INTO commentaires_communaute (post_id, user_id, contenu) VALUES (1,'${TIERS}','Bravo');`, AUTEUR);
  partDe('réagir à un post prévient le créateur', TIERS,
         `INSERT INTO reactions (post_id, user_id, type) VALUES (1,'${TIERS}','heart');`, AUTEUR);
  partDe('s\'abonner prévient le créateur', LECTEUR,
         `INSERT INTO follows (user_id, followed_id) VALUES ('${LECTEUR}','${AUTEUR}');`, AUTEUR);

  /* ══ Rapport ══ */
  console.log('\n' + '═'.repeat(60));
  const ko = resultats.filter(r => !r.conforme);
  console.log(`${resultats.length - ko.length}/${resultats.length} politiques conformes à ce que l'interface propose`);
  if (releve.length) {
    console.log('\n═══ ÉCARTS ═══\n');
    for (const g of ['grave', 'moyen']) {
      const l = releve.filter(x => x.gravite === g);
      if (!l.length) continue;
      console.log('### ' + g.toUpperCase() + ' (' + l.length + ')');
      l.forEach(x => { console.log('  • ' + x.quoi); console.log('      ' + x.detail); });
      console.log('');
    }
    process.exit(1);
  }
  console.log('✅ aucun écart entre les politiques et les gestes de l\'interface');
})();
