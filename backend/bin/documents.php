<?php
declare(strict_types=1);

/**
 * Archivage serveur des fiches (A322-72) — reprise et rattrapage.
 *
 * Usage (sur le Pi, en www-data : écriture dans /var/lib/dp-fede/documents) :
 *   sudo -u www-data php8.5 /var/www/dp-fede-api/bin/documents.php [--dry-run]
 *        [--retry]            plongées en 'error', ou 'pending' depuis plus de 15 min (défaut)
 *        [--backfill]         + plongées archivées sans document de moins d'un an
 *                             (archivées avant la phase 5)
 *        [--dive=ID]          une plongée précise (archivée)
 *        [--limit=N]          nombre maximal de plongées traitées (défaut 50)
 *
 * Cron suggéré (cf. docs/deploy/club-socle.md) : toutes les heures, --retry.
 * Code de sortie : 0 succès (même partiel), 1 erreur fatale, 2 usage.
 */

require __DIR__ . '/cli-bootstrap.php';

$args    = array_slice($argv, 1);
$dry     = in_array('--dry-run', $args, true);
$backfill = in_array('--backfill', $args, true);
$diveId  = null;
$limit   = 50;
foreach ($args as $a) {
    if (in_array($a, ['--dry-run', '--retry', '--backfill'], true)) continue;
    if (preg_match('/^--dive=([0-9a-fA-F-]{36})$/', $a, $m)) { $diveId = $m[1]; continue; }
    if (preg_match('/^--limit=(\d{1,4})$/', $a, $m)) { $limit = max(1, (int)$m[1]); continue; }
    fwrite(STDERR, "Option inconnue : {$a}\nUsage : php bin/documents.php [--dry-run] [--retry] [--backfill] [--dive=ID] [--limit=N]\n");
    exit(2);
}

try {
    if ($diveId !== null) {
        $ids = array_column(Db::all("SELECT id FROM dives WHERE id=? AND status='archived' AND deleted_at IS NULL", [$diveId]), 'id');
    } else {
        $where = "(documents_status = 'error'
                   OR (documents_status = 'pending' AND documents_updated_at < DATE_SUB(NOW(), INTERVAL 15 MINUTE)))";
        if ($backfill) {
            $where = "({$where} OR (documents_status IS NULL
                       AND " . ClubRetention::REFERENCE_SQL . " >= DATE_SUB(NOW(), INTERVAL 1 YEAR)))";
        }
        $ids = array_column(Db::all(
            "SELECT id FROM dives WHERE status='archived' AND deleted_at IS NULL AND {$where}
              ORDER BY COALESCE(date_plongee, created_at) DESC LIMIT {$limit}"
        ), 'id');
    }

    $ok = 0;
    $ko = 0;
    foreach ($ids as $id) {
        if ($dry) { cli_out("[dry-run] à générer : {$id}"); continue; }
        DiveArchive::refreshParticipants((string)$id);
        DiveArchive::setStatus((string)$id, 'pending');
        if (DiveArchive::generateDocuments((string)$id)) {
            $ok++;
            cli_out("documents générés : {$id}");
        } else {
            $ko++;
            cli_err("échec (détail dans /var/log/dp-fede-php.log) : {$id}");
        }
    }
    cli_out(sprintf('%s : %d plongée(s), %d succès, %d échec(s)', $dry ? '[dry-run]' : 'terminé', count($ids), $ok, $ko));
    exit(0);
} catch (\Throwable $e) {
    cli_err($e->getMessage());
    exit(1);
}
