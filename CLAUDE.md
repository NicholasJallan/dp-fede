# CLAUDE.md — DP Assistant

Outil d'aide au Directeur de Plongée (FFESSM / Code du Sport).
Frontend : React 19 + esbuild. Backend : PHP 8.5-FPM (pool dédié dp-fede à côté du pool « dive » d'une autre application — ne jamais modifier ce pool ni de réglage global de php8.5-fpm ; cf. `docs/deploy/php85.md`) + MariaDB sur Raspberry Pi. PrestaShop/WordPress restent en PHP 7.4 sur le même Pi. `composer.json` : `php >= 8.2`, `config.platform.php = 8.5.11` ; CI PHPUnit en 8.2 et 8.5.

## Build frontend

```bash
npm run build           # build de prod → dist/   (node build.js, sans sourcemap)
npm run dev             # watch mode   → dist/   (node build.js --watch)
npm run test:e2e:local  # build + sert dist/ sur :8765 + smoke Playwright (API simulée)
```

`dist/` est gitignored — toujours déployer via `deploy/deploy-frontend.sh` (qui lance le build puis rsync `dist/`).

Le bump sw.js VERSION est **automatique** (`build.js` : hash du contenu de `dist/`) — ne pas modifier `VERSION` à la main.

## Architecture

```
Source → node build.js → dist/  ← ce qui est déployé
  index.html                 template HTML source (copié tel quel ; placeholder Maps conservé)
  public/                    copié tel quel : sw.js, inline-boot.js, manifest, icônes, logo
  src/app/main.jsx           entrée esbuild → dist/app.js (TOUT le JS applicatif)
  src/styles/styles.css      → dist/styles.css

src/                         modules ES, organisés par fonctionnalité
  app/          shell : main.jsx, bootstrap.js, App.jsx, constants.js, derive.js,
                dive-content.js, hooks/ (use-dive-session, use-dive-actions,
                use-dive-lifecycle, use-step-navigation, use-directory,
                use-outbox-items, use-auth-expired), components/ (Topbar,
                DiveStepper, AdminNav, SideSummary, FootNav, UrgenceModal,
                ExecuteOverlays, ConfirmModals, ScreenRouter)
  screens/      screen-*.jsx (un écran par fichier) ; sous-dossiers par écran :
                club/ (screen-club : infos, membres, invitations, mes clubs,
                quitter/supprimer ; invitation-dialog), import/ (screen-import :
                CSV dry_run → rapport → confirmation), stats/ (screen-stats),
                alerts/ (bandeau accueil + liste annuaire), archives/
                (dive-documents : PDF archivés), account/ (RGPD export/suppression)
  components/   ui.jsx, cds-link.jsx, format.js, sync-drawer.jsx, toast.jsx,
                error-boundary.jsx, diver-form.jsx (+ diver-payload.js, logique
                pure), typed-confirm-dialog.jsx (saisie SUPPRIMER), copy-button.jsx,
                components.jsx (ré-exports)
  auth/         auth-context.jsx (exporte purgeLocalData ; refreshUser, endSession), super-admin.js
  club/         socle club côté front : club-context.jsx (useClub : club courant,
                rôle, can(perm), switchClub, acceptInvitation), permissions.js
                (miroir de Club::PERMISSIONS), alerts.js, import-report.js,
                deletion.js, season.js, invitation.js (#invitation=…),
                use-club-alerts.js
  domain/       règles métier pures (index.js ré-exporte tout) : cds-tables,
                pal-rules, pal-helpers, depth-clamp, aptitudes, questions, checklist,
                conditions, milieu, levels, cds-articles, reglementation,
                fiche, emergency, types
  offline/      net.js, uuid.js, offline-store.js, outbox.js, sync.js,
                offline-api.js, club-scope.js, use-online.jsx, use-auto-save.jsx
  api/          api.js, google-drive.js, drive-upload.js, storage-keys.js,
                club-header.js (club courant + en-tête X-DP-Club), download.js
  package.json  { "type": "module" } (import direct par node --test)

/var/www/html/dp-fede/       ← dist/ rsynced ici
  index.html, app.js (bundle), styles.css, inline-boot.js
  sw.js, site.webmanifest        ← PWA (Service Worker + manifest)
  favicon*, apple-touch-icon.png, android-chrome-*.png, logo-ffessm.png

/var/www/dp-fede-api/        ← backend PHP (nginx → PHP-FPM)
  index.php, lib/, routes/

/etc/dp-fede/config.php      ← config secrète (hors web root, chown root:www-data 640)

MariaDB : base dp_fede, user dp_fede_user@localhost
```

Plus aucun `<script>` applicatif ni global `window.*` partagé : les modules
s'importent. Seuls restent hors bundle `inline-boot.js` (fallback de
chargement, `window.GOOGLE_CLIENT_ID`, callback `__gmapsReady`,
enregistrement du SW), Google Identity Services et Google Maps.
Ordre d'amorçage (`src/app/bootstrap.js`, appelé par `main.jsx` avant le
rendu) : `startNetMonitor()` → `decorateApiForOffline(api)` (décore EN PLACE
le singleton `api`) → `sync.start()` au tick suivant → capture du lien
d'invitation `#invitation=…` (sessionStorage, fragment retiré de l'URL).

- Auth : Google OAuth 2.0 (Google Identity Services) — pas de mot de passe
- Annuaire plongeurs, sites et plongées : **par club** (club courant), stockés en MariaDB.
  Rôles responsable / dp / encadrant / lecture (contrat : `docs/api-club.md`) ;
  le front masque les actions non autorisées via `useClub().can(perm)`, le serveur tranche (403).
  Écrans : Club (barre haute + onglets admin), Statistiques, Import (depuis l'annuaire).
- Session : cookie HttpOnly SameSite=Lax + CSRF double-submit cookie
- Premier utilisateur connecté = admin automatiquement

## Déployer le frontend

```bash
bash deploy/deploy-frontend.sh        # build + rsync dist/ → Pi
bash deploy/deploy-frontend.sh --dry-run  # test sans déployer
```

Le script fait : `node build.js` (VERSION sw.js = hash du contenu) → `rsync dist/`.

## Déployer le backend PHP

```bash
bash deploy/deploy-backend.sh --dry-run   # relire ce qui serait envoyé / supprimé
bash deploy/deploy-backend.sh             # release → composer install --no-dev → backup → migrations → bascule
```

Les migrations ne tournent plus à chaque requête : `php backend/bin/migrate.php`
(appelé par le script de déploiement, `--status` pour l'état). Purge RGPD et
sessions : `backend/bin/purge.php` (cron, cf. `deploy/cron.example`).
Procédure complète, sauvegardes et restauration : `docs/deploy/README.md`,
`deploy/restore.md`. `pi-scripts/` (non versionné, contient des secrets) est
remplacé par `deploy/`.

> Ne jamais déployer `backend/config.php` (gitignored) — la config vit sur le Pi dans `/etc/dp-fede/config.php`.

## Accès

- **URL** : https://dp-fede.bullesenvalais.ch
- **SSH Pi** : `pi@bullesenvalais.ch`
- **Frontend** : `/var/www/html/dp-fede/`
- **Backend PHP** : `/var/www/dp-fede-api/`
- **Config secrète** : `/etc/dp-fede/config.php`
- **DB** : MariaDB `dp_fede` / user `dp_fede_user@localhost`
- **nginx** : `/etc/nginx/sites-available/dp-fede` (fichier propre depuis le 20/10/2026, généré depuis `deploy/nginx-dp-fede.conf` ; contient la clé Google Maps via `sub_filter` — cf. section « Clé Google Maps ») + en-têtes `/etc/nginx/snippets/dp-fede-security-headers.conf`. Les autres sites (site, shop, dive…) restent dans `sites-available/bullesenvalais` : ne pas y toucher.
- **GitHub** : https://github.com/NicholasJallan/dp-fede
- **Google OAuth Client ID** : `813155202106-jlddu3nmfuq552p9673odcegrf5kuke7.apps.googleusercontent.com`
- **GCP Project** : `api-project-813155202106`

## Nginx après modification

```bash
ssh pi@bullesenvalais.ch "sudo nginx -t && sudo systemctl reload nginx"
```

### Clé Google Maps — injectée au runtime par nginx

`index.html` (template source, copié tel quel dans `dist/`) contient le
placeholder `__GOOGLE_MAPS_API_KEY__` dans la balise `<script>` Maps. nginx remplace
ce placeholder par la vraie clé au moment du serve via `sub_filter`
dans le bloc `location ~* \.(?:html|js|jsx|css)$` du site dp-fede :

```nginx
sub_filter '__GOOGLE_MAPS_API_KEY__' '<nouvelle-clé-AIza…>';
sub_filter_once on;
```

(le placeholder n'apparaît qu'une fois dans le HTML → `sub_filter_once
on`. Ne pas ajouter `sub_filter_types text/html;` : c'est le défaut,
nginx warn « duplicate MIME type ».)

La clé vit donc UNIQUEMENT dans
`/etc/nginx/sites-available/dp-fede` sur le Pi (mode 640, root). **Jamais dans
git.** Le rsync de déploiement frontend envoie le placeholder tel quel,
nginx s'occupe du reste — rien à faire de spécial au déploiement.

Rotation de la clé (alerte GitHub Secret Scanning, compromission, ou
audit trimestriel) :

1. GCP Console → APIs & Services → Credentials → créer la nouvelle clé,
   la restreindre (HTTP referrer `https://dp-fede.bullesenvalais.ch/*` +
   APIs Maps JS + Places), supprimer l'ancienne.
2. SSH Pi : `sudo $EDITOR /etc/nginx/sites-available/dp-fede`,
   remplacer la valeur dans la directive `sub_filter`.
3. `sudo nginx -t && sudo systemctl reload nginx`.
4. Vérifier : `curl -s https://dp-fede.bullesenvalais.ch/ | grep AIza`
   doit renvoyer la nouvelle clé.

Aucun redéploiement frontend nécessaire.

Pré-commit guard : `git grep -E 'AIza[0-9A-Za-z_-]{35}'` doit ne rien
renvoyer.

### CSP et en-têtes de sécurité

Source de vérité : `deploy/nginx-dp-fede-security-headers.conf` (installé dans
`/etc/nginx/snippets/dp-fede-security-headers.conf`), inclus au niveau
`server` ET dans chaque `location` qui pose ses propres `add_header` (nginx
n'hérite pas des `add_header` sinon). Toute nouvelle API externe appelée via
`fetch()` doit être ajoutée à `connect-src` dans ce fichier, puis réinstallée
sur le Pi (`sudo install -m 644 … && sudo nginx -t && sudo systemctl reload nginx`).
Sans ça, le navigateur émet « Failed to fetch » silencieusement.

État au 20/10/2026 :

- `connect-src` : `'self'`, `maps.googleapis.com`, `maps.gstatic.com` (Maps +
  Places), `api.open-meteo.com` (météo), `www.googleapis.com` (Drive),
  `oauth2.googleapis.com`, `accounts.google.com` (jetons), Google Fonts.
  Plus d'unpkg/cdnjs : React est bundlé dans `app.js`.
- `img-src` : `'self' data: blob:` + `*.googleapis.com`, `*.gstatic.com`,
  `*.google.com`, `*.googleusercontent.com`, `*.ggpht.com` (tuiles Maps
  satellite `khms*.googleapis.com`, avatars Google).
- `worker-src 'self' blob:`, `manifest-src 'self'`, `form-action 'self'`,
  `frame-ancestors 'none'`.
- `Cross-Origin-Opener-Policy: same-origin-allow-popups` (popup Google
  Identity Services), HSTS preload, `Permissions-Policy` (geolocation `self`
  pour le bouton météo).
- `sw.js` : `no-cache, no-store, must-revalidate` + `Service-Worker-Allowed: /` ;
  `site.webmanifest` : `no-cache`.

CSP report-uri configurée : violations envoyées à `/api/csp/report` →
log `/var/log/dp-fede-csp.log` (chown www-data:www-data, mode 640).
Vérifier régulièrement ce fichier pour identifier les nouvelles
violations.

Certificat : SAN partagé `www.bullesenvalais.ch` (site, dive, shop, dp-fede),
renouvelé par certbot en mode **webroot** (`webroot_map` dp-fede →
`/var/www/html/dp-fede`) : le bloc port 80 doit continuer à servir
`/.well-known/acme-challenge/` sans redirection. Contrôle :
`sudo certbot renew --cert-name www.bullesenvalais.ch --dry-run`.

La constante `VERSION` de `public/sw.js` vaut `__SW_VERSION__` dans le dépôt ;
`build.js` la remplace par un hash du contenu de `dist/` (`dp-{hash12}`). Ne
pas la modifier à la main. `PRECACHE_URLS` liste l'app shell : `/`,
`index.html`, `inline-boot.js`, `styles.css`, `app.js`, icônes, manifest.

## Tests métier

Lancer : `npm test` (utilise `node --test`, Node 20+ requis, zéro dépendance NPM).
Les tests sont des modules ES (`tests/package.json` → `"type": "module"`) qui
importent directement `src/domain/*` et les fabriques de `src/offline/*`.
Voir [TESTING.md](TESTING.md) pour le détail. Couverture actuelle : **426 tests JS**, 426 PHPUnit, 45 e2e locaux
(métier FFESSM/Code du Sport + offline : outbox, offline-store, sync, dive-lifecycle, home-buckets + contextualisation check-list par milieu

- socle club : `sync-club.test.js` (X-DP-Club, périmètre club du store), `club-logic.test.js` (droits, alertes, rapport d'import, suppressions)
- `sync-terrain.test.js` (inflight, listes réconciliées, premier rattachement), `paliers.test.js` (fixtures partagées avec PHP), `drive-preference.test.js).

## Données métier

Modules purs dans `src/domain/` (ré-exportés par `src/domain/index.js`) :

- `QUESTIONS` (`questions.js`) — sections du questionnaire (A, B, C, E, F, G), questions conditionnelles (`when`)
- `CHECKLIST_RULES` (`checklist.js`) — 2 phases (préparation / sur site avant mise à l'eau), items conditionnels (`when`) ; `matchCondition(when, answers)` (`conditions.js`)
- `LEVELS` / `STRUCTURE_LABELS` (`levels.js`) — libellés des niveaux FFESSM (flag `canBeDP`) et des structures
- `APTITUDE_MAP` (`aptitudes.js`) — mapping niveau → aptitudes mandatory/optional
- `REGLEMENTATION` (`reglementation.js`), `CDS_ARTICLES` / `parseCdsRefs` (`cds-articles.js`), `getEmergencyInfo` (`emergency.js`)
- `CDS` (`cds-tables.js`) — tableaux des annexes III-15 a à III-18 c
- `encadrantLevel(diver, cadrePro)`, `diverForCadre`, `isCadrePro(structureType)`, `DIPLOMES_PRO` (`encadrement.js`) — niveau encadrant retenu selon le cadre associatif / commercial
- `getMilieuType(milieu)` (`milieu.js`) — normalise 'En mer'/'Lac'/'Carrière'/'Piscine'/'Fosse' → 'mer'/'lac'/'piscine'/'fosse'
- `isMilieuNaturel(milieu)` (`milieu.js`) — vrai en mer/lac/carrière, faux en piscine/fosse ; sert à masquer les questions et items de check-list sans objet en bassin (météo, marée, bouée)
- `getDiverAptitudes(diver, isExploration, palContext)` (`aptitudes.js`) — aptitudes disponibles pour un plongeur ; `palContext` (optionnel) apporte le bonus formation selon l'enseignant de la palanquée
- `getDpMaxDepth(palType, dp)` (`aptitudes.js`) — profondeur max autorisée pour un DP selon le type ('formation'/'exploration') ; 0 = type interdit
- `getFormationBonusAptitudes(diver, maxEnsLevel)` (`aptitudes.js`) — aptitudes PE bonus accordées en formation selon l'enseignant présent
- `aptitudeMaxDepth(aptitude)` (`aptitudes.js`) — profondeur max (m) associée à une aptitude (Baptême=6, PE20=20, …)
- `getPalType(membres)` (`aptitudes.js`) — type de palanquée : 'bapteme'/'formation'/'guidee'/'exploration'
- `getAvailableMelanges(dp)` (`aptitudes.js`) — mélanges autorisés selon les qualifications du DP
- `sortMembresForFiche(membres)` (`fiche.js`) — tri canonique des membres pour la fiche (encadrant → GP → … ; 2ᵉ GP en serre-file)
- `validatePal` (`pal-rules.js`, règles) ; `derivePalMode`, `isBassinDerogation`, `hasGasQual`, `palGas` (rôle fond / déco des mélanges : Nx > 40 % avec un autre gaz = déco, sans MOD), `withDecoO2`, contexte de palanquée (`pal-helpers.js`, ré-exportés par `pal-rules.js`) ; `computePalHardLimit`, `clampProfMax` (`depth-clamp.js`) ; `minDtr`, `dtrForProf` (`dtr.js`, DTR prévue ≥ 1 min / 10 m)
- Graphe d'import sans cycle : `pal-helpers` ← `aptitudes` ← `pal-rules` (garder `pal-helpers.js` indépendant d'`aptitudes.js`).

## Règles de dérivation automatique (ne pas re-questionner l'utilisateur)

- **`answers.milieu`** : propagé depuis `selectedSite.milieu` dans `src/screens/screen-profil.jsx` (useEffect sur `answers.site_id`). Ne pas afficher de question milieu en section A.
- **`answers.activite`** : dérivé dans `src/screens/screen-palanquees.jsx` (useEffect sur `palanquees`) — 'Enseignement' si palanquée avec E1→E4, 'Exploration' sinon, 'Mixte' si les deux. Ne pas afficher de question activité en section A.
- **`isExploration`** dans `src/screens/screen-palanquees.jsx` = `answers.dp_qual === 'N5'` (N5 ne peut faire qu'exploration). Ce n'est PAS dérivé de `answers.activite`.
- **`answers.depart_bord` / `answers.depart_bateau`** : propagés depuis `selectedSite` (même useEffect).
- **`answers.dp_qual` / `answers.dp_nom`** : propagés depuis le plongeur sélectionné comme DP (useEffect sur `answers.dp_id`).

## Layout

- `.main` dans `src/styles/styles.css` n'a PAS de `max-width` ni `margin: auto` — il est pleine largeur comme la topbar et le stepper. Si on les rajoute, le contenu se décale visuellement vers la droite.

## Pièges connus

- **Clé Google Maps** : la balise Maps de `index.html` doit contenir le placeholder `__GOOGLE_MAPS_API_KEY__`, jamais une vraie clé `AIza…`. Une vraie clé qui s'y glisse fuite dans GitHub (Secret Scanning) à la première push. nginx (`sub_filter` côté Pi) injecte la vraie clé au serve — cf. section « Clé Google Maps ». Si le sélecteur de sites n'affiche plus la carte après modif nginx : vérifier que `sub_filter` est bien dans le bloc `location ~* \.(?:html|js|jsx|css)$` de `/etc/nginx/sites-available/dp-fede` (sinon il ne s'applique pas au HTML, qui est servi par ce bloc à cause de l'extension).
- `buildQualifs()` dans `backend/routes/divers.php` : utiliser `$recs` (variable locale filtrée) et NON `compact('recycleurs')` qui capturerait le paramètre de fonction (liste complète).
- `DIPLOMES_PRO` (`src/domain/encadrement.js` ↔ `Encadrement::DIPLOMES_PRO`) : `BEES1` (E3), `BEES2` (E4), `DEJEPS` (libellé « DEJEPS E3 »), `DEJEPS-E4` (DEJEPS + certificat complémentaire, ou obtenu avant la réforme), `DESJEPS` (E4), `Autre`. Le code `DEJEPS` reste celui de l'E3 (données existantes). MF1/MF2/BEPPA sont des brevets fédéraux, pas des diplômes professionnels d'État.
- **Niveau encadrant selon le cadre** : `niveau_encadrant` = prérogatives fédérales (cadre associatif) ; en structure commerciale (`structure_type = 'sca'`), seul le niveau du diplôme pro compte (`encadrantLevel`, ex. MF1 + BEPPA + DEJEPS sans CC : E4 en club, E3 en SCA). Appliqué à l'ENTRÉE des écrans de plongée (`useDiveDivers` → `diverForCadre`, niveau saisi conservé dans `niveau_encadrant_annuaire`, relu par `diverToForm` avant toute écriture) et côté serveur dans `validatePalanqueesOrAbort` (`Encadrement::applyToRow`). Le domaine (`pal-rules`, `aptitudes`) lit `niveau_encadrant` sans connaître le cadre : ne pas lui passer l'annuaire brut.
- `getMilieuType()` est case-insensitive (`.toLowerCase()`) pour gérer les valeurs sites ('Lac', 'Carrière') et les anciennes valeurs questions.
- `validatePal` vit dans `src/domain/pal-rules.js`. Toute modification doit être accompagnée d'un cas dans `tests/fixtures/pal-rules.json` (lu aussi par PHPUnit — ne pas déplacer ce fichier) et passer `tests/pal-rules.test.js`.
- Plafond de profondeur d'une palanquée : `computePalHardLimit({...})` de `src/domain/depth-clamp.js` (UN seul endroit). Les 4 anciennes duplications ont été supprimées.
- Super-administrateur : email unique `nicholas.jallan@gmail.com` (constante `SUPER_ADMIN_EMAIL` de `src/auth/super-admin.js` côté front + `Auth::SUPER_ADMIN_EMAIL` côté back). Le rôle DB `admin` ne donne PAS accès aux endpoints `/api/users/*` — `Auth::requireSuperAdmin()` est requis.
- **Schéma DB** : géré par `Migrator::run()` (CLI `bin/migrate.php`). Migrations dans `backend/migrations/NNN_*.sql`, appliquées dans l'ordre lexicographique, trackées dans `schema_migrations`. **La production a appliqué 000, 001 et `002_workspaces.sql`** (structures partagées de l'ancienne branche `main`) : ce fichier ne doit jamais changer (empreinte vérifiée par `MigratorTest`) ; nos migrations sont 003 → 011. `007_clubs.sql` reprend les structures en clubs (règles et plan/verify : `lib/LegacyWorkspaces.php`, `bin/workspaces-plan.php`, appelé par `deploy-backend.sh` ; recette MariaDB : `deploy/recette-migration-clubs.php`). Comptes `users.kind='workspace'` : jamais connectables (`Auth::current`), exclus de `/api/users*` et des purges ; `/api/workspaces*` → 410 `WORKSPACES_REPLACED`. Inventaire de la fusion : `docs/integration-upstream.md`. `Db::migrate()` conserve aussi les garde-fous `addColumnIfMissing`/`addIndexIfMissing` pour la compatibilité. Nouvelles modifications → ajouter un fichier `NNN_*.sql`.
- **Table `dives`** : cycle de vie `status ENUM('prepared','in_progress','archived')`. Colonnes : `planned_at`, `started_at`, `closed_at`, `deleted_at`. `render_state` conservé dans `dives` pour backward-compat mais écrits dans `dive_runtime_state` (H4).
- **Table `dive_runtime_state`** : `(dive_id PK FK, state MEDIUMTEXT, updated_at)`. Écritures render_state (autosave) ici → ne touche PAS `dives.updated_at` (curseur de sync préservé). GET /api/dives/:id fait un LEFT JOIN (COALESCE state/dives.render_state).
- `dives.date_plongee` est un `DATETIME`. Le front envoie/reçoit du `YYYY-MM-DDTHH:mm` ; la conversion est dans `backend/routes/dives.php::parseDiveDateToMySql/normalizeDiveDate`.
- TTL session backend = **7 jours** (`Auth::TTL = 604800`), sliding refresh à 3,5 j restants. CSRF TTL alignée à 7 jours. Couvre les sessions terrain offline prolongées (Phase 1 offline).
- `divers` et `sites` font du **soft-delete** : `DELETE` met `deleted_at = NOW()`, la ligne reste pour propager la suppression aux clients via `GET /api/divers?since=`. La liste sans `?since=` exclut les soft-deletes. Champ `deleted: bool` dans la réponse. Même mécanique pour `dives`.
- `dives.client_uuid` : si le front envoie un `client_uuid` (UUID v4) et qu'une plongée ACTIVE du club courant le porte déjà (index unique `(club_id, client_uuid)`, migration 011), le POST renvoie 200 `{ id, duplicate: true }`. Porté par une plongée d'un autre club ou supprimée → 409 `CLIENT_UUID_CONFLICT`. L'outbox ne compte un 409 comme succès que si `duplicate: true` (sinon : revue). Codes d'erreur stables : `docs/api-club.md`.
- Plongée `archived` = fiche figée : `render_state` modifié → 422 `ARCHIVED_IMMUTABLE` (seul `drive_link` reste modifiable) ; `closed_at` posé par le serveur à l'archivage (base de la conservation légale, avec `created_at`).
- `POST /api/divers` et `POST /api/sites` acceptent un `id` optionnel (UUID v4 client) ; en cas de collision PK, ils font un UPSERT limité au club (`SyncHelpers::clubScopedUpsert`) et réactivent les soft-deletes (`deleted_at = NULL`). `id` d'un autre club → 404 (ligne intacte).
- Mode offline : `src/offline/net.js` exporte `netStatus()` (et `startNetMonitor()`, appelé au démarrage) ; le hook React est `useOnline()` de `src/offline/use-online.jsx`. `offline-store`, `outbox` et `sync` exportent un singleton ET une fabrique (`createOfflineStore`, `createOutbox`, `createSync`) utilisée par les tests pour repartir d'un état vierge. Auth-context bascule en `authMode = 'offline'` si `/api/auth/me` échoue mais qu'un snapshot `dp-last-user` < 7 j existe. L'écran archive ne déclenche pas Drive hors-ligne et reprend automatiquement quand `online` repasse à true.
- Service Worker : source `public/sw.js`, servi à la racine (scope `/`). `VERSION` est calculée au build (hash de `dist/`), jamais à la main. Tout nouveau fichier statique servi hors `app.js` doit être ajouté à `PRECACHE_URLS`. Les anciens caches sont purgés sèchement à l'activation du nouveau SW (pas de migration douce). Icônes (favicons, apple-touch, android-chrome, maskable) référencées avec `?v=N` dans `index.html`, `site.webmanifest` et `PRECACHE_URLS` : à incrémenter partout quand on change l'icône (nginx les cache 7 j et Chrome garde sa propre base de favicons).
- `render_state` : JSON sérialisé `{ pressions, realises, heuresDebut, heuresFin, checked, comments }` ; `realises[palId]` = `{ duree, profMax, dtr, commentaire, paliers: {9,6,3}, confort: {on, profondeur, duree} }` (paliers réalisés : `src/domain/paliers.js` ↔ `PdfRender::formatPaliers`, cas communs `tests/fixtures/paliers.json`). Écrit dans `dive_runtime_state` via PATCH /api/dives/:id. Utilisé par les templates PHP (fiche.php, checklist.php) lors de la génération PDF côté serveur (C1.2). `finalizePendingDrive` fait un flush PATCH avant de demander le PDF.
- **Plan de secours** : `sites.acces_secours` et `sites.caisson` (VARCHAR 500, créés via `Db::migrate`). Propagés dans `answers` par `src/screens/screen-profil.jsx` (`site_acces_secours`, `site_caisson`, `site_coords`) et affichés dans le bloc « Conduite à tenir » de la fiche/PDF (`src/screens/screen-fiche.jsx`, `src/screens/screen-archive.jsx`). Bouton flottant « ☎ URGENCE » en mode `execute` (`src/app/components/ExecuteOverlays.jsx` + `UrgenceModal.jsx`).
- **Cycle de vie** : plongée créée à `status='prepared'` dès le clic "+ Nouvelle plongée". Transition → `in_progress` au 1er `heuresDebut` posé (`src/app/hooks/use-dive-lifecycle.js`). Transition → `archived` à l'étape 5, sans aucune dépendance à Google Drive (le serveur archive les PDF ; la copie Drive est facultative, préférence de l'appareil `src/api/drive-preference.js`, clé `dp-drive-export`). PATCH refusé en rétrograde (`archived` → autre statut).
- **Auto-save** (`src/offline/use-auto-save.jsx`) : debounce 500 ms vers `api.dives.update(currentDiveId, { answers, palanquees, render_state })`. Flush immédiat au retour accueil (`flushSave`) et lors de `loadDive` (bascule entre plongées).
- **`diveMode`** dans `src/app/App.jsx` (`useAppController`) : `'prepare'` (étapes 1-3) ou `'execute'` (étapes 3-5). Check-list filtre les phases selon `mode`.
- **Outbox kinds** : `dive.create`, `dive.update`, `dive.delete` ; `diver.create`, `diver.update`, `diver.delete` ; `site.create`, `site.update`, `site.delete`. Handlers dans `src/offline/sync.js` (`DEFAULT_HANDLERS`). Chaque item porte `club_id` (club courant à la mise en file, `getCurrentClubId()`) et est rejoué avec l'en-tête **`X-DP-Club`** : il reste dans son club même après un changement de club. Pas de coalesce entre clubs ; la réponse d'un item d'un autre club n'est pas réécrite dans le store local. 403 hors CSRF/origine (rôle insuffisant, club quitté) → item « à revoir », comme 400/404/422.
- **Synchro terrain** : `outbox.recoverInflight()` au démarrage (items laissés « inflight » par une fermeture d'onglet), pull toutes les 60 s si l'onglet est visible, listes annuaire / sites réconciliées (`listWithFallback` : lignes en attente fusionnées, suppressions en file masquées, lignes supprimées ailleurs purgées). Premier rattachement d'un appareil de l'ancienne version : seules les lignes non envoyées sont gardées (`purgeSyncedClubData`).
- **APCu** : partagé par tous les pools de php8.5-fpm (dont l'application « dive ») → clés préfixées `dp_fede:`, cache JWKS signé (HMAC).
- **Changement de club** : `bindLocalDataToClub` (`src/offline/club-scope.js`, `meta.club`) purge annuaire, sites, plongées et curseurs `?since=` de l'ancien club (outbox conservée) puis émet `dp:clubChanged` (annuaire rechargé, plongée ouverte fermée, retour accueil). Déclenché par `/api/auth/me` (`club_id`), `useClub().switchClub` / `acceptInvitation`, et `GET /api/sync/state` (`club_id`) si le club a changé ailleurs. Le dépôt Google Drive n'est pas un kind d'outbox (jeton Google interactif) : il passe par `finalizePendingDrive` (`src/screens/screen-archive.jsx`), relancé depuis l'accueil.
