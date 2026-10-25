<?php
declare(strict_types=1);

// Recette des écritures de plongées et de la conservation sur le VRAI MariaDB
// du Pi, dans une base JETABLE (jamais dp_fede) : DiveService (transactions,
// verrou de ligne, validation à l'archivage), index unique client_uuid,
// archivage (participants, PDF réellement générés par mPDF, numéro d'urgence
// du PDF), purge à 5 ans (Retention / ClubRetention).
//
// Sur le Pi, avec le code déployé (vendor/ compris) :
//   sudo php8.5 deploy/recette-dives.php [/var/www/dp-fede-api]
//
// Connexion root par socket Unix (sudo) ; crée puis supprime la base
// dp_recette_dives et un dossier de documents temporaire.

$app = rtrim($argv[1] ?? '/var/www/dp-fede-api', '/');
require $app . '/vendor/autoload.php';

const DB_NAME = 'dp_recette_dives';
const SOCKET  = 'mysql:unix_socket=/run/mysqld/mysqld.sock';
$opts = [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION, PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC];

$failures = 0;
function check(bool $ok, string $msg): void {
    global $failures;
    echo ($ok ? '  ok     ' : '  ÉCHEC  ') . $msg . "\n";
    if (!$ok) $failures++;
}
function section(string $t): void { echo "\n== {$t}\n"; }
function uuid(): string { return Db::uuid(); }
/** Refus attendu : renvoie l'exception (ou null si aucune). */
function refusal(callable $fn): ?Throwable {
    try { $fn(); } catch (Throwable $e) { return $e; }
    return null;
}

$root = new PDO(SOCKET, 'root', '', $opts);
$root->exec('DROP DATABASE IF EXISTS ' . DB_NAME);
$root->exec('CREATE DATABASE ' . DB_NAME . ' CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci');
$docs = sys_get_temp_dir() . '/dp-recette-docs-' . bin2hex(random_bytes(4));
mkdir($docs, 0700, true);

try {
    $pdo = new PDO(SOCKET . ';dbname=' . DB_NAME . ';charset=utf8mb4', 'root', '', $opts);
    $pdo->exec("SET time_zone = '+01:00'");
    (new ReflectionProperty(Db::class, 'pdo'))->setValue(null, $pdo);
    (new ReflectionProperty(Config::class, 'cfg'))->setValue(null, [
        'app'       => ['domain' => 'dp-fede.bullesenvalais.ch'],
        'documents' => ['path' => $docs],
    ]);
    $logged = [];
    Log::capture(function (string $kind, ?array $ctx) use (&$logged): void { $logged[] = [$kind, $ctx]; });

    section('Schéma');
    Migrator::run($pdo, null, $app . '/migrations');
    $applied = (int)$pdo->query('SELECT COUNT(*) FROM schema_migrations')->fetchColumn();
    check($applied === count(glob($app . '/migrations/*.sql')), "toutes les migrations appliquées ({$applied})");

    // ── Jeu de données : un club, un DP E3, un GP, deux N2 ───────────────────
    $club = uuid();
    $pdo->prepare("INSERT INTO clubs (id, nom, structure_type, urgence_defaut) VALUES (?,'Club recette','club',NULL)")->execute([$club]);
    $pdo->prepare("INSERT INTO users (id, google_sub, email, nom, prenom, role, kind, current_club_id) VALUES (1,'g1','dp@recette.test','Recette','DP','user','person',?)")->execute([$club]);
    $pdo->prepare("INSERT INTO club_members (club_id, user_id, role) VALUES (?,1,'responsable')")->execute([$club]);
    $diver = $pdo->prepare('INSERT INTO divers (id, club_id, user_id, nom, prenom, niveau_plongeur, niveau_encadrant, qualifs, aptitudes_sup, medical, date_naissance)
                            VALUES (?,?,1,?,?,?,?,\'{"nitrox":[],"trimix":[]}\',\'[]\',?,?)');
    $ids = [];
    foreach ([['dp', 'Directeur', 'N3', 'E3'], ['gp', 'Guide', 'N3', 'N4'], ['a', 'Plongeur A', 'N2', null], ['b', 'Plongeur B', 'N2', null]] as [$k, $nom, $np, $ne]) {
        $ids[$k] = uuid();
        $diver->execute([$ids[$k], $club, $nom, 'Test', $np, $ne, date('Y-m-d', strtotime('-2 months')), '1985-04-12']);
    }
    $answers = ['date' => date('Y-m-d') . 'T10:00', 'milieu' => 'Lac', 'dp_id' => $ids['dp'], 'dp_qual' => 'E3', 'dp_nom' => 'Test DIRECTEUR', 'site_nom' => 'Lac recette'];
    $valid = [['id' => 'p1', 'profMax' => 30, 'duree' => 40, 'dtr' => 3, 'melanges' => ['Air'], 'membres' => [
        ['diverId' => $ids['gp'], 'aptitude' => 'GP'],
        ['diverId' => $ids['a'], 'aptitude' => 'PE40'],
        ['diverId' => $ids['b'], 'aptitude' => 'PE40'],
    ]]];
    $solo = [['id' => 'p1', 'profMax' => 20, 'melanges' => ['Air'], 'membres' => [['diverId' => $ids['a'], 'aptitude' => 'PE40']]]];
    $status = fn(string $id): array => Db::row('SELECT status, closed_at, documents_status, answers FROM dives WHERE id=?', [$id]) ?? [];

    section('Création (POST)');
    $cu = uuid();
    $c = DiveService::create($club, '1', ['client_uuid' => $cu, 'status' => 'prepared', 'date_plongee' => $answers['date'],
        'answers' => $answers, 'palanquees' => $solo, 'render_state' => ['heuresDebut' => []], 'site_nom' => 'Lac recette ' . str_repeat('é', 300)]);
    $row = Db::row('SELECT d.site_nom, r.state FROM dives d LEFT JOIN dive_runtime_state r ON r.dive_id=d.id WHERE d.id=?', [$c['id']]);
    check($row !== null && $row['state'] !== null, 'plongée + état d\'exécution écrits ensemble');
    check(mb_strlen((string)$row['site_nom']) === 255 && mb_check_encoding((string)$row['site_nom'], 'UTF-8'), 'site_nom tronqué à 255 caractères sans couper un caractère UTF-8');
    $dup = refusal(fn() => DiveService::create($club, '1', ['client_uuid' => $cu, 'status' => 'prepared', 'answers' => $answers]));
    check($dup instanceof PDOException && (string)$dup->getCode() === '23000', 'client_uuid rejoué : index unique (23000), rattrapé par la route');
    check((int)Db::row('SELECT COUNT(*) n FROM dives')['n'] === 1, 'rejeu : aucune ligne de plus (transaction annulée)');

    section('Mise à l\'eau puis archivage refusé');
    $r = DiveService::patch($club, $c['id'], ['status' => 'in_progress', 'started_at' => date('c')]);
    check($r['status'] === 'in_progress', 'in_progress envoyé seul accepté malgré une palanquée invalide (jamais de refus à la mise à l\'eau)');
    $e = refusal(fn() => DiveService::patch($club, $c['id'], ['status' => 'archived'], fn() => null));
    check($e instanceof DiveRefusal && $e->httpStatus === 422, 'PATCH {status: archived} seul, palanquée stockée invalide → 422 (' . ($e ? $e->getMessage() : 'aucun refus') . ')');
    check(($status($c['id'])['status'] ?? null) === 'in_progress' && $status($c['id'])['closed_at'] === null, 'refus : statut et closed_at inchangés (rollback réel)');
    check(!$pdo->inTransaction(), 'aucune transaction laissée ouverte');

    section('Verrou de ligne (SELECT … FOR UPDATE)');
    $other = new PDO(SOCKET . ';dbname=' . DB_NAME . ';charset=utf8mb4', 'root', '', $opts);
    $other->beginTransaction();
    $other->prepare('SELECT id FROM dives WHERE id=? FOR UPDATE')->execute([$c['id']]);
    $pdo->exec('SET SESSION innodb_lock_wait_timeout = 1');
    $t0 = microtime(true);
    $e = refusal(fn() => DiveService::patch($club, $c['id'], ['site_nom' => 'pendant le verrou']));
    check($e instanceof PDOException && microtime(true) - $t0 >= 0.9, 'PATCH bloqué tant qu\'une autre connexion tient la ligne (attente de verrou)');
    $other->rollBack();
    $pdo->exec('SET SESSION innodb_lock_wait_timeout = 50');
    check(DiveService::patch($club, $c['id'], ['site_nom' => 'après le verrou'])['status'] === 'in_progress', 'verrou relâché : PATCH appliqué');

    section('Archivage valide, PDF réels');
    $archivedIds = [];
    $r = DiveService::patch($club, $c['id'], ['status' => 'archived', 'palanquees' => $valid, 'answers' => $answers + ['site_pays_code' => '']],
        function (string $id) use (&$archivedIds): void { $archivedIds[] = $id; });
    $s = $status($c['id']);
    check($s['status'] === 'archived' && $s['closed_at'] !== null && $s['documents_status'] === 'pending', 'archived, closed_at serveur et documents_status « pending » posés ensemble');
    check($archivedIds === [$c['id']], 'onArchived appelé une fois, après COMMIT');
    DiveArchive::refreshParticipants($c['id']);
    check((int)Db::row('SELECT COUNT(*) n FROM dive_participants WHERE dive_id=?', [$c['id']])['n'] === 4, 'participants calculés (DP + 3 membres)');
    $ok = DiveArchive::generateDocuments($c['id']);
    check($ok && $status($c['id'])['documents_status'] === 'ok', 'fiche et check-list générées par mPDF, documents_status ok');
    $pdfs = glob($docs . '/**/*.pdf') ?: [];
    $pdfs = array_merge($pdfs, glob($docs . '/*/*/*.pdf') ?: [], glob($docs . '/*/*/*/*.pdf') ?: []);
    check(count(array_unique($pdfs)) >= 2, 'deux PDF sur disque (' . count(array_unique($pdfs)) . ')');
    $dive = DivePdf::loadForClub($c['id'], $club);
    $tpl = (new ReflectionMethod(DivePdf::class, 'renderTemplate'));
    $html = $tpl->invoke(null, $app . '/templates/fiche.php', [
        'answers' => json_decode($dive['answers'], true), 'palanquees' => json_decode($dive['palanquees'], true),
        'renderState' => [], 'diversById' => [], 'user' => DivePdf::clubProfile($club),
    ]);
    check(str_contains($html, 'URGENCE : 112'), 'PDF, pays inconnu et club sans numéro : URGENCE 112 (décision du 25/10/2026)');
    check(!str_contains($html, '196 (CROSS)'), 'PDF, lac : pas de CROSS');

    section('Plongée archivée figée (A322-72)');
    $before = $status($c['id'])['answers'];
    DiveService::patch($club, $c['id'], ['answers' => ['dp_nom' => 'falsifié'], 'drive_link' => 'https://drive.example/x']);
    check($status($c['id'])['answers'] === $before, 'answers ignorées sur une plongée archivée, drive_link accepté');
    $e = refusal(fn() => DiveService::patch($club, $c['id'], ['status' => 'prepared']));
    check($e instanceof DiveRefusal && $e->errorCode === 'ARCHIVED_IMMUTABLE', 'retour en arrière refusé (ARCHIVED_IMMUTABLE)');
    $n = $pdo->prepare("UPDATE dives SET deleted_at=NOW() WHERE id=? AND club_id=? AND status<>'archived'");
    $n->execute([$c['id'], $club]);
    check($n->rowCount() === 0, 'suppression d\'une plongée archivée sans effet (garde de la route DELETE)');

    section('Plongeur inconnu du club');
    $logged = [];
    $c2 = DiveService::create($club, '1', ['client_uuid' => uuid(), 'status' => 'prepared', 'answers' => $answers]);
    $withGhost = $valid;
    $withGhost[0]['membres'][] = ['diverId' => uuid(), 'aptitude' => 'PE40'];
    DiveService::patch($club, $c2['id'], ['status' => 'archived', 'palanquees' => $withGhost, 'answers' => $answers], fn() => null);
    $kinds = array_column($logged, 0);
    check(($status($c2['id'])['status'] ?? null) === 'archived' && in_array('dive.unknown_divers', $kinds, true), 'archivage accepté, plongeur inconnu journalisé');

    section('Conservation 5 ans (purge)');
    $opts5 = Retention::parseOptions([], [])['options'];
    check($opts5['archived_dives_years'] === 5, 'défaut : 5 ans');
    $old = $c2['id'];
    $pdo->prepare('UPDATE dives SET closed_at = NOW() - INTERVAL 6 YEAR, created_at = NOW() - INTERVAL 6 YEAR WHERE id=?')->execute([$old]);
    $dry = Retention::run(['dry_run' => true] + $opts5, new DateTimeImmutable('now'));
    check(Db::row('SELECT id FROM dives WHERE id=?', [$old]) !== null, 'dry-run : rien supprimé (' . json_encode($dry) . ')');
    Retention::run(['dry_run' => false] + $opts5, new DateTimeImmutable('now'));
    check(Db::row('SELECT id FROM dives WHERE id=?', [$old]) === null, 'plongée archivée de 6 ans purgée');
    check(Db::row('SELECT id FROM dives WHERE id=?', [$c['id']]) !== null, 'plongée archivée du jour conservée');
    $zero = Retention::parseOptions([], ['archived_dives_years' => 0])['options'];
    check($zero['archived_dives_years'] === 0, 'config explicite 0 : purge désactivée');
} finally {
    Log::capture(null);
    $root->exec('DROP DATABASE IF EXISTS ' . DB_NAME);
    exec('rm -rf ' . escapeshellarg($docs));
}

echo "\n" . ($failures === 0 ? 'RECETTE OK' : "RECETTE : {$failures} échec(s)") . "\n";
exit($failures === 0 ? 0 : 1);
