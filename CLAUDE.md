# CLAUDE.md — DP Assistant

Outil d'aide au Directeur de Plongée (FFESSM / Code du Sport).
Frontend : React 18 + Babel CDN, zéro build. Backend : PHP 7.4 + MariaDB sur Raspberry Pi.

## Architecture

```
/var/www/html/dp-fede/       ← fichiers statiques (nginx)
  DP Assistant.html / index.html
  api.js, auth-context.jsx, app.jsx, screen-*.jsx
  components.jsx, data.js, styles.css

/var/www/dp-fede-api/        ← backend PHP (nginx → PHP-FPM)
  index.php, lib/, routes/, migrations/

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

## Données métier

Tout est dans `data.js` (aucun build requis) :
- `QUESTIONS` — 8 sections A→H, questions conditionnelles
- `CHECKLIST_RULES` — 5 phases, items conditionnels
- `LEVELS` / `QUALIFICATIONS` — niveaux FFESSM et qualifs complémentaires
- `APTITUDE_MAP` — mapping niveau → aptitudes mandatory/optional
- `DP_DEPTH_RULES` — profondeurs max par niveau DP (exploration / formation)
- `getMilieuType(milieu)` — normalise 'En mer'/'Lac'/'Carrière'/'Piscine'/'Fosse' → 'mer'/'lac'/'piscine'/'fosse'
- `getProfOptions(dpQual, activite)` — liste des profondeurs disponibles ; si exploration=0 pour le DP (E1/E2), fallback sur formation
- `getDiverAptitudes(diver, isExploration)` — aptitudes disponibles pour un plongeur selon isExploration
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
