<?php
declare(strict_types=1);

// GET /api/archives — liste des plongées archivées (sans les gros champs JSON)
// Paramètre optionnel ?since=ISO8601 pour pull incrémental.
if ($method === 'GET' && $path === '/api/archives') {
    $user  = Auth::require();
    $since = $_GET['since'] ?? null;
    if ($since) {
        $sinceSql = SyncHelpers::parseSinceParam($since);
        $rows = Db::all(
            'SELECT id, client_uuid, site_nom, date_plongee, dp_nom, dp_qual, activite, drive_link, palanquees, created_at, updated_at
             FROM archives WHERE user_id=? AND updated_at >= ?
             ORDER BY date_plongee DESC, created_at DESC',
            [$user['id'], $sinceSql]
        );
    } else {
        $rows = Db::all(
            'SELECT id, client_uuid, site_nom, date_plongee, dp_nom, dp_qual, activite, drive_link, palanquees, created_at, updated_at
             FROM archives WHERE user_id=? ORDER BY date_plongee DESC, created_at DESC',
            [$user['id']]
        );
    }
    foreach ($rows as &$r) {
        $r['date_plongee'] = normalizeDiveDate($r['date_plongee'] ?? null);
        $pals = json_decode($r['palanquees'] ?? '[]', true) ?: [];
        $r['nb_palanquees'] = count($pals);
        $r['nb_plongeurs']  = (int) array_sum(array_map(fn($p) => count($p['membres'] ?? []), $pals));
        unset($r['palanquees']);
    }
    Json::ok($rows);
}

// GET /api/archives/:id — détail complet
if ($method === 'GET' && preg_match('#^/api/archives/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    $row  = Db::row('SELECT * FROM archives WHERE id=? AND user_id=?', [$m[1], $user['id']]);
    if (!$row) Json::abort(404, 'Archive introuvable');
    $row['answers']      = json_decode($row['answers']    ?? '{}', true) ?? [];
    $row['palanquees']   = json_decode($row['palanquees'] ?? '[]', true) ?? [];
    $row['date_plongee'] = normalizeDiveDate($row['date_plongee'] ?? null);
    Json::ok($row);
}

// POST /api/archives — créer (ou récupérer si déjà créée) une archive.
//
// Idempotence : si le body contient client_uuid et que ce couple
// (user_id, client_uuid) existe déjà, on renvoie 200 avec la ligne
// existante (pas 409, parce que c'est le comportement attendu par
// l'outbox côté client : rejouer = no-op).
//
// drive_link est désormais nullable : l'outbox peut envoyer l'archive
// sans Drive (offline). Un PATCH ultérieur posera le lien quand Drive
// est disponible.
if ($method === 'POST' && $path === '/api/archives') {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();

    $clientUuid = isset($body['client_uuid']) && SyncHelpers::isValidUuid((string)$body['client_uuid'])
        ? (string)$body['client_uuid'] : null;

    if ($clientUuid) {
        $existing = Db::row(
            'SELECT id FROM archives WHERE user_id=? AND client_uuid=?',
            [$user['id'], $clientUuid]
        );
        if ($existing) {
            Json::ok(['id' => $existing['id'], 'duplicate' => true], 200);
        }
    }

    $id = Db::uuid();
    Db::q(
        'INSERT INTO archives (id, user_id, client_uuid, site_nom, date_plongee, dp_nom, dp_qual, activite, answers, palanquees, drive_link)
         VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        [
            $id, $user['id'], $clientUuid,
            substr((string)($body['site_nom']     ?? ''), 0, 255),
            parseDiveDateToMySql((string)($body['date_plongee'] ?? '')),
            substr((string)($body['dp_nom']       ?? ''), 0, 200),
            substr((string)($body['dp_qual']      ?? ''), 0, 20),
            substr((string)($body['activite']     ?? ''), 0, 50),
            json_encode($body['answers']    ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($body['palanquees'] ?? [], JSON_UNESCAPED_UNICODE),
            substr((string)($body['drive_link']   ?? ''), 0, 500),
        ]
    );
    Json::ok(['id' => $id, 'duplicate' => false], 201);
}

// PATCH /api/archives/:id — mise à jour partielle (drive_link uniquement).
// Permet à l'outbox de poser le lien Drive après coup, une fois que
// l'archive structurée est déjà en base. Toute autre modification est
// rejetée : une archive est immuable côté métier.
if ($method === 'PATCH' && preg_match('#^/api/archives/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();

    $row = Db::row('SELECT id FROM archives WHERE id=? AND user_id=?', [$m[1], $user['id']]);
    if (!$row) Json::abort(404, 'Archive introuvable');

    $driveLink = substr((string)($body['drive_link'] ?? ''), 0, 500);
    if ($driveLink === '') Json::abort(422, 'drive_link requis');

    Db::q(
        'UPDATE archives SET drive_link=? WHERE id=? AND user_id=?',
        [$driveLink, $m[1], $user['id']]
    );
    Json::ok(['id' => $m[1], 'drive_link' => $driveLink]);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers de format date_plongee.
// Le front envoie "YYYY-MM-DDTHH:mm" (input datetime-local) ou "YYYY-MM-DD".
// La DB stocke en DATETIME (MariaDB renvoie "YYYY-MM-DD HH:mm:ss").
// ─────────────────────────────────────────────────────────────────────────

/**
 * Convertit l'entrée front en format MySQL DATETIME, ou null si parse échoue.
 */
function parseDiveDateToMySql(string $raw): ?string {
    $raw = trim($raw);
    if ($raw === '') return null;
    // Tolère les deux formats du front : ISO datetime-local et date pure
    $candidates = [
        'Y-m-d\TH:i',
        'Y-m-d\TH:i:s',
        'Y-m-d H:i',
        'Y-m-d H:i:s',
        'Y-m-d',
    ];
    foreach ($candidates as $fmt) {
        $dt = DateTimeImmutable::createFromFormat($fmt, $raw);
        if ($dt !== false) {
            return $dt->format('Y-m-d H:i:s');
        }
    }
    return null;
}

/**
 * Renormalise un DATETIME MySQL en chaîne ISO "YYYY-MM-DDTHH:mm" attendue
 * par le front (input datetime-local + formatDateTime).
 */
function normalizeDiveDate(?string $sqlDate): ?string {
    if (!$sqlDate) return null;
    $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $sqlDate);
    return $dt ? $dt->format('Y-m-d\TH:i') : $sqlDate;
}
