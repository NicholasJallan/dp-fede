# CLAUDE.md — DP Assistant

Outil d'aide au Directeur de Plongée (FFESSM / Code du Sport).
Frontend : React 18 + Babel CDN, zéro build. Backend : PHP 7.4-FPM (API) + PHP 8.2 (CLI, PHPUnit) + MariaDB sur Raspberry Pi.

## Architecture

```
/var/www/html/dp-fede/       ← fichiers statiques (nginx)
  DP Assistant.html / index.html
  api.js, auth-context.jsx, app.jsx, screen-*.jsx
  components.jsx, diver-form.jsx, toast.jsx
  data.js, styles.css
  sw.js, site.webmanifest        ← PWA (Service Worker + manifest)
  lib/                           ← front (zéro build) :
    depth-clamp.js, net.js, offline-api.js,
    offline-store.js, outbox.js, pal-rules.js, sync.js

/var/www/dp-fede-api/        ← backend PHP (nginx → PHP-FPM)
  index.php, lib/, routes/

/etc/dp-fede/config.php      ← config secrète (hors web root, chown root:www-data 640)

MariaDB : base dp_fede, user dp_fede_user@localhost
```

- Auth : Google OAuth 2.0 (Google Identity Services) — pas de mot de passe
- Annuaire plongeurs et sites : per-user, stockés en MariaDB
- Session : cookie HttpOnly SameSite=Lax + CSRF double-submit cookie
- Premier utilisateur connecté = admin automatiquement

## Déployer le frontend

```bash
rsync -av --rsync-path="sudo rsync" \
  --exclude='.git' --exclude='backend/' \
  /Users/nicholas/projects/dpchecklist/ \
  pi@bullesenvalais.ch:/var/www/html/dp-fede/

ssh pi@bullesenvalais.ch "sudo chown -R www-data:www-data /var/www/html/dp-fede && \
  sudo cp '/var/www/html/dp-fede/DP Assistant.html' /var/www/html/dp-fede/index.html && \
  sudo chown www-data:www-data /var/www/html/dp-fede/index.html"
```

## Déployer le backend PHP

```bash
rsync -av --rsync-path="sudo rsync" \
  /Users/nicholas/projects/dpchecklist/backend/ \
  pi@bullesenvalais.ch:/var/www/dp-fede-api/

ssh pi@bullesenvalais.ch "sudo chown -R www-data:www-data /var/www/dp-fede-api"
```

> Ne jamais déployer `backend/config.php` (gitignored) — la config vit sur le Pi dans `/etc/dp-fede/config.php`.

## Accès

- **URL** : https://dp-fede.bullesenvalais.ch
- **SSH Pi** : `pi@bullesenvalais.ch`
- **Frontend** : `/var/www/html/dp-fede/`
- **Backend PHP** : `/var/www/dp-fede-api/`
- **Config secrète** : `/etc/dp-fede/config.php`
- **DB** : MariaDB `dp_fede` / user `dp_fede_user@localhost`
- **nginx** : `/etc/nginx/sites-available/bullesenvalais` (bloc dp-fede en bas)
- **GitHub** : https://github.com/NicholasJallan/dp-fede
- **Google OAuth Client ID** : `813155202106-jlddu3nmfuq552p9673odcegrf5kuke7.apps.googleusercontent.com`
- **GCP Project** : `api-project-813155202106`

## Nginx après modification

```bash
ssh pi@bullesenvalais.ch "sudo nginx -t && sudo systemctl reload nginx"
```

### CSP — origines whitelistées dans `connect-src`

Toute nouvelle API externe appelée via `fetch()` doit être ajoutée à
`connect-src` dans `/etc/nginx/sites-available/bullesenvalais` du bloc
dp-fede. Sans ça, le navigateur émet « Failed to fetch » silencieusement.

État au 13/06/2026 (Sprint 4 sécurité durcie) :
- `'self'`
- `https://maps.googleapis.com`, `https://maps.gstatic.com` (Maps + Places)
- `https://api.open-meteo.com` (bouton « Précompléter depuis météo »)
- `https://www.googleapis.com` (Google Drive : list/create/upload files)
- `https://oauth2.googleapis.com`, `https://accounts.google.com`
  (token endpoints — OAuth Drive scope)
- `https://unpkg.com`, `https://cdnjs.cloudflare.com`,
  `https://fonts.googleapis.com`, `https://fonts.gstatic.com`
  (REQUIS pour le Service Worker qui fait du runtime-fetch sur ces CDN)

CSP report-uri configurée : violations envoyées à `/api/csp/report` →
log `/var/log/dp-fede-csp.log` (chown www-data:www-data, mode 640).
Vérifier régulièrement ce fichier pour identifier les nouvelles
violations.

Headers sécurité associés :
- `Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`
  (préinscription HSTS effective si soumise à hstspreload.org).
- `Permissions-Policy: camera=(), microphone=(), geolocation=(self), payment=(), usb=()`
  (geolocation `self` car le bouton météo l'utilise).
- `form-action 'self'` dans la CSP.

### CSP / nginx — Service Worker et mode offline

Pour le mode offline (PWA + SW) ajouter à la CSP du bloc dp-fede :
`worker-src 'self'; manifest-src 'self';`

Ajouter aussi les directives `location` pour `sw.js` (no-cache strict) et
`site.webmanifest` (no-cache). Voir `nginx-offline-snippet.conf` à la
racine du repo — à copier dans le bloc server après modification.

Avant chaque déploiement frontend, bumper **manuellement** la constante
`VERSION` dans `sw.js` (format `dp-{YYYYMMDD}-{sha7}`). Sans ce bump, le
navigateur considère que le SW n'a pas changé et conserve l'ancien cache.

## Tests métier

Lancer : `npm test` (utilise `node --test`, Node 20+ requis, zéro dépendance NPM).
Voir [TESTING.md](TESTING.md) pour le détail. Couverture actuelle : **174 tests**
(métier FFESSM/Code du Sport + offline : outbox, offline-store, sync, dive-lifecycle, home-buckets + contextualisation check-list par milieu).

## Données métier

Tout est dans `data.js` (aucun build requis) :
- `QUESTIONS` — sections du questionnaire (A, B, C, E, F, G), questions conditionnelles (`when`)
- `CHECKLIST_RULES` — 2 phases (préparation / sur site avant mise à l'eau), items conditionnels (`when`)
- `LEVELS` / `QUALIFICATIONS` — niveaux FFESSM et qualifs complémentaires
- `APTITUDE_MAP` — mapping niveau → aptitudes mandatory/optional
- `DP_DEPTH_RULES` — profondeurs max par niveau DP (exploration / formation)
- `getMilieuType(milieu)` — normalise 'En mer'/'Lac'/'Carrière'/'Piscine'/'Fosse' → 'mer'/'lac'/'piscine'/'fosse'
- `isMilieuNaturel(milieu)` — vrai en mer/lac/carrière, faux en piscine/fosse ; sert à masquer les questions et items de check-list sans objet en bassin (météo, marée, bouée)
- `getProfOptions(niveauEncadrant, activite, dp, site)` — liste des profondeurs disponibles ; si exploration=0 pour le DP (E1/E2), fallback sur formation
- `getDiverAptitudes(diver, isExploration, palContext)` — aptitudes disponibles pour un plongeur ; `palContext` (optionnel) apporte le bonus formation selon l'enseignant de la palanquée
- `getDpMaxDepth(palType, dp)` — profondeur max autorisée pour un DP selon le type ('formation'/'exploration') ; 0 = type interdit
- `getFormationBonusAptitudes(diver, maxEnsLevel)` — aptitudes PE bonus accordées en formation selon l'enseignant présent
- `aptitudeMaxDepth(aptitude)` — profondeur max (m) associée à une aptitude (Baptême=6, PE20=20, …)
- `sortMembresForFiche(membres)` — tri canonique des membres pour la fiche (encadrant → GP → … ; 2ᵉ GP en serre-file)
- `getPalType(membres)` — type de palanquée : 'bapteme'/'formation'/'guidee'/'exploration'
- `calcDTR(profMax)` — DTR sans déco : Math.ceil(profMax / 10)

## Règles de dérivation automatique (ne pas re-questionner l'utilisateur)

- **`answers.milieu`** : propagé depuis `selectedSite.milieu` dans `screen-profil.jsx` (useEffect sur `answers.site_id`). Ne pas afficher de question milieu en section A.
- **`answers.activite`** : dérivé dans `screen-palanquees.jsx` (useEffect sur `palanquees`) — 'Enseignement' si palanquée avec E1→E4, 'Exploration' sinon, 'Mixte' si les deux. Ne pas afficher de question activité en section A.
- **`isExploration`** dans `screen-palanquees.jsx` = `answers.dp_qual === 'N5'` (N5 ne peut faire qu'exploration). Ce n'est PAS dérivé de `answers.activite`.
- **`answers.depart_bord` / `answers.depart_bateau`** : propagés depuis `selectedSite` (même useEffect).
- **`answers.dp_qual` / `answers.dp_nom`** : propagés depuis le plongeur sélectionné comme DP (useEffect sur `answers.dp_id`).

## Layout

- `.main` dans `styles.css` n'a PAS de `max-width` ni `margin: auto` — il est pleine largeur comme la topbar et le stepper. Si on les rajoute, le contenu se décale visuellement vers la droite.

## Pièges connus

- `buildQualifs()` dans `backend/routes/divers.php` : utiliser `$recs` (variable locale filtrée) et NON `compact('recycleurs')` qui capturerait le paramètre de fonction (liste complète).
- `DIPLOMES_PRO` = `['BEES1','DEJEPS','DESJEPS','Autre']` — MF1/MF2 sont des brevets fédéraux, pas des diplômes professionnels d'État.
- `getMilieuType()` est case-insensitive (`.toLowerCase()`) pour gérer les valeurs sites ('Lac', 'Carrière') et les anciennes valeurs questions.
- `validatePal` vit dans `lib/pal-rules.js` (extrait de `screen-palanquees.jsx`). Toute modification doit être accompagnée d'un test dans `tests/pal-rules.test.js`.
- Plafond de profondeur d'une palanquée : `window.computePalHardLimit({...})` (UN seul endroit). Les 4 anciennes duplications ont été supprimées.
- Super-administrateur : email unique `nicholas.jallan@gmail.com` (constante `SUPER_ADMIN_EMAIL` côté front + `Auth::SUPER_ADMIN_EMAIL` côté back). Le rôle DB `admin` ne donne PAS accès aux endpoints `/api/users/*` — `Auth::requireSuperAdmin()` est requis.
- **Schéma DB** : entièrement décrit par `backend/lib/Db.php::migrate()`, appelé au 1er accès PDO. Source unique de vérité, idempotent (`CREATE TABLE IF NOT EXISTS` + `addColumnIfMissing`/`addIndexIfMissing`), sûr pour une base fraîche comme pour la base déjà déployée. Il n'y a **plus** de dossier `migrations/` ni de chaîne de migrations versionnées : l'historique vit dans git (projet bêta, déploiement unique).
- **Table `dives`** : cycle de vie `status ENUM('prepared','in_progress','archived')`. Colonnes : `planned_at`, `started_at`, `closed_at`, `render_state` (MEDIUMTEXT, JSON sérialisé), `deleted_at`.
- `dives.date_plongee` est un `DATETIME`. Le front envoie/reçoit du `YYYY-MM-DDTHH:mm` ; la conversion est dans `backend/routes/dives.php::parseDiveDateToMySql/normalizeDiveDate`.
- TTL session backend = **7 jours** (`Auth::TTL = 604800`), sliding refresh à 3,5 j restants. CSRF TTL alignée à 7 jours. Couvre les sessions terrain offline prolongées (Phase 1 offline).
- `divers` et `sites` font du **soft-delete** : `DELETE` met `deleted_at = NOW()`, la ligne reste pour propager la suppression aux clients via `GET /api/divers?since=`. La liste sans `?since=` exclut les soft-deletes. Champ `deleted: bool` dans la réponse. Même mécanique pour `dives`.
- `dives.client_uuid` : si le front envoie un `client_uuid` (UUID v4) et qu'une plongée existe déjà avec ce couple `(user_id, client_uuid)`, le POST renvoie 200 `{ id, duplicate: true }` au lieu de créer une 2ᵉ ligne. Permet à l'outbox de rejouer sans dupliquer.
- `POST /api/divers` et `POST /api/sites` acceptent un `id` optionnel (UUID v4 client) ; en cas de collision PK, ils font un UPSERT (`ON DUPLICATE KEY UPDATE`) et réactivent les soft-deletes (`deleted_at = NULL`).
- Mode offline : `lib/net.js` expose `window.useOnline()` (hook React) et `window.netStatus()`. Auth-context bascule en `authMode = 'offline'` si `/api/auth/me` échoue mais qu'un snapshot `dp-last-user` < 7 j existe. L'écran archive ne déclenche pas Drive hors-ligne et reprend automatiquement quand `online` repasse à true.
- Service Worker : `sw.js` à la racine, scope `/`. Avant déploiement frontend, bumper **manuellement** la constante `VERSION` dans `sw.js`. Les anciens caches sont purgés sèchement à l'activation du nouveau SW (pas de migration douce).
- `render_state` : colonne `MEDIUMTEXT` de `dives` contenant du JSON sérialisé `{ pressions, realises, heuresDebut, heuresFin, checked, comments }`. Synchronisé en continu via outbox (`dive.update`). Utilisé par `finalizePendingDrive` pour régénérer le PDF après reconnexion.
- **Plan de secours** : `sites.acces_secours` et `sites.caisson` (VARCHAR 500, créés via `Db::migrate`). Propagés dans `answers` par `screen-profil.jsx` (`site_acces_secours`, `site_caisson`, `site_coords`) et affichés dans le bloc « Conduite à tenir » de la fiche/PDF (`screen-fiche.jsx`, `screen-archive.jsx`). Bouton flottant « ☎ URGENCE » en mode `execute` (`app.jsx`).
- **Cycle de vie** : plongée créée à `status='prepared'` dès le clic "+ Nouvelle plongée". Transition → `in_progress` au 1er `heuresDebut` posé (détectée dans `app.jsx` via useEffect). Transition → `archived` à l'archivage Drive. PATCH refusé en rétrograde (`archived` → autre statut).
- **Auto-save** : debounce 500 ms vers `api.dives.update(currentDiveId, { answers, palanquees, render_state })`. Flush immédiat au retour accueil (`flushSave`) et lors de `loadDive` (bascule entre plongées).
- **`diveMode`** dans `app.jsx` : `'prepare'` (étapes 1-3) ou `'execute'` (étapes 3-5). Check-list filtre les phases selon `mode`.
- **Outbox kinds** : `dive.create`, `dive.update`, `dive.delete`, `dive.drive` (drive registered par ScreenArchive) ; `diver.create`, `diver.update`, `diver.delete` ; `site.create`, `site.update`, `site.delete`. Handlers dans `lib/sync.js` (`DEFAULT_HANDLERS`).
