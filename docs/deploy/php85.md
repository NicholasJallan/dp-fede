# Backend DP Assistant sur PHP 8.5 (pool PHP-FPM dédié) et bascule de production

Le Raspberry Pi fait déjà tourner **PHP 8.5-FPM** pour une autre application
(pool **« dive »**, utilisateur `bulles-php`) ; PrestaShop et WordPress
restent en **PHP 7.4**. La production actuelle de DP Assistant (branche
`main`, structures partagées) tourne encore sur PHP 7.4.

On ajoute à php8.5-fpm un pool **`[dp-fede]`** et on ne bascule que le bloc
nginx de dp-fede :

```text
nginx ─┬─ PrestaShop / WordPress ─► php7.4-fpm (inchangés)
       ├─ application dive       ─► php8.5-fpm, pool [dive]    (inchangé)
       └─ dp-fede /api/          ─► php8.5-fpm, pool [dp-fede]
                                    socket /run/php/php8.5-fpm-dp-fede.sock
```

**Règle d'or : ne jamais modifier le pool `dive`** (ni son fichier, ni un
réglage global de php8.5-fpm). Conséquences, déjà prises en compte dans le
dépôt :

- plus de fichier `conf.d/99-dp-fede.ini` (il aurait changé OPcache/APCu pour
  dive) : tout réglage propre à dp-fede est un `php_admin_*` du pool
  (`deploy/php-fpm-dp-fede.conf`) ;
- ne jamais `systemctl stop|restart php8.5-fpm` : seulement `reload`
  (rechargement en douceur, les requêtes en cours de dive se terminent) ; pour
  couper l'API seule, désactiver le fichier du pool (`deploy/restore.md` §5) ;
- **APCu est partagé** entre les pools d'un même php-fpm : les clés de
  dp-fede sont préfixées `dp_fede:` et le cache des clés Google (JWKS) est
  signé (HMAC, secret dérivé de `/etc/dp-fede/config.php`, illisible par
  `bulles-php`) — une entrée injectée par un autre pool est ignorée ;
- installer une extension `php8.5-*` la charge aussi dans le pool dive
  (sans effet tant qu'il ne l'utilise pas) : vérifier dive après le §3.

Fichiers versionnés utilisés : `deploy/php-fpm-dp-fede.conf` (pool),
`deploy/nginx-dp-fede.conf`, `deploy/nginx-dp-fede-security-headers.conf`,
`deploy/deploy-backend.sh`, `deploy/deploy-frontend.sh`.

Copier d'abord les fichiers sur le Pi (depuis la racine du dépôt, sur le Mac) :

```bash
scp deploy/php-fpm-dp-fede.conf deploy/nginx-dp-fede.conf \
    deploy/nginx-dp-fede-security-headers.conf pi@bullesenvalais.ch:/tmp/
```

## 1. Diagnostic (rien n'est modifié)

```bash
php8.5 -v; php-fpm8.5 -v
ls /etc/php/8.5/fpm/pool.d/                         # dive.conf (+ www.conf ?) — NE PAS TOUCHER
grep -E '^\s*(user|listen)\s*=' /etc/php/8.5/fpm/pool.d/dive.conf   # lecture seule
php8.5 -m | grep -Ei '^(pdo_mysql|mysqli|mbstring|gd|xml|dom|curl|intl|apcu|zend opcache)$'
grep -n "fastcgi_pass" /etc/nginx/sites-available/bullesenvalais     # socket 7.4 actuel de dp-fede (retour arrière)
grep -E '^\s*date.timezone' /etc/php/7.4/fpm/php.ini                # fuseau à reprendre
mariadb --version; free -h
sudo mysql dp_fede -e "SELECT version FROM schema_migrations ORDER BY version"   # 000, 001, 002
```

## 2. Sauvegardes préalables

```bash
sudo /usr/local/sbin/dp-fede-backup        # si déjà installé (docs/deploy/README.md §1)
sudo cp -a /etc/nginx/sites-available/bullesenvalais /root/bullesenvalais.nginx.$(date +%F)
sudo tar czf /root/php85-etc-$(date +%F).tar.gz /etc/php/8.5
```

## 3. Extensions PHP 8.5

Extensions requises : **mysql** (pdo_mysql), **mbstring**, **gd**, **xml**,
**curl**, **intl**, **apcu** (OPcache est intégré à PHP 8.5). Simuler d'abord :
**aucun paquet ne doit être retiré** (`Remv`), en particulier aucun `php7.4-*`.

```bash
PKGS="php8.5-cli php8.5-mysql php8.5-mbstring php8.5-gd php8.5-xml php8.5-curl php8.5-intl php8.5-apcu unzip"
sudo apt-get install -s $PKGS | grep -E '^(Inst|Remv)'
sudo apt-get install -y $PKGS
sudo update-alternatives --display php | head -n 3     # « php » par défaut inchangé (crons PrestaShop/WordPress)
php8.5 -m | grep -Ei '^(pdo_mysql|mbstring|gd|xml|curl|intl|apcu|zend opcache)$'
curl -sI https://<site de l'application dive>/ | head -n 1   # dive toujours OK
```

## 4. Pool dédié dp-fede

```bash
sudo install -o root -g root -m 644 /tmp/php-fpm-dp-fede.conf /etc/php/8.5/fpm/pool.d/dp-fede.conf
# date.timezone = Europe/Paris est fixé dans le pool (PHP 7.4 devinait le fuseau système, PHP 8 vaut UTC)

# Répertoires et journaux écrits par le pool (open_basedir : préfixe /var/log/dp-fede)
sudo install -d -o www-data -g www-data -m 750 /var/lib/dp-fede /var/lib/dp-fede/documents
for f in dp-fede.log dp-fede-csp.log dp-fede-php.log; do
  sudo touch /var/log/$f; sudo chown www-data:www-data /var/log/$f; sudo chmod 640 /var/log/$f
done

sudo php-fpm8.5 -t
sudo systemctl reload php8.5-fpm
ls -l /run/php/php8.5-fpm-dp-fede.sock        # srw-rw---- www-data www-data
```

### Test du pool AVANT de toucher à nginx

Le pool sert le code présent dans `/var/www/dp-fede-api` (encore l'ancienne
version) : ce test vérifie aussi que l'ancien code démarre sous 8.5, ce qui
sera le cas pendant les quelques minutes de la bascule (§6, lectures seules).

```bash
sudo apt-get install -y libfcgi-bin
sudo -u www-data env SCRIPT_FILENAME=/var/www/dp-fede-api/index.php SCRIPT_NAME=/index.php \
  REQUEST_METHOD=GET REQUEST_URI=/api/auth/me \
  cgi-fcgi -bind -connect /run/php/php8.5-fpm-dp-fede.sock
# → en-têtes HTTP puis {"ok":true,"data":null}
sudo tail -n 20 /var/log/dp-fede-php.log      # pas d'erreur fatale (des « Deprecated » de l'ancien code sont possibles)
```

## 5. Composer sur le Pi (pour `deploy/deploy-backend.sh`)

```bash
command -v composer || {
  cd /tmp
  php8.5 -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
  # Vérifier la signature : https://getcomposer.org/download/ (hash SHA-384 publié)
  php8.5 -r "echo hash_file('sha384', 'composer-setup.php'), PHP_EOL;"
  sudo php8.5 composer-setup.php --install-dir=/usr/local/bin --filename=composer
  rm composer-setup.php
}
php8.5 /usr/local/bin/composer --version
```

`composer install --no-dev` installe le `vendor/` complet ;
`backend/index.php` et `bin/cli-bootstrap.php` chargent
`vendor/autoload.php` s'il est présent. L'autoloader restreint
`PdfAutoload.php` et la copie `psr-log-shim/` de la production (contournement
du `platform_check` de Composer sous PHP 7.4) sont **supprimés** : sous 8.5 le
`vendor/` résolu pour `config.platform.php = 8.5.11` se charge normalement, et
une copie figée de psr/log v1 serait en conflit avec psr/log v3 de `vendor/`.
Sans `vendor/` (oubli de `composer install`), l'API démarre, journalise
l'absence et seuls les PDF échouent.

## 6. Bascule de production (premier déploiement de cette version)

Ce déploiement **n'est pas additif** : la migration 007 transforme les
structures en clubs (les lignes du compte-structure changent d'auteur),
l'ancien code ne verrait plus les données du stage. On coupe donc les
**écritures** le temps de la bascule (une dizaine de minutes). Les clients
PWA gardent leurs écritures dans l'outbox (un 503 est un échec transitoire)
et les rejouent après.

Prérequis : §1 à §5 faits, `deploy/backup.sh` installé (docs/deploy/README.md
§1), **tiroir de synchronisation vide sur les tablettes terrain** si possible
(cf. « Écritures hors ligne » ci-dessous).

1. **Maintenance des écritures** — dans le bloc dp-fede, `location /api/`,
   ajouter en première ligne puis recharger nginx :

   ```nginx
   if ($request_method !~ ^(GET|HEAD|OPTIONS)$) { return 503; }
   ```

   ```bash
   sudo nginx -t && sudo systemctl reload nginx
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://dp-fede.bullesenvalais.ch/api/dives   # 503
   ```

2. **nginx → pool 8.5** : remplacer le `fastcgi_pass` vers le socket 7.4 par
   `fastcgi_pass unix:/run/php/php8.5-fpm-dp-fede.sock;` (bloc dp-fede
   uniquement), `sudo nginx -t && sudo systemctl reload nginx`.

3. **Backend** (Mac, racine du dépôt) :

   ```bash
   deploy/deploy-backend.sh --dry-run   # relire les suppressions (lib/PdfAutoload.php, lib/psr-log-shim/, routes/workspaces.php…)
   deploy/deploy-backend.sh
   ```

   Déroulé : `composer install --no-dev` (php8.5) → sauvegarde → **plan de
   reprise** (`bin/workspaces-plan.php --save /var/lib/dp-fede/workspaces-plan.json`,
   affiché dans la sortie : relire clubs, membres, clubs courants) →
   migrations **003 → 011** → **vérification** du plan (`--verify` : tout écart
   arrête le script AVANT la bascule du code) → bascule → `reload php8.5-fpm`
   → test de fumée.

4. **Frontend, immédiatement** : `deploy/deploy-frontend.sh`. Tant qu'un
   navigateur garde l'ancien front, il appelle `/api/workspaces*` (réponse
   `410 WORKSPACES_REPLACED` : « rechargez l'application ») ; le Service
   Worker installe la nouvelle version au chargement suivant.

5. **Fin de maintenance** : retirer la ligne `if (…) { return 503; }`,
   `sudo nginx -t && sudo systemctl reload nginx`.

6. **Configuration nginx versionnée** (peut attendre) : §7.

### Reprise des structures

Résultat attendu sur la production (volumes au 20/10/2026) :

|                                                          | Attendu                                                                                                                           |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Clubs                                                    | 19 : un club personnel par compte (18) + « BEPPA Hendaye 2026 »                                                                   |
| Compte-structure (id 14)                                 | conservé, `kind = 'workspace'`, ni club, ni adhésion, ni club courant ; toujours non connectable                                  |
| Membres du club BEPPA                                    | 2 responsable ; 6, 15, 16, 18, 19, 20 dp                                                                                          |
| Plongées                                                 | club BEPPA 7 (ex-user 14) ; club personnel de 2 : 19, de 4 : 2, de 5 : 2, de 10 : 1, de 21 : 1                                    |
| Plongeurs                                                | club BEPPA 20 ; personnels 2 : 10, 4 : 5, 5 : 2, 6 : 1, 9 : 1, 10 : 2                                                             |
| Auteur (`user_id`) des lignes BEPPA                      | `created_by` s'il désigne un compte existant, sinon NULL (« auteur inconnu »)                                                     |
| Club courant                                             | BEPPA pour les membres dont la **session la plus récente** (non expirée) était dans la structure ; club personnel pour les autres |
| `updated_at`, `dive_runtime_state`, tables `workspaces*` | inchangés                                                                                                                         |

Contrôles manuels après la bascule :

```bash
sudo mysql dp_fede -e "
  SELECT c.nom, COUNT(m.user_id) AS membres FROM clubs c JOIN club_members m ON m.club_id = c.id
   WHERE c.legacy_workspace_id IS NOT NULL GROUP BY c.id;
  SELECT COUNT(*) AS sans_club_courant FROM users WHERE kind = 'person' AND current_club_id IS NULL;
  SELECT COUNT(*) AS lignes_compte_structure FROM dives WHERE user_id IN (SELECT id FROM users WHERE kind = 'workspace');"
# attendu : BEPPA Hendaye 2026 / 7 ; 0 ; 0
```

**Choix du club courant** : par membre (et non par appareil, le club courant
est porté par le compte). La session la plus récente est l'espace que le
membre utilisait et celui où ses écritures hors ligne ont été saisies. Ses
autres appareils suivent ce club au prochain `GET /api/auth/me` /
`/api/sync/state` ; il change de club en un clic (barre haute).

**Écritures hors ligne** : l'ancien front ne rattachait pas ses écritures en
file à un espace. Le nouveau front les met d'abord « à revoir » puis, une
fois le club courant confirmé par le serveur, les rattache à ce club (et
purge du cache local, au premier rattachement d'un appareil ancien, les
lignes déjà synchronisées : elles sont relues dans le bon club). Une écriture
saisie dans le stage sur un appareil dont le membre a pour club courant son
club personnel partirait donc dans ce club personnel : d'où la consigne de
vider les tiroirs de synchronisation avant la bascule.

**Rejoindre un club** : les codes d'invitation partagés des structures ne
sont pas repris (ils contournaient le responsable) ; on rejoint un club par
une invitation nominative (lien à usage unique, `docs/api-club.md`).

## 7. Configuration nginx versionnée (après la bascule)

**Appliquée le 20/10/2026** : le bloc dp-fede historique a été retiré de
`/etc/nginx/sites-available/bullesenvalais` (sauvegarde :
`/root/nginx-bak-20261020-231117/`) et remplacé par
`/etc/nginx/sites-available/dp-fede` (lien dans `sites-enabled/`), généré depuis
`deploy/nginx-dp-fede.conf`, + `/etc/nginx/snippets/dp-fede-security-headers.conf`.

Réalités du Pi prises en compte par le fichier versionné :

- certificat SAN partagé `www.bullesenvalais.ch` (`__CERT_NAME__`), sans
  `options-ssl-nginx.conf` ni `ssl-dhparams.pem` (obtenu en mode webroot :
  réglages TLS globaux de `nginx.conf`) ;
- renouvellement certbot **webroot** : `/.well-known/acme-challenge/` servi
  en HTTP depuis `/var/www/html/dp-fede`, sans redirection ;
- journaux `/var/log/nginx/dp-fede.{access,error}_log` ;
- le routeur PHP lit `REQUEST_URI` (fourni par `fastcgi_params`).

Mise à jour ultérieure (nouvelle CSP, nouvel en-tête…) :

```bash
scp deploy/nginx-dp-fede.conf deploy/nginx-dp-fede-security-headers.conf pi@bullesenvalais.ch:/tmp/
ssh pi@bullesenvalais.ch
TS=$(date +%Y%m%d-%H%M%S); sudo mkdir -p /root/nginx-bak-$TS
sudo cp -a /etc/nginx/sites-available/dp-fede /etc/nginx/snippets/dp-fede-security-headers.conf /root/nginx-bak-$TS/
sudo install -o root -g root -m 644 /tmp/nginx-dp-fede-security-headers.conf /etc/nginx/snippets/dp-fede-security-headers.conf
# Le fichier du site porte la vraie clé Maps : la reprendre du fichier en place.
KEY=$(sudo grep -oE "AIza[0-9A-Za-z_-]{35}" /etc/nginx/sites-available/dp-fede | sort -u)
sed -e "s/__CERT_NAME__/www.bullesenvalais.ch/g" -e "s/__VRAIE_CLE_MAPS__/$KEY/" /tmp/nginx-dp-fede.conf \
  | sudo install -o root -g root -m 640 /dev/stdin /etc/nginx/sites-available/dp-fede
sudo nginx -t && sudo systemctl reload nginx   # sinon : recopier /root/nginx-bak-$TS/*
sudo certbot renew --cert-name www.bullesenvalais.ch --dry-run   # défi ACME toujours servi
```

## 8. Vérifications

```bash
curl -s https://dp-fede.bullesenvalais.ch/api/auth/me              # {"ok":true,"data":null}
curl -s https://dp-fede.bullesenvalais.ch/api/workspaces           # 410 WORKSPACES_REPLACED
curl -sI https://dp-fede.bullesenvalais.ch/api/auth/me | grep -i x-powered-by   # rien
curl -s https://dp-fede.bullesenvalais.ch/ | grep -c 'AIza'        # 1 (clé injectée)
curl -sI https://dp-fede.bullesenvalais.ch/sw.js | grep -iE 'cache-control|content-security|strict-transport'
curl -sI https://<site PrestaShop>/ | head -n 1                    # 200 : 7.4 intact
curl -sI https://<site de l'application dive>/ | head -n 1         # 200 : pool dive intact
systemctl is-active php7.4-fpm php8.5-fpm                          # active / active
sudo -u www-data php8.5 /var/www/dp-fede-api/bin/migrate.php --status   # 000 → 011 « appliquée »
sudo tail -f /var/log/dp-fede-php.log /var/log/nginx/error.log /var/log/dp-fede-csp.log
```

Dans l'application : connexion Google, club courant et changement de club
(BEPPA ↔ personnel), liste et ouverture d'une plongée du stage, génération
du PDF (fiche + check-list), archivage (PDF archivés par le serveur, dépôt
Drive facultatif), marée SHOM, pré-remplissage météo.

Mettre à jour les tâches planifiées : `deploy/cron.example` appelle
`/usr/bin/php8.5` (purge 03:15, reprise des documents `:40`, cf.
`club-socle.md` §5).

## 9. Retour arrière

- **Avant** l'étape 3 du §6 : remettre l'ancien `fastcgi_pass` (socket 7.4
  noté au §1), retirer la maintenance, `sudo nginx -t && sudo systemctl reload nginx`.
- **Si `deploy-backend.sh` s'arrête à la vérification du plan** : le code n'a
  pas été basculé mais la base est migrée. Restaurer la sauvegarde prise par
  le script (`deploy/restore.md` §5, étapes 2 à 4 — sans relancer
  `migrate.php`), revenir au socket 7.4, analyser les écarts affichés.
- **Après** la bascule : restaurer la sauvegarde d'avant migration, redéployer
  l'ancienne version (`main`, depuis un clone : `pi-scripts/` d'origine),
  revenir au socket 7.4. Les écritures faites entre-temps sont perdues côté
  serveur (elles restent dans les outbox qui ne les auraient pas encore
  envoyées) : décider vite.
- Configuration versionnée (§7) : `sudo rm /etc/nginx/sites-enabled/dp-fede`,
  restaurer `/root/bullesenvalais.nginx.<date>`, `nginx -t`, reload.
- Pool : `sudo rm /etc/php/8.5/fpm/pool.d/dp-fede.conf && sudo systemctl reload php8.5-fpm`
  (dive non concerné).

## 10. Après stabilisation (quelques semaines)

- `sudo apt-get remove libfcgi-bin`.
- Le bloc dp-fede ne dépend plus de php7.4-fpm ; garder 7.4 tant que
  PrestaShop/WordPress n'ont pas migré (fin de vie : planifier).
- Une migration ultérieure pourra supprimer `workspaces`,
  `workspace_members`, `sessions.workspace_id`, les colonnes `created_by` et
  le compte-structure (après la durée de conservation des fiches du stage).
