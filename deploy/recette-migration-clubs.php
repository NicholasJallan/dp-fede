<?php
declare(strict_types=1);

// Recette de la reprise « structures → clubs » (migration 007) sur un
// MariaDB JETABLE (jamais la production) : reproduit l'état de production
// (000, 001, 002 appliquées, volumes réels, aucune donnée personnelle),
// applique 003 → 011 et vérifie le résultat (clubs, membres, club courant,
// lignes et auteurs, curseurs de synchro), l'accord avec LegacyWorkspaces
// (plan/verify), la reprise après une coupure à CHAQUE instruction de données
// de 007, l'idempotence et les cas limites.
//
//   DP_RECETTE_DSN='mysql:host=127.0.0.1;port=3306' DP_RECETTE_USER=root \
//   DP_RECETTE_PASS= php deploy/recette-migration-clubs.php
//
// Crée puis supprime des bases nommées dp_recette_* (droits CREATE/DROP requis).

require __DIR__ . '/../backend/lib/Migrator.php';
require __DIR__ . '/../backend/lib/LegacyWorkspaces.php';

const REPO = __DIR__ . '/../backend/migrations';
$opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];
$dsn  = getenv('DP_RECETTE_DSN') ?: 'mysql:host=127.0.0.1;port=3306';
$user = getenv('DP_RECETTE_USER') ?: 'root';
$pass = getenv('DP_RECETTE_PASS') ?: '';

function fresh(string $db): PDO {
    global $opts, $dsn, $user, $pass;
    $db = 'dp_recette_' . $db;
    $root = new PDO($dsn, $user, $pass, $opts);
    $root->exec("DROP DATABASE IF EXISTS {$db}");
    $root->exec("CREATE DATABASE {$db} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    return new PDO("{$dsn};dbname={$db};charset=utf8mb4", $user, $pass, $opts);
}

function prodSchema(PDO $pdo): void {
    $dir = sys_get_temp_dir() . '/dp-prod-mig-' . getmypid();
    @mkdir($dir);
    foreach (['000_initial.sql', '001_dive_runtime_state.sql', '002_workspaces.sql'] as $f) copy(REPO . "/{$f}", "{$dir}/{$f}");
    Migrator::run($pdo, null, $dir);
    array_map('unlink', glob("{$dir}/*.sql")); rmdir($dir);
}

function uuid(): string {
    $b = random_bytes(16);
    $b[6] = chr((ord($b[6]) & 0x0f) | 0x40); $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
}

$failures = 0;
function check(bool $ok, string $msg): void {
    global $failures;
    echo ($ok ? '  ok   ' : '  ÉCHEC ') . $msg . "\n";
    if (!$ok) $failures++;
}

/** Jeu de données calqué sur la production (volumes réels, aucune donnée perso). */
function seedProd(PDO $pdo, bool $edge = false): array {
    $persons = [1, 2, 4, 5, 6, 7, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21];
    $ins = $pdo->prepare('INSERT INTO users (id, google_sub, email, nom, prenom, role, club_nom, urgence_defaut, created_at, kind)
                          VALUES (?,?,?,?,?,?,?,?,?,?)');
    foreach ($persons as $id) {
        $ins->execute([$id, "sub-{$id}", "u{$id}@example.test", "Nom{$id}", "Prenom{$id}", $id === 2 ? 'admin' : 'user',
                       $id === 2 ? 'Club du DP 2' : '', null, '2026-06-01 10:00:00', 'person']);
    }
    $ins->execute([14, 'workspace:beppa-hendaye-2026:0011223344556677', 'structure+beppa-hendaye-2026@dp-fede.invalid',
                   '', '', 'user', 'BEPPA Hendaye 2026', '18', '2026-08-30 09:00:00', 'workspace']);

    $pdo->exec("INSERT INTO workspaces (id, name, slug, join_code, data_user_id, created_by, archived_at, created_at)
                VALUES (1, 'BEPPA Hendaye 2026', 'beppa-hendaye-2026', 'BEPPA-2026', 14, 2, NULL, '2026-08-30 09:00:00')");
    $wm = $pdo->prepare('INSERT INTO workspace_members (workspace_id, user_id, role, joined_at) VALUES (1,?,?,?)');
    foreach ([2 => 'owner', 6 => 'member', 15 => 'member', 16 => 'member', 18 => 'member', 19 => 'member', 20 => 'member'] as $u => $r) {
        $wm->execute([$u, $r, '2026-08-31 08:00:00']);
    }
    if ($edge) {
        // Structure archivée (owner 4, membre 5) et structure sans owner (créée par 9, membre 10).
        $ins->execute([30, 'workspace:old:1', 'structure+old@dp-fede.invalid', '', '', 'user', 'Ancien stage', '18', '2026-06-01 00:00:00', 'workspace']);
        $ins->execute([31, 'workspace:orphan:1', 'structure+orphan@dp-fede.invalid', '', '', 'user', 'Sortie club', '112', '2026-06-01 00:00:00', 'workspace']);
        $pdo->exec("INSERT INTO workspaces (id, name, slug, join_code, data_user_id, created_by, archived_at)
                    VALUES (2, 'Ancien stage', 'ancien-stage', 'OLD-1', 30, 4, '2026-07-01 00:00:00'),
                           (3, 'Sortie club', 'sortie-club', 'SORTIE-1', 31, 9, NULL)");
        $pdo->exec("INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (2,4,'owner'),(2,5,'member'),(3,10,'member'),(3,9,'member')");
    }

    $now = time();
    $sess = $pdo->prepare('INSERT INTO sessions (id, user_id, expires_at, workspace_id) VALUES (?,?,?,?)');
    $s = static fn(int $u, int $days, ?int $ws) => $sess->execute([bin2hex(random_bytes(32)), $u, date('Y-m-d H:i:s', $now + $days * 86400), $ws]);
    $s(2, 2, null); $s(2, 6, 1);      // dernière session de 2 : dans la structure
    $s(6, 5, null); $s(6, 1, 1);      // dernière session de 6 : personnelle
    $s(15, -1, 1);                    // session expirée
    $s(16, 3, 1);                     // 16 : dans la structure
    $s(19, 4, 1); $s(19, 4, null);    // égalité d'expiration : structure ou perso (indifférent, doit rester cohérent)
    if ($edge) { $s(5, 3, 2); $s(10, 3, 3); }

    $diverCounts = [2 => 10, 4 => 5, 5 => 2, 6 => 1, 9 => 1, 10 => 2, 14 => 20];
    if ($edge) $diverCounts += [30 => 2, 31 => 1];
    $d = $pdo->prepare('INSERT INTO divers (id, user_id, nom, prenom, licence, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)');
    $i = 0;
    foreach ($diverCounts as $u => $n) {
        for ($k = 0; $k < $n; $k++, $i++) {
            // Plongeurs du stage : créés par 2, 6, 15… ; certains sans auteur connu ; un auteur supprimé (999).
            $by = $u === 14 ? [2, 6, 15, 16, null, 999][$k % 6] : ($u >= 30 ? 5 : null);
            $d->execute([uuid(), $u, "Plongeur{$i}", "P{$i}", "L{$i}", $by, '2026-07-01 10:00:00', sprintf('2026-09-0%d 1%d:00:00', 1 + $k % 5, $k % 10)]);
        }
    }

    $st = $pdo->prepare('INSERT INTO sites (id, user_id, nom, created_by, updated_at) VALUES (?,?,?,?,?)');
    foreach ([[2, null], [2, 2], [14, 2], [14, null], [4, null]] as $j => [$u, $by]) $st->execute([uuid(), $u, "Site{$j}", $by, '2026-08-1' . $j . ' 10:00:00']);

    $diveCounts = [2 => 19, 4 => 2, 5 => 2, 10 => 1, 14 => 7, 21 => 1];
    if ($edge) $diveCounts += [30 => 1];
    if ($edge) {
        // Même auteur, même client_uuid dans DEUX structures (rejeu d'outbox) :
        // l'index (user_id, client_uuid) ne doit pas faire échouer 007.
        $twin = uuid();
        $ins2 = $pdo->prepare("INSERT INTO dives (id, user_id, client_uuid, site_nom, status, created_by) VALUES (?,?,?,?,'prepared',6)");
        $ins2->execute(['00000000-0000-4000-8000-000000000001', 14, $twin, 'Jumeau A']);
        $ins2->execute(['00000000-0000-4000-8000-000000000002', 31, $twin, 'Jumeau B']);
    }
    // 8 plongées avec created_by : 6 du stage, 2 personnelles.
    $createdBy = [14 => [2, 2, 6, 15, 16, 2, null], 2 => [2], 4 => [4]];
    $v = $pdo->prepare('INSERT INTO dives (id, user_id, client_uuid, site_nom, date_plongee, status, answers, palanquees, created_by, updated_at, created_at)
                        VALUES (?,?,?,?,?,?,?,?,?,?,?)');
    $rs = $pdo->prepare('INSERT INTO dive_runtime_state (dive_id, state) VALUES (?,?)');
    $sharedUuid = uuid();
    foreach ($diveCounts as $u => $n) {
        for ($k = 0; $k < $n; $k++) {
            $id = uuid();
            $client = ($edge && $u === 14 && $k === 0) || ($edge && $u === 2 && $k === 1) ? $sharedUuid : uuid();
            $by = $createdBy[$u][$k] ?? ($u >= 30 ? 4 : null);
            $status = $k % 3 === 0 ? 'archived' : ($k % 3 === 1 ? 'in_progress' : 'prepared');
            $v->execute([$id, $u, $client, "Site {$u}/{$k}", '2026-09-04 10:00:00', $status, '{"dp_nom":"x"}', '[]', $by,
                         sprintf('2026-09-0%d 0%d:00:00', 1 + $k % 5, $k % 10), '2026-09-01 08:00:00']);
            if ($k % 2 === 0) $rs->execute([$id, '{"pressions":{"a":"50"}}']);
        }
    }
    return ['persons' => $persons];
}

function snapshot(PDO $pdo): array {
    $out = [];
    foreach (['divers', 'sites', 'dives'] as $t) {
        $rows = $pdo->query("SELECT id, updated_at FROM {$t} ORDER BY id")->fetchAll();
        $out[$t] = array_column($rows, 'updated_at', 'id');
    }
    $out['runtime'] = $pdo->query('SELECT dive_id, state FROM dive_runtime_state ORDER BY dive_id')->fetchAll();
    return $out;
}

/** État normalisé (indépendant des UUID de clubs) pour comparer deux exécutions. */
function normalized(PDO $pdo): array {
    $key = "COALESCE(CONCAT('perso:', c.auto_created_for), CONCAT('ws:', c.legacy_workspace_id), c.id)";
    return [
        'clubs'   => $pdo->query("SELECT {$key} AS k, c.nom, c.urgence_defaut FROM clubs c ORDER BY k")->fetchAll(),
        'members' => $pdo->query("SELECT {$key} AS k, m.user_id, m.role FROM club_members m JOIN clubs c ON c.id = m.club_id ORDER BY k, m.user_id")->fetchAll(),
        'current' => $pdo->query("SELECT u.id, {$key} AS k FROM users u LEFT JOIN clubs c ON c.id = u.current_club_id ORDER BY u.id")->fetchAll(),
        'rows'    => array_merge(...array_map(fn($t) => $pdo->query("SELECT '{$t}' AS t, x.id, x.user_id, x.updated_at, {$key} AS k FROM {$t} x JOIN clubs c ON c.id = x.club_id ORDER BY x.id")->fetchAll(), ['divers', 'sites', 'dives'])),
    ];
}

function clubOf(PDO $pdo, string $where): ?string {
    $r = $pdo->query("SELECT id FROM clubs WHERE {$where}")->fetch();
    return $r ? $r['id'] : null;
}

// ═══ 1. Production ══════════════════════════════════════════════════════════
echo "── Scénario production (volumes réels)\n";
$pdo = fresh('prod');
prodSchema($pdo);
seedProd($pdo);
$before = snapshot($pdo);
$plan = LegacyWorkspaces::plan(LegacyWorkspaces::snapshot($pdo));
$plan = json_decode(json_encode($plan), true);   // aller-retour JSON comme bin/workspaces-plan.php
$applied = Migrator::run($pdo);
$diff = LegacyWorkspaces::verify($plan, $pdo);
check($diff === [], 'plan (LegacyWorkspaces) = résultat SQL' . ($diff ? ' : ' . implode(' ; ', $diff) : ''));
check($plan['warnings'] === [], 'plan sans avertissement');
check($applied === ['003', '004', '005', '006', '007', '008', '009', '010', '011'], 'migrations appliquées : ' . implode(',', $applied));
$after = snapshot($pdo);
check($before['divers'] === $after['divers'] && $before['sites'] === $after['sites'] && $before['dives'] === $after['dives'],
      'aucune ligne perdue, updated_at (curseurs de synchro) inchangés');
check($before['runtime'] == $after['runtime'], 'dive_runtime_state intact');

$ws = clubOf($pdo, 'legacy_workspace_id = 1');
check($ws !== null, 'club « BEPPA Hendaye 2026 » créé');
$c = $pdo->query("SELECT * FROM clubs WHERE id = '{$ws}'")->fetch();
check($c['nom'] === 'BEPPA Hendaye 2026' && $c['urgence_defaut'] === '18' && $c['auto_created_for'] === null, 'nom et numéro d\'urgence repris du compte-structure');
check((int)$pdo->query('SELECT COUNT(*) FROM clubs')->fetchColumn() === 19, '19 clubs (18 personnels + 1 structure)');
check((int)$pdo->query('SELECT COUNT(*) FROM clubs WHERE auto_created_for = 14')->fetchColumn() === 0
      && (int)$pdo->query('SELECT COUNT(*) FROM club_members WHERE user_id = 14')->fetchColumn() === 0, 'aucun club ni adhésion pour le compte-structure');
$members = $pdo->query("SELECT user_id, role FROM club_members WHERE club_id = '{$ws}' ORDER BY user_id")->fetchAll(PDO::FETCH_KEY_PAIR);
check($members == [2 => 'responsable', 6 => 'dp', 15 => 'dp', 16 => 'dp', 18 => 'dp', 19 => 'dp', 20 => 'dp'], 'membres : 2 responsable, 6/15/16/18/19/20 dp');
check((int)$pdo->query("SELECT COUNT(*) FROM club_members m JOIN clubs c ON c.id = m.club_id WHERE c.auto_created_for = m.user_id AND m.role = 'responsable'")->fetchColumn() === 18,
      'chaque personne responsable de son club personnel');
$cur = $pdo->query("SELECT u.id, IF(u.current_club_id = '{$ws}', 'ws', IF(c.auto_created_for = u.id, 'perso', '?')) FROM users u LEFT JOIN clubs c ON c.id = u.current_club_id WHERE u.kind = 'person' ORDER BY u.id")->fetchAll(PDO::FETCH_KEY_PAIR);
check($cur[2] === 'ws' && $cur[16] === 'ws' && $cur[6] === 'perso' && $cur[15] === 'perso' && $cur[18] === 'perso' && $cur[1] === 'perso', 'club courant : structure pour 2 et 16 (session la plus récente), personnel pour 6, 15, 18…');
check(in_array($cur[19], ['ws', 'perso'], true), 'égalité d\'expiration de session : club courant valide (' . $cur[19] . ')');
check((int)$pdo->query("SELECT COUNT(*) FROM users WHERE kind = 'person' AND current_club_id IS NULL")->fetchColumn() === 0, 'tout compte personne a un club courant');
check($pdo->query('SELECT current_club_id FROM users WHERE id = 14')->fetchColumn() === null, 'compte-structure sans club courant');

$perClub = static fn(string $t) => $pdo->query("SELECT IF(x.club_id = '{$ws}', 'ws', c.auto_created_for) AS k, COUNT(*) FROM {$t} x JOIN clubs c ON c.id = x.club_id GROUP BY k ORDER BY k")->fetchAll(PDO::FETCH_KEY_PAIR);
check($perClub('dives') == ['10' => 1, '2' => 19, '21' => 1, '4' => 2, '5' => 2, 'ws' => 7], 'plongées par club : {2:19, 4:2, 5:2, 10:1, 21:1, structure:7}');
check($perClub('divers') == ['10' => 2, '2' => 10, '4' => 5, '5' => 2, '6' => 1, '9' => 1, 'ws' => 20], 'plongeurs par club : {2:10, 4:5, 5:2, 6:1, 9:1, 10:2, structure:20}');
check($perClub('sites') == ['2' => 2, '4' => 1, 'ws' => 2], 'sites par club');
foreach (['divers', 'sites', 'dives'] as $t) {
    check((int)$pdo->query("SELECT COUNT(*) FROM {$t} WHERE user_id = 14")->fetchColumn() === 0, "{$t} : plus aucune ligne attribuée au compte-structure");
    check((int)$pdo->query("SELECT COUNT(*) FROM {$t} x JOIN users a ON a.id = x.user_id WHERE x.club_id = '{$ws}' AND (x.created_by IS NULL OR a.id <> x.created_by)")->fetchColumn() === 0, "{$t} : auteur = created_by");
}
check($pdo->query("SELECT GROUP_CONCAT(COALESCE(user_id, 'NULL') ORDER BY user_id) FROM dives WHERE club_id = '{$ws}'")->fetchColumn() === 'NULL,2,2,2,6,15,16', 'plongées du stage : auteurs 2,2,2,6,15,16 + 1 inconnu (NULL)');
check((int)$pdo->query("SELECT COUNT(*) FROM divers WHERE club_id = '{$ws}' AND user_id IS NULL")->fetchColumn() === 6, 'plongeurs du stage sans auteur connu (NULL ou compte supprimé 999) : 6');
check((int)$pdo->query('SELECT COUNT(*) FROM dives WHERE created_by IS NOT NULL')->fetchColumn() === 8, '8 plongées avec created_by (colonne conservée)');
check((int)$pdo->query('SELECT COUNT(*) FROM workspaces')->fetchColumn() === 1 && (int)$pdo->query('SELECT COUNT(*) FROM workspace_members')->fetchColumn() === 7, 'tables workspaces conservées (pas de DROP)');

// Idempotence : rejouer 007 → 011 ne change rien.
$norm = normalized($pdo);
foreach (['007_clubs', '008_divers_club_fields', '009_dive_archive', '010_clubs_soft_delete', '011_dives_client_uuid_club'] as $f) {
    foreach (Migrator::splitStatements((string)file_get_contents(REPO . "/{$f}.sql")) as $stmt) $pdo->exec($stmt);
}
check(normalized($pdo) == $norm, 'rejouer 007 → 011 sur une base migrée : aucun changement');

// ═══ 2. Reprise après échec partiel ═════════════════════════════════════════
echo "── Échec partiel de 007 puis reprise\n";
$stmts = Migrator::splitStatements((string)file_get_contents(REPO . '/007_clubs.sql'));
$cuts = [];
foreach ($stmts as $i => $s) {
    if (preg_match('/^(UPDATE|INSERT|ALTER TABLE \w+\s+MODIFY)/', $s)) $cuts[] = $i;
}
$ref = null;
foreach ($cuts as $cut) {
    $p = fresh('partial');
    prodSchema($p);
    // Même jeu de données à chaque essai (UUID différents, comparaison normalisée).
    seedProd($p);
    $dir = sys_get_temp_dir() . '/dp-mig-partial-' . getmypid();
    @mkdir($dir);
    foreach (glob(REPO . '/*.sql') as $f) {
        if ((int)basename($f) >= 7) continue;
        copy($f, $dir . '/' . basename($f));
    }
    Migrator::run($p, null, $dir);   // 003 → 006
    array_map('unlink', glob("{$dir}/*.sql")); rmdir($dir);
    foreach (array_slice($stmts, 0, $cut + 1) as $s) $p->exec($s);   // 007 interrompue après l'instruction $cut
    Migrator::run($p);                                                // reprise complète
    $n = normalized($p);
    $n['rows'] = array_map(static fn($r) => [$r['t'], $r['user_id'], $r['k']], $n['rows']);
    usort($n['rows'], static fn($a, $b) => $a <=> $b);
    $summary = json_encode([$n['clubs'], $n['members'], $n['current'], $n['rows']]);
    if ($ref === null) $ref = $summary;
    if ($summary !== $ref) { check(false, "reprise après coupure à l'instruction {$cut} : état final différent"); }
}
check(true, 'reprise après coupure à chacune des ' . count($cuts) . ' instructions de données : état final identique');

// ═══ 3. Cas limites ═════════════════════════════════════════════════════════
echo "── Cas limites (structure archivée, sans owner, conflit client_uuid)\n";
$e = fresh('edge');
prodSchema($e);
seedProd($e, true);
$planE = json_decode(json_encode(LegacyWorkspaces::plan(LegacyWorkspaces::snapshot($e))), true);
Migrator::run($e);
$diffE = LegacyWorkspaces::verify($planE, $e);
check($diffE === [], 'cas limites : plan = résultat SQL' . ($diffE ? ' : ' . implode(' ; ', $diffE) : ''));
$old = clubOf($e, 'legacy_workspace_id = 2');
$orphan = clubOf($e, 'legacy_workspace_id = 3');
check($e->query("SELECT GROUP_CONCAT(user_id, ':', role) FROM club_members WHERE club_id = '{$old}'")->fetchColumn() === '4:responsable', 'structure archivée : seul l\'owner est repris');
check($e->query("SELECT current_club_id FROM users WHERE id = 5")->fetchColumn() === clubOf($e, 'auto_created_for = 5'), 'membre d\'une structure archivée : club personnel');
check($e->query("SELECT GROUP_CONCAT(user_id, ':', role ORDER BY user_id) FROM club_members WHERE club_id = '{$orphan}'")->fetchColumn() === '9:responsable,10:dp', 'structure sans owner : créateur promu responsable');
check($e->query("SELECT current_club_id FROM users WHERE id = 10")->fetchColumn() === $orphan, 'structure active dans la dernière session : club courant');
check((int)$e->query("SELECT COUNT(*) FROM dives WHERE club_id = (SELECT id FROM clubs WHERE legacy_workspace_id = 1) AND user_id IS NULL")->fetchColumn() === 2,
      'conflit (auteur, client_uuid) avec une plongée personnelle : auteur NULL au lieu d\'un échec');
check((int)$e->query('SELECT COUNT(*) FROM dives')->fetchColumn() === 35, 'aucune plongée perdue (35)');
check($e->query("SELECT GROUP_CONCAT(COALESCE(user_id, 'NULL') ORDER BY id) FROM dives WHERE site_nom LIKE 'Jumeau%'")->fetchColumn() === '6,NULL',
      'même (auteur, client_uuid) dans deux structures : la première garde l\'auteur, la seconde NULL');

echo $failures === 0 ? "\nTOUT EST VERT\n" : "\n{$failures} ÉCHEC(S)\n";
exit($failures === 0 ? 0 : 1);
