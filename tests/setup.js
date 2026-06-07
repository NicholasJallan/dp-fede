// Test harness — charge les modules métier (data.js + lib/*) dans un faux `window`
// puis renvoie ce window pour utilisation dans les tests.
//
// On utilise `eval` indirect plutôt que `vm.createContext` pour rester dans
// le même realm V8 : sinon les Array créés dans le contexte VM ont un prototype
// différent et `assert.deepEqual` (mode strict) échoue.

const fs   = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');

// Faux window partagé — toutes les assignations `window.X = ...` y aboutissent.
const win = {};

// Expose comme `window` global ET `globalThis.window` (data.js fait window.X = ...).
global.window     = win;
globalThis.window = win;

const indirectEval = eval;  // call site → scope global

for (const rel of ['lib/depth-clamp.js', 'lib/pal-rules.js', 'data.js']) {
  const code = fs.readFileSync(path.join(projectRoot, rel), 'utf8');
  indirectEval(code);
}

module.exports = win;
