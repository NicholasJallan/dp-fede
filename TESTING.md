# Tests — DP Assistant

Le projet utilise le **test runner intégré à Node.js 20+** (`node --test`). Aucune dépendance NPM tierce — `package.json` ne déclare que la version Node minimale et deux scripts.

## Lancer les tests

```bash
# Front (logique métier, Node 20+, sans dépendance NPM)
npm test              # Une passe, reporter spec
npm run test:watch    # Watch mode

# Backend PHP (PHPUnit, nécessite composer install sur le Pi)
npm run test:php

# End-to-end Playwright (nécessite cookies session — voir tests-e2e/README.md)
npm run test:e2e
npm run test:e2e:ui   # mode debug interactif
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

## Backend PHP (Sprint 2)

Scaffold PHPUnit dans `backend/`. Quatre suites en place :

| Suite | Couvre |
|---|---|
| `AuthTest.php` | `Auth::isSuperAdmin`, constante `SUPER_ADMIN_EMAIL` (régression rôle) |
| `CsrfTest.php` | `Csrf::verify` voie nominale, `Csrf::token` format hex |
| `DiveDateHelpersTest.php` | `parseDiveDateToMySql`, `normalizeDiveDate` (frontière format date) |
| `SyncHelpersTest.php` | `isValidUuid` (rempart contre injection PK), `parseSinceParam` |

Sur le Pi (ou en CI) :

```bash
cd backend
composer install --dev
composer test
```

### À venir (hors Sprint 2)
- Tests d'intégration HTTP (Auth::abort + routes complètes) — nécessite stub PDO.
- Coverage rapportée (pcov ou xdebug).

## E2E Playwright (Sprint 2)

Trois golden paths dans `tests-e2e/` :

| Fichier | Couvre |
|---|---|
| `01-home-loads.spec.js` | Hero, badge Drive (absence par défaut), navigation |
| `02-dive-create-flow.spec.js` | Création plongée → questionnaire → retour home |
| `03-offline-resilience.spec.js` | Coupure réseau, reload, reconnexion |

Voir `tests-e2e/README.md` pour le setup cookies + variables d'env.

## Cibles non encore couvertes

- Composants React rendus (DOM) hors E2E : pas de tests unitaires DOM-level
  (zéro-build → pas de @testing-library/react sans bundler).
- Logique CRUD palanquée dans `screen-palanquees.jsx` (addToPal, setAptitude…)
  — testée indirectement via validatePal.
- Backend : intégration HTTP complète (nécessite stub PDO ou DB de test).
