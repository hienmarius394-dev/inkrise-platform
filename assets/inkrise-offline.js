/* Téléchargement de chapitres pour lecture hors-ligne.
   - Les planches sont stockées dans le cache navigateur "inkrise-pages"
     (servies par le service worker quand le réseau est coupé).
   - Les métadonnées (titres, liste des pages) vivent en localStorage pour
     que le lecteur et la bibliothèque fonctionnent sans réseau. */
(function () {
  const CACHE = 'inkrise-pages';
  const KEY = 'inkrise_offline_v1';

  function all() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; }
    catch (e) { return {}; }
  }
  function saveAll(data) { localStorage.setItem(KEY, JSON.stringify(data)); }
  function get(chapId) { return all()[String(chapId)] || null; }

  /* Télécharge toutes les planches d'un chapitre dans le cache.
     onProgress(fait, total) est appelé au fil de l'eau. */
  async function download(sb, manga, chap, onProgress) {
    if (!('caches' in window)) return { ok: false, reason: 'Cache non supporté par ce navigateur' };
    const { data: files, error } = await sb.storage.from('pages')
      .list('chapitres/' + chap.id, { sortBy: { column: 'name', order: 'asc' } });
    if (error) return { ok: false, reason: error.message };
    const images = (files || []).filter(f => f.name.match(/\.(jpg|jpeg|png|webp|gif)$/i));
    if (!images.length) return { ok: false, reason: 'Ce chapitre n\'a pas encore de pages' };

    const urls = images.map(f =>
      sb.storage.from('pages').getPublicUrl('chapitres/' + chap.id + '/' + f.name).data.publicUrl);

    const cache = await caches.open(CACHE);
    let done = 0;
    for (const url of urls) {
      const res = await fetch(url);
      if (!res.ok) return { ok: false, reason: 'Téléchargement interrompu (page ' + (done + 1) + ')' };
      await cache.put(url, res);
      done++;
      if (onProgress) onProgress(done, urls.length);
    }

    const data = all();
    data[String(chap.id)] = {
      chapId: chap.id,
      chapTitre: chap.titre || ('Chapitre ' + chap.numero),
      numero: chap.numero,
      mangaId: manga.id,
      mangaTitre: manga.titre || 'Manga',
      mangaType: manga.type || 'manga',
      sensLecture: manga.sens_lecture || 'rl',
      pages: urls,
      savedAt: Date.now()
    };
    saveAll(data);
    return { ok: true, count: urls.length };
  }

  async function remove(chapId) {
    const data = all();
    const meta = data[String(chapId)];
    if (meta && 'caches' in window) {
      const cache = await caches.open(CACHE);
      await Promise.all((meta.pages || []).map(u => cache.delete(u)));
    }
    delete data[String(chapId)];
    saveAll(data);
  }

  window.inkriseOffline = { all: all, get: get, download: download, remove: remove };
})();
