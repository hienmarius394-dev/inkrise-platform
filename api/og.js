/* Aperçu de lien pour les réseaux sociaux (fonction serverless Vercel).
   ─────────────────────────────────────────────────────────────────────
   Inkrise est un site statique : le vrai titre d'un manga n'apparaît qu'une
   fois le JavaScript exécuté. Or WhatsApp, Facebook, Telegram, Discord et
   consorts ne l'exécutent pas — ils lisent le HTML brut. Résultat, tous les
   liens partagés se ressemblaient : « Manga — Inkrise » et la même image
   générique, quelle que soit l'œuvre.

   Cette fonction rend le même contenu, mais avec de VRAIES balises Open
   Graph. Elle n'est appelée que pour les robots d'aperçu (voir les règles
   `rewrites` de vercel.json) : les visiteurs continuent de recevoir la page
   statique, inchangée et sans détour.

   On laisse volontairement Googlebot de côté : il exécute le JavaScript, il
   voit donc déjà le bon titre — et lui servir une page différente n'aurait
   fait que ressembler à du cloaking pour rien.

   Si cette fonction tombe, le robot reçoit l'ancien aperçu générique : on
   revient exactement à la situation d'avant, jamais à un lien cassé. */

const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://bsdcpwtimsgxcnaamwip.supabase.co';
const SUPABASE_ANON =
  process.env.SUPABASE_ANON_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJzZGNwd3RpbXNneGNuYWFtd2lwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAzMTQ1MDIsImV4cCI6MjA5NTg5MDUwMn0.uMcfUsnlULHNqS_87xzUWRUB8tEaCCNQglrWwN2fb44';

const SITE = process.env.SITE_URL || 'https://inkrise-platform.vercel.app';
const IMAGE_DEFAUT = SITE + '/assets/hero-manga.jpg';

const esc = (s) =>
  String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/* Une description d'aperçu se fait tronquer autour de 200 caractères : on
   coupe nous-mêmes, sur un mot, plutôt que de laisser couper au milieu. */
function resumer(texte, max) {
  const t = String(texte || '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const coupe = t.slice(0, max);
  const espace = coupe.lastIndexOf(' ');
  return (espace > max * 0.6 ? coupe.slice(0, espace) : coupe).trim() + '…';
}

async function interroger(chemin) {
  const res = await fetch(SUPABASE_URL + '/rest/v1/' + chemin, {
    headers: {
      apikey: SUPABASE_ANON,
      Authorization: 'Bearer ' + SUPABASE_ANON,
      Accept: 'application/json',
    },
  });
  if (!res.ok) return null;
  const rows = await res.json();
  return Array.isArray(rows) ? rows[0] || null : rows;
}

async function fiche(type, id) {
  if (type === 'manga') {
    const m = await interroger(
      'mangas?id=eq.' + encodeURIComponent(id) +
      '&select=id,titre,synopsis,couverture_url,statut,type,auteur_id,profiles!auteur_id(username)');
    if (!m) return null;
    /* Un brouillon n'est pas public : on ne divulgue rien de plus que ce
       que la page elle-même montrerait. */
    if (m.statut === 'brouillon') return null;
    const auteur = m.profiles && m.profiles.username;
    return {
      titre: m.titre ? m.titre + ' — Inkrise' : 'Manga — Inkrise',
      description: resumer(
        m.synopsis || (auteur ? `Un ${m.type || 'manga'} de ${auteur}, à lire gratuitement sur Inkrise.`
                              : 'À lire gratuitement sur Inkrise.'), 200),
      image: m.couverture_url || IMAGE_DEFAUT,
      portrait: !!m.couverture_url,
      canonique: SITE + '/manga.html?id=' + encodeURIComponent(m.id),
    };
  }

  if (type === 'pack') {
    const p = await interroger(
      'packs_tutoriels?id=eq.' + encodeURIComponent(id) +
      '&select=id,titre,description,couverture_url,prix');
    if (!p) return null;
    const prix = Number(p.prix);
    const etiquette = !prix || isNaN(prix) ? 'Gratuit' : prix + ' €';
    return {
      titre: p.titre ? p.titre + ' — Inkrise' : 'Pack tutoriel — Inkrise',
      description: resumer((p.description || 'Un pack de dessin manga sur Inkrise.') +
                           ' · ' + etiquette, 200),
      image: p.couverture_url || IMAGE_DEFAUT,
      portrait: !!p.couverture_url,
      canonique: SITE + '/pack.html?id=' + encodeURIComponent(p.id),
    };
  }

  if (type === 'auteur') {
    const a = await interroger(
      'profiles?id=eq.' + encodeURIComponent(id) + '&select=id,username,bio,avatar_url');
    if (!a) return null;
    const pseudo = a.username || 'Créateur';
    return {
      titre: pseudo + ' — Inkrise',
      description: resumer(a.bio || `Découvre les œuvres de ${pseudo} sur Inkrise.`, 200),
      image: a.avatar_url || IMAGE_DEFAUT,
      portrait: !!a.avatar_url,
      canonique: SITE + '/auteur.html?id=' + encodeURIComponent(a.id),
    };
  }

  return null;
}

function page(f) {
  /* `summary_large_image` étire l'image sur toute la largeur : superbe pour
     la bannière paysage, disgracieux pour une couverture verticale ou un
     avatar, qui se retrouvent rognés. On choisit donc selon l'image. */
  const carte = f.portrait ? 'summary' : 'summary_large_image';
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(f.titre)}</title>
<meta name="description" content="${esc(f.description)}" />
<link rel="canonical" href="${esc(f.canonique)}" />
<meta property="og:site_name" content="Inkrise" />
<meta property="og:type" content="article" />
<meta property="og:locale" content="fr_FR" />
<meta property="og:title" content="${esc(f.titre)}" />
<meta property="og:description" content="${esc(f.description)}" />
<meta property="og:image" content="${esc(f.image)}" />
<meta property="og:url" content="${esc(f.canonique)}" />
<meta name="twitter:card" content="${carte}" />
<meta name="twitter:title" content="${esc(f.titre)}" />
<meta name="twitter:description" content="${esc(f.description)}" />
<meta name="twitter:image" content="${esc(f.image)}" />
<meta http-equiv="refresh" content="0; url=${esc(f.canonique)}" />
</head>
<body>
<p><a href="${esc(f.canonique)}">${esc(f.titre)}</a></p>
<script>location.replace(${JSON.stringify(f.canonique)});</script>
</body>
</html>`;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const type = url.searchParams.get('type');
  const id = url.searchParams.get('id');

  const secours = {
    manga: '/manga.html', pack: '/pack.html', auteur: '/auteur.html',
  }[type] || '/index.html';

  try {
    const f = id ? await fiche(type, id) : null;
    if (!f) {
      /* Contenu introuvable, privé, ou base injoignable : on renvoie le
         robot vers la page normale. Il y trouvera l'aperçu générique —
         c'est-à-dire exactement ce qu'il avait avant cette fonction. */
      res.writeHead(302, { Location: secours + (id ? '?id=' + encodeURIComponent(id) : '') });
      return res.end();
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    /* Les robots repassent souvent : un cache court évite de taper la base
       à chaque fois qu'un lien circule, sans figer un titre corrigé. */
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=86400');
    return res.end(page(f));
  } catch (e) {
    res.writeHead(302, { Location: secours + (id ? '?id=' + encodeURIComponent(id) : '') });
    return res.end();
  }
};
