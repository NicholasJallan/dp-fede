<?php
declare(strict_types=1);

/**
 * Applique les migrations SQL en attente (backend/migrations/NNN_*.sql).
 *
 * Usage (sur le Pi, en tant que www-data pour lire /etc/dp-fede/config.php) :
 *   sudo -u www-data php8.2 /var/www/dp-fede-api/bin/migrate.php
 *   sudo -u www-data php8.2 /var/www/dp-fede-api/bin/migrate.php --status
 *
 * Variable d'environnement DP_FEDE_CONFIG : autre fichier de config (ex. base
 * temporaire lors d'un test de restauration, cf. deploy/restore.md).
 *
 * Code de sortie : 0 succès, 1 échec, 2 usage.
 */

require __DIR__ . '/cli-bootstrap.php';

$args = array_slice($argv, 1);
$unknown = array_diff($args, ['--status', '--help', '-h']);
if ($unknown || in_array('--help', $args, true) || in_array('-h', $args, true)) {
    fwrite(STDERR, "Usage : php bin/migrate.php [--status]\n");
    exit($unknown ? 2 : 0);
}

try {
    $pdo = Db::get();

    if (in_array('--status', $args, true)) {
        foreach (Migrator::status($pdo) as $version => $info) {
            cli_out(sprintf('%s  %-8s %s', $version, $info['applied'] ? 'appliquée' : 'EN ATTENTE', $info['file']));
        }
        exit(0);
    }

    $done = Migrator::run($pdo, 'cli_out');
    cli_out($done ? 'Migrations appliquées : ' . implode(', ', $done) : 'Schéma à jour, aucune migration en attente.');
    exit(0);
} catch (\Throwable $e) {
    cli_err($e->getMessage());
    exit(1);
}
