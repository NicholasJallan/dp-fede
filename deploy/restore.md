# Restauration de la base `dp_fede`

Procédure pas à pas : **on restaure toujours d'abord dans une base temporaire**,
on vérifie, puis seulement on bascule. Les sauvegardes sont produites par
`deploy/backup.sh` (installé en `/usr/local/sbin/dp-fede-backup`), dans
`/var/backups/dp-fede/dp_fede-AAAAMMJJ-HHMMSS.sql.gz` (+ `.sha256`).

Le dump est fait **sans** `--databases` : il ne contient ni `CREATE DATABASE`
ni `USE`, et peut donc être chargé dans n'importe quelle base.

> **Exercice de restauration** : dérouler les étapes 1 à 4 (sans bascule) une
> fois par trimestre, et noter la date et le résultat en bas de ce fichier. Une
> sauvegarde jamais restaurée n'est pas une sauvegarde.

Toutes les commandes sont lancées sur le Pi (`ssh pi@bullesenvalais.ch`).

## 0. Variables de travail

```bash
BACKUP=/var/backups/dp-fede/dp_fede-AAAAMMJJ-HHMMSS.sql.gz   # fichier choisi
TMPDB=dp_fede_restore_$(date +%Y%m%d)
```

Sauvegarde distante uniquement (Pi perdu) : la rapatrier d'abord, par exemple
`sudo rclone copy pcloud:Sauvegardes/dp-fede/<fichier>.sql.gz /var/backups/dp-fede/`
(plus le `.sha256`).

## 1. Vérifier l'intégrité du fichier

```bash
cd /var/backups/dp-fede
sudo sha256sum -c "$(basename "$BACKUP").sha256"     # → OK
sudo gzip -t "$BACKUP" && echo "gzip OK"
sudo zcat "$BACKUP" | tail -n 1                      # → « -- Dump completed on … »
```

Si l'une de ces vérifications échoue, prendre la sauvegarde précédente.

## 2. Restaurer dans une base temporaire

```bash
sudo mysql -e "CREATE DATABASE \`$TMPDB\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
sudo zcat "$BACKUP" | sudo mysql "$TMPDB"
```

(`sudo mysql` = root via unix_socket ; aucun mot de passe en ligne de commande.)

## 3. Vérifier le contenu restauré

```bash
# Volumétrie, comparée à la prod
for db in dp_fede "$TMPDB"; do
  echo "== $db"
  sudo mysql "$db" -e "
    SELECT 'users' t, COUNT(*) n FROM users UNION ALL
    SELECT 'divers',  COUNT(*) FROM divers UNION ALL
    SELECT 'sites',   COUNT(*) FROM sites UNION ALL
    SELECT 'dives',   COUNT(*) FROM dives UNION ALL
    SELECT 'dive_runtime_state', COUNT(*) FROM dive_runtime_state"
done

# Fraîcheur : dernières écritures
sudo mysql "$TMPDB" -e "SELECT MAX(updated_at) FROM dives; SELECT MAX(last_login) FROM users;"

# Version du schéma
sudo mysql "$TMPDB" -e "SELECT version, applied_at FROM schema_migrations ORDER BY version"
```

Contrôles attendus :

- les comptes sont cohérents avec la date de la sauvegarde (pas de table vide) ;
- `schema_migrations` liste toutes les versions jusqu'à la dernière migration
  connue à la date du dump ;
- quelques plongées connues sont présentes, avec leur contenu :
  `SELECT id, site_nom, date_plongee, status FROM dives ORDER BY date_plongee DESC LIMIT 5;`

### 3 bis. (Optionnel) Monter le schéma de la base restaurée à la version du code

Si la sauvegarde est antérieure à des migrations déjà déployées, les appliquer
**sur la base temporaire** pour valider qu'elles passent :

```bash
sudo install -o root -g www-data -m 640 /etc/dp-fede/config.php /etc/dp-fede/config-restore.php
sudo sed -i "s/'name' => 'dp_fede'/'name' => '$TMPDB'/" /etc/dp-fede/config-restore.php
sudo grep "'name'" /etc/dp-fede/config-restore.php              # → la base temporaire
# L'utilisateur applicatif doit avoir les droits sur la base temporaire :
sudo mysql -e "GRANT ALL PRIVILEGES ON \`$TMPDB\`.* TO 'dp_fede_user'@'localhost'"
sudo -u www-data DP_FEDE_CONFIG=/etc/dp-fede/config-restore.php \
  php8.5 /var/www/dp-fede-api/bin/migrate.php
sudo -u www-data DP_FEDE_CONFIG=/etc/dp-fede/config-restore.php \
  php8.5 /var/www/dp-fede-api/bin/migrate.php --status
```

## 4. Fin d'exercice (pas de bascule)

```bash
sudo mysql -e "DROP DATABASE \`$TMPDB\`"
sudo mysql -e "REVOKE ALL PRIVILEGES ON \`$TMPDB\`.* FROM 'dp_fede_user'@'localhost'" 2>/dev/null || true
sudo rm -f /etc/dp-fede/config-restore.php
```

## 5. Bascule réelle (incident)

Uniquement après les étapes 1 à 3 réussies.

1. **Couper l'écriture** : mettre l'API en maintenance en désactivant le
   SEUL pool dp-fede. Ne jamais arrêter le service `php8.5-fpm` : il sert
   aussi le pool « dive » d'une autre application (PrestaShop/WordPress, en
   PHP 7.4, ne sont pas concernés) :

   ```bash
   sudo mv /etc/php/8.5/fpm/pool.d/dp-fede.conf /etc/php/8.5/fpm/pool.d/dp-fede.conf.off
   sudo systemctl reload php8.5-fpm      # rechargement en douceur, pool dive intact
   ```

   Les clients PWA passent en mode hors-ligne : leurs écritures restent dans
   l'outbox et seront rejouées après la bascule.

2. **Conserver l'état actuel**, même s'il est corrompu (analyse ultérieure) :

   ```bash
   sudo /usr/local/sbin/dp-fede-backup || \
     sudo mysqldump --single-transaction --routines --triggers dp_fede | gzip > /var/backups/dp-fede/pre-restore-$(date +%Y%m%d-%H%M%S).sql.gz
   ```

3. **Remplacer le contenu de `dp_fede`** par le dump vérifié. Pas de
   `DROP DATABASE` : on garde la base, ses droits (`dp_fede_user`) et sa
   collation ; le dump contient un `DROP TABLE IF EXISTS` par table :

   ```bash
   sudo zcat "$BACKUP" | sudo mysql dp_fede
   ```

4. **Remettre le schéma à niveau** puis **relancer l'API** :

   ```bash
   sudo -u www-data php8.5 /var/www/dp-fede-api/bin/migrate.php
   sudo mv /etc/php/8.5/fpm/pool.d/dp-fede.conf.off /etc/php/8.5/fpm/pool.d/dp-fede.conf
   sudo php-fpm8.5 -t && sudo systemctl reload php8.5-fpm
   curl -s https://dp-fede.bullesenvalais.ch/api/auth/me     # → {"ok":true,"data":null}
   ```

5. **Vérifier dans l'application** : connexion, liste des plongées, ouverture
   d'une plongée archivée, génération d'un PDF.

6. **Nettoyer** la base temporaire (étape 4) et consigner l'incident dans
   `docs/security/incidents/AAAA-MM-JJ.md` (cause, sauvegarde utilisée, perte
   de données éventuelle entre la sauvegarde et l'incident).

> Les sessions sont restaurées avec la base : les utilisateurs restent connectés
> si leur session existait au moment de la sauvegarde. Pour forcer une
> reconnexion générale : `sudo mysql dp_fede -e "DELETE FROM sessions"`.

## Journal des exercices de restauration

| Date | Sauvegarde testée | Résultat | Par |
| ---- | ----------------- | -------- | --- |
|      |                   |          |     |
