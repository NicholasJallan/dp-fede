# Plan de remédiation — Code review du 2026-06-13

> Plan d'action issu d'une revue générale (sécurité, dette technique, choix
> architecturaux). Chaque étape est auto-contenue : on peut lancer une session
> Claude Sonnet sur n'importe quel item sans relire le reste.
>
> **Format de chaque tâche** :
> - **Pourquoi** : motivation et risque actuel
> - **Fichiers** : où intervenir
> - **Quoi faire** : actions concrètes
> - **Critères d'acceptation** : ce qui prouve que c'est fini
> - **Tests** : commandes à lancer
>
> Prompt-type pour Sonnet :
> > « Ouvre `docs/CODE_REVIEW_PLAN.md` et exécute la tâche **<ID>**. Lis-la en
> > entier, propose un plan, attends mon OK, puis implémente + tests. »

---

## Vue d'ensemble — ordre d'attaque

| Phase | Tâches | Durée estimée |
|-------|--------|---------------|
| Phase 0 — Hotfix sécu | C1.1 | 1 h |
| Phase 1 — Quick wins | M3, M4, M6, L1–L4 | 1 jour |
| Phase 2 — Backend durci | H5, H6, M7, M11 | 2–3 jours |
| Phase 3 — Refondre le front | H1, H2 | 1 semaine |
| Phase 4 — Sécurité légale | C1.2, M2 | 1 semaine |
| Phase 5 — Long terme | C2, H3, H4, H7 | 2 semaines |

---

# Phase 0 — Hotfix sécurité (priorité absolue)

## C1.1 — Neutraliser le LFI/SSRF dans la génération PDF

**Pourquoi** : tout compte authentifié (rôle `user`) peut POSTer du HTML
arbitraire à `/api/pdf/fiche`. Le serveur passe ce HTML à
`wkhtmltopdf --enable-local-file-access`. Conséquences :
- exfiltration de `/etc/dp-fede/config.php` (mot de passe DB, SMTP) via
  `<iframe src="file:///etc/dp-fede/config.php">`,
- SSRF interne au réseau du Pi via `<img src="http://192.168.x.x/admin">`,
- exécution potentielle de JS embarqué dans wkhtmltopdf (Qt WebKit 538).

**PoC** (à reproduire pour vérifier le fix) :
```js
fetch('/api/pdf/fiche', {
  method: 'POST', credentials: 'include',
  headers: { 'Content-Type':'application/json', 'X-CSRF-Token': window.getCsrfToken() },
  body: JSON.stringify({ html: '<iframe src="file:///etc/passwd" width=900 height=1200></iframe>' })
}).then(r => r.blob()).then(b => window.open(URL.createObjectURL(b)));
```

**Fichiers** :
- `backend/routes/pdf.php`

**Quoi faire** :
1. Supprimer `--enable-local-file-access`.
2. Ajouter `--disable-local-file-access` explicite (defense in depth).
3. Ajouter `--disable-javascript` (Qt WebKit 538 est non patché).
4. Ajouter `--no-stop-slow-scripts --javascript-delay 0`.
5. Strip côté serveur des balises dangereuses avant écriture sur disque :
   `<iframe>`, `<object>`, `<embed>`, `<link rel="import">`, et tout attribut
   `src=`/`href=` commençant par `file:`, `gopher:`, `dict:`, `ftp:`, `jar:`,
   `data:` (sauf `data:image/...` pour les images inline légitimes).
6. Fixer le leak `tempnam` : `tempnam` crée déjà un fichier ; le `.html`
   ajouté laisse un fichier orphelin. Utiliser :
   ```php
   $tmpHtml = tempnam(sys_get_temp_dir(), 'fiche_');
   rename($tmpHtml, $tmpHtml . '.html');
   $tmpHtml .= '.html';
   ```
   (idem pour `$tmpPdf`).

**Critères d'acceptation** :
- Le PoC ci-dessus produit un PDF **vide** ou avec une iframe vide (pas le
  contenu du fichier).
- `<script>alert(1)</script>` dans le HTML produit un PDF sans alerte ni
  rendu de script.
- `/tmp` ne contient plus de fichiers `fiche_XXX` orphelins (sans extension)
  après plusieurs requêtes (`ls /tmp/fiche_* | grep -v '\.html\|\.pdf'`
  doit être vide).
- Le PDF normal (rendu depuis `screen-archive.jsx` et `screen-fiche.jsx`)
  s'affiche toujours correctement.

**Tests** :
```bash
cd backend && composer test       # tests PHP existants
npm test                           # tests Node existants
# Manuel : générer une fiche, vérifier visuellement le PDF
```

**Note** : ce hotfix ne résout pas le problème de fond (le serveur accepte
du HTML arbitraire). Le fix complet est C1.2 en phase 4.

---

# Phase 1 — Quick wins (1 jour)

## M3 — Auto-bump de la version du Service Worker au déploiement

**Pourquoi** : `sw.js` contient `const VERSION = 'dp-YYYYMMDD-...'` que tu
dois bumper à la main avant chaque déploiement frontend. Oublier = les
utilisateurs restent collés à l'ancien cache.

**Fichiers** :
- `sw.js`
- `pi-scripts/` (où vivent tes scripts de déploiement) ou nouveau script `deploy.sh`

**Quoi faire** :
1. Créer `pi-scripts/deploy-frontend.sh` qui :
   - calcule `SHA=$(git rev-parse --short HEAD)`, `DATE=$(date +%Y%m%d)`
   - patche `sw.js` localement (copie temp) : `sed "s/^const VERSION = .*/const VERSION = 'dp-${DATE}-${SHA}';/"`
   - lance le rsync existant en utilisant la copie patchée
2. OU : pre-commit hook qui bump `VERSION` quand `sw.js` ou n'importe
   quel fichier précaché est touché. Moins fiable (commit ≠ déploiement),
   préférer (1).
3. Documenter dans CLAUDE.md : « le bump VERSION est automatique, ne plus
   modifier `VERSION` à la main ».

**Critères d'acceptation** :
- Modifier un fichier précaché + lancer `deploy-frontend.sh` met à jour
  `VERSION` dans le `sw.js` déployé.
- L'ancienne version reste dans git (le script ne commit pas le bump).

**Tests** :
```bash
# Dry-run du script de déploiement
bash pi-scripts/deploy-frontend.sh --dry-run
grep VERSION sw.js   # avant : version 'manuelle'
# après déploiement : version 'dp-AAAAMMJJ-{sha7}'
```

---

## M4 — Sortir les scripts inline pour supprimer `'unsafe-inline'` de CSP

**Pourquoi** : `nginx-offline-snippet.conf` autorise
`script-src 'self' 'unsafe-inline'`. Tu le sais
(docs/security/README.md : « nonce sera Sprint 5+ »). C'est la principale
faiblesse de la CSP — un XSS reflété quelque part te coûterait le DOM entier.

**Fichiers** :
- `DP Assistant.html`
- nouveau fichier : `inline-boot.js`
- `sw.js` (ajouter `inline-boot.js` au precache)
- `nginx-offline-snippet.conf`

**Quoi faire** :
1. Identifier les 3 inline scripts dans `DP Assistant.html` :
   - le timer fallback de chargement (12 s),
   - la déclaration `window.GOOGLE_CLIENT_ID`,
   - le callback `window.__gmapsReady`,
   - l'enregistrement du Service Worker (bas de page).
2. Tous les déplacer dans `inline-boot.js`, chargé en `<script src="inline-boot.js">`.
3. Garder l'ordre : `inline-boot.js` doit être chargé AVANT GIS / Maps pour
   que les callbacks soient définis.
4. Retirer `'unsafe-inline'` de `script-src` dans `nginx-offline-snippet.conf`.
5. Ajouter `inline-boot.js` dans `PRECACHE_URLS` de `sw.js`.

**Critères d'acceptation** :
- Aucun `<script>` inline dans `DP Assistant.html` (que des `<script src=...>`
  et `<script type="text/babel" src=...>`).
- La nouvelle CSP `script-src 'self' https://accounts.google.com https://maps.googleapis.com https://maps.gstatic.com https://unpkg.com https://cdnjs.cloudflare.com` ne bloque rien.
- L'app boot normalement, Maps charge, le fallback à 12 s fonctionne (test :
  bloquer un script dans devtools → message s'affiche).

**Tests** :
```bash
# Vérifier la nouvelle CSP en dev (console navigateur — 0 violation)
# Vérifier le SW : DevTools → Application → Service Workers
# Vérifier que /api/csp/report ne reçoit plus rien après déploiement
```

---

## M6 — Validation date stricte

**Pourquoi** : `Validate::date` regex `/^\d{4}-\d{2}-\d{2}$/` accepte
`9999-99-99`. Le check date est insuffisant.

**Fichiers** :
- `backend/lib/Validate.php`
- `backend/tests-php/` (nouveau test)

**Quoi faire** :
1. Remplacer la regex par `DateTimeImmutable::createFromFormat('Y-m-d', $v)`
   + check `$dt && $dt->format('Y-m-d') === $v` (anti-overflow type
   `2026-02-31` qui devient `2026-03-03`).
2. Garder la signature de la méthode (chaînable).
3. Ajouter `backend/tests-php/ValidateTest.php` couvrant : date valide,
   date format invalide, date avec mois 13, date avec jour 32, date vide
   (ne doit pas échouer car c'est `required()` qui s'en occupe).

**Critères d'acceptation** :
- `9999-99-99` est rejeté.
- `2026-02-31` est rejeté (overflow détecté).
- `2026-02-28` passe.
- Test PHPUnit vert.

**Tests** :
```bash
cd backend && composer test
```

---

## L1–L4 — Lot de petits fix

**Pourquoi** : petits points relevés en revue qui peuvent partir dans le
même commit que M6.

**Fichiers / Quoi faire** :

**L1** — `backend/lib/Smtp.php:43` : `$line[3]` crashe si ligne < 4 caractères.
Remplacer par `if (strlen($line) >= 4 && $line[3] === ' ') break;`.

**L2** — `screen-archive.jsx:870` : `setTimeout(resolve, 50)` fragile. Remplacer
par `requestAnimationFrame(() => requestAnimationFrame(resolve))` ou
`flushSync` (React 18). Plus déterministe pour laisser React peindre.

**L3** — Ajouter `.editorconfig` à la racine :
```ini
root = true
[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
[*.php]
indent_size = 4
[*.md]
trim_trailing_whitespace = false
```

**L4** — `backend/routes/divers.php:124` : après UPSERT avec
`deleted_at=NULL`, on garde l'ancien `created_at`. Documenter ce choix
dans un commentaire « réactivation = même ressource logique, on garde
created_at » OU réinitialiser `created_at=NOW()` si c'est un cas vraiment
nouveau. Demander à l'utilisateur lequel des deux est la sémantique attendue.

**Critères d'acceptation** :
- L1 : un test avec ligne SMTP courte ne crashe pas (cas dur à tester unitairement, OK pour relecture seulement).
- L2 : la génération PDF reste fonctionnelle, pas de race condition observable.
- L3 : `.editorconfig` présent, VS Code/IntelliJ respectent indent 2/4.
- L4 : commentaire OU comportement aligné avec ta décision.

---

# Phase 2 — Backend durci (2–3 jours)

## H5 — Rate-limit persistant (sortir d'APCu)

**Pourquoi** : `apcu_store` perd toute mémoire au reload PHP-FPM. Un
attaquant peut spammer pile dans la fenêtre d'un reload, ou attendre un
logrotate qui touche PHP-FPM. Si tu scales un jour (plusieurs workers),
chaque worker a son propre compteur.

**Fichiers** :
- `backend/index.php` (la fonction `rateLimitOrAbort`)
- `backend/lib/RateLimit.php` (nouveau)
- `backend/lib/Db.php` (ajouter une table `rate_limits` dans `migrate()`)

**Quoi faire** :
1. Nouvelle table dans `Db::migrate()` :
   ```sql
   CREATE TABLE IF NOT EXISTS rate_limits (
       bucket    VARCHAR(64) NOT NULL,
       ident     VARCHAR(64) NOT NULL,  -- IP ou user_id
       count     INT UNSIGNED NOT NULL DEFAULT 0,
       window_start DATETIME NOT NULL,
       PRIMARY KEY (bucket, ident)
   ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
   ```
2. Nouveau `backend/lib/RateLimit.php` avec API identique à l'actuelle :
   `RateLimit::hitOrAbort(string $bucket, int $max, int $windowSec, string $errMsg, ?string $ident = null): void`
3. Implémentation atomique :
   ```php
   $now = time();
   $windowStart = date('Y-m-d H:i:s', $now - $windowSec);
   // Reset si fenêtre dépassée
   Db::q("DELETE FROM rate_limits WHERE bucket=? AND ident=? AND window_start < ?",
         [$bucket, $ident, $windowStart]);
   Db::q("INSERT INTO rate_limits (bucket, ident, count, window_start) VALUES (?,?,1,NOW())
          ON DUPLICATE KEY UPDATE count=count+1", [$bucket, $ident]);
   $n = Db::row("SELECT count FROM rate_limits WHERE bucket=? AND ident=?",
                [$bucket, $ident])['count'];
   if ($n > $max) Json::abort(429, $errMsg);
   ```
4. Garbage collection : ajouter un appel `RateLimit::purge()` qui supprime
   les lignes avec `window_start < NOW() - INTERVAL 1 HOUR`. À déclencher
   au plus 1 fois par 100 requêtes (pseudo-random).
5. Garder le wrapper APCu en fallback si la table n'existe pas encore
   (pour zéro-downtime au premier déploiement).
6. Ajouter `backend/tests-php/RateLimitTest.php`.

**Critères d'acceptation** :
- Reload `php-fpm` ne réinitialise plus le compteur.
- 11 essais de login depuis la même IP en 15 min → le 11ᵉ est bloqué.
- `EXPLAIN` sur la requête SELECT utilise bien la PK (vérifié sur MariaDB Pi).

**Tests** :
```bash
cd backend && composer test
# Test fonctionnel : ab -n 200 -c 1 https://dp-fede.bullesenvalais.ch/api/dives
# (attention : nécessite un cookie de session)
```

---

## H6 — Décider du sort de `backend/lib/Smtp.php`

**Pourquoi** : tu as un client SMTP fait-maison avec STARTTLS, mais aucun
appel `Smtp::send()` dans les routes (à vérifier). Soit c'est du code mort,
soit c'est utilisé via un chemin non grep-friendly.

**Fichiers** :
- `backend/lib/Smtp.php`
- `backend/routes/*.php` (à grep)

**Quoi faire** :
1. `grep -rn "Smtp::\|new Smtp\|smtp(" backend/` → identifier tous les
   call-sites.
2. Si **0 call-site** : supprimer `Smtp.php` + sa référence dans
   `backend/index.php` (la ligne `foreach (['Config','Json',...'Smtp',...]...)`).
   Supprimer aussi la config `smtp` dans `config.example.php`.
3. Si **≥ 1 call-site** : remplacer par `symfony/mailer` (zero transitive deps
   importants). Composer en dev OU vendoré à la main si tu veux éviter
   composer en prod.
4. Mettre à jour `docs/security/composer-audit.md` selon le choix.

**Critères d'acceptation** :
- Soit `Smtp.php` n'existe plus, soit l'envoi de mail passe par une lib
  testée.
- Aucune régression sur les flows qui utilisent l'email (vérifier le sujet
  avec l'utilisateur si pas grep-able).

**Tests** :
```bash
grep -rn "Smtp" backend/ --include="*.php"
cd backend && composer test
```

---

## M7 — Logging structuré côté backend

**Pourquoi** : aucune trace des actions métier. Pour un outil qui produit
des fiches de sécurité (dimension légale), savoir qui a archivé quoi et
quand est important en cas d'audit / contestation.

**Fichiers** :
- nouveau : `backend/lib/Log.php`
- `backend/routes/dives.php` (call-sites)
- `backend/routes/divers.php`
- `backend/routes/sites.php`
- `backend/routes/auth.php`
- `backend/routes/users.php`

**Quoi faire** :
1. `backend/lib/Log.php` :
   ```php
   class Log {
     public static function action(string $kind, ?array $context = null): void {
       $entry = [
         'ts' => date('c'),
         'kind' => $kind,
         'user_id' => $_SESSION_USER_ID ?? null, // ou récup via Auth::current()
         'ip' => $_SERVER['REMOTE_ADDR'] ?? '',
         'path' => $_SERVER['REQUEST_URI'] ?? '',
         'context' => $context,
       ];
       $line = json_encode($entry, JSON_UNESCAPED_UNICODE) . "\n";
       @file_put_contents('/var/log/dp-fede.log', $line, FILE_APPEND | LOCK_EX);
     }
   }
   ```
2. Instrumenter les actions critiques :
   - `dive.created`, `dive.archived`, `dive.deleted`
   - `diver.deleted`, `site.deleted`
   - `auth.login`, `auth.logout`, `auth.refused` (Google token invalide)
   - `user.role_changed`, `user.deleted` (super-admin actions)
3. Créer le fichier sur le Pi avec les bonnes perms :
   `sudo touch /var/log/dp-fede.log && sudo chown www-data:www-data /var/log/dp-fede.log && sudo chmod 640 /var/log/dp-fede.log`
4. Ajouter au logrotate Pi (`/etc/logrotate.d/dp-fede`) :
   ```
   /var/log/dp-fede.log {
       weekly
       rotate 12
       compress
       missingok
       notifempty
   }
   ```

**Critères d'acceptation** :
- Une archive génère une ligne JSON dans `/var/log/dp-fede.log`.
- `logrotate -d /etc/logrotate.d/dp-fede` ne renvoie pas d'erreur.
- Aucune fuite de PII inutile (ne pas logger les `answers`/`palanquees`
  entiers, juste `dive_id`, `site_nom`, `nb_palanquees`).

**Tests** :
```bash
ssh pi@bullesenvalais.ch "tail -f /var/log/dp-fede.log"
# Reproduire des actions, vérifier les lignes
```

---

## M11 — Remplacer la vérif JWT fait-maison par `firebase/php-jwt`

**Pourquoi** : `Auth::jwkToPem` construit un PEM à partir d'un JWK en
montant l'ASN.1 à la main. C'est de la crypto. Il manque des tests négatifs
(JWK malformé, exponent géant, kid inconnu). Risque de CVE silencieuse non
nul.

**Fichiers** :
- `backend/composer.json`
- `backend/lib/Auth.php`
- Pi : `/var/www/dp-fede-api/vendor/`

**Quoi faire** :
1. Ajouter `firebase/php-jwt` en dependency PROD (déplacer de
   `require-dev` → `require`).
2. `composer require firebase/php-jwt` localement.
3. Remplacer `Auth::verifyJwtLocal` par :
   ```php
   use Firebase\JWT\JWT;
   use Firebase\JWT\JWK;
   $jwks = self::fetchJwks();  // garder le cache APCu
   $keys = JWK::parseKeySet($jwks);
   $payload = (array) JWT::decode($idToken, $keys);
   ```
4. Garder le fallback `verifyViaTokeninfo` (réseau) si JWKS échoue.
5. Garder la revalidation `aud`/`iss`/`exp` côté serveur.
6. Supprimer `jwkToPem`, `asn1Integer`, `asn1Sequence`, `asn1TLV`,
   `b64UrlDecode`.
7. Déployer `vendor/` sur le Pi via rsync.
8. Mettre à jour `docs/security/composer-audit.md` (Composer arrive en prod).

**Critères d'acceptation** :
- Login Google fonctionne toujours.
- Les tests `AuthTest` passent (adapter si besoin).
- `composer audit` ne renvoie pas de vulnérabilité critique.

**Tests** :
```bash
cd backend && composer install --no-dev && composer audit
cd backend && composer test
# Manuel : login Google end-to-end
```

---

# Phase 3 — Refondre le frontend (1 semaine)

## H1 — Sortir Babel CDN + React dev, passer à esbuild

**Pourquoi** :
- `@babel/standalone` ~3 MB gzippé bloque le first paint 1–3 s sur mobile.
- `react.development.js` ≠ `react.production.min.js` (≈ 5× la taille).
- Le SW pré-cache 20+ fichiers JSX que le navigateur ne peut consommer
  **qu'après** que Babel se soit compilé en runtime → cache miss "utile" raté.
- Gain mesuré attendu : LCP ÷ 3 sur mobile, bundle ÷ 10.

**Fichiers** :
- `package.json` (ajout esbuild)
- nouveau : `build.sh` ou `package.json` script
- `DP Assistant.html`
- `sw.js` (precache list)
- `pi-scripts/deploy-frontend.sh`

**Quoi faire** :
1. `npm install --save-dev esbuild` (zéro config, ≈ 50 ms par build).
2. Créer `build.sh` :
   ```bash
   #!/bin/bash
   set -e
   mkdir -p dist
   npx esbuild app.jsx \
     --bundle \
     --minify \
     --sourcemap \
     --target=es2020 \
     --loader:.jsx=jsx \
     --loader:.js=jsx \
     --outfile=dist/app.js \
     --define:process.env.NODE_ENV='"production"'
   cp 'DP Assistant.html' dist/index.html
   sed -i 's|<script type="text/babel" src=".*"></script>||g' dist/index.html
   # Ajouter <script src="app.js"></script> avant </body>
   cp styles.css sw.js api.js *.png favicon.ico site.webmanifest dist/
   cp -r lib dist/
   ```
3. Adapter `DP Assistant.html` :
   - retirer toutes les balises `<script type="text/babel" src="...">`,
   - retirer Babel CDN,
   - retirer React/ReactDOM CDN,
   - laisser un seul `<script src="app.js" defer></script>` qui contient
     tout bundlé,
   - garder Google Identity Services, Google Maps (toujours via CDN externe).
4. Adapter `sw.js` :
   - `PRECACHE_URLS` ne liste que `index.html`, `app.js`, `styles.css`, les
     icônes, et `lib/` si nécessaire (mais en réalité tout sera dans `app.js`).
5. Adapter `pi-scripts/deploy-frontend.sh` pour rsync `dist/` au lieu de
   la racine.
6. Mettre à jour `README.md` et `CLAUDE.md` (section déploiement).

**Critères d'acceptation** :
- Bundle `dist/app.js` < 250 KB gzippé.
- Lighthouse mobile : LCP < 2.5 s sur 3G simulé (cible Web Vitals).
- L'app boot, tous les écrans fonctionnent.
- Le SW met bien à jour avec la nouvelle structure.
- `npm test` passe.

**Tests** :
```bash
bash build.sh
ls -la dist/  # vérifier les sorties
# Servir dist/ localement et tester (cf. tâche L5 ci-après pour le serveur dev)
npm run test:e2e   # Playwright contre le bundle
```

**Note** : préserver `script type="text/babel"` dans `DP Assistant.html`
source en dev si tu veux garder l'option "zero build" pour les hot-fixes
en urgence. Le `build.sh` génère `dist/index.html` propre.

---

## H2 — Ajouter TypeScript (au moins JSDoc + `// @ts-check`)

**Pourquoi** : les structures `answers`, `palanquees[].membres[]`,
`archive.render_state` sont des bags `any`. Les transformations (legacy →
new format, `_render` → `render_state`) ne sont jamais vérifiées au build.
TS attrape 80 % de ces bugs gratos.

**Option A — JSDoc + `// @ts-check` (4 h)** : zéro changement de fichier,
juste annoter les structures clés.

**Option B — Vraie migration TS (3–5 j)** : `.jsx` → `.tsx`, `tsconfig.json`,
esbuild compile direct. Réservé après H1.

**Recommandation** : commencer par A immédiatement, B après H1.

### H2.A — JSDoc minimal

**Fichiers** :
- `data.js`
- `lib/pal-rules.js`
- `lib/sync.js`

**Quoi faire** :
1. Ajouter en haut de chaque fichier :
   ```js
   // @ts-check
   /**
    * @typedef {Object} Diver
    * @property {string} id
    * @property {string} nom
    * @property {string} prenom
    * @property {('N1'|'N2'|'N3'|null)} niveau_plongeur
    * @property {('N4'|'N5'|'E1'|'E2'|'E3'|'E4'|null)} niveau_encadrant
    * @property {string[]} aptitudes_sup
    * @property {string} medical
    * ...
    */
   /**
    * @typedef {Object} Palanquee
    * ...
    */
   ```
2. Annoter les fonctions exportées : `@param`, `@returns`.
3. Lancer `npx tsc --allowJs --checkJs --noEmit data.js lib/*.js` pour voir
   les erreurs.

**Critères d'acceptation** :
- `tsc --noEmit` est vert.
- Les types capturent au moins : `Diver`, `Site`, `Palanquee`, `Dive`,
  `Answers`, `RenderState`.

### H2.B — Migration TS complète

À spécifier après H1 (esbuild en place). Faire un sous-document
`docs/MIGRATION_TS.md` à ce moment.

---

# Phase 4 — Sécurité légale (1 semaine)

## C1.2 — Rendre le PDF côté serveur depuis les données métier

**Pourquoi** : phase 0 (C1.1) bloque le LFI mais le serveur accepte toujours
du HTML arbitraire. Solution propre : le client envoie le `dive_id`, le
serveur fait le rendu à partir de la DB. Bénéfices :
- LFI impossible par construction (HTML 100 % maîtrisé),
- on peut virer html2canvas et jsPDF du frontend (gain bundle),
- on peut virer la duplication de templates React/HTML,
- la fiche archivée est régénérable identiquement à n'importe quel moment.

**Fichiers** :
- nouveau : `backend/lib/PdfRender.php`
- nouveau : `backend/templates/fiche.php`, `backend/templates/checklist.php`
- `backend/routes/pdf.php`
- `screen-archive.jsx`, `screen-fiche.jsx` (côté client)

**Quoi faire** :
1. Définir le contrat serveur :
   ```
   POST /api/pdf/fiche
   Body : { dive_id: "uuid", type: "fiche" | "checklist" }
   Réponse : application/pdf
   ```
2. Côté serveur, charger `dives` + `divers` (annuaire) + `user`, puis
   rendre via un template PHP figé (`backend/templates/fiche.php`) qui
   reproduit la fiche actuelle.
3. Récrire la fiche en HTML "statique CSS" — pas de React. Utiliser des
   `<?= htmlspecialchars($answer['site_nom']) ?>` partout.
4. Côté client, remplacer les `fetch('/api/pdf/fiche', { html, filename })`
   par `fetch('/api/pdf/fiche', { dive_id, type })`. Plus de génération
   offscreen, plus de `outerHTML`.
5. Migration progressive : garder l'ancien endpoint en deprecated pendant
   1 release, logger les accès pour s'assurer que rien ne l'utilise plus.

**Critères d'acceptation** :
- Le PDF généré côté serveur est visuellement identique à l'ancien (pixel
  diff acceptable pour les fontes).
- L'endpoint refuse les `dive_id` qui n'appartiennent pas à l'utilisateur
  (test : POST avec un dive_id volé → 404).
- Plus aucun `outerHTML` ni `html2canvas` dans le bundle frontend.
- L'archive Drive contient toujours le bon PDF.

**Tests** :
```bash
cd backend && composer test
npm test
npm run test:e2e
```

---

## M2 — Validation des règles métier côté backend

**Pourquoi** : `validatePal`, `computePalHardLimit`, profondeurs max sont
**uniquement côté client**. Un utilisateur peut POSTer une plongée non
conforme au Code du Sport. En cas de litige, la défense « le navigateur a
validé » n'est pas opposable.

**Fichiers** :
- nouveau : `backend/lib/Rules.php`
- nouveau : `backend/tests-php/RulesTest.php`
- `backend/routes/dives.php` (PATCH / POST)
- `lib/pal-rules.js`, `data.js` (source à porter)

**Quoi faire** :
1. Porter en PHP :
   - `getDpMaxDepth(palType, dp)`
   - `computePalHardLimit(...)`
   - `validatePal(palanquee, ...)`
   - `getDiverAptitudes(...)`
2. Au POST/PATCH `/api/dives`, si `palanquees` est fourni, valider et
   renvoyer 422 si une palanquée viole les règles dures (encadrant requis
   manquant, profondeur dépassée, etc.).
3. Distinguer **règles dures** (refusées) des **règles douces** (warnings :
   N4 sans RIFAP par exemple). Les douces remontent en liste de warnings
   dans la réponse sans bloquer.
4. Tests PHP qui reproduisent les tests Node existants (`tests/pal-rules.test.js`).
5. **Stratégie de parité** : les deux implémentations doivent rester
   alignées. Soit on a une suite de tests partagée (formats JSON inputs +
   outputs attendus), soit on génère le PHP depuis le JS via un script.
   La 1ʳᵉ est plus simple.

**Critères d'acceptation** :
- POST d'une palanquée illégale → 422 avec message clair.
- POST d'une palanquée légale → 200, persistée.
- Suite de fixtures JSON identiques utilisée par les tests Node et PHP.
- Aucune régression UX (le frontend continue de valider en plus, pour le
  feedback temps réel).

**Tests** :
```bash
cd backend && composer test
npm test
```

---

# Phase 5 — Long terme (2 semaines)

## C2 — Sortir wkhtmltopdf

**Pourquoi** : archivé depuis 2022, Qt WebKit 538 non patché. Quand une
CVE remonte (ça finira par arriver), tu n'auras aucun upstream pour la fix.

**Options** :

**Option 1 — Chromium headless** :
- Pros : rendu moderne, CSS récent, Web Fonts.
- Cons : ~200 MB d'installation sur le Pi (RAM tight), surface d'attaque
  plus large.
- Lib PHP : `spatie/browsershot` (depend de Puppeteer ou Chrome direct).

**Option 2 — mPDF ou Dompdf (PHP pur)** :
- Pros : pas de process externe, pas de sandbox à gérer.
- Cons : rendu plus limité (CSS 2.1 + un peu de CSS3), pas de flexbox/grid
  moderne. Mais ta fiche actuelle utilise déjà `<table>` à cause de
  wkhtmltopdf 0.12.6 — la migration mPDF serait quasi-gratuite.

**Recommandation** : commencer par **mPDF**. Le rendu actuel est déjà
sous-CSS2 → migration douce.

**Fichiers** :
- `backend/composer.json` (ajout mpdf/mpdf)
- `backend/routes/pdf.php`
- `backend/lib/PdfRender.php` (si fait en C1.2)

**Quoi faire** :
1. `composer require mpdf/mpdf` (poids : ~5 MB vendor).
2. Remplacer le shell-out wkhtmltopdf par :
   ```php
   $mpdf = new \Mpdf\Mpdf(['format'=>'A4','margin_top'=>12,'margin_bottom'=>12]);
   $mpdf->WriteHTML($html);
   $pdf = $mpdf->Output('', 'S');
   ```
3. Adapter le CSS de la fiche si besoin (mPDF a son propre subset).
4. Désinstaller wkhtmltopdf du Pi : `sudo apt purge wkhtmltopdf`.

**Critères d'acceptation** :
- Le PDF est visuellement proche (légères différences typo acceptables).
- Plus aucun shell-out / process externe.
- `composer audit` clean.

---

## H3 — Migrations versionnées

**Pourquoi** : `Db::migrate()` est idempotent (bien), mais sans historique.
Pas de rollback. Pas de seed reproductible pour test/staging. Quand une 2ᵉ
instance arrive, on ne sait pas la migrer (renames, enum changes, backfills).

**Fichiers** :
- nouveau : `backend/migrations/000_initial.sql`, `001_dives_lifecycle.sql`, ...
- `backend/lib/Db.php`
- nouveau : `backend/lib/Migrator.php`
- `backend/composer.json` (scripts)

**Quoi faire** :
1. Créer `migrations/NNN_description.sql` avec UP only (pas de rollback —
   c'est ok pour ta volumétrie).
2. Table `schema_migrations(version VARCHAR(10) PK, applied_at DATETIME)`.
3. `Migrator::run()` lit `migrations/`, applique celles non présentes
   dans la table, dans l'ordre lexicographique.
4. Faire le snapshot initial : `000_initial.sql` = le contenu actuel de
   `Db::migrate()`.
5. `Db::migrate()` devient un appel à `Migrator::run()`.
6. Script CLI `php backend/migrate.php` pour appliquer hors HTTP.

**Critères d'acceptation** :
- Nouvelle instance : appliquer migrations 000 → N donne le schéma
  attendu.
- Instance existante : 000 est marquée appliquée d'office (heuristique :
  si toutes les tables principales existent déjà, on marque 000 comme
  appliquée silencieusement).
- Tests PHPUnit existants passent.

---

## H4 — Séparer `render_state` dans une table dédiée

**Pourquoi** : autosave 500 ms écrit ~5–20 KB dans `dives.render_state`,
ce qui touche `dives.updated_at` (ton cursor de sync), invalide
`idx_dives_user_status` et fait du page-split InnoDB.

**Fichiers** :
- `backend/lib/Db.php` (migration ou ajout)
- `backend/routes/dives.php`
- `lib/use-auto-save.jsx` ou `lib/sync.js` (debounce élargi sur ce champ)

**Quoi faire** :
1. Nouvelle table :
   ```sql
   CREATE TABLE dive_runtime_state (
       dive_id      VARCHAR(36) PRIMARY KEY,
       state        MEDIUMTEXT NOT NULL,
       updated_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
       FOREIGN KEY (dive_id) REFERENCES dives(id) ON DELETE CASCADE
   );
   ```
2. Migrer les données : `INSERT INTO dive_runtime_state SELECT id, render_state, NOW() FROM dives WHERE render_state IS NOT NULL;`
3. Supprimer la colonne `dives.render_state` (ou la laisser nullable
   pendant 1 release).
4. Adapter PATCH `/api/dives/:id` : route les writes sur `render_state`
   vers `dive_runtime_state`, sans toucher `dives.updated_at`.
5. Adapter GET `/api/dives/:id` : LEFT JOIN sur `dive_runtime_state`.
6. Élargir le debounce frontend à 2–5 s pour ce champ (l'utilisateur perd
   au pire 5 s en cas de crash navigateur).

**Critères d'acceptation** :
- Autosave toujours fonctionnel.
- `dives.updated_at` ne bouge plus quand seul `render_state` change → le
  cursor de sync ne pull pas les `dives` à chaque pression de touche.
- Test : 100 autosaves consécutifs n'augmentent pas le `dives.updated_at`.

---

## H7 — Héberger les CDN scripts en local

**Pourquoi** : la CSP autorise `unpkg.com` et `cdnjs.cloudflare.com`. Une
compromission de ces CDN = compromission de ta page. Tu peux les rapatrier
pour 0 risque et meilleure perf (cache HTTP maîtrisé).

**Fichiers** :
- nouveau : `vendor/jspdf.umd.min.js`, `vendor/html2canvas.min.js`, etc.
- `DP Assistant.html`
- `nginx-offline-snippet.conf` (CSP)
- `sw.js` (precache)

**Quoi faire** :
1. Télécharger les versions pinned :
   ```bash
   mkdir -p vendor
   curl -o vendor/jspdf.umd.min.js https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js
   curl -o vendor/html2canvas.min.js https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js
   # Si H1 pas encore fait, idem pour React / Babel
   ```
2. Calculer le SRI hash pour vérifier qu'on a le même fichier.
3. Remplacer dans `DP Assistant.html` : `<script src="/vendor/jspdf.umd.min.js">`.
4. Retirer `https://unpkg.com` et `https://cdnjs.cloudflare.com` de
   `script-src` et `connect-src` (ce dernier si le SW ne fetch plus du CDN).
5. Ajouter au precache SW.
6. Note : si C1.2 a viré jsPDF/html2canvas, sauter cette tâche en partie.

**Critères d'acceptation** :
- CSP ne contient plus `unpkg.com` ni `cdnjs.cloudflare.com`.
- L'app fonctionne hors-ligne immédiatement après install (pas besoin de
  premier chargement online).
- Bundle vendor < 200 KB.

---

# Annexe — Setup local recommandé pour Sonnet

Avant de lancer une tâche, vérifier que l'environnement local est prêt :

```bash
cd /Users/nicholas/projects/dpchecklist
node --version          # >= 20
npm test                # baseline verte
cd backend
composer install --dev  # installe PHPUnit
composer test           # baseline verte (peut nécessiter PHP 8.x local)
```

Si une tâche modifie le backend, déployer sur le Pi à la fin :

```bash
# Déploiement backend
rsync -av --rsync-path="sudo rsync" \
  /Users/nicholas/projects/dpchecklist/backend/ \
  pi@bullesenvalais.ch:/var/www/dp-fede-api/
ssh pi@bullesenvalais.ch "sudo chown -R www-data:www-data /var/www/dp-fede-api"

# Déploiement frontend (cf. CLAUDE.md)
rsync -av --rsync-path="sudo rsync" \
  --exclude='.git' --exclude='backend/' \
  /Users/nicholas/projects/dpchecklist/ \
  pi@bullesenvalais.ch:/var/www/html/dp-fede/
ssh pi@bullesenvalais.ch "sudo chown -R www-data:www-data /var/www/html/dp-fede && \
  sudo cp '/var/www/html/dp-fede/DP Assistant.html' /var/www/html/dp-fede/index.html && \
  sudo chown www-data:www-data /var/www/html/dp-fede/index.html"
```

---

# Suivi

Cocher les tâches au fil de l'eau :

- [x] C1.1 — Hotfix wkhtmltopdf (Phase 0)
- [x] M3 — Auto-bump SW (pi-scripts/deploy-frontend.sh, local only)
- [x] M4 — Inline scripts sortis → inline-boot.js, CSP sans 'unsafe-inline'
- [x] M6 — Validation date stricte
- [x] L1 — Fix Smtp `$line[3]` (Smtp.php supprimé ensuite)
- [x] L2 — `requestAnimationFrame` au lieu de `setTimeout 50`
- [x] L3 — `.editorconfig`
- [x] L4 — Sémantique de réactivation décidée (commentaire)
- [x] H5 — Rate-limit persistant
- [x] H6 — Smtp.php supprimé (code mort, 0 call-site)
- [x] M7 — Logging structuré
- [x] M11 — firebase/php-jwt v7.1.0 (advisory v6 → v7 sans advisory)
- [x] H1 — esbuild + production builds
- [x] H2.A — JSDoc minimal
- [ ] H2.B — Vraie migration TS
- [x] C1.2 — PDF rendu côté serveur (mPDF, templates PHP)
- [x] M2 — Validation métier backend (Rules.php + RulesTest.php)
- [x] C2 — Sortir wkhtmltopdf → mPDF PHP pur
- [x] H3 — Migrations versionnées (Migrator.php)
- [x] H4 — Séparer `render_state` (table dive_runtime_state)
- [ ] H7 — CDN locaux
