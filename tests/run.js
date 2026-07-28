#!/usr/bin/env node
/* Lance toutes les suites et rend un bilan.
   Usage :  node tests/run.js  [motif]
   Exemple : node tests/run.js lecteur   → n'exécute que lecteur.test.js */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const motif = process.argv[2] || '';
const suites = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js') && f.includes(motif))
  .sort();

if (!suites.length) { console.error('Aucune suite ne correspond à « ' + motif + ' »'); process.exit(1); }

let total = 0, reussis = 0;
const echecs = [];
console.log(`\nInkrise — ${suites.length} suite(s) à exécuter\n` + '─'.repeat(52));

for (const s of suites) {
  process.stdout.write(path.basename(s, '.test.js').padEnd(20));
  let sortie = '', ok = true;
  try {
    sortie = execFileSync(process.execPath, [path.join(__dirname, s)],
                          { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    ok = false;
    sortie = (e.stdout || '') + (e.stderr || '');
  }
  const m = sortie.match(/(\d+)\/(\d+) vérifications OK/);
  if (m) { reussis += +m[1]; total += +m[2]; }
  if (ok && m && m[1] === m[2]) {
    console.log(`✅  ${m[1]}/${m[2]}`);
  } else {
    console.log(`❌  ${m ? m[1] + '/' + m[2] : 'plantée'}`);
    echecs.push([s, sortie]);
  }
}

console.log('─'.repeat(52));
console.log(`${reussis}/${total} vérifications OK\n`);

for (const [s, sortie] of echecs) {
  console.log(`\n═══ détail de ${s} ═══`);
  const lignes = sortie.split('\n').filter(l => l.includes('❌') || l.includes('CRASH') || l.includes('Erreurs JS'));
  console.log(lignes.length ? lignes.join('\n') : sortie.slice(-1400));
}
process.exit(echecs.length ? 1 : 0);
