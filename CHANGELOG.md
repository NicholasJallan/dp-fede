# Changelog

Format inspiré de [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/).
Dates en ISO 8601.

## [Unreleased]

### Conformité Code du sport (texte consolidé du 08/10/2026)
- Moteur de règles réécrit à partir des annexes III-15 a à III-18 c (`src/domain/cds-tables.js`, `pal-rules.js`) et porté à l'identique en PHP ; 95 cas réglementaires partagés JS/PHP (`tests/fixtures/pal-rules.json`), revus de façon indépendante.
- Situations auparavant autorisées à tort désormais bloquées : E1 avec 2 baptêmes, air > 60 m, trimix autonome à 6, âge minimal en autonomie, DP E1/E2 en fosse > 6 m, nitrox en formation, GP à 0-60 m, PpO₂ > 1,6 bar…
- Blocages injustifiés levés : E1/E2 en milieu naturel, panachage d'aptitudes, PA en formation, exploration encadrée par un E sous DP N5, plongeur supplémentaire GP/P4.
- DTR saisie par le DP (plus jamais calculée d'office) ; check-list complétée (A322-78/80/93/97) ; date de naissance et PTH-40.

### Stabilité et données
- Crash de l'étape 4 corrigé ; ErrorBoundary. Plus de perte de données hors-ligne (fusion des données synchronisées, garde-fou serveur 409, outbox fusionnée par entité, état « à revoir »). Service Worker sans cache API ; données locales liées à l'utilisateur et au club.
- PDF générés depuis la base (état d'exécution inclus) ; mode « HTML client » supprimé (SSRF).

### Interface
- Direction « console de bord » : thèmes Soleil / Nuit, carte « cadran » en exécution, palanquées bloquées explicites avec article du Code du sport, Dialog accessible, responsive 320 → 1440, axe-core sans violation.

### Club (léger, compatible import VPDive)
- Clubs, rôles, invitations ; import CSV idempotent ; alertes CACI / licences / mineurs ; archivage serveur des fiches (conservation 1 an, A322-72) ; statistiques ; export et suppression de compte (RGPD).

### Technique et exploitation
- Code front en modules ES dans `src/` ; ESLint ; CI GitHub Actions ; backend PHP 8.2 (php-jwt 7) ; migrations en CLI ; déploiement, sauvegardes et restauration versionnés dans `deploy/` ; `docs/rgpd.md`, `docs/deploy/`.

### Historique antérieur (sprints 1 à 4)

### Added — Structures partagées (branche de production, 04/09/2026 — remplacées par les clubs, cf. `docs/integration-upstream.md`)
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
