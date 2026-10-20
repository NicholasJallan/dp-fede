<?php
declare(strict_types=1);

$NIVEAUX_PLONGEUR  = ['N1','N2','N3'];
$NIVEAUX_ENCADRANT = ['N4','N5','E1','E2','E3','E4'];
$DIPLOMES_PRO      = ['BEES1','DEJEPS','DESJEPS','Autre'];
$RECYCLEURS_OK     = ['Revo','AP','Triton','JJccr','Xccr','Megalodon','Shark','Submatix','Autre'];

// Annuaire du CLUB COURANT (club_id) ; user_id = auteur de la fiche.
// Lecture : tous les rôles ; écriture : responsable, dp (Club::PERMISSIONS).

// GET /api/divers
// Paramètre optionnel ?since=ISO8601 — sync incrémental.
// Renvoie les plongeurs créés/modifiés/supprimés depuis cette date (incl.
// les soft-deletes pour propager les suppressions aux clients hors-ligne).
if ($method === 'GET' && $path === '/api/divers') {
    $user  = Auth::require();
    Club::requirePermission($user, 'divers.read');
    $since = $_GET['since'] ?? null;
    if ($since) {
        $sinceSql = SyncHelpers::parseSinceParam($since);
        $rows = Db::all(
            'SELECT * FROM divers
             WHERE club_id=? AND (updated_at >= ? OR deleted_at >= ?)
             ORDER BY nom, prenom',
            [$user['club_id'], $sinceSql, $sinceSql]
        );
    } else {
        // Liste « live » : on exclut les soft-deletes côté snapshot complet.
        $rows = Db::all(
            'SELECT * FROM divers WHERE club_id=? AND deleted_at IS NULL ORDER BY nom, prenom',
            [$user['club_id']]
        );
    }
    Json::ok(array_map('decodeDiver', $rows));
}

// POST /api/divers/import — import CSV / JSON de l'annuaire (cf.
// docs/import-plongeurs.md). ?dry_run=1 : rapport sans écriture.
if ($method === 'POST' && $path === '/api/divers/import') {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'divers.import');
    RateLimit::hitOrAbort('import', 30, 3600, 'Trop d\'imports. Réessayez dans une heure.', 'u' . $user['id']);
    handleDiverImport($user);
}

// POST /api/divers
// Le client peut envoyer son propre id (UUID v4). Si fourni, l'insertion est
// idempotente via INSERT ... ON DUPLICATE KEY UPDATE : un sync rejoué par
// l'outbox n'a aucun effet de bord. Sans id, le serveur en génère un.
// L'UPSERT est limité au club de façon atomique (SyncHelpers::clubScopedUpsert) :
// un id appartenant à un autre club laisse sa ligne intacte et répond 404,
// exactement comme un plongeur inexistant (pas d'oracle d'existence).
if ($method === 'POST' && $path === '/api/divers') {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'divers.write');
    $body = Json::body();
    $v    = validateDiverBody($body);

    $clientId = $v->nullable('id');
    $id       = $clientId && SyncHelpers::isValidUuid($clientId) ? $clientId : Db::uuid();

    $cols = [
        'id' => $id, 'club_id' => $user['club_id'], 'user_id' => $user['id'],
    ] + diverBaseValues($v, $DIPLOMES_PRO, $RECYCLEURS_OK) + diverExtraValues($body, $v);

    // created_at, user_id (auteur), source et external_id ne sont pas mis à
    // jour : réactivation = même ressource logique.
    [$sql, $params] = SyncHelpers::clubScopedUpsert('divers', $cols, ['user_id']);
    Db::q($sql, $params);
    $row = diverInClubOrAbort((string)$user['club_id'], $id);
    Json::ok(decodeDiver($row), 201);
}

// GET /api/divers/:id
if ($method === 'GET' && preg_match('#^/api/divers/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    Club::requirePermission($user, 'divers.read');
    $row  = diverInClubOrAbort((string)$user['club_id'], $m[1]);
    Json::ok(decodeDiver($row));
}

// PUT /api/divers/:id
if ($method === 'PUT' && preg_match('#^/api/divers/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'divers.write');
    diverInClubOrAbort((string)$user['club_id'], $m[1]);

    $body = Json::body();
    $v    = validateDiverBody($body);
    $cols = diverBaseValues($v, $DIPLOMES_PRO, $RECYCLEURS_OK) + diverExtraValues($body, $v);

    $sets   = array_map(static fn(string $c): string => "{$c}=?", array_keys($cols));
    $sets[] = 'deleted_at=NULL';
    Db::q(
        'UPDATE divers SET ' . implode(', ', $sets) . ' WHERE id=? AND club_id=?',
        [...array_values($cols), $m[1], $user['club_id']]
    );
    Json::ok(decodeDiver(Db::row('SELECT * FROM divers WHERE id=? AND club_id=?', [$m[1], $user['club_id']])));
}

// DELETE /api/divers/:id
// Soft delete — la ligne reste en base avec deleted_at non-null, ce qui
// permet de propager la suppression aux clients qui pullent via ?since=.
// Un re-DELETE est sans effet (idempotent : NOW() écrase deleted_at mais
// l'état logique « supprimé » reste identique).
if ($method === 'DELETE' && preg_match('#^/api/divers/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'divers.write');
    diverInClubOrAbort((string)$user['club_id'], $m[1]);
    Db::q('UPDATE divers SET deleted_at=NOW() WHERE id=? AND club_id=?', [$m[1], $user['club_id']]);
    Log::action('diver.deleted', ['diver_id' => $m[1], 'club_id' => $user['club_id']]);
    Json::ok(null);
}

// ── helpers ───────────────────────────────────────────────────────────────

function diverInClubOrAbort(string $clubId, string $diverId): array {
    $row = Db::row('SELECT * FROM divers WHERE id=? AND club_id=?', [$diverId, $clubId]);
    if (!$row) Json::abort(404, 'Plongeur introuvable');
    return $row;
}

function validateDiverBody(array $body): Validate {
    $v = new Validate($body);
    $v->required('nom', 'Nom')
      ->maxLen('nom', 100, 'Nom')
      ->maxLen('prenom', 100, 'Prénom')
      ->maxLen('licence', 50, 'Numéro de licence')
      ->required('medical', 'Date du certificat médical')
      ->date('medical', 'Date du certificat médical')
      ->date('date_naissance', 'Date de naissance')
      ->date('licence_fin', 'Date de fin de licence')
      ->maxLen('representant_legal', 200, 'Représentant légal')
      ->abortIfErrors();
    $season = $v->nullable('autorisation_parentale_saison');
    if ($season !== null && !ClubAlerts::isValidSeason($season)) {
        Json::abort(422, 'Saison d\'autorisation parentale invalide (format AAAA-AAAA, ex. 2026-2027)');
    }
    return $v;
}

/** Colonnes historiques de la fiche, toujours écrites (POST / PUT). */
function diverBaseValues(Validate $v, array $diplomes, array $recycleurs): array {
    return [
        'nom'              => $v->str('nom'),
        'prenom'           => $v->str('prenom'),
        'licence'          => $v->str('licence'),
        'niveau'           => buildLegacyNiveau($v),
        'niveau_plongeur'  => $v->nullable('niveau_plongeur'),
        'niveau_encadrant' => $v->nullable('niveau_encadrant'),
        'qualifs'          => json_encode(buildQualifs($v, $diplomes, $recycleurs), JSON_UNESCAPED_UNICODE),
        'aptitudes_sup'    => json_encode($v->arr('aptitudes_sup'), JSON_UNESCAPED_UNICODE),
        'medical'          => $v->nullable('medical'),
        'notes'            => $v->str('notes'),
        'date_naissance'   => $v->nullable('date_naissance') ?: null,
    ];
}

/**
 * Colonnes ajoutées en phase 5 : écrites UNIQUEMENT si présentes dans le
 * corps. Un client antérieur (qui ne les connaît pas) n'efface donc pas une
 * fin de licence ou une autorisation parentale importées.
 */
function diverExtraValues(array $body, Validate $v): array {
    $out = [];
    foreach (['licence_fin', 'representant_legal', 'autorisation_parentale_saison'] as $col) {
        if (array_key_exists($col, $body)) $out[$col] = $v->nullable($col);
    }
    return $out;
}

function buildLegacyNiveau(Validate $v): string {
    // Keep niveau col for backward compat; prefer encadrant > plongeur
    $ne = $v->nullable('niveau_encadrant');
    $np = $v->nullable('niveau_plongeur');
    return $ne ?: ($np ?: '');
}

function buildQualifs(Validate $v, array $diplomes, array $recycleurs): array {
    $nitrox    = array_values(array_intersect($v->arr('nitrox'),    ['PN','PN-C']));
    $trimix    = array_values(array_intersect($v->arr('trimix'),    ['PTH-40','PTH-70','PTH-120']));
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
        $row['trimix']    = array_values(array_intersect($raw, ['PTH-40','PTH-70','PTH-120']));
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

/**
 * Import : lit la requête (multipart « file », JSON { csv } ou JSON { rows }),
 * planifie, applique si dry_run absent, renvoie le rapport.
 */
function handleDiverImport(array $user): void {
    $isMultipart = stripos((string)($_SERVER['CONTENT_TYPE'] ?? ''), 'multipart/form-data') === 0;
    $params  = $isMultipart ? $_POST : Json::body();
    $dryRun  = !empty($_GET['dry_run']) || !empty($params['dry_run']);
    $profile = (string)($params['profile'] ?? $_GET['profile'] ?? 'auto');
    if (!in_array($profile, DiverImport::PROFILES, true)) Json::abort(422, 'Profil d\'import inconnu (auto, vpdive)');
    $defaultSource = DiverImport::normalizeSource((string)($params['source'] ?? ($profile === 'vpdive' ? 'vpdive' : 'csv')));
    if ($defaultSource === null || $defaultSource === 'manuel') {
        Json::abort(422, 'Source invalide (lettres, chiffres, - et _ ; « manuel » est réservé)');
    }

    $meta = ['profile' => $profile, 'source' => $defaultSource];
    if ($isMultipart || isset($params['csv'])) {
        $raw = $isMultipart ? readUploadedImportFile() : (string)$params['csv'];
        if (strlen($raw) > DiverImport::MAX_BYTES) Json::abort(413, 'Fichier trop volumineux (1 Mo maximum)');
        [$text, $encoding] = DiverImport::decode($raw);
        $sep  = DiverImport::detectSeparator($text);
        $rows = DiverImport::parseCsv($text, $sep);
        if (!$rows) Json::abort(422, 'Fichier vide');
        $headers = DiverImport::mapHeaders(array_shift($rows)['cells'], $profile);
        if ($headers['errors']) Json::abort(422, implode('; ', $headers['errors']));
        $records = DiverImport::rowsToRecords($rows, $headers['map']);
        $meta += [
            'format' => 'csv', 'encoding' => $encoding, 'separator' => $sep === "\t" ? 'tab' : $sep,
            'columns' => ['recognized' => $headers['recognized'], 'ignored' => $headers['ignored']],
        ];
    } elseif (isset($params['rows']) && is_array($params['rows'])) {
        $records = DiverImport::jsonToRecords($params['rows'], $profile);
        $meta += ['format' => 'json'];
    } else {
        Json::abort(422, 'Fournir un fichier CSV (multipart « file »), { "csv": "…" } ou { "rows": [ … ] }');
    }
    if (count($records) > DiverImport::MAX_ROWS) {
        Json::abort(413, 'Trop de lignes (' . DiverImport::MAX_ROWS . ' maximum par import)');
    }

    $today    = new DateTimeImmutable('today');
    $valid    = [];
    $invalid  = [];
    $warnings = [];
    foreach ($records as $r) {
        $n = DiverImport::normalize($r['data'], $defaultSource, $today);
        foreach ($n['warnings'] as $w) $warnings[] = ['line' => $r['line'], 'message' => $w];
        if ($n['record'] === null) {
            $invalid[] = ['line' => $r['line'], 'errors' => $n['errors']];
        } else {
            $valid[] = ['line' => $r['line'], 'record' => $n['record']];
        }
    }

    $existing = DiverImportPlan::fetchExisting((string)$user['club_id']);
    $plan     = DiverImportPlan::plan($valid, $existing);
    if (!$dryRun) {
        DiverImportPlan::apply($plan, $existing, (string)$user['club_id'], (int)$user['id']);
    }
    $report = DiverImportPlan::report($plan, $invalid, $warnings, $dryRun, $meta);
    if (!$dryRun) {
        Log::action('divers.imported', [
            'club_id' => $user['club_id'], 'created' => $report['created'],
            'updated' => $report['updated'], 'errors' => count($report['errors']),
        ]);
    }
    Json::ok($report);
}

function readUploadedImportFile(): string {
    $f = $_FILES['file'] ?? null;
    if (!is_array($f) || ($f['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK || !is_uploaded_file((string)$f['tmp_name'])) {
        $code = is_array($f) ? (int)($f['error'] ?? 0) : UPLOAD_ERR_NO_FILE;
        Json::abort($code === UPLOAD_ERR_INI_SIZE || $code === UPLOAD_ERR_FORM_SIZE ? 413 : 422,
            'Fichier CSV manquant ou invalide (champ « file »)');
    }
    if ((int)$f['size'] > DiverImport::MAX_BYTES) Json::abort(413, 'Fichier trop volumineux (1 Mo maximum)');
    $raw = file_get_contents((string)$f['tmp_name']);
    if ($raw === false) Json::abort(422, 'Lecture du fichier impossible');
    return $raw;
}
