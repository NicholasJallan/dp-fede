<?php
declare(strict_types=1);

/**
 * Purges périodiques (cron quotidien, cf. deploy/cron.example et docs/rgpd.md).
 *
 * Usage :
 *   php8.5 bin/purge.php [--dry-run]
 *                        [--soft-deleted-days=N]        défaut 180, 0 = off
 *                        [--archived-dives-years=N]     défaut 0 = off, N ≥ 1
 *                        [--inactive-accounts-years=N]  défaut 0 = off, N ≥ 2
 *
 * Les valeurs par défaut peuvent être fixées dans /etc/dp-fede/config.php :
 *   'retention' => ['soft_deleted_days' => 180, 'archived_dives_years' => 0,
 *                   'inactive_accounts_years' => 0],
 * Les options CLI priment sur la config.
 *
 * Code de sortie : 0 succès, 1 échec, 2 usage.
 */

require __DIR__ . '/cli-bootstrap.php';

$usage = <<<TXT
Usage : php bin/purge.php [--dry-run] [--soft-deleted-days=N]
                          [--archived-dives-years=N] [--inactive-accounts-years=N]

TXT;

if (array_intersect(array_slice($argv, 1), ['--help', '-h'])) {
    fwrite(STDOUT, $usage);
    exit(0);
}

try {
    $config = Config::get('retention');
    $parsed = Retention::parseOptions(array_slice($argv, 1), is_array($config) ? $config : []);
} catch (\Throwable $e) {
    cli_err($e->getMessage());
    exit(1);
}

if ($parsed['errors']) {
    foreach ($parsed['errors'] as $err) cli_err($err);
    fwrite(STDERR, $usage);
    exit(2);
}

$opts = $parsed['options'];
try {
    $counts = Retention::run($opts, new DateTimeImmutable('now'));
} catch (\Throwable $e) {
    cli_err($e->getMessage());
    exit(1);
}

$prefix = $opts['dry_run'] ? '[dry-run] à supprimer' : 'supprimé';
foreach ($counts as $what => $n) {
    cli_out(sprintf('%s : %-22s %d', $prefix, $what, $n));
}
if (!$opts['dry_run']) {
    Log::action('purge.run', ['counts' => $counts, 'options' => $opts]);
}
exit(0);
