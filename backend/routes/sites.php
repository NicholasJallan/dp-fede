<?php
declare(strict_types=1);

$MILIEUX = ['En mer','Lac','Carrière','Piscine','Autre'];

// Sites du CLUB COURANT (club_id) ; user_id = auteur.
// Lecture : tous les rôles ; écriture : responsable, dp.

// GET /api/sites
// Paramètre optionnel ?since=ISO8601 — sync incrémental incluant les soft-deletes.
if ($method === 'GET' && $path === '/api/sites') {
    $user  = Auth::require();
    Club::requirePermission($user, 'sites.read');
    $since = $_GET['since'] ?? null;
    if ($since) {
        $sinceSql = SyncHelpers::parseSinceParam($since);
        $rows = Db::all(
            'SELECT * FROM sites
             WHERE club_id=? AND (updated_at >= ? OR deleted_at >= ?)
             ORDER BY nom',
            [$user['club_id'], $sinceSql, $sinceSql]
        );
    } else {
        $rows = Db::all(
            'SELECT * FROM sites WHERE club_id=? AND deleted_at IS NULL ORDER BY nom',
            [$user['club_id']]
        );
    }
    Json::ok(array_map('decodeSite', $rows));
}

// POST /api/sites
// Idempotent : id optionnel envoyé par le client (UUID v4) → INSERT ... ON
// DUPLICATE KEY UPDATE limité au club. Permet à l'outbox de rejouer sans dupliquer.
if ($method === 'POST' && $path === '/api/sites') {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'sites.write');
    $v    = new Validate(Json::body());
    $v->required('nom', 'Nom du site')
      ->maxLen('nom', 200, 'Nom du site')
      ->inList('milieu', $MILIEUX, 'Milieu')
      ->maxLen('ville', 150, 'Ville')
      ->maxLen('pays', 80, 'Pays')
      ->maxLen('pays_code', 3, 'Code pays')
      ->maxLen('region', 150, 'Région')
      ->maxLen('acces_secours', 500, 'Accès secours')
      ->maxLen('caisson', 500, 'Caisson de référence')
      ->abortIfErrors();

    if (!$v->nullable('depart_bord') && !$v->nullable('depart_bateau')) {
        Json::abort(422, 'Indiquer au moins un type de départ (bord ou bateau).');
    }

    $clientId = $v->nullable('id');
    $id       = $clientId && SyncHelpers::isValidUuid($clientId) ? $clientId : Db::uuid();
    $coord    = $v->arr('coordonnees');

    // UPSERT limité au club, atomique (cf. POST /api/divers) : id d'un autre
    // club → ligne intacte et 404, comme un site inexistant.
    [$sql, $params] = SyncHelpers::clubScopedUpsert('sites', [
        'id'             => $id,
        'club_id'        => $user['club_id'],
        'user_id'        => $user['id'],
        'nom'            => $v->str('nom'),
        'milieu'         => $v->str('milieu') ?: 'En mer',
        'profondeur_max' => $v->float('profondeur_max'),
        'coordonnees'    => $coord ? json_encode($coord, JSON_UNESCAPED_UNICODE) : null,
        'notes'          => $v->str('notes'),
        'depart_bord'    => (int)(bool)$v->nullable('depart_bord'),
        'depart_bateau'  => (int)(bool)$v->nullable('depart_bateau'),
        'shot_line'      => (int)(bool)$v->nullable('shot_line'),
        'ville'          => $v->str('ville'),
        'pays'           => $v->str('pays'),
        'pays_code'      => $v->str('pays_code'),
        'region'         => $v->str('region'),
        'acces_secours'  => $v->str('acces_secours'),
        'caisson'        => $v->str('caisson'),
    ], ['user_id']);
    Db::q($sql, $params);
    Json::ok(decodeSite(siteInClubOrAbort((string)$user['club_id'], $id)), 201);
}

// GET /api/sites/:id
if ($method === 'GET' && preg_match('#^/api/sites/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    Club::requirePermission($user, 'sites.read');
    $row  = siteInClubOrAbort((string)$user['club_id'], $m[1]);
    Json::ok(decodeSite($row));
}

// PUT /api/sites/:id
if ($method === 'PUT' && preg_match('#^/api/sites/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'sites.write');
    siteInClubOrAbort((string)$user['club_id'], $m[1]);

    $v = new Validate(Json::body());
    $v->required('nom', 'Nom du site')
      ->maxLen('nom', 200, 'Nom du site')
      ->inList('milieu', $MILIEUX, 'Milieu')
      ->maxLen('ville', 150, 'Ville')
      ->maxLen('pays', 80, 'Pays')
      ->maxLen('pays_code', 3, 'Code pays')
      ->maxLen('region', 150, 'Région')
      ->maxLen('acces_secours', 500, 'Accès secours')
      ->maxLen('caisson', 500, 'Caisson de référence')
      ->abortIfErrors();

    if (!$v->nullable('depart_bord') && !$v->nullable('depart_bateau')) {
        Json::abort(422, 'Indiquer au moins un type de départ (bord ou bateau).');
    }

    $coord = $v->arr('coordonnees');
    Db::q(
        'UPDATE sites SET nom=?, milieu=?, profondeur_max=?, coordonnees=?, notes=?, depart_bord=?, depart_bateau=?, shot_line=?, ville=?, pays=?, pays_code=?, region=?, acces_secours=?, caisson=?, deleted_at=NULL
         WHERE id=? AND club_id=?',
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
            $v->str('acces_secours'),
            $v->str('caisson'),
            $m[1], $user['club_id'],
        ]
    );
    Json::ok(decodeSite(Db::row('SELECT * FROM sites WHERE id=? AND club_id=?', [$m[1], $user['club_id']])));
}

// DELETE /api/sites/:id — soft delete pour propager aux clients via ?since=.
if ($method === 'DELETE' && preg_match('#^/api/sites/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'sites.write');
    siteInClubOrAbort((string)$user['club_id'], $m[1]);
    Db::q('UPDATE sites SET deleted_at=NOW() WHERE id=? AND club_id=?', [$m[1], $user['club_id']]);
    Log::action('site.deleted', ['site_id' => $m[1], 'club_id' => $user['club_id']]);
    Json::ok(null);
}

function siteInClubOrAbort(string $clubId, string $siteId): array {
    $row = Db::row('SELECT * FROM sites WHERE id=? AND club_id=?', [$siteId, $clubId]);
    if (!$row) Json::abort(404, 'Site introuvable');
    return $row;
}

function decodeSite(array $row): array {
    $row['coordonnees']  = $row['coordonnees'] ? json_decode($row['coordonnees'], true) : null;
    $row['depart_bord']  = (bool)($row['depart_bord']   ?? false);
    $row['depart_bateau']= (bool)($row['depart_bateau'] ?? false);
    $row['shot_line']    = (bool)($row['shot_line']     ?? false);
    // Flag « supprimé » consommé par l'outbox côté client pour appliquer le
    // delete dans son store local.
    $row['deleted']      = !empty($row['deleted_at']);
    return $row;
}
