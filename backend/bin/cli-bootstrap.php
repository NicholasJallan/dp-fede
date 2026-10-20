<?php
declare(strict_types=1);

/**
 * Amorçage commun des scripts CLI (bin/migrate.php, bin/purge.php).
 * Refuse toute exécution hors CLI : bin/ n'est jamais servi par nginx (seul
 * index.php l'est), mais on double la garde.
 */
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit(1);
}

error_reporting(E_ALL);
ini_set('display_errors', 'stderr');

// Fuseau des dates de plongée : PHP 8 vaut UTC par défaut (PHP 7.4 devinait
// celui du système). Les dates saisies sont locales (France / Suisse).
// Inconditionnel : en PHP 8, ini_get('date.timezone') vaut « UTC » même sans
// réglage, un test « non défini » ne s'appliquerait jamais.
date_default_timezone_set('Europe/Paris');

$root = dirname(__DIR__);
if (is_file($root . '/vendor/autoload.php')) {
    require_once $root . '/vendor/autoload.php';
}
foreach (['Config', 'Json', 'Db', 'Auth', 'Csrf', 'Validate', 'SyncHelpers', 'RateLimit', 'Log', 'Account', 'Migrator', 'Retention',
          'Club', 'ClubInvitation', 'ClubAlerts', 'ClubStats', 'LevelMapper', 'DiverImport', 'DiverImportPlan',
          'DivePdf', 'DivePolicy', 'DiveStore', 'DiveArchive', 'ClubRetention', 'LegacyWorkspaces'] as $cls) {
    require_once $root . "/lib/{$cls}.php";
}

/** Écrit une ligne horodatée sur stdout. */
function cli_out(string $msg): void
{
    fwrite(STDOUT, '[' . date('Y-m-d H:i:s') . '] ' . $msg . "\n");
}

/** Écrit une erreur sur stderr. */
function cli_err(string $msg): void
{
    fwrite(STDERR, '[' . date('Y-m-d H:i:s') . '] ERREUR : ' . $msg . "\n");
}
