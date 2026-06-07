<?php
declare(strict_types=1);

$NIVEAUX_PLONGEUR  = ['N1','N2','N3'];
$NIVEAUX_ENCADRANT = ['N4','N5','E1','E2','E3','E4'];
$DIPLOMES_PRO      = ['BEES1','DEJEPS','DESJEPS','Autre'];
$RECYCLEURS_OK     = ['Revo','AP','Triton','JJccr','Xccr','Megalodon','Shark','Submatix','Autre'];

// GET /api/divers
// Paramètre optionnel ?since=ISO8601 — sync incrémental.
// Renvoie les plongeurs créés/modifiés/supprimés depuis cette date (incl.
// les soft-deletes pour propager les suppressions aux clients hors-ligne).
if ($method === 'GET' && $path === '/api/divers') {
    $user  = Auth::require();
    $since = $_GET['since'] ?? null;
    if ($since) {
        $sinceSql = SyncHelpers::parseSinceParam($since);
        $rows = Db::all(
            'SELECT * FROM divers
             WHERE user_id=? AND (updated_at >= ? OR deleted_at >= ?)
             ORDER BY nom, prenom',
            [$user['id'], $sinceSql, $sinceSql]
        );
    } else {
        // Liste « live » : on exclut les soft-deletes côté snapshot complet.
        $rows = Db::all(
            'SELECT * FROM divers WHERE user_id=? AND deleted_at IS NULL ORDER BY nom, prenom',
            [$user['id']]
        );
    }
    Json::ok(array_map('decodeDiver', $rows));
}

// POST /api/divers
// Le client peut envoyer son propre id (UUID v4). Si fourni, l'insertion est
// idempotente via INSERT ... ON DUPLICATE KEY UPDATE : un sync rejoué par
// l'outbox n'a aucun effet de bord. Sans id, le serveur en génère un.
if ($method === 'POST' && $path === '/api/divers') {
    Csrf::verify();
    $user = Auth::require();
    $v    = new Validate(Json::body());
    $v->required('nom', 'Nom')
      ->maxLen('nom', 100, 'Nom')
      ->maxLen('prenom', 100, 'Prénom')
      ->maxLen('licence', 50, 'Numéro de licence')
      ->required('medical', 'Date du certificat médical')
      ->date('medical', 'Date du certificat médical')
      ->abortIfErrors();

    $clientId = $v->nullable('id');
    $id       = $clientId && SyncHelpers::isValidUuid($clientId) ? $clientId : Db::uuid();

    $params = [
        $id, $user['id'],
        $v->str('nom'), $v->str('prenom'), $v->str('licence'),
        buildLegacyNiveau($v),
        $v->nullable('niveau_plongeur'), $v->nullable('niveau_encadrant'),
        json_encode(buildQualifs($v, $DIPLOMES_PRO, $RECYCLEURS_OK), JSON_UNESCAPED_UNICODE),
        json_encode($v->arr('aptitudes_sup'), JSON_UNESCAPED_UNICODE),
        $v->nullable('medical'), $v->str('notes'),
    ];

    Db::q(
        'INSERT INTO divers
           (id, user_id, nom, prenom, licence, niveau, niveau_plongeur, niveau_encadrant, qualifs, aptitudes_sup, medical, notes)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
           nom=VALUES(nom), prenom=VALUES(prenom), licence=VALUES(licence),
           niveau=VALUES(niveau), niveau_plongeur=VALUES(niveau_plongeur),
           niveau_encadrant=VALUES(niveau_encadrant), qualifs=VALUES(qualifs),
           aptitudes_sup=VALUES(aptitudes_sup), medical=VALUES(medical),
           notes=VALUES(notes), deleted_at=NULL',
        $params
    );
    Json::ok(decodeDiver(Db::row('SELECT * FROM divers WHERE id=? AND user_id=?', [$id, $user['id']])), 201);
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
      ->required('medical', 'Date du certificat médical')
      ->date('medical', 'Date du certificat médical')
      ->abortIfErrors();

    Db::q(
        'UPDATE divers SET nom=?, prenom=?, licence=?, niveau=?,
          niveau_plongeur=?, niveau_encadrant=?, qualifs=?, aptitudes_sup=?, medical=?, notes=?,
          deleted_at=NULL
         WHERE id=? AND user_id=?',
        [
            $v->str('nom'), $v->str('prenom'), $v->str('licence'),
            buildLegacyNiveau($v),
            $v->nullable('niveau_plongeur'), $v->nullable('niveau_encadrant'),
            json_encode(buildQualifs($v, $DIPLOMES_PRO, $RECYCLEURS_OK), JSON_UNESCAPED_UNICODE),
            json_encode($v->arr('aptitudes_sup'), JSON_UNESCAPED_UNICODE),
            $v->nullable('medical'), $v->str('notes'),
            $m[1], $user['id'],
        ]
    );
    Json::ok(decodeDiver(Db::row('SELECT * FROM divers WHERE id=?', [$m[1]])));
}

// DELETE /api/divers/:id
// Soft delete — la ligne reste en base avec deleted_at non-null, ce qui
// permet de propager la suppression aux clients qui pullent via ?since=.
// Un re-DELETE est sans effet (idempotent : NOW() écrase deleted_at mais
// l'état logique « supprimé » reste identique).
if ($method === 'DELETE' && preg_match('#^/api/divers/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    ownerOrAbort($user['id'], $m[1]);
    Db::q('UPDATE divers SET deleted_at=NOW() WHERE id=? AND user_id=?', [$m[1], $user['id']]);
    Json::ok(null);
}

// ── helpers ───────────────────────────────────────────────────────────────

function ownerOrAbort(int $userId, string $diverId): array {
    $row = Db::row('SELECT * FROM divers WHERE id=? AND user_id=?', [$diverId, $userId]);
    if (!$row) Json::abort(404, 'Plongeur introuvable');
    return $row;
}

function buildLegacyNiveau(Validate $v): string {
    // Keep niveau col for backward compat; prefer encadrant > plongeur
    $ne = $v->nullable('niveau_encadrant');
    $np = $v->nullable('niveau_plongeur');
    return $ne ?: ($np ?: '');
}

function buildQualifs(Validate $v, array $diplomes, array $recycleurs): array {
    $nitrox    = array_values(array_intersect($v->arr('nitrox'),    ['PN','PN-C']));
    $trimix    = array_values(array_intersect($v->arr('trimix'),    ['PTH-70','PTH-120']));
    $recs      = array_values(array_intersect($v->arr('recycleurs'), $recycleurs));
    $diplome   = in_array($v->str('diplome_pro'), $diplomes, true) ? $v->str('diplome_pro') : null;
    $rifap     = (bool)($v->nullable('rifap') ?? false);
    $tiv       = (bool)($v->nullable('tiv')   ?? false);
    return ['nitrox' => $nitrox, 'trimix' => $trimix, 'recycleurs' => $recs,
            'diplome' => $diplome, 'rifap' => $rifap, 'tiv' => $tiv];
}

function decodeDiver(array $row): array {
    // Decode structured qualifs (new format) or legacy array
    $raw = json_decode($row['qualifs'] ?? '[]', true) ?? [];
    if (isset($raw['nitrox'])) {
        // New structured format
        $row['nitrox']    = $raw['nitrox']    ?? [];
        $row['trimix']    = $raw['trimix']    ?? [];
        $row['recycleurs']= $raw['recycleurs']?? [];
        $row['diplome_pro']= $raw['diplome']  ?? null;
        $row['rifap']     = (bool)($raw['rifap'] ?? false);
        $row['tiv']       = (bool)($raw['tiv']   ?? false);
    } else {
        // Legacy flat array — map to new fields best-effort
        $row['nitrox']    = array_values(array_intersect($raw, ['PN','PN-C']));
        $row['trimix']    = array_values(array_intersect($raw, ['PTH-70','PTH-120']));
        $row['recycleurs']= [];
        $row['diplome_pro']= null;
        $row['rifap']     = in_array('RIFAP', $raw, true);
        $row['tiv']       = in_array('TIV',   $raw, true);
    }
    $row['aptitudes_sup'] = json_decode($row['aptitudes_sup'] ?? '[]', true) ?? [];
    // Le client a besoin du flag « supprimé » pour appliquer le delete dans son
    // store local. updated_at sert au cursor de sync (?since=).
    $row['deleted'] = !empty($row['deleted_at']);
    // Keep legacy qualifs for any old consumers
    $row['qualifs'] = $raw;
    return $row;
}

