# Déploiement du socle club (phase 5)

Complète [README.md](README.md). À faire **une fois**, avant ou pendant le
premier `deploy/deploy-backend.sh` qui embarque les migrations 007 à 011.

## 1. Répertoire d'archivage des fiches (A322-72)

```bash
# Pi
sudo install -d -o www-data -g www-data -m 750 /var/lib/dp-fede
sudo install -d -o www-data -g www-data -m 750 /var/lib/dp-fede/documents
```

Hors web root, jamais servi par nginx : les PDF ne sortent que par
`GET /api/dives/:id/documents/:type` (contrôle d'accès au club + vérification
SHA-256). Arborescence : `documents/<club_id>/<année>/<dive_id>-<fiche|checklist>.pdf`.

Autre emplacement possible : section `documents.path` de
`/etc/dp-fede/config.php` (modèle : `backend/config.example.php`). Le
répertoire doit alors aussi figurer dans `open_basedir`.

## 2. Pool PHP-FPM : `open_basedir`

`deploy/php-fpm-dp-fede.conf` ajoute `/var/lib/dp-fede/` à `open_basedir`
(**seule modification de `deploy/`** de la phase 5, indispensable : sans elle,
PHP-FPM ne peut pas écrire les PDF et les plongées archivées restent en
`documents_status = error`).

```bash
sudo install -o root -g root -m 644 deploy/php-fpm-dp-fede.conf /etc/php/8.2/fpm/pool.d/dp-fede.conf
sudo php-fpm8.2 -t && sudo systemctl reload php8.2-fpm
```

## 3. Sauvegardes

Les PDF archivés ne sont **pas** dans la base : ajouter
`/var/lib/dp-fede/documents` au stockage distant (hook
`backup-upload-rclone.sh` ou équivalent), sinon une perte du disque du Pi fait
perdre les fiches que le club doit conserver un an.

## 4. Migrations

`deploy/deploy-backend.sh` sauvegarde la base puis applique :

| Version | Contenu |
|---|---|
| 007 | `clubs`, `club_members`, `club_invitations`, `users.current_club_id`, `club_id` sur divers/sites/dives ; **reprise** : un club personnel par compte `users.kind='person'` (depuis `users.club_*`), l'utilisateur responsable, ses lignes rattachées ; **un club par structure** (`workspaces`, migration 002 de production) avec ses lignes et ses membres (owner → responsable, member → dp) ; club courant = structure si elle était active sur la dernière session du membre ; `user_id` devient l'auteur (FK `ON DELETE SET NULL`), `created_by` pour les lignes d'une structure. Détail : [php85.md](php85.md#reprise-des-structures) |
| 008 | divers : `source`, `external_id` (unique par club et source), `licence_fin`, `representant_legal`, `autorisation_parentale_saison` |
| 009 | `dives.documents_status`, `dive_documents`, `dive_participants` |
| 010 | `clubs.deleted_at`, `clubs.retention_until` : suppression d'un club avec conservation légale des fiches (A322-72) |

Les fichiers sont idempotents (rejouables après un échec partiel ; pour 007,
vérifié sur MariaDB en coupant la migration après chacune de ses instructions
de données). `deploy/deploy-backend.sh` encadre la reprise par
`bin/workspaces-plan.php` (plan enregistré avant, comparé après : un écart
bloque la bascule du code).
Vérifications après déploiement :

```bash
sudo -u www-data php8.2 /var/www/dp-fede-api/bin/migrate.php --status
sudo mysql dp_fede -e "SELECT COUNT(*) FROM users WHERE current_club_id IS NULL;
                       SELECT COUNT(*) FROM club_members WHERE role='responsable';
                       SELECT COUNT(*) FROM divers WHERE club_id IS NULL;"
```

Attendu : 0 utilisateur sans club courant (le compte-structure, `kind =
'workspace'`, n'en a pas et n'est pas compté s'il est filtré :
`WHERE kind = 'person'`), autant de responsables que de comptes personnes
plus un par structure (production : 18 + 1), 0 plongeur sans club.

> Les colonnes `users.club_*` sont conservées (lecture seule) et pourront être
> supprimées par une migration ultérieure, une fois le nouveau front en place.

**Ordre de mise en production** : le backend phase 5 reste compatible avec le
front actuel (cf. [../api-club.md](../api-club.md#compatibilité-avec-le-front-actuel)) ;
il peut être déployé avant le nouveau front.

## 5. Tâches planifiées

**Obligatoire** — ajouter à `/etc/cron.d/dp-fede` (le fichier versionné
`deploy/cron.example` n'a pas été modifié). C'est le filet de sécurité de
l'archivage A322-72 : une génération interrompue (worker FPM tué par
`request_terminate_timeout`, mémoire insuffisante) laisse la plongée en
`pending` / `error` jusqu'à ce passage :

```cron
# Toutes les heures à :40 — reprise des PDF archivés en échec ou bloqués.
40 * * * * www-data /usr/bin/php8.2 /var/www/dp-fede-api/bin/documents.php --retry >> /var/log/dp-fede-purge.log 2>&1
```

Rattrapage ponctuel des plongées archivées avant la phase 5 (moins d'un an) :

```bash
sudo -u www-data php8.2 /var/www/dp-fede-api/bin/documents.php --backfill --dry-run
sudo -u www-data php8.2 /var/www/dp-fede-api/bin/documents.php --backfill --limit=200
```

`bin/purge.php` (cron existant) purge désormais aussi les invitations closes
depuis plus de 30 jours et les clubs supprimés dont la conservation légale est
échue (fiches et PDF compris), et supprime les fichiers PDF des plongées qu'il
purge.

## 6. Points de vigilance

- Génération PDF après la réponse : `fastcgi_finish_request()` (PHP-FPM).
  Le travail reste borné par `request_terminate_timeout = 60s` et
  `memory_limit = 128M` du pool (deux PDF mPDF à la suite sur le Pi). Surveiller
  `/var/log/dp-fede-php.log` et `SELECT documents_status, COUNT(*) FROM dives
  GROUP BY documents_status` les premières semaines ; en cas d'échecs
  répétés, relever ces deux limites dans `deploy/php-fpm-dp-fede.conf`.
- `upload_max_filesize = 1M` du pool = taille maximale d'un import CSV.
- Fuseau : `expires_at` des invitations et `NOW()` MariaDB doivent être dans
  le même fuseau que PHP (cf. `date.timezone` dans le pool).
