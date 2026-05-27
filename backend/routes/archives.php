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
    Json::ok($rows);
}

// GET /api/archives/:id — détail complet
if ($method === 'GET' && preg_match('#^/api/archives/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    $row  = Db::row('SELECT * FROM archives WHERE id=? AND user_id=?', [$m[1], $user['id']]);
    if (!$row) Json::abort(404, 'Archive introuvable');
    $row['answers']    = json_decode($row['answers']    ?? '{}', true) ?? [];
    $row['palanquees'] = json_decode($row['palanquees'] ?? '[]', true) ?? [];
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
            substr((string)($body['date_plongee'] ?? ''), 0, 50),
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
