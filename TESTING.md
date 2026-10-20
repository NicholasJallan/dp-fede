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

# Smoke test local du build (dist/ servi sur :8765, API /api/** simulée)
npm run test:e2e:local
```

## Architecture

```
src/domain/            ← règles métier pures (modules ES), ré-exportées par index.js
  pal-rules.js         ← validatePal (ré-exporte les helpers de pal-helpers.js)
  pal-helpers.js       ← peLevel, paLevel, getMaxEnsLevel, derivePalMode, contexte
  depth-clamp.js       ← computePalHardLimit, clampProfMax
  aptitudes.js         ← getDpMaxDepth, getDiverAptitudes, getAvailableMelanges, …
  questions.js, checklist.js, conditions.js, milieu.js, fiche.js, …
src/offline/           ← offline-store, outbox, sync, offline-api (fabriques + singletons)
src/api/google-drive.js

tests/                 ← modules ES (tests/package.json : "type": "module")
  setup.js             ← regroupe les exports de src/domain/ dans un objet `win`
  helpers/builders.js  ← makeDiver, makePal, makeBapteme, PRESET.n1(), …
  helpers/offline-harness.js ← faux window/localStorage + instances offline neuves
  fixtures/pal-rules.json    ← cas réglementaires partagés avec PHPUnit (ne pas déplacer)
  pal-rules.test.js    ← exécute les fixtures sur validatePal
  dp-rules.test.js     ← getDpMaxDepth, getAvailableMelanges
  aptitudes.test.js    ← getDiverAptitudes, aptitudeMaxDepth, getMilieuType, getPalType, sortMembresForFiche
  depth-clamp.test.js  ← computePalHardLimit, clampProfMax
  checklist-context.test.js, home-buckets.test.js, google-drive.test.js
  offline-store / outbox / sync / sync-integrity / dive-lifecycle .test.js

tests-e2e/             ← Playwright (CommonJS)
  0x-*.spec.js         ← golden paths contre la prod (cookies de session)
  local-smoke.spec.js  ← build local + API simulée (playwright.local.config.js)
```

### Pourquoi `node --test` plutôt que Jest/Vitest ?

- Les règles métier et la couche offline sont des modules ES sans dépendance :
  Node les importe directement, sans transpilation ni bundler de tests.
- Pas de TypeScript — tout est en JS pur (JSDoc).
- Le runner Node intègre `describe`, `test`, `beforeEach`, `assert/strict` et un reporter spec.
- Une seule dépendance : Node 20+. C'est tout.

### Modules ES partagés navigateur / Node

Tout le code de `src/` est en modules ES (`src/package.json` déclare
`"type": "module"`). Le navigateur les reçoit via le bundle esbuild
(`dist/app.js`), Node les importe tels quels :

```js
import { validatePal } from '../src/domain/index.js';
```

Les modules `src/domain/*` n'utilisent ni DOM ni React. Les modules
`src/offline/*` lisent les globaux (`window`, `localStorage`, `fetch`,
`CustomEvent`) **au moment de l'appel** : `tests/helpers/offline-harness.js`
installe un faux `window` sur `globalThis` puis crée des instances neuves via
`createOfflineStore()`, `createOutbox()` et `createSync()` — chaque test part
d'un état vierge, sans `eval` ni rechargement de fichier.

## Ajouter un test

1. Créer ou éditer `tests/X.test.js`.
2. Importer les helpers : `import { makeDiver, makePal, ... } from './helpers/builders.js';`
3. Importer le module testé : `import { validatePal } from '../src/domain/index.js';` (ou via `import win from './setup.js';` puis `const { validatePal } = win;`)
4. Écrire un `describe` / `test` (AAA : Arrange, Act, Assert).

### Exemple

```js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validatePal } from '../src/domain/index.js';
import { makePal, makeMembre, makeAnswers, PRESET, errors } from './helpers/builders.js';

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

État actuel : **391 tests JS** (node 20+), **407 tests PHPUnit** (PHP 8.2 et 8.5 en CI), **42 tests e2e locaux** (Playwright, API simulée).

Recette de la migration des structures de production en clubs, sur un MariaDB jetable : `php deploy/recette-migration-clubs.php` (variables `DP_RECETTE_DSN`, `DP_RECETTE_USER`, `DP_RECETTE_PASS`).

Modules couverts :

| Module | Fonction | Tests |
|---|---|---|
| `src/domain/pal-rules.js` | `validatePal` | fixtures partagées PHP : taille, profondeur, GP, encadrants, PA, baptêmes, débutants, médical, mélanges |
| `src/domain/depth-clamp.js` | `computePalHardLimit`, `clampProfMax` | bornes session / DP / aptitudes |
| `src/offline/outbox.js` | `enqueue`, `ready`, `markFailed`, `coalesce` (backoff) | FIFO, backoff exp, nextWakeMs, revue |
| `src/offline/offline-store.js` | `put`, `get`, `all`, `del` | fallback localStorage |
| `src/offline/sync.js` | `drainOutbox`, `pullIncremental`, handlers `dive.*` / `diver.*` | succès, 409 idempotent, offline guard, ordre par entité |
| `src/offline/offline-api.js` | `dives.get`, `dives.update` | persistance hors-ligne, fusion d'outbox |
| `src/api/google-drive.js` | `getDriveToken`, `getCsrfToken` | cache-first, timeout, scope |
| `src/domain/aptitudes.js` | `getDpMaxDepth` | E1→E4, N5, extensions PTH-120 |
| `src/domain/aptitudes.js` | `getAvailableMelanges` | filtrage Air / Nx / Tx selon qualif DP |
| `src/domain/aptitudes.js` | `getDiverAptitudes` | par niveau, bonus formation |
| `src/domain/aptitudes.js` | `aptitudeMaxDepth` | toutes les aptitudes + fallback |
| `src/domain/milieu.js` | `getMilieuType`, `isMilieuNaturel` | normalisation mer/lac/piscine/fosse |
| `src/domain/aptitudes.js` | `getPalType` | priorité baptême > formation > guidée > exploration |
| `src/domain/fiche.js` | `sortMembresForFiche` | ordre canonique + serre-file |
| `src/domain/questions.js`, `checklist.js` | filtrage milieu / phase | items conditionnels piscine/fosse/mer |
| Dive lifecycle | transitions prepared → in_progress → archived | refus rétrograde, auto-save flush |
| Home buckets | groupement par statut + tri | ordre date, pending Drive |
| `src/offline/*` (synchro terrain) | `recoverInflight`, `nextWakeMs`, `listWithFallback`, `purgeSyncedClubData` | `tests/sync-terrain.test.js` |
| `src/domain/paliers.js`, `fiche/fin-rules.js` | `formatPaliers`, bornes de saisie | `tests/paliers.test.js` (fixtures `tests/fixtures/paliers.json` partagées avec PHPUnit) |
| `src/api/drive-preference.js` | copie Drive facultative | `tests/drive-preference.test.js` |
| Backend `LegacyWorkspaces` + `007_clubs.sql` | reprise des structures (règles, plan sur volumes de production, ordre SQL via `RecordingPdo`) | `LegacyWorkspacesTest.php`, `MigratorTest.php` |

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

Trois golden paths contre la prod dans `tests-e2e/` (config `playwright.config.js`) :

| Fichier | Couvre |
|---|---|
| `01-home-loads.spec.js` | Hero, badge Drive (absence par défaut), navigation |
| `02-dive-create-flow.spec.js` | Création plongée → questionnaire → retour home |
| `03-offline-resilience.spec.js` | Coupure réseau, reload, reconnexion |

Voir `tests-e2e/README.md` pour le setup cookies + variables d'env.

### Smoke test local (`npm run test:e2e:local`)

`tests-e2e/local-smoke.spec.js` + `playwright.local.config.js` : construit
`dist/`, le sert sur http://127.0.0.1:8765 (`python3 -m http.server`) et
simule toutes les routes `/api/**` (utilisateur connecté, annuaire, une
plongée préparée). Scripts Google (GIS, Maps, Fonts) remplacés par des
réponses vides. Vérifie :

- l'accueil et la création d'une plongée (étapes 1 → 3, préparation) ;
- l'exécution d'une plongée (étapes 3 → 5, fiche incluse, modale urgence) ;
- l'absence d'erreur console ;
- la coupure réseau en cours d'usage (pas d'écran blanc) et le rechargement
  hors-ligne servi par le cache du Service Worker.

## Cibles non encore couvertes

- Composants React rendus (DOM) hors E2E : pas de tests unitaires DOM-level
  (le smoke test local couvre le rendu des étapes 1 → 5).
- Logique CRUD palanquée dans `src/screens/screen-palanquees.jsx` (addToPal, setAptitude…)
  — testée indirectement via validatePal.
- Backend : intégration HTTP complète (nécessite stub PDO ou DB de test).
