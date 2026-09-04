# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Dates en ISO 8601.

## [Unreleased]

### Added — Structures partagées
- Espaces de travail partagés : plusieurs moniteurs mettent en commun annuaire
  de plongeurs, sites et fiches de sécurité. On rejoint une structure avec un
  code d'invitation, à la connexion ou depuis la topbar.
- `backend/migrations/002_workspaces.sql` : tables `workspaces` et
  `workspace_members`, colonnes `users.kind`, `sessions.workspace_id` et
  `created_by` sur `divers`/`sites`/`dives`.
- `backend/routes/workspaces.php` : liste, join par code (rate-limité), bascule
  de scope, départ ; création et liste globale réservées au super-admin.
- `Auth::current()` résout `scope_id` / `workspace` / `scope` ; refuse toute
  session rattachée à un compte-structure.
- `lib/scope.js` : `purgeLocalScope()` et `switchScope()` — purge IndexedDB,
  snapshots `dp-cache-*` et cache SW `*-api` à chaque bascule, refuse de basculer
  si l'outbox n'est pas vide.
- `screen-workspace.jsx` : sélecteur d'espace après connexion et depuis la topbar.
- Section « Structures » dans l'écran Administration.
- Tests : `tests/scope-purge.test.js` (6 cas) et
  `backend/tests-php/WorkspaceScopeTest.php` (garde-fou : aucune route de données
  ne doit scoper sur `$user['id']`).

### Fixed — Structures partagées
- **`React is not defined` au démarrage** : `lib/net.js` (hors bundle) référence
  un `React` global que `build.js` avait cessé de fournir en supprimant les
  balises unpkg. Aucun composant ne montait, la page restait sur le fallback
  « Chargement impossible ». `app.jsx` réexpose `window.React`.
- `logout()` purge désormais les caches locaux : sur une tablette partagée, le
  compte suivant ne voit plus l'annuaire du précédent.
- `POST /api/divers` et `/api/sites` refusent en 409 un upsert visant un id
  détenu par un autre espace.
- Les comptes-structure sont masqués de `GET /api/users` et `/api/users/stats`.

### Added — Sprint 4 (sécurité durcie)
- `docs/security/README.md` : vue d'ensemble architecture sécurité + table de surfaces d'attaque.
- `docs/security/gcp-checklist.md` : audit trimestriel GCP (OAuth Consent Screen, OAuth Client, API Keys, Quotas).
- `docs/security/composer-audit.md` : état des dépendances PHP + procédure audit.
- `backend/routes/csp.php` : endpoint POST `/api/csp/report` pour collecter les violations CSP du navigateur.
- `nginx-offline-snippet.conf` : headers HSTS 1 an + preload, Permissions-Policy, COOP, et CSP avec `report-uri`.

### Added — Sprint 3 (refactor + sécurité backend)
- `lib/drive-upload.js` : helpers `driveGetOrCreateFolder` + `driveUploadFile`, partagés entre `ScreenArchive` et `finalizePendingDrive`.
- `lib/use-auto-save.jsx` : hook React isolé pour l'auto-save debouncé (extrait d'`app.jsx`).
- `Auth::verifyGoogleToken` : vérification JWT RS256 locale via JWKS Google (cache APCu 6h), fallback `tokeninfo` si OpenSSL absent.
- Rate-limit générique sur `/api/dives`, `/api/divers`, `/api/sites` (POST/PATCH/PUT/DELETE) : 120/min/IP.

### Added — Sprint 2 (tests)
- `backend/composer.json` + `backend/phpunit.xml` : scaffold PHPUnit pour le backend.
- 4 suites PHP : `AuthTest`, `CsrfTest`, `DiveDateHelpersTest`, `SyncHelpersTest`.
- `playwright.config.js` + 3 scénarios E2E : `01-home-loads`, `02-dive-create-flow`, `03-offline-resilience`.
- `tests-e2e/README.md` : setup cookies + CI.

### Added — Sprint 1 (quick wins)
- `lib/google-drive.js` : `getDriveToken({ explicit, timeoutMs })` (cache-first, scope `drive.file`) + `getCsrfToken()`.
- `lib/storage-keys.js` : `STORAGE_KEYS`, `COOKIE_KEYS`, `TTL` centralisés.
- SRI sur jsPDF 2.5.1 + html2canvas 1.4.1 dans `DP Assistant.html`.
- 9 nouveaux tests `tests/google-drive.test.js`.

### Changed
- `screen-home.jsx` : suppression de la **pré-autorisation Drive silencieuse au load**. Le token Drive n'est demandé qu'au clic « + Nouvelle plongée ». Économise une requête GIS pour 100 % des sessions admin / consultation.
- `screen-archive.jsx` : `doArchive` + `finalizePendingDrive` utilisent désormais le helper centralisé `window.getDriveToken`. Suppression de ~70 lignes de duplication.
- `api.js`, `lib/sync.js`, `lib/offline-api.js` : utilisent `window.getCsrfToken` au lieu de regex inline.
- `auth-context.jsx`, `app.jsx` : clés `localStorage` via `STORAGE_KEYS`.
- `TESTING.md` : compteur 120 → 185+ tests, nouvelles suites listées.

### Fixed
- État `driveAuth` fragile (`setTimeout 4000` à l'idle) supprimé : remplacé par une logique synchrone à l'action utilisateur.

---

## Versions antérieures

L'historique avant ce changelog vit dans `git log`. Quelques étapes clés :

- **2026-06-12** : fiche PDF — bloc paramètres complémentaires + coords secours.
- **2026-06-11** : phase offline 2 — outbox + sync + lifecycle prepared/in_progress/archived.
- **2026-05-28** : phase offline 1 — Service Worker, IndexedDB, snapshot offline 7 jours.
- **2026-05-26** : v1.0 — Google OAuth, annuaire plongeurs/sites, fiche A322-72.
