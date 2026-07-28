/* Résolution du navigateur de test.
   Priorité : variable d'environnement, puis les emplacements habituels de
   Playwright, puis on laisse Playwright choisir lui-même. Les tests tournent
   ainsi aussi bien en local que dans un conteneur pré-équipé. */
const fs = require('fs');
const path = require('path');

function trouverChromium() {
  if (process.env.INKRISE_CHROME) return process.env.INKRISE_CHROME;
  const racines = [process.env.PLAYWRIGHT_BROWSERS_PATH, '/opt/pw-browsers',
                   path.join(process.env.HOME || '', '.cache/ms-playwright')].filter(Boolean);
  for (const racine of racines) {
    if (!fs.existsSync(racine)) continue;
    for (const d of fs.readdirSync(racine)) {
      if (!d.startsWith('chromium')) continue;
      for (const bin of ['chrome-linux/chrome', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
        const p = path.join(racine, d, bin);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return undefined;   // Playwright utilisera son navigateur par défaut
}

const CHROME = trouverChromium();
module.exports = {
  CHROME,
  optionsLancement: CHROME ? { executablePath: CHROME } : {},
};
