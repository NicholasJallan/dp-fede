# Passage du backend DP Assistant à PHP 8.2 (pool PHP-FPM dédié)

Le Raspberry Pi héberge aussi PrestaShop et WordPress, qui **restent en
PHP 7.4**. On installe PHP 8.2 **à côté**, avec un pool FPM dédié à dp-fede,
et on ne bascule que le bloc nginx de dp-fede.

```text
nginx ─┬─ bloc shop / accueil ──► php7.4-fpm (pools existants, inchangés)
       └─ bloc dp-fede /api/   ──► php8.2-fpm, pool [dp-fede]
                                   socket /run/php/php8.2-fpm-dp-fede.sock
```

Fichiers versionnés utilisés : `deploy/php-fpm-dp-fede.conf` (pool),
`deploy/php-dp-fede.ini` (OPcache/APCu), `deploy/nginx-dp-fede.conf` et
`deploy/nginx-dp-fede-security-headers.conf`.

> **Ordre impératif** : PHP 8.2 et la bascule nginx **avant** de déployer le
> nouveau backend. Après `composer install`, `vendor/composer/platform_check.php`
> refuse de démarrer sous PHP < 8.2 : l'ancien pool 7.4 ne pourrait plus servir
> l'API.

Copier d'abord les fichiers sur le Pi (depuis la racine du dépôt, sur le Mac) :

```bash
scp deploy/php-fpm-dp-fede.conf deploy/php-dp-fede.ini \
    deploy/nginx-dp-fede.conf deploy/nginx-dp-fede-security-headers.conf \
    pi@bullesenvalais.ch:/tmp/
```

## 1. Diagnostic (rien n'est modifié)

```bash
cat /etc/os-release | grep VERSION_CODENAME   # bullseye / bookworm attendu
dpkg --print-architecture                     # armhf ou arm64 : tous deux fournis par sury
nginx -v; mariadb --version
apt-cache policy php7.4-fpm | head -n 5       # origine de PHP 7.4 : Debian ou packages.sury.org ?
ls /etc/apt/sources.list.d/
update-alternatives --display php | head -n 3 # binaire « php » par défaut (CLI)
grep -n "fastcgi_pass" /etc/nginx/sites-available/bullesenvalais
grep -E '^\s*date.timezone' /etc/php/7.4/fpm/php.ini   # fuseau à reprendre en 8.2
free -h                                       # RAM disponible (pool 8.2 : ~4 workers max)
```

Noter : le socket 7.4 utilisé par le bloc dp-fede (pour le retour arrière) et le
fuseau horaire de PHP 7.4.

## 2. Sauvegardes préalables

```bash
sudo /usr/local/sbin/dp-fede-backup        # si déjà installé (docs/deploy/README.md §1)
sudo cp -a /etc/nginx/sites-available/bullesenvalais /root/bullesenvalais.nginx.$(date +%F)
sudo tar czf /root/php-etc-$(date +%F).tar.gz /etc/php
```

## 3. Dépôt sury (si PHP 7.4 ne vient pas déjà de packages.sury.org)

```bash
sudo apt-get update
sudo apt-get install -y lsb-release ca-certificates curl
sudo curl -fsSLo /usr/share/keyrings/deb.sury.org-php.gpg https://packages.sury.org/php/apt.gpg
echo "deb [signed-by=/usr/share/keyrings/deb.sury.org-php.gpg] https://packages.sury.org/php/ $(lsb_release -sc) main" \
  | sudo tee /etc/apt/sources.list.d/php-sury.list
sudo apt-get update
```

**Protéger PHP 7.4** (PrestaShop/WordPress) contre une mise à jour non voulue
par les paquets sury :

```bash
sudo apt-mark hold $(dpkg-query -W -f='${Package}\n' 'php7.4*' 2>/dev/null)
```

## 4. Installation de PHP 8.2

Simuler d'abord et lire la liste : **aucun paquet `php7.4-*` ne doit être
retiré** (`Remv`).

```bash
PKGS="php8.2-fpm php8.2-cli php8.2-mysql php8.2-mbstring php8.2-gd php8.2-xml php8.2-curl php8.2-apcu php8.2-opcache unzip"
sudo apt-get install -s $PKGS | grep -E '^(Inst|Remv)'
sudo apt-get install -y $PKGS
```

Remettre PHP 7.4 comme `php` par défaut en ligne de commande (les crons
PrestaShop/WordPress appellent `php`) — l'installation de 8.2 peut avoir changé
l'alternative :

```bash
sudo update-alternatives --set php /usr/bin/php7.4
php -v            # → 7.4
php8.2 -v         # → 8.2
php8.2 -m | grep -Ei '^(pdo_mysql|mbstring|gd|xml|curl|apcu|zend opcache)$'
```

## 5. Pool dédié dp-fede

```bash
# Désactiver le pool « www » par défaut de 8.2 (inutile, consomme de la RAM)
sudo mv /etc/php/8.2/fpm/pool.d/www.conf /etc/php/8.2/fpm/pool.d/www.conf.disabled

sudo install -o root -g root -m 644 /tmp/php-fpm-dp-fede.conf /etc/php/8.2/fpm/pool.d/dp-fede.conf
sudo install -o root -g root -m 644 /tmp/php-dp-fede.ini      /etc/php/8.2/fpm/conf.d/99-dp-fede.ini

# Fuseau horaire : reprendre la valeur de 7.4 notée au §1
sudo $EDITOR /etc/php/8.2/fpm/pool.d/dp-fede.conf     # décommenter php_admin_value[date.timezone]

# Journaux écrits par le pool (open_basedir autorise le préfixe /var/log/dp-fede)
for f in dp-fede.log dp-fede-csp.log dp-fede-php.log; do
  sudo touch /var/log/$f
  sudo chown www-data:www-data /var/log/$f
  sudo chmod 640 /var/log/$f
done

sudo php-fpm8.2 -t
sudo systemctl enable --now php8.2-fpm
sudo systemctl restart php8.2-fpm
ls -l /run/php/php8.2-fpm-dp-fede.sock        # srw-rw---- www-data www-data
```

### Test du pool AVANT de toucher à nginx

```bash
sudo apt-get install -y libfcgi-bin
sudo -u www-data env SCRIPT_FILENAME=/var/www/dp-fede-api/index.php SCRIPT_NAME=/index.php \
  REQUEST_METHOD=GET REQUEST_URI=/api/auth/me \
  cgi-fcgi -bind -connect /run/php/php8.2-fpm-dp-fede.sock
# → en-têtes HTTP puis {"ok":true,"data":null}
sudo tail -n 20 /var/log/dp-fede-php.log      # aucune erreur
```

## 6. Composer sur le Pi (pour `deploy/deploy-backend.sh`)

```bash
cd /tmp
php8.2 -r "copy('https://getcomposer.org/installer', 'composer-setup.php');"
# Vérifier la signature : https://getcomposer.org/download/ (hash SHA-384 publié)
php8.2 -r "echo hash_file('sha384', 'composer-setup.php'), PHP_EOL;"
sudo php8.2 composer-setup.php --install-dir=/usr/local/bin --filename=composer
rm composer-setup.php
php8.2 /usr/local/bin/composer --version
```

## 7. Bascule nginx — bloc dp-fede uniquement

### 7a. Bascule minimale (retour arrière immédiat possible)

Dans `/etc/nginx/sites-available/bullesenvalais`, **bloc `server_name
dp-fede.bullesenvalais.ch` uniquement**, remplacer le `fastcgi_pass` vers le
socket 7.4 par :

```nginx
fastcgi_pass unix:/run/php/php8.2-fpm-dp-fede.sock;
```

```bash
sudo nginx -t && sudo systemctl reload nginx
```

### 7b. Configuration versionnée (après le déploiement du backend)

Remplace le bloc dp-fede historique par `deploy/nginx-dp-fede.conf` (CSP sans
unpkg/cdnjs, en-têtes hérités correctement par sw.js, limite de corps CSP…).

```bash
sudo install -o root -g root -m 644 /tmp/nginx-dp-fede-security-headers.conf \
  /etc/nginx/snippets/dp-fede-security-headers.conf
sudo install -o root -g root -m 644 /tmp/nginx-dp-fede.conf /etc/nginx/sites-available/dp-fede

# Placeholders : nom du certificat et VRAIE clé Maps (reprise de l'ancien sub_filter)
sudo certbot certificates | grep -A2 dp-fede
sudo grep -n "sub_filter '__GOOGLE_MAPS_API_KEY__'" /etc/nginx/sites-available/bullesenvalais
sudo $EDITOR /etc/nginx/sites-available/dp-fede   # __CERT_NAME__, __VRAIE_CLE_MAPS__

# Retirer le bloc dp-fede de l'ancien fichier (server 443 ET redirection 80),
# sinon nginx signale « conflicting server name ».
sudo $EDITOR /etc/nginx/sites-available/bullesenvalais

sudo ln -s /etc/nginx/sites-available/dp-fede /etc/nginx/sites-enabled/dp-fede
sudo nginx -t && sudo systemctl reload nginx
```

## 8. Vérifications

```bash
curl -s https://dp-fede.bullesenvalais.ch/api/auth/me              # {"ok":true,"data":null}
curl -sI https://dp-fede.bullesenvalais.ch/api/auth/me | grep -i x-powered-by   # rien
curl -s https://dp-fede.bullesenvalais.ch/ | grep -c 'AIza'        # 1 (clé injectée)
curl -sI https://dp-fede.bullesenvalais.ch/sw.js | grep -iE 'cache-control|content-security|strict-transport'
curl -sI https://<site PrestaShop>/ | head -n 1                    # 200 : 7.4 intact
curl -sI https://<site WordPress>/ | head -n 1                     # 200
systemctl is-active php7.4-fpm php8.2-fpm                          # active / active
sudo tail -f /var/log/dp-fede-php.log /var/log/nginx/error.log /var/log/dp-fede-csp.log
```

Dans l'application : connexion Google, liste et ouverture d'une plongée,
génération du PDF (fiche + check-list), marée SHOM, pré-remplissage météo,
archivage Drive. Surveiller `/var/log/dp-fede-csp.log` quelques jours : toute
violation signale une origine à ajouter (ou un script à retirer).

## 9. Retour arrière

- **Avant** le déploiement du nouveau backend : remettre l'ancien `fastcgi_pass`
  (socket 7.4 noté au §1) dans le bloc dp-fede, puis
  `sudo nginx -t && sudo systemctl reload nginx`.
- **Après** le déploiement du nouveau backend (vendor/ exige PHP ≥ 8.2) : un
  retour en 7.4 impose aussi de redéployer l'ancienne version du backend. Les
  migrations 003 à 005 sont additives et compatibles avec l'ancien code.
- Configuration versionnée (§7b) : `sudo rm /etc/nginx/sites-enabled/dp-fede`,
  restaurer `/root/bullesenvalais.nginx.<date>`, `nginx -t`, reload.

## 10. Après stabilisation (quelques semaines)

- Désinstaller ce qui ne sert plus : `sudo apt-get remove libfcgi-bin`.
- Garder le `hold` sur `php7.4*` tant que PrestaShop/WordPress n'ont pas été
  migrés ; PHP 7.4 est en fin de vie : planifier leur montée de version.
