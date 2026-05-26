<?php
declare(strict_types=1);

$NIVEAUX = ['N1','N2','N3','N4','GP','E1','E2','E3','E4','P5','MF1','MF2','BEES1','DEJEPS','DESJEPS'];
$QUALIFS  = ['PN','PN-C','PTH-70','PTH-120','REC-CCR','TEC-CCR','TIV','RIFAP','PSC1','DAEFR',
             'PE-40','PE-60','Apnée','Chasse'];

// GET /api/divers — liste les plongeurs de l'utilisateur courant
if ($method === 'GET' && $path === '/api/divers') {
    $user  = Auth::require();
    $rows  = Db::all('SELECT * FROM divers WHERE user_id=? ORDER BY nom, prenom', [$user['id']]);
    Json::ok(array_map('decodeDiver', $rows));
}

// POST /api/divers — créer un plongeur
if ($method === 'POST' && $path === '/api/divers') {
    Csrf::verify();
    $user = Auth::require();
    $v    = new Validate(Json::body());
    $v->required('nom', 'Nom')
      ->maxLen('nom', 100, 'Nom')
      ->maxLen('prenom', 100, 'Prénom')
      ->maxLen('licence', 50, 'Numéro de licence')
      ->inList('niveau', $NIVEAUX, 'Niveau')
      ->date('medical', 'Date du certificat médical')
      ->abortIfErrors();

    $qualifs = array_values(array_intersect($v->arr('qualifs'), $QUALIFS));
    $id = Db::uuid();
    Db::q(
        'INSERT INTO divers (id, user_id, nom, prenom, licence, niveau, qualifs, medical, notes)
         VALUES (?,?,?,?,?,?,?,?,?)',
        [
            $id, $user['id'],
            $v->str('nom'), $v->str('prenom'), $v->str('licence'),
            $v->str('niveau'), json_encode($qualifs, JSON_UNESCAPED_UNICODE),
            $v->nullable('medical'), $v->str('notes'),
        ]
    );
    Json::ok(decodeDiver(Db::row('SELECT * FROM divers WHERE id=?', [$id])), 201);
}

// GET /api/divers/:id
if ($method === 'GET' && preg_match('#^/api/divers/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    $row  = ownerOrAbort($user['id'], $m[1]);
    Json::ok(decodeDiver($row));
}

// PUT /api/divers/:id
if ($method === 'PUT' && preg_match('#^/api/divers/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    ownerOrAbort($user['id'], $m[1]);

    $v = new Validate(Json::body());
    $v->required('nom', 'Nom')
      ->maxLen('nom', 100, 'Nom')
      ->maxLen('prenom', 100, 'Prénom')
      ->maxLen('licence', 50, 'Numéro de licence')
      ->inList('niveau', $NIVEAUX, 'Niveau')
      ->date('medical', 'Date du certificat médical')
      ->abortIfErrors();

    $qualifs = array_values(array_intersect($v->arr('qualifs'), $QUALIFS));
    Db::q(
        'UPDATE divers SET nom=?, prenom=?, licence=?, niveau=?, qualifs=?, medical=?, notes=? WHERE id=?',
        [
            $v->str('nom'), $v->str('prenom'), $v->str('licence'), $v->str('niveau'),
            json_encode($qualifs, JSON_UNESCAPED_UNICODE),
            $v->nullable('medical'), $v->str('notes'), $m[1],
        ]
    );
    Json::ok(decodeDiver(Db::row('SELECT * FROM divers WHERE id=?', [$m[1]])));
}

// DELETE /api/divers/:id
if ($method === 'DELETE' && preg_match('#^/api/divers/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    ownerOrAbort($user['id'], $m[1]);
    Db::q('DELETE FROM divers WHERE id=?', [$m[1]]);
    Json::ok(null);
}

function ownerOrAbort(int $userId, string $diverId): array {
    $row = Db::row('SELECT * FROM divers WHERE id=? AND user_id=?', [$diverId, $userId]);
    if (!$row) Json::abort(404, 'Plongeur introuvable');
    return $row;
}

function decodeDiver(array $row): array {
    $row['qualifs'] = json_decode($row['qualifs'] ?? '[]', true) ?? [];
    return $row;
}
