# Tests — DP Assistant

Le projet utilise le **test runner intégré à Node.js 20+** (`node --test`). Aucune dépendance NPM tierce — `package.json` ne déclare que la version Node minimale et deux scripts.

## Lancer les tests

```bash
npm test              # Une passe, reporter spec
npm run test:watch    # Watch mode
```

## Architecture

```
lib/
  depth-clamp.js      ← computePalHardLimit, clampProfMax
  pal-rules.js        ← validatePal, peLevel, paLevel, getMaxEnsLevel
data.js               ← getDpMaxDepth, getDiverAptitudes, getAvailableMelanges, …

tests/
  setup.js            ← charge data.js + lib/* dans un faux `window`
  helpers/builders.js ← makeDiver, makePal, makeBapteme, PRESET.n1(), …
  pal-rules.test.js   ← couverture validatePal (~50 cas)
  dp-rules.test.js    ← couverture getDpMaxDepth, getProfOptions, getAvailableMelanges
  aptitudes.test.js   ← couverture getDiverAptitudes, aptitudeMaxDepth, getMilieuType, getPalType, sortMembresForFiche
  depth-clamp.test.js ← couverture computePalHardLimit, clampProfMax
```

### Pourquoi `node --test` plutôt que Jest/Vitest ?

- Le projet utilise déjà du **zéro-build** (Babel CDN côté navigateur). On ne veut pas introduire un bundler de tests.
- Pas de transpilation TypeScript — tout est en JS pur.
- Le runner Node intègre `describe`, `test`, `beforeEach`, `assert/strict` et un reporter spec.
- Une seule dépendance : Node 20+. C'est tout.

### Pattern UMD léger

Les modules `lib/*.js` sont écrits en UMD léger pour fonctionner à la fois :

- Dans le navigateur : chargés via `<script src="lib/x.js">`, ils assignent à `window.X`.
- Dans Node : `require('./lib/x.js')` retourne un objet `{X, Y, ...}`.

```js
(function(root) {
  function maFonction() { /* ... */ }

  const api = { maFonction };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  if (root) Object.assign(root, api);
})(typeof window !== 'undefined' ? window : globalThis);
```

### Setup réseau-free

`tests/setup.js` simule un `window` global puis `eval` indirect les fichiers source. Pas de mocking de DOM nécessaire — la logique métier n'a aucune dépendance DOM.

> Important : on utilise `eval` indirect (et **pas** `vm.createContext`) pour rester dans le même realm V8. Sinon, les `Array` créés dans le contexte VM ont un `prototype` différent et `assert.deepEqual` (mode strict) échoue avec des messages trompeurs (« same structure but not reference-equal »).

## Ajouter un test

1. Créer ou éditer `tests/X.test.js`.
2. Importer les helpers : `const { makeDiver, makePal, ... } = require('./helpers/builders');`
3. Importer le module testé via le setup : `const win = require('./setup');` puis `const { validatePal } = win;`
4. Écrire un `describe` / `test` (AAA : Arrange, Act, Assert).

### Exemple

```js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const win = require('./setup');
const { makeDiver, makePal, makeMembre, makeAnswers, PRESET, errors } = require('./helpers/builders');

const { validatePal } = win;

describe('Ma nouvelle règle', () => {
  test('cas nominal → OK', () => {
    const dp = PRESET.e3();
    const n2 = PRESET.n2();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(n2, 'PE40')],
    });
    const issues = validatePal(pal, { [n2.id]: n2 }, makeAnswers(), dp);
    assert.equal(errors(issues).length, 0);
  });
});
```

## Couverture

État actuel : **176+ tests, 40 suites**, ~100 ms d'exécution (node 20 sans aucune dépendance NPM).

Modules couverts :

| Module | Fonction | Tests |
|---|---|---|
| `lib/pal-rules.js` | `validatePal` | taille, profondeur, GP, encadrants, PA, baptêmes, débutants, médical, mélanges |
| `lib/depth-clamp.js` | `computePalHardLimit`, `clampProfMax` | bornes session / DP / aptitudes |
| `lib/outbox.js` | `enqueue`, `ready`, `markFailed` (backoff) | FIFO, backoff exp, nextWakeMs |
| `lib/offline-store.js` | `put`, `get`, `all`, `del` | IDB-like avec fallback localStorage |
| `lib/sync.js` | `drainOutbox`, handlers `dive.*` / `diver.*` | succès, 409 idempotent, offline guard |
| `lib/google-drive.js` | `getDriveToken`, `getCsrfToken` | cache-first, timeout, scope |
| `data.js` | `getDpMaxDepth` | E1→E4, N5, extensions PTH-120 |
| `data.js` | `getProfOptions` | options par DP × site × Trimix |
| `data.js` | `getAvailableMelanges` | filtrage Air / Nx / Tx selon qualif DP |
| `data.js` | `getDiverAptitudes` | par niveau, bonus formation |
| `data.js` | `aptitudeMaxDepth` | toutes les aptitudes + fallback |
| `data.js` | `getMilieuType` | normalisation mer/lac/piscine/fosse |
| `data.js` | `getPalType` | priorité baptême > formation > guidée > exploration |
| `data.js` | `sortMembresForFiche` | ordre canonique + serre-file |
| `screen-checklist.jsx` (extrait) | filtrage milieu / phase | items conditionnels piscine/fosse/mer |
| Dive lifecycle | transitions prepared → in_progress → archived | refus rétrograde, auto-save flush |
| Home buckets | groupement par statut + tri | ordre date, pending Drive |

## Cibles non encore couvertes

- Backend PHP : voir Sprint 2 (PHPUnit ajouté).
- Composants React rendus (DOM) : voir Sprint 2 (Playwright E2E + tests d'unité sur hooks isolés).
- Logique CRUD palanquée dans `screen-palanquees.jsx` (addToPal, setAptitude…) — testée indirectement via validatePal.
