<?php
declare(strict_types=1);

$MILIEUX = ['En mer','Lac','Carrière','Piscine','Autre'];

// GET /api/sites
if ($method === 'GET' && $path === '/api/sites') {
    $user = Auth::require();
    $rows = Db::all('SELECT * FROM sites WHERE user_id=? ORDER BY nom', [$user['id']]);
    Json::ok(array_map('decodeSite', $rows));
}

// POST /api/sites
if ($method === 'POST' && $path === '/api/sites') {
    Csrf::verify();
    $user = Auth::require();
    $v    = new Validate(Json::body());
    $v->required('nom', 'Nom du site')
      ->maxLen('nom', 200, 'Nom du site')
      ->inList('milieu', $MILIEUX, 'Milieu')
      ->abortIfErrors();

    $coord = $v->arr('coordonnees');
    $id    = Db::uuid();
    Db::q(
        'INSERT INTO sites (id, user_id, nom, milieu, profondeur_max, coordonnees, notes)
         VALUES (?,?,?,?,?,?,?)',
        [
            $id, $user['id'],
            $v->str('nom'), $v->str('milieu') ?: 'En mer',
            $v->float('profondeur_max'),
            $coord ? json_encode($coord, JSON_UNESCAPED_UNICODE) : null,
            $v->str('notes'),
        ]
    );
    Json::ok(decodeSite(Db::row('SELECT * FROM sites WHERE id=?', [$id])), 201);
}

// GET /api/sites/:id
if ($method === 'GET' && preg_match('#^/api/sites/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    $row  = siteOwnerOrAbort($user['id'], $m[1]);
    Json::ok(decodeSite($row));
}

// PUT /api/sites/:id
if ($method === 'PUT' && preg_match('#^/api/sites/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    siteOwnerOrAbort($user['id'], $m[1]);

    $v = new Validate(Json::body());
    $v->required('nom', 'Nom du site')
      ->maxLen('nom', 200, 'Nom du site')
      ->inList('milieu', $MILIEUX, 'Milieu')
      ->abortIfErrors();

    $coord = $v->arr('coordonnees');
    Db::q(
        'UPDATE sites SET nom=?, milieu=?, profondeur_max=?, coordonnees=?, notes=? WHERE id=?',
        [
            $v->str('nom'), $v->str('milieu') ?: 'En mer',
            $v->float('profondeur_max'),
            $coord ? json_encode($coord, JSON_UNESCAPED_UNICODE) : null,
            $v->str('notes'), $m[1],
        ]
    );
    Json::ok(decodeSite(Db::row('SELECT * FROM sites WHERE id=?', [$m[1]])));
}

// DELETE /api/sites/:id
if ($method === 'DELETE' && preg_match('#^/api/sites/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    siteOwnerOrAbort($user['id'], $m[1]);
    Db::q('DELETE FROM sites WHERE id=?', [$m[1]]);
    Json::ok(null);
}

function siteOwnerOrAbort(int $userId, string $siteId): array {
    $row = Db::row('SELECT * FROM sites WHERE id=? AND user_id=?', [$siteId, $userId]);
    if (!$row) Json::abort(404, 'Site introuvable');
    return $row;
}

function decodeSite(array $row): array {
    $row['coordonnees'] = $row['coordonnees'] ? json_decode($row['coordonnees'], true) : null;
    return $row;
}
