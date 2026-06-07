<?php
declare(strict_types=1);

// GET /api/archives — liste des plongées archivées (sans les gros champs JSON)
if ($method === 'GET' && $path === '/api/archives') {
    $user = Auth::require();
    $rows = Db::all(
        'SELECT id, site_nom, date_plongee, dp_nom, dp_qual, activite, drive_link, created_at
         FROM archives WHERE user_id=? ORDER BY date_plongee DESC, created_at DESC',
        [$user['id']]
    );
    // date_plongee est désormais un DATETIME — on renvoie une string ISO compatible
    // avec le front qui consomme déjà "YYYY-MM-DDTHH:mm".
    foreach ($rows as &$r) {
        $r['date_plongee'] = normalizeDiveDate($r['date_plongee'] ?? null);
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

// POST /api/archives — créer une archive
if ($method === 'POST' && $path === '/api/archives') {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();

    $id = Db::uuid();
    Db::q(
        'INSERT INTO archives (id, user_id, site_nom, date_plongee, dp_nom, dp_qual, activite, answers, palanquees, drive_link)
         VALUES (?,?,?,?,?,?,?,?,?,?)',
        [
            $id, $user['id'],
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
    Json::ok(['id' => $id], 201);
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
