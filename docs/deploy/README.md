# Mise en production — DP Assistant

Runbook d'exploitation du Raspberry Pi (`pi@bullesenvalais.ch`). Tous les
fichiers référencés sont versionnés dans `deploy/` et **ne contiennent aucun
secret** ; les secrets vivent uniquement sur le Pi :

| Secret                                          | Emplacement                                  | Droits                                          |
| ----------------------------------------------- | -------------------------------------------- | ----------------------------------------------- |
| Config backend (DB, OAuth client id, rétention) | `/etc/dp-fede/config.php`                    | `root:www-data 640`                             |
| Accès sauvegarde (DB, hooks)                    | `/etc/dp-fede/backup.env`                    | `root:root 600`                                 |
| Clé Google Maps                                 | directive `sub_filter` du bloc nginx dp-fede | `root 644` (servie publiquement de toute façon) |
| Compte SMTP des rapports                        | `/etc/msmtprc`                               | `root 600`                                      |
| Jetons du stockage distant                      | `/root/.config/rclone/rclone.conf`           | `root 600`                                      |

## Contenu de `deploy/`

| Fichier                                                     | Rôle                                                                                                                                                                                      | Installé en                                                  |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `deploy-backend.sh`                                         | Lint + tests, rsync vers un staging, `composer install --no-dev`, sauvegarde, plan de reprise des structures, `bin/migrate.php`, vérification du plan, bascule, reload FPM, test de fumée | lancé depuis le Mac                                          |
| `recette-migration-clubs.php`                               | Rejoue la reprise structures → clubs (003 → 011) sur un MariaDB jetable : volumes de production, coupure à chaque instruction, idempotence                                                | lancé depuis le Mac                                          |
| `deploy-frontend.sh`                                        | `npm run build` + rsync `dist/`                                                                                                                                                           | lancé depuis le Mac                                          |
| `backup.sh` + `backup.env.example`                          | Sauvegarde MariaDB vérifiée + rétention + hooks                                                                                                                                           | `/usr/local/sbin/dp-fede-backup`, `/etc/dp-fede/backup.env`  |
| `backup-upload-rclone.sh`                                   | Hook : copie distante (pCloud, S3…)                                                                                                                                                       | `/usr/local/sbin/dp-fede-backup-upload`                      |
| `backup-notify-mail.sh`                                     | Hook : e-mail de statut (remplace `backup_report.php`)                                                                                                                                    | `/usr/local/sbin/dp-fede-backup-notify`                      |
| `restore.md`                                                | Procédure de restauration + journal des exercices                                                                                                                                         | —                                                            |
| `cron.example`                                              | Sauvegarde 02:30, purge 03:15                                                                                                                                                             | `/etc/cron.d/dp-fede`                                        |
| `logrotate-dp-fede`                                         | Rotation de `/var/log/dp-fede*.log` (12 semaines)                                                                                                                                         | `/etc/logrotate.d/dp-fede`                                   |
| `php-fpm-dp-fede.conf`                                      | Pool PHP 8.5 dédié (php8.5-fpm partagé avec l'application « dive », jamais modifiée)                                                                                                      | `/etc/php/8.5/fpm/pool.d/dp-fede.conf`                       |
| `nginx-dp-fede.conf`, `nginx-dp-fede-security-headers.conf` | Bloc serveur + en-têtes (CSP…)                                                                                                                                                            | `/etc/nginx/sites-available/dp-fede`, `/etc/nginx/snippets/` |

## Première mise en production — ordre des opérations

Chaque étape est réversible indépendamment ; ne pas passer à la suivante si les
vérifications échouent.

### 1. Sauvegarde fiable d'abord

```bash
# Mac
scp deploy/backup.sh deploy/backup.env.example deploy/backup-notify-mail.sh \
    deploy/backup-upload-rclone.sh deploy/cron.example deploy/logrotate-dp-fede \
    pi@bullesenvalais.ch:/tmp/
# Pi
sudo install -o root -g root -m 750 /tmp/backup.sh /usr/local/sbin/dp-fede-backup
sudo install -o root -g root -m 600 /tmp/backup.env.example /etc/dp-fede/backup.env
sudo $EDITOR /etc/dp-fede/backup.env        # DB_USER vide = root via unix_socket
sudo /usr/local/sbin/dp-fede-backup && ls -l /var/backups/dp-fede/
```

Optionnel, tout de suite ou plus tard : hooks rclone et e-mail (voir les
en-têtes des deux scripts), puis `BACKUP_UPLOAD_HOOK` / `BACKUP_NOTIFY_HOOK`
dans `backup.env`.

### 2. PHP 8.5 + pool dédié

Suivre [php85.md](php85.md) §1 à §5 (extensions, pool `[dp-fede]` à côté du
pool « dive », Composer).

### 3. Déploiement du backend

```bash
# Mac, racine du dépôt
deploy/deploy-backend.sh --dry-run     # relire les suppressions annoncées (« *deleting »)
deploy/deploy-backend.sh
```

**Premier déploiement de cette version : suivre la bascule de production
[php85.md §6](php85.md#6-bascule-de-production-premier-déploiement-de-cette-version)**
(maintenance des écritures, nginx vers le pool 8.5, backend puis frontend).
Le script applique les migrations **003** (date de naissance), **004** (repli
du schéma inline), **005** (FK + suppression des orphelins — d'où la
sauvegarde automatique juste avant), **006** (`users.last_seen_at`), puis
**007 → 011** (socle club, dont la reprise des structures de production,
encadrée par `bin/workspaces-plan.php`, cf. [club-socle.md](club-socle.md)).
Ensuite :

```bash
# Pi
sudo -u www-data php8.5 /var/www/dp-fede-api/bin/migrate.php --status   # tout « appliquée »
sudo -u www-data php8.5 /var/www/dp-fede-api/bin/purge.php --dry-run
```

### 4. Tâches planifiées et journaux

```bash
sudo install -o root -g root -m 644 /tmp/cron.example /etc/cron.d/dp-fede
sudo install -o root -g root -m 644 /tmp/logrotate-dp-fede /etc/logrotate.d/dp-fede
for f in dp-fede-purge.log dp-fede-backup.log; do
  sudo install -o www-data -g www-data -m 640 /dev/null /var/log/$f
done
sudo logrotate --debug /etc/logrotate.d/dp-fede
```

Si `pi-scripts/save.sh` (crontab de `pi`) sauvegarde aussi `dp_fede`, le
laisser tourner en parallèle quelques semaines, puis retirer sa section
dp-fede.

### 5. Configuration nginx versionnée

[php85.md](php85.md) §7, puis §8 (vérifications) et
surveillance de `/var/log/dp-fede-csp.log`.

### 6. Frontend

```bash
deploy/deploy-frontend.sh --dry-run
deploy/deploy-frontend.sh
```

### 7. Exercice de restauration

[deploy/restore.md](../../deploy/restore.md) étapes 1 à 4, puis consigner le
résultat dans son journal.

### 8. Durées de conservation

Renseigner la section `retention` de `/etc/dp-fede/config.php` (modèle :
`backend/config.example.php`) selon [../rgpd.md](../rgpd.md).

## Déploiements courants

```bash
deploy/deploy-backend.sh          # backend (migrations incluses)
deploy/deploy-frontend.sh         # frontend
```

Nouvelle évolution du schéma : ajouter `backend/migrations/NNN_description.sql`
**idempotent** (`ADD COLUMN IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, garde
`information_schema` pour les FK) ; ne jamais modifier une migration déjà
appliquée. Le schéma n'est plus migré pendant les requêtes HTTP.

## Points d'attention

- `pi-scripts/` (non versionné) contient en clair des cookies de session et un
  secret client pCloud : les révoquer (déconnexion des sessions pCloud,
  régénération du secret) une fois `backup-upload-rclone.sh` en place.
- `pi-scripts/backup_report.php` inclut `lib/Smtp.php`, supprimé du dépôt.
  `deploy-backend.sh` protège ce fichier sur le Pi (filtre rsync `P`) en
  attendant le passage à `backup-notify-mail.sh` ; retirer ensuite le filtre et
  le fichier.
- `pi-scripts/save.sh` se termine toujours par `exit 0` : un échec n'est visible
  que dans l'e-mail. `dp-fede-backup` renvoie un code ≠ 0.
