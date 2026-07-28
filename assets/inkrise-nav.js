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
    s.textContent = 'html,body{overflow-x:clip;max-width:100%;}';
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
      box.style.cssText = 'background:#fff;border-radius:18px;padding:24px 22px;max-width:380px;width:100%;' +
        "font-family:'DM Sans',system-ui,sans-serif;box-shadow:0 24px 70px rgba(20,14,40,.3);text-align:center;";

      const h = document.createElement('div');
      h.id = 'inkConfirmTitle';
      h.style.cssText = 'font-weight:800;font-size:1.05rem;color:#1c1c1e;margin-bottom:8px;';
      h.textContent = opts.title || 'Confirmer';
      box.setAttribute('aria-labelledby', 'inkConfirmTitle');
      box.appendChild(h);

      if (opts.message) {
        const m = document.createElement('div');
        m.style.cssText = 'font-size:.87rem;line-height:1.6;color:#48484a;margin-bottom:16px;white-space:pre-line;';
        m.textContent = opts.message;
        box.appendChild(m);
      }

      let input = null;
      if (opts.requireText) {
        const hint = document.createElement('label');
        hint.style.cssText = 'display:block;font-size:.78rem;color:#656569;margin-bottom:6px;text-align:left;';
        hint.textContent = 'Tape « ' + opts.requireText + ' » pour confirmer';
        input = document.createElement('input');
        input.type = 'text';
        input.autocapitalize = 'off';
        input.autocomplete = 'off';
        input.style.cssText = 'width:100%;padding:11px 13px;border:1px solid rgba(0,0,0,.15);border-radius:10px;' +
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
            : 'border:1px solid rgba(0,0,0,.16);background:#fff;color:#1c1c1e;');
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
          input.style.borderColor = 'rgba(0,0,0,.15)';
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
    box.style.cssText = 'background:#fff;border-radius:16px;padding:22px;max-width:340px;width:100%;font-family:\'DM Sans\',sans-serif;box-shadow:0 24px 60px rgba(0,0,0,.25);';
    box.innerHTML = '<div style="font-weight:800;font-size:1rem;margin-bottom:4px;">🚩 Signaler ce contenu</div>' +
      '<div id="inkSignalMsg" style="font-size:.8rem;color:#75757a;margin-bottom:14px;">Pourquoi veux-tu le signaler ?</div>';
    RAISONS.forEach(function (raison) {
      const b = document.createElement('button');
      b.textContent = raison;
      b.style.cssText = 'display:block;width:100%;text-align:left;padding:11px 14px;margin-bottom:8px;border-radius:10px;border:1px solid rgba(0,0,0,.1);background:#f7f7fa;cursor:pointer;font-size:.86rem;font-weight:600;color:#1c1c1e;';
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
    close.style.cssText = 'display:block;width:100%;padding:10px;margin-top:4px;border-radius:10px;border:none;background:none;cursor:pointer;font-size:.84rem;font-weight:700;color:#75757a;';
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
      '<div style="font-weight:800;font-size:.72rem;letter-spacing:.6px;color:#7c5cfc;margin-bottom:6px;">💜 NOTRE MISSION</div>' +
      '<div style="font-size:.82rem;line-height:1.5;color:#4a4560;">Tu publies tes mangas sur Inkrise ? Dès que la communauté sera assez grande, jusqu\'à <b>70% des revenus publicitaires</b> te seront reversés <b>selon les vues de tes œuvres</b>.</div>' +
      '<div style="margin-top:8px;font-size:.8rem;font-weight:700;color:#ff5fa8;">En savoir plus →</div>';
    drawer.appendChild(card);

    // Liens légaux discrets sous la carte mission (présents sur toutes les pages)
    // #9a99a8 ne donnait que 2,8:1 sur fond blanc, sous le minimum lisible
    // de 4,5:1 ; #6b6a78 reste discret tout en montant à 5,3:1.
    const legal = document.createElement('div');
    legal.style.cssText = 'padding:0 18px 40px;font-size:.72rem;line-height:1.8;color:#6b6a78;';
    legal.innerHTML =
      '<a href="mentions-legales.html" style="color:#6b6a78;text-decoration:underline;">Mentions légales</a> · ' +
      '<a href="cgu.html" style="color:#6b6a78;text-decoration:underline;">CGU / CGV</a> · ' +
      '<a href="confidentialite.html" style="color:#6b6a78;text-decoration:underline;">Confidentialité</a>';
    drawer.appendChild(legal);
  }
})();
