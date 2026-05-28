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
      ->maxLen('ville', 150, 'Ville')
      ->maxLen('pays', 80, 'Pays')
      ->maxLen('pays_code', 3, 'Code pays')
      ->maxLen('region', 150, 'Région')
      ->abortIfErrors();

    if (!$v->nullable('depart_bord') && !$v->nullable('depart_bateau')) {
        Json::abort(422, 'Indiquer au moins un type de départ (bord ou bateau).');
    }

    $coord = $v->arr('coordonnees');
    $id    = Db::uuid();
    Db::q(
        'INSERT INTO sites (id, user_id, nom, milieu, profondeur_max, coordonnees, notes, depart_bord, depart_bateau, shot_line, ville, pays, pays_code, region)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
            $id, $user['id'],
            $v->str('nom'), $v->str('milieu') ?: 'En mer',
            $v->float('profondeur_max'),
            $coord ? json_encode($coord, JSON_UNESCAPED_UNICODE) : null,
            $v->str('notes'),
            (int)(bool)$v->nullable('depart_bord'),
            (int)(bool)$v->nullable('depart_bateau'),
            (int)(bool)$v->nullable('shot_line'),
            $v->str('ville'),
            $v->str('pays'),
            $v->str('pays_code'),
            $v->str('region'),
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
      ->maxLen('ville', 150, 'Ville')
      ->maxLen('pays', 80, 'Pays')
      ->maxLen('pays_code', 3, 'Code pays')
      ->maxLen('region', 150, 'Région')
      ->abortIfErrors();

    if (!$v->nullable('depart_bord') && !$v->nullable('depart_bateau')) {
        Json::abort(422, 'Indiquer au moins un type de départ (bord ou bateau).');
    }

    $coord = $v->arr('coordonnees');
    Db::q(
        'UPDATE sites SET nom=?, milieu=?, profondeur_max=?, coordonnees=?, notes=?, depart_bord=?, depart_bateau=?, shot_line=?, ville=?, pays=?, pays_code=?, region=?
         WHERE id=?',
        [
            $v->str('nom'), $v->str('milieu') ?: 'En mer',
            $v->float('profondeur_max'),
            $coord ? json_encode($coord, JSON_UNESCAPED_UNICODE) : null,
            $v->str('notes'),
            (int)(bool)$v->nullable('depart_bord'),
            (int)(bool)$v->nullable('depart_bateau'),
            (int)(bool)$v->nullable('shot_line'),
            $v->str('ville'),
            $v->str('pays'),
            $v->str('pays_code'),
            $v->str('region'),
            $m[1],
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
    $row['coordonnees']  = $row['coordonnees'] ? json_decode($row['coordonnees'], true) : null;
    $row['depart_bord']  = (bool)($row['depart_bord']   ?? false);
    $row['depart_bateau']= (bool)($row['depart_bateau'] ?? false);
    $row['shot_line']    = (bool)($row['shot_line']     ?? false);
    return $row;
}
