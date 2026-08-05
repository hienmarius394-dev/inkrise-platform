/* Nav du bas partagée — une seule source de vérité pour toutes les pages.
   Usage : <div id="inkriseBottomNav" data-active="accueil"></div>
           <script src="assets/inkrise-nav.js"></script>
   data-active : accueil | tutoriels | communaute | profil (ou vide) */
(function () {
  /* Garde-fou anti-débordement horizontal : empêche la page de "glisser"
     de gauche à droite quand un élément dépasse la largeur de l'écran.
     overflow-x: clip (et non hidden) pour ne pas casser les nav sticky. */
  (function () {
    var s = document.createElement('style');
    s.textContent = 'html,body{overflow-x:clip;max-width:100%;}' +
      /* Cibles tactiles — ces éléments sont déclarés à l'identique dans une
         vingtaine de fichiers ; les agrandir ici évite vingt retouches et
         garantit qu'ils restent cohérents. La loupe de recherche mesurait
         32×27px et la croix du menu 30×30, sous le seuil confortable au
         doigt : on vise 44px sans changer l'allure de la barre. */
      '.univ-nav-search{min-height:44px;}' +
      '.univ-nav-si{min-height:44px;}' +
      '.univ-nav-sb{min-width:44px;min-height:44px;display:flex;align-items:center;justify-content:center;}' +
      '.univ-d-close{width:40px;height:40px;}' +
      '.univ-nav-hbg{min-width:40px;min-height:40px;}' +
      /* Liens légaux du menu : 12px de haut, quasi impossibles à viser */
      '#univDrawer a[href$="mentions-legales.html"],' +
      '#univDrawer a[href$="cgu.html"],' +
      '#univDrawer a[href$="confidentialite.html"]{display:inline-block;padding:8px 2px;}';
    document.head.appendChild(s);
  })();

  const ITEMS = [
    { id: 'accueil',    href: 'index.html',      icon: '🏠', label: 'Accueil' },
    { id: 'tutoriels',  href: 'tutoriels.html',  icon: '🎓', label: 'Tutoriels' },
    { id: 'search' },
    { id: 'communaute', href: 'communaute.html', icon: '👥', label: 'Communauté' },
    { id: 'profil',     href: 'profil.html',     icon: '👤', label: 'Profil' },
  ];

  const mount = document.getElementById('inkriseBottomNav');
  if (mount) {
    const active = mount.dataset.active || '';

    const nav = document.createElement('div');
    nav.className = 'univ-bnav';
    nav.innerHTML = ITEMS.map(it => {
      if (it.id === 'search') {
        return '<button class="univ-bnav-search" type="button" title="Rechercher" ' +
          'aria-label="Rechercher"><span aria-hidden="true">🔍</span></button>';
      }
      const cls = 'univ-bnav-item' + (it.id === active ? ' active' : '');
      // L'emoji double le libellé écrit juste dessous : on ne l'annonce pas.
      return '<a href="' + it.href + '" class="' + cls + '"' +
        (it.id === active ? ' aria-current="page"' : '') + '>' +
        '<span class="univ-bnav-icon" aria-hidden="true">' + it.icon + '</span>' +
        '<span class="univ-bnav-label">' + it.label + '</span></a>';
    }).join('');
    mount.replaceWith(nav);

    nav.querySelector('.univ-bnav-search').addEventListener('click', function () {
      // Priorité : champ de recherche de la page (nav haut ou hero), sinon page recherche
      if (typeof window.focusSearch === 'function' && document.getElementById('navSearchInput')) {
        window.focusSearch();
        return;
      }
      const hero = document.getElementById('heroSearchInput');
      if (hero) {
        hero.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      window.location.href = 'recherche.html';
    });
  }

  /* ── Garde-fou anti-page-figée ──
     Quand le réseau lâche en cours de route, une requête Supabase peut rester
     suspendue sans jamais rejeter : la page tourne alors indéfiniment sur son
     écran de chargement. Six pages restaient ainsi bloquées pour de bon —
     comportement d'autant plus fréquent que le public lit sur mobile.
     Plutôt que d'emballer chaque requête page par page, on surveille ici
     l'écran de chargement lui-même : s'il est toujours là passé le délai, on
     dit ce qui se passe et on propose de réessayer. */
  const LOADERS = ['#pageLoading', '#libLoading', '#loadingEl', '#loading-screen',
                   '#loaderInitial', '.page-loading', '.loading-wrap', '.loading-state',
                   '.loading-spinner', '.reader-loading'];

  /* Zones de contenu principal, pour repérer une page restée vide */
  const ZONES = ['#mainContent', '#app', '.main-wrap', '.page-wrap', '#dashboard', '#libGrid'];

  function loaderVisible() {
    for (const sel of LOADERS) {
      for (const el of document.querySelectorAll(sel)) {
        const s = getComputedStyle(el);
        if (s.display !== 'none' && s.visibility !== 'hidden' && el.offsetHeight > 0) return el;
      }
    }
    return null;
  }

  /* Deuxième symptôme, plus sournois que le spinner immobile : la page cache
     son écran de chargement puis n'affiche rien du tout. Le lecteur se
     retrouve devant une page blanche — ni contenu, ni erreur, ni explication. */
  function zoneVide() {
    for (const sel of ZONES) {
      const el = document.querySelector(sel);
      if (!el) continue;
      const s = getComputedStyle(el);
      if (s.display === 'none' || s.visibility === 'hidden') continue;
      if ((el.innerText || '').trim().length < 40) { el.dataset.inkZone = '1'; return el; }
    }
    return null;
  }

  function montrerPanne(el) {
    if (document.getElementById('inkStalled')) return;
    const horsLigne = !navigator.onLine;
    const box = document.createElement('div');
    box.id = 'inkStalled';
    box.style.cssText = 'max-width:420px;margin:40px auto;padding:32px 24px;text-align:center;' +
      "font-family:'DM Sans',system-ui,sans-serif;";
    box.innerHTML =
      '<div style="font-size:2.8rem;margin-bottom:12px;">' + (horsLigne ? '📡' : '🐢') + '</div>' +
      '<div style="font-weight:800;font-size:1.05rem;color:var(--text);margin-bottom:8px;">' +
        (horsLigne ? 'Pas de connexion' : 'Le chargement n\'aboutit pas') + '</div>' +
      '<div style="font-size:.87rem;line-height:1.6;color:var(--text-2);margin-bottom:20px;">' +
        (horsLigne
          ? 'Vérifie ta connexion : rien n\'a pu être récupéré.'
          : 'Le serveur met trop de temps à répondre. Ton contenu est intact.') +
      '</div>' +
      '<button type="button" id="inkStalledRetry" style="min-height:46px;padding:12px 26px;border:none;' +
        'border-radius:12px;background:#6649f5;color:#fff;font-family:inherit;font-size:.9rem;' +
        'font-weight:700;cursor:pointer;">↻ Réessayer</button>' +
      '<div style="margin-top:14px;"><a href="index.html" style="font-size:.84rem;color:var(--text-3);">← Retour à l\'accueil</a></div>';
    if (el.dataset.inkZone === '1') {
      /* Zone de contenu restée vide : on écrit dedans, sans la masquer */
      el.appendChild(box);
    } else {
      /* Écran de chargement : on le remplace à sa place exacte, pour ne pas
         laisser un spinner tourner à côté du message. */
      el.style.display = 'none';
      (el.parentNode || document.body).insertBefore(box, el.nextSibling);
    }
    document.getElementById('inkStalledRetry').addEventListener('click', function () {
      window.location.reload();
    });

    /* Si la réponse finit malgré tout par arriver, la page se remplit : on
       retire alors le message plutôt que de le laisser contredire l'écran. */
    const repere = document.body.innerText.length;
    const veille = setInterval(function () {
      if (!document.getElementById('inkStalled')) { clearInterval(veille); return; }
      if (document.body.innerText.length > repere + 150) {
        box.remove();
        clearInterval(veille);
      }
    }, 1500);
    setTimeout(function () { clearInterval(veille); }, 40000);
  }

  function armerGardeFou() {
    /* Hors ligne, inutile d'attendre : on le sait déjà. Sinon on laisse au
       serveur le temps de répondre — au-delà de dix secondes, un écran de
       chargement immobile est lu comme une panne, autant le dire. */
    const delai = navigator.onLine ? 10000 : 2500;
    setTimeout(function () {
      const el = loaderVisible() || zoneVide();
      if (el) montrerPanne(el);
    }, delai);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', armerGardeFou);
  } else {
    armerGardeFou();
  }
  /* Coupure survenue pendant le chargement : on abrège l'attente */
  window.addEventListener('offline', function () {
    setTimeout(function () {
      const el = loaderVisible() || zoneVide();
      if (el) montrerPanne(el);
    }, 1500);
  });

  /* Confirmation d'une action irréversible : window.inkriseConfirm({…}) → Promise<bool>
     Les fenêtres confirm()/prompt() du navigateur cassaient l'identité du site
     au moment précis où l'on demande à quelqu'un de réfléchir — fond blanc
     système, typographie d'OS, aucune hiérarchie entre « annuler » et
     « supprimer ». Cette boîte reprend l'habillage d'Inkrise, met l'action
     destructrice en rouge, et sait exiger la saisie d'un mot pour les cas
     vraiment définitifs (suppression de compte).
     Options : title, message, confirmLabel, cancelLabel, danger, requireText. */
  window.inkriseConfirm = function (opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const prev = document.activeElement;
      const ov = document.createElement('div');
      ov.className = 'ink-confirm-ov';
      ov.style.cssText = 'position:fixed;inset:0;background:rgba(22,19,42,.55);z-index:600;display:flex;' +
        'align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(4px);';
      const box = document.createElement('div');
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');
      box.style.cssText = 'background:var(--bg-2);border-radius:18px;padding:24px 22px;max-width:380px;width:100%;' +
        "font-family:'DM Sans',system-ui,sans-serif;box-shadow:0 24px 70px rgba(20,14,40,.3);text-align:center;";

      const h = document.createElement('div');
      h.id = 'inkConfirmTitle';
      h.style.cssText = 'font-weight:800;font-size:1.05rem;color:var(--text);margin-bottom:8px;';
      h.textContent = opts.title || 'Confirmer';
      box.setAttribute('aria-labelledby', 'inkConfirmTitle');
      box.appendChild(h);

      if (opts.message) {
        const m = document.createElement('div');
        m.style.cssText = 'font-size:.87rem;line-height:1.6;color:var(--text-2);margin-bottom:16px;white-space:pre-line;';
        m.textContent = opts.message;
        box.appendChild(m);
      }

      let input = null;
      if (opts.requireText) {
        const hint = document.createElement('label');
        hint.style.cssText = 'display:block;font-size:.78rem;color:var(--text-3);margin-bottom:6px;text-align:left;';
        hint.textContent = 'Tape « ' + opts.requireText + ' » pour confirmer';
        input = document.createElement('input');
        input.type = 'text';
        input.autocapitalize = 'off';
        input.autocomplete = 'off';
        input.style.cssText = 'width:100%;padding:11px 13px;border:1px solid var(--border);border-radius:10px;' +
          'font-size:.9rem;font-family:inherit;margin-bottom:16px;outline:none;min-height:44px;';
        hint.setAttribute('for', 'inkConfirmInput');
        input.id = 'inkConfirmInput';
        box.appendChild(hint); box.appendChild(input);
      }

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;justify-content:center;flex-wrap:wrap;';
      const mk = function (label, primary) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.style.cssText = 'flex:1 1 130px;min-height:46px;padding:12px 18px;border-radius:12px;cursor:pointer;' +
          'font-family:inherit;font-size:.9rem;font-weight:700;transition:transform .15s;' +
          (primary
            ? 'border:none;color:#fff;background:' + (opts.danger === false ? '#6649f5' : '#c62b09') + ';'
            : 'border:1px solid var(--border);background:var(--bg-2);color:var(--text);');
        return b;
      };
      const cancel = mk(opts.cancelLabel || 'Annuler', false);
      const ok = mk(opts.confirmLabel || 'Supprimer', true);

      function close(v) {
        document.removeEventListener('keydown', onKey, true);
        ov.remove();
        if (prev && prev.focus) prev.focus();
        resolve(v);
      }
      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(false); }
        /* Piège à tabulation : sans lui, le clavier repart derrière la boîte */
        if (e.key === 'Tab') {
          const f = box.querySelectorAll('button, input');
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      cancel.addEventListener('click', function () { close(false); });
      ok.addEventListener('click', function () {
        if (input && input.value.trim() !== opts.requireText) {
          input.style.borderColor = '#c62b09';
          input.focus();
          return;
        }
        close(true);
      });
      if (input) {
        /* Le bouton ne s'active qu'une fois le mot exact saisi : on ne
           supprime pas un compte par réflexe. */
        ok.disabled = true; ok.style.opacity = '.5'; ok.style.cursor = 'not-allowed';
        input.addEventListener('input', function () {
          const good = input.value.trim() === opts.requireText;
          ok.disabled = !good;
          ok.style.opacity = good ? '1' : '.5';
          ok.style.cursor = good ? 'pointer' : 'not-allowed';
          input.style.borderColor = 'var(--border)';
        });
        input.addEventListener('keydown', function (e) { if (e.key === 'Enter' && !ok.disabled) ok.click(); });
      }
      row.appendChild(cancel); row.appendChild(ok);
      box.appendChild(row);
      ov.appendChild(box);
      ov.addEventListener('click', function (e) { if (e.target === ov) close(false); });
      document.addEventListener('keydown', onKey, true);
      document.body.appendChild(ov);
      setTimeout(function () { (input || cancel).focus(); }, 40);
    });
  };

  /* Signalement de contenu : window.inkriseSignaler(sb, 'manga'|'commentaire'|'post'|'pack'|'profil', id)
     Ouvre une petite modale de choix de raison puis insère dans `signalements`. */
  window.inkriseSignaler = function (sb, typeContenu, contenuId) {
    if (document.getElementById('inkSignalOverlay')) return;
    const RAISONS = ['Contenu volé / plagiat', 'Contenu inapproprié', 'Spam ou arnaque', 'Harcèlement', 'Autre'];
    const ov = document.createElement('div');
    ov.id = 'inkSignalOverlay';
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:400;display:flex;align-items:center;justify-content:center;padding:20px;backdrop-filter:blur(3px);';
    const box = document.createElement('div');
    box.style.cssText = 'background:var(--bg-2);border-radius:16px;padding:22px;max-width:340px;width:100%;font-family:\'DM Sans\',sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.25);';
    box.innerHTML = '<div style="font-weight:800;font-size:1rem;margin-bottom:4px;">🚩 Signaler ce contenu</div>' +
      '<div id="inkSignalMsg" style="font-size:.8rem;color:var(--text-3);margin-bottom:14px;">Pourquoi veux-tu le signaler ?</div>';
    RAISONS.forEach(function (raison) {
      const b = document.createElement('button');
      b.textContent = raison;
      b.style.cssText = 'display:block;width:100%;text-align:left;padding:11px 14px;margin-bottom:8px;border-radius:10px;border:1px solid var(--border);background:var(--surface);cursor:pointer;font-size:.86rem;font-weight:600;color:var(--text);';
      b.onclick = async function () {
        const msg = document.getElementById('inkSignalMsg');
        try {
          const { data } = await sb.auth.getSession();
          if (!data || !data.session) { msg.textContent = 'Connecte-toi pour signaler un contenu.'; msg.style.color = '#ef4444'; return; }
          const { error } = await sb.from('signalements').insert({
            type_contenu: typeContenu, contenu_id: String(contenuId),
            raison: raison, signale_par: data.session.user.id
          });
          if (error && String(error.code) === '23505') { msg.textContent = 'Tu as déjà signalé ce contenu — merci !'; }
          else if (error) { msg.textContent = 'Erreur : ' + error.message; msg.style.color = '#ef4444'; return; }
          else { msg.textContent = '✅ Merci, ton signalement a bien été transmis.'; }
          msg.style.color = '#0fb8a6';
          box.querySelectorAll('button').forEach(function (x) { if (x !== close) x.disabled = true; x.style.opacity = '.55'; });
          close.style.opacity = '1'; close.disabled = false;
          setTimeout(function () { ov.remove(); }, 1600);
        } catch (e) { msg.textContent = 'Erreur inattendue.'; msg.style.color = '#ef4444'; }
      };
      box.appendChild(b);
    });
    const close = document.createElement('button');
    close.textContent = 'Annuler';
    close.style.cssText = 'display:block;width:100%;padding:10px;margin-top:4px;border-radius:10px;border:none;background:none;cursor:pointer;font-size:.84rem;font-weight:700;color:var(--text-3);';
    close.onclick = function () { ov.remove(); };
    box.appendChild(close);
    ov.appendChild(box);
    ov.addEventListener('click', function (e) { if (e.target === ov) ov.remove(); });
    document.body.appendChild(ov);
  };

  /* ── Accessibilité du menu latéral, pour les quinze pages qui en ont un ──
     Chaque page définit ses propres openDrawer/closeDrawer ; plutôt que de
     modifier quinze fichiers, on les enveloppe ici pour ajouter ce qui
     manquait : l'état ouvert/fermé annoncé, le focus déplacé dans le menu
     puis rendu au bouton, et la fermeture par Échap. L'ordre des scripts
     varie d'une page à l'autre, d'où l'attente du document complet. */
  function initDrawerA11y() {
    const drawerEl = document.getElementById('univDrawer');
    const hbg = document.querySelector('.univ-nav-hbg');
    if (!drawerEl) return;

    drawerEl.setAttribute('role', 'dialog');
    drawerEl.setAttribute('aria-modal', 'true');
    drawerEl.setAttribute('aria-label', 'Menu de navigation');
    if (hbg) {
      hbg.setAttribute('type', 'button');
      hbg.setAttribute('aria-controls', 'univDrawer');
      hbg.setAttribute('aria-expanded', 'false');
      hbg.setAttribute('aria-label', 'Ouvrir le menu');
    }
    // Les pastilles emoji du menu doublent le libellé écrit juste à côté :
    // un lecteur d'écran les annoncerait deux fois.
    drawerEl.querySelectorAll('.univ-d-icon').forEach(function (i) {
      i.setAttribute('aria-hidden', 'true');
    });

    let lastFocus = null;
    const open = window.openDrawer, close = window.closeDrawer;
    if (typeof open === 'function') {
      window.openDrawer = function () {
        lastFocus = document.activeElement;
        open.apply(this, arguments);
        if (hbg) hbg.setAttribute('aria-expanded', 'true');
        const first = drawerEl.querySelector('.univ-d-close, a, button');
        if (first) setTimeout(function () { first.focus(); }, 60);
      };
    }
    if (typeof close === 'function') {
      window.closeDrawer = function () {
        close.apply(this, arguments);
        if (hbg) hbg.setAttribute('aria-expanded', 'false');
        // Sans ça le focus repart en haut du document à chaque fermeture
        if (lastFocus && lastFocus.focus) { lastFocus.focus(); lastFocus = null; }
      };
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && drawerEl.classList.contains('open') &&
          typeof window.closeDrawer === 'function') window.closeDrawer();
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDrawerA11y);
  } else {
    initDrawerA11y();
  }

  /* PWA : enregistre le service worker (cache assets + pages, mode hors-ligne) */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { /* non bloquant */ });
    });
  }

  /* ── Basculeur de thème, en haut du bas du menu latéral ──
     Le menu est le seul endroit présent sur les quinze pages principales :
     y placer le réglage évite d'inventer une page Paramètres pour un seul
     bouton, et le met à portée de pouce depuis n'importe où. */
  function initBasculeurTheme() {
    const d = document.getElementById('univDrawer');
    if (!d || !window.inkriseTheme || document.getElementById('inkThemeRow')) return;

    const OPTIONS = [
      { valeur: 'clair',  icone: '☀️', libelle: 'Clair' },
      { valeur: 'sombre', icone: '🌙', libelle: 'Sombre' },
      { valeur: 'auto',   icone: '🌗', libelle: 'Auto' },
    ];

    const titre = document.createElement('div');
    titre.className = 'univ-d-sec';
    titre.textContent = 'Apparence';

    const rangee = document.createElement('div');
    rangee.className = 'ink-theme-row';
    rangee.id = 'inkThemeRow';
    rangee.setAttribute('role', 'group');
    rangee.setAttribute('aria-label', 'Thème du site');

    const boutons = OPTIONS.map(function (o) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ink-theme-opt';
      b.dataset.valeur = o.valeur;
      b.innerHTML = '<span aria-hidden="true">' + o.icone + '</span><span>' + o.libelle + '</span>';
      b.setAttribute('aria-label', 'Thème ' + o.libelle.toLowerCase());
      b.addEventListener('click', function () {
        window.inkriseTheme.set(o.valeur);
        rafraichir();
      });
      rangee.appendChild(b);
      return b;
    });

    function rafraichir() {
      const actuel = window.inkriseTheme.get();
      boutons.forEach(function (b) {
        b.setAttribute('aria-pressed', String(b.dataset.valeur === actuel));
      });
    }
    rafraichir();

    d.appendChild(titre);
    d.appendChild(rangee);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBasculeurTheme);
  } else {
    initBasculeurTheme();
  }

  /* Carte "Notre mission" en bas du menu latéral — visible en permanence,
     sur toutes les pages, connecté ou non. */
  const drawer = document.getElementById('univDrawer');
  if (drawer && !document.getElementById('drawerMission')) {
    const card = document.createElement('a');
    card.id = 'drawerMission';
    card.href = 'creators-remuneration.html';
    card.style.cssText = 'display:block;margin:16px 14px 12px;padding:14px 16px;border-radius:14px;' +
      'text-decoration:none;background:linear-gradient(135deg,rgba(124,92,252,.12),rgba(255,95,168,.10));' +
      'border:1px solid rgba(124,92,252,.28);';
    card.innerHTML =
      '<div style="font-weight:800;font-size:.72rem;letter-spacing:.6px;color:var(--purple2);margin-bottom:6px;">💜 NOTRE MISSION</div>' +
      '<div style="font-size:.82rem;line-height:1.5;color:var(--text-2);">Tu publies tes mangas sur Inkrise ? Dès que la communauté sera assez grande, jusqu\'à <b>70% des revenus publicitaires</b> te seront reversés <b>selon les vues de tes œuvres</b>.</div>' +
      '<div style="margin-top:8px;font-size:.8rem;font-weight:700;color:var(--pink);">En savoir plus →</div>';
    drawer.appendChild(card);

    // Liens légaux discrets sous la carte mission (présents sur toutes les pages)
    // #9a99a8 ne donnait que 2,8:1 sur fond blanc, sous le minimum lisible
    // de 4,5:1 ; #6b6a78 reste discret tout en montant à 5,3:1.
    const legal = document.createElement('div');
    legal.style.cssText = 'padding:0 18px 40px;font-size:.72rem;line-height:1.8;color:var(--text-3);';
    legal.innerHTML =
      '<a href="mentions-legales.html" style="color:var(--text-3);text-decoration:underline;">Mentions légales</a> · ' +
      '<a href="cgu.html" style="color:var(--text-3);text-decoration:underline;">CGU / CGV</a> · ' +
      '<a href="confidentialite.html" style="color:var(--text-3);text-decoration:underline;">Confidentialité</a>';
    drawer.appendChild(legal);
  }
})();
