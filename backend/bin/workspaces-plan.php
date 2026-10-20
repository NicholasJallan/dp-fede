<?php
declare(strict_types=1);

/**
 * Garde-fou de la reprise « structures → clubs » (migration 007).
 *
 *   php bin/workspaces-plan.php                 affiche le plan (lecture seule)
 *   php bin/workspaces-plan.php --save FICHIER  enregistre le plan AVANT migration
 *   php bin/workspaces-plan.php --verify FICHIER compare la base migrée au plan
 *
 * --save est sans effet (code 0, rien d'écrit) si la base est déjà migrée
 * (table clubs présente) ou n'a jamais connu les structures (pas de table
 * workspaces). --verify sort en 1 au moindre écart : deploy/deploy-backend.sh
 * ne bascule alors pas le code (restaurer la sauvegarde prise juste avant).
 *
 * Usage sur le Pi : sudo -u www-data php8.5 /var/www/dp-fede-api-release/bin/workspaces-plan.php
 * Code de sortie : 0 succès, 1 échec ou écart, 2 usage.
 */

require __DIR__ . '/cli-bootstrap.php';

$args = array_slice($argv, 1);
$mode = $args[0] ?? '';
$file = $args[1] ?? '';
if (!in_array($mode, ['', '--save', '--verify'], true) || ($mode !== '' && $file === '')) {
    fwrite(STDERR, "Usage : php bin/workspaces-plan.php [--save FICHIER | --verify FICHIER]\n");
    exit(2);
}

function table_exists(PDO $pdo, string $table): bool
{
    $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
    $st->execute([$table]);
    return (int)$st->fetchColumn() > 0;
}

function print_plan(array $plan): void
{
    foreach ($plan['clubs'] as $key => $c) {
        $rows = [];
        foreach ($plan['rows'] as $table => $buckets) {
            $n = 0;
            foreach ($buckets as $bucket => $count) if (strpos($bucket, $key . '|') === 0) $n += $count;
            $rows[] = "{$table} {$n}";
        }
        $members = implode(', ', array_map(static fn($u, $r) => "{$u}:{$r}", array_keys($c['members']), $c['members']));
        cli_out(sprintf('%-10s membres [%s] — %s', $key, $members, implode(', ', $rows)));
    }
    $current = array_filter($plan['current'], static fn(string $k): bool => strpos($k, 'ws:') === 0);
    cli_out('Club courant = club de structure pour : ' . ($current ? implode(', ', array_map(static fn($u, $k) => "{$u} → {$k}", array_keys($current), $current)) : 'personne'));
    foreach ($plan['warnings'] as $w) cli_out("ATTENTION : {$w}");
}

try {
    $pdo = Db::get();

    if ($mode === '--verify') {
        $plan = json_decode((string)@file_get_contents($file), true);
        if (!is_array($plan)) { cli_err("plan illisible : {$file}"); exit(1); }
        $diff = LegacyWorkspaces::verify($plan, $pdo);
        foreach ($diff as $d) cli_err($d);
        if ($diff) exit(1);
        cli_out('Reprise conforme au plan (' . count($plan['clubs']) . ' clubs).');
        exit(0);
    }

    if (table_exists($pdo, 'clubs') || !table_exists($pdo, 'workspaces')) {
        cli_out('Rien à planifier : base déjà migrée vers les clubs, ou sans structures.');
        exit(0);
    }

    $plan = LegacyWorkspaces::plan(LegacyWorkspaces::snapshot($pdo));
    print_plan($plan);
    if ($mode === '--save') {
        if (file_put_contents($file, json_encode($plan, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE)) === false) {
            cli_err("écriture impossible : {$file}");
            exit(1);
        }
        cli_out("Plan enregistré : {$file}");
    }
    exit(0);
} catch (\Throwable $e) {
    cli_err($e->getMessage());
    exit(1);
}
