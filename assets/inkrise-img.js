/* Compression d'images côté navigateur avant upload vers Supabase Storage.
   window.inkriseCompressImage(file, opts) → Promise<File>
   - redimensionne à opts.maxDim px max (largeur ou hauteur, défaut 1600)
   - convertit en WebP qualité opts.quality (défaut 0.82)
   - rend l'original tel quel si : pas une image raster, GIF (animation),
     déjà léger (< opts.minBytes, défaut 150 Ko), échec, ou aucun gain. */
(function () {
  async function compressImage(file, opts) {
    opts = opts || {};
    const maxDim   = opts.maxDim   || 1600;
    const quality  = opts.quality  || 0.82;
    const minBytes = opts.minBytes || 150 * 1024;
    try {
      if (!file || !file.type || !file.type.startsWith('image/')) return file;
      if (file.type === 'image/gif') return file;
      if (file.size < minBytes) return file;

      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      if (bitmap.close) bitmap.close();

      const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', quality));
      if (!blob || blob.size >= file.size) return file;

      const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.webp';
      return new File([blob], name, { type: 'image/webp' });
    } catch (e) {
      console.warn('Compression ignorée :', e);
      return file;
    }
  }
  window.inkriseCompressImage = compressImage;
})();
