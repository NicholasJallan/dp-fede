<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/Rules.php';
require_once __DIR__ . '/../lib/Encadrement.php';

// Charge les divers référencés dans les palanquées depuis la DB et retourne
// ['diversById' => [...], 'dp' => array|null]. Renvoie 422 si la validation
// des règles dures échoue (erreurs bloquantes). Les warnings sont ignorés
// (le front affiche le feedback temps réel, le back valide les dures seulement).
function validatePalanqueesOrAbort(array $palanquees, array $answers, string $clubId): void
{
    if (empty($palanquees)) return;

    // Collecter tous les diverId uniques référencés
    $driverIds = [];
    foreach ($palanquees as $pal) {
        foreach ($pal['membres'] ?? [] as $m) {
            if (empty($m['_bapteme']) && !empty($m['diverId'])) {
                $driverIds[$m['diverId']] = true;
            }
        }
    }

    // Niveau encadrant du cadre de la structure (associatif / SCA).
    $club     = Db::row('SELECT structure_type FROM clubs WHERE id=?', [$clubId]);
    $cadrePro = Encadrement::isCadrePro($club['structure_type'] ?? null);

    $diversById = [];
    if (!empty($driverIds)) {
        $ids   = array_keys($driverIds);
        $phs   = implode(',', array_fill(0, count($ids), '?'));
        $rows  = Db::all(
            "SELECT id, nom, prenom, niveau_plongeur, niveau_encadrant,
                    aptitudes_sup, qualifs, medical, date_naissance
               FROM divers
              WHERE id IN ({$phs}) AND club_id=? AND deleted_at IS NULL",
            [...$ids, $clubId]
        );
        foreach ($rows as $row) {
            $row = Encadrement::applyToRow($row, $cadrePro);
            // Décoder qualifs → nitrox / trimix (même logique que routes/divers.php)
            $raw = json_decode($row['qualifs'] ?? '[]', true) ?? [];
            if (isset($raw['nitrox'])) {
                $row['nitrox'] = $raw['nitrox'] ?? [];
                $row['trimix'] = $raw['trimix'] ?? [];
            } else {
                $row['nitrox'] = array_values(array_intersect((array)$raw, ['PN', 'PN-C']));
                $row['trimix'] = array_values(array_intersect((array)$raw, ['PTH-40', 'PTH-70', 'PTH-120']));
            }
            $row['aptitudes_sup'] = json_decode($row['aptitudes_sup'] ?? '[]', true) ?? [];
            $diversById[$row['id']] = $row;
        }
    }

    // Charger le DP
    $dp = null;
    if (!empty($answers['dp_id'])) {
        $dpRow = Db::row(
            'SELECT id, niveau_encadrant, qualifs, aptitudes_sup
               FROM divers WHERE id=? AND club_id=? AND deleted_at IS NULL',
            [$answers['dp_id'], $clubId]
        );
        if ($dpRow) {
            $dpRow = Encadrement::applyToRow($dpRow, $cadrePro);
            $raw = json_decode($dpRow['qualifs'] ?? '[]', true) ?? [];
            $dpRow['nitrox'] = isset($raw['nitrox']) ? ($raw['nitrox'] ?? []) : array_values(array_intersect((array)$raw, ['PN', 'PN-C']));
            $dpRow['trimix'] = isset($raw['trimix']) ? ($raw['trimix'] ?? []) : array_values(array_intersect((array)$raw, ['PTH-40', 'PTH-70', 'PTH-120']));
            $dp = $dpRow;
        }
    }

    // Si le DP n'est pas en DB, construire un dp minimal depuis answers (dp_qual)
    if (!$dp && !empty($answers['dp_qual'])) {
        $dp = ['niveau_encadrant' => $answers['dp_qual'], 'nitrox' => [], 'trimix' => []];
    }

    $result = Rules::validateDive($palanquees, $diversById, $answers, $dp);
    if (!$result['ok']) {
        Json::abort(422, implode(' | ', $result['errors']));
    }
}

// ── GET /api/dives ─────────────────────────────────────────────────────────
// Liste des plongées (tous statuts par défaut).
// ?status=prepared,in_progress,archived — filtre sur un ou plusieurs statuts.
// ?since=ISO8601 — pull incrémental (updated_at >= since).
if ($method === 'GET' && $path === '/api/dives') {
    $user   = Auth::require();
    Club::requirePermission($user, 'dives.read');
    $since  = $_GET['since']  ?? null;
    $status = isset($_GET['status'])
        ? array_filter(array_map('trim', explode(',', $_GET['status'])))
        : [];
    $allowed = ['prepared', 'in_progress', 'archived'];

    $where  = ['d.club_id=?'];
    $params = [$user['club_id']];

    if ($since) {
        $sinceSql = SyncHelpers::parseSinceParam($since);
        $where[]  = 'd.updated_at >= ?';
        $params[] = $sinceSql;
    }

    if (!empty($status)) {
        $valid = array_values(array_intersect($status, $allowed));
        if (!empty($valid)) {
            $placeholders = implode(',', array_fill(0, count($valid), '?'));
            $where[]  = "d.status IN ($placeholders)";
            $params   = array_merge($params, $valid);
        }
    }

    // Soft-deletes : si ?since est fourni, on inclut les supprimées pour propagation.
    // Sans ?since, on exclut les supprimées de la liste normale.
    if (!$since) {
        $where[] = 'd.deleted_at IS NULL';
    }

    $whereStr = implode(' AND ', $where);
    $rows = Db::all(
        "SELECT d.id, d.client_uuid, d.status, d.site_nom, d.date_plongee,
                d.dp_nom, d.dp_qual, d.activite, d.drive_link,
                d.planned_at, d.started_at, d.closed_at,
                d.palanquees, d.deleted_at, d.updated_at, d.created_at,
                d.user_id, u.prenom AS auteur_prenom, u.nom AS auteur_nom,
                d.documents_status
           FROM dives d
           LEFT JOIN users u ON u.id = d.user_id
          WHERE {$whereStr}
          ORDER BY d.date_plongee DESC, d.created_at DESC",
        $params
    );

    foreach ($rows as &$r) {
        $r['date_plongee'] = normalizeDiveDate($r['date_plongee'] ?? null);
        $r['planned_at']   = normalizeDiveDate($r['planned_at']   ?? null);
        $r['started_at']   = normalizeDiveDate($r['started_at']   ?? null);
        $r['closed_at']    = normalizeDiveDate($r['closed_at']    ?? null);
        $pals = json_decode($r['palanquees'] ?? '[]', true) ?: [];
        $r['nb_palanquees'] = count($pals);
        $r['nb_plongeurs']  = (int) array_sum(array_map(fn($p) => count($p['membres'] ?? []), $pals));
        $r['deleted']       = !empty($r['deleted_at']);
        unset($r['palanquees']);
    }
    Json::ok($rows);
}

// ── GET /api/dives/:id ──────────────────────────────────────────────────────
// H4 : render_state chargé depuis dive_runtime_state (LEFT JOIN) afin de ne
// pas dépendre de dives.render_state (colonne gardée pour compatibilité).
if ($method === 'GET' && preg_match('#^/api/dives/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    Club::requirePermission($user, 'dives.read');
    $row  = DivePdf::loadForClub($m[1], (string)$user['club_id']);
    if (!$row) Json::abort(404, 'Plongée introuvable');
    $row['documents'] = DiveArchive::listForDive((string)$row['id']);
    $row['answers']      = json_decode($row['answers']      ?? '{}', true) ?? [];
    $row['palanquees']   = json_decode($row['palanquees']   ?? '[]', true) ?? [];
    $row['render_state'] = json_decode($row['render_state'] ?? '{}', true) ?? [];
    $row['date_plongee'] = normalizeDiveDate($row['date_plongee'] ?? null);
    $row['planned_at']   = normalizeDiveDate($row['planned_at']   ?? null);
    $row['started_at']   = normalizeDiveDate($row['started_at']   ?? null);
    $row['closed_at']    = normalizeDiveDate($row['closed_at']    ?? null);
    Json::ok($row);
}

// ── POST /api/dives ─────────────────────────────────────────────────────────
// Crée une nouvelle plongée. Statut par défaut : 'prepared'.
// Idempotence (outbox) : un client_uuid déjà porté par une plongée ACTIVE du
// club courant renvoie 200 { id, duplicate: true }. Porté par une plongée
// d'un autre club ou supprimée : 409 CLIENT_UUID_CONFLICT (jamais confondu
// avec un rejeu). Index unique (club_id, client_uuid) : migration 011.
// Plongée créée directement archivée (sync hors-ligne) : closed_at = heure
// SERVEUR (base de la conservation légale, cf. ClubRetention).
if ($method === 'POST' && $path === '/api/dives') {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'dives.write');
    $body   = Json::body();
    $clubId = (string)$user['club_id'];

    $clientUuid = isset($body['client_uuid']) && SyncHelpers::isValidUuid((string)$body['client_uuid'])
        ? (string)$body['client_uuid'] : null;

    if ($clientUuid) respondIfClientUuidKnown($clientUuid, $clubId);

    $status  = in_array($body['status'] ?? '', ['prepared', 'in_progress', 'archived'])
        ? $body['status'] : 'prepared';
    $dpDate  = parseDiveDateToMySql((string)($body['date_plongee'] ?? ''));
    $planned = $dpDate; // planned_at = date_plongee à la création

    // Validation règles métier uniquement si la plongée est créée avec un statut
    // avancé (in_progress ou archived = sync offline d'une session déjà terminée).
    // Pour 'prepared', la palanquée peut être incomplète → pas de blocage.
    if (!empty($body['palanquees']) && in_array($status, ['in_progress', 'archived'], true)) {
        validatePalanqueesOrAbort($body['palanquees'], $body['answers'] ?? [], $clubId);
    }
    $rsJson = !empty($body['render_state']) ? renderStateJsonOrAbort($body['render_state']) : null;

    $id = Db::uuid();
    try {
        Db::q(
            'INSERT INTO dives
             (id, club_id, user_id, client_uuid, status, site_nom, date_plongee, planned_at,
              dp_nom, dp_qual, activite, answers, palanquees, drive_link, closed_at)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,' . ($status === 'archived' ? 'NOW()' : 'NULL') . ')',
            [
                $id, $clubId, $user['id'], $clientUuid, $status,
                substr((string)($body['site_nom']   ?? ''), 0, 255),
                $dpDate,
                $planned,
                substr((string)($body['dp_nom']     ?? ''), 0, 200),
                substr((string)($body['dp_qual']    ?? ''), 0, 20),
                substr((string)($body['activite']   ?? ''), 0, 50),
                json_encode($body['answers']    ?? [], JSON_UNESCAPED_UNICODE),
                json_encode($body['palanquees'] ?? [], JSON_UNESCAPED_UNICODE),
                substr((string)($body['drive_link'] ?? ''), 0, 500),
            ]
        );
    } catch (PDOException $e) {
        // Deux rejeux simultanés : l'index unique (club_id, client_uuid) a
        // arrêté le second → même réponse qu'un rejeu séquentiel.
        if ($clientUuid && (string)$e->getCode() === '23000') respondIfClientUuidKnown($clientUuid, $clubId);
        throw $e;
    }

    // H4 : render_state → table dédiée (n'impacte pas dives.updated_at)
    if (!empty($rsJson)) {
        Db::q(
            'INSERT INTO dive_runtime_state (dive_id, state) VALUES (?,?)',
            [$id, $rsJson]
        );
    }

    Log::action('dive.created', ['dive_id' => $id, 'club_id' => $clubId]);
    $documentsStatus = null;
    if ($status === 'archived') {
        // Plongée archivée hors-ligne puis synchronisée : même traitement
        // qu'un passage en 'archived' par PATCH.
        Log::action('dive.archived', ['dive_id' => $id]);
        DiveArchive::onArchived($id);
        $documentsStatus = 'pending';
    }
    Json::ok(['id' => $id, 'duplicate' => false, 'documents_status' => $documentsStatus], 201);
}

/**
 * client_uuid déjà connu : 200 { id, duplicate: true } (rejeu dans le même
 * club) ou 409 CLIENT_UUID_CONFLICT (autre club, plongée supprimée).
 * Ne rend la main que si l'uuid est inconnu.
 */
function respondIfClientUuidKnown(string $clientUuid, string $clubId): void {
    [$outcome, $existingId] = DivePolicy::clientUuidOutcome(DiveStore::rowsByClientUuid($clientUuid), $clubId);
    if ($outcome === 'duplicate') {
        Json::ok(['id' => $existingId, 'duplicate' => true], 200);
    }
    if ($outcome === 'conflict') {
        Json::abort(409, 'Identifiant client de plongée déjà utilisé (autre club ou plongée supprimée)', DivePolicy::CLIENT_UUID_CONFLICT);
    }
}

// ── PATCH /api/dives/:id ────────────────────────────────────────────────────
// Mise à jour partielle d'une plongée.
// Autorisée sur tous les champs tant que status != 'archived'.
// Plongée archivée (A322-72, fiche figée) : seul drive_link est modifiable ;
// un render_state différent de l'état stocké → 422 ARCHIVED_IMMUTABLE (un
// rejeu identique du PATCH d'archivage est accepté) ; answers / palanquees
// sont ignorés. Transition 'archived' → autre statut : 422 ARCHIVED_IMMUTABLE.
// closed_at est posé par le SERVEUR au passage en 'archived' (valeur cliente
// ignorée : elle fonde la durée de conservation légale).
if ($method === 'PATCH' && preg_match('#^/api/dives/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'dives.write');
    $body = Json::body();

    $row = DiveStore::findActive($m[1], (string)$user['club_id']);
    if (!$row) Json::abort(404, 'Plongée introuvable');

    $curStatus = $row['status'];
    $newStatus = isset($body['status']) && in_array($body['status'], ['prepared', 'in_progress', 'archived'])
        ? $body['status'] : null;

    // Transition rétrograde interdite
    if ($newStatus !== null && $curStatus === 'archived' && $newStatus !== 'archived') {
        Json::abort(422, 'Impossible de modifier le statut d\'une plongée archivée', DivePolicy::ARCHIVED_IMMUTABLE);
    }

    $hasRenderState = isset($body['render_state']);
    if ($curStatus === 'archived') {
        $violation = DivePolicy::archivedPatchViolation($body, DiveStore::storedRenderState((string)$row['id']));
        if ($violation !== null) Json::abort(422, $violation, DivePolicy::ARCHIVED_IMMUTABLE);
        // État identique (rejeu) : rien à écrire.
        $hasRenderState = false;
    }

    $sets   = [];
    $params = [];

    if ($curStatus !== 'archived') {
        // Champs librement mutables tant que pas encore archivé
        if (isset($body['answers'])) {
            $sets[]   = 'answers=?';
            $params[] = json_encode($body['answers'], JSON_UNESCAPED_UNICODE);
        }
        if (isset($body['palanquees'])) {
            $sets[]   = 'palanquees=?';
            $params[] = json_encode($body['palanquees'], JSON_UNESCAPED_UNICODE);
        }
        if (isset($body['site_nom'])) {
            $sets[]   = 'site_nom=?';
            $params[] = substr((string)$body['site_nom'], 0, 255);
        }
        if (isset($body['date_plongee'])) {
            $sets[]   = 'date_plongee=?';
            $params[] = parseDiveDateToMySql((string)$body['date_plongee']);
        }
        if (isset($body['dp_nom'])) {
            $sets[]   = 'dp_nom=?';
            $params[] = substr((string)$body['dp_nom'], 0, 200);
        }
        if (isset($body['dp_qual'])) {
            $sets[]   = 'dp_qual=?';
            $params[] = substr((string)$body['dp_qual'], 0, 20);
        }
        if (isset($body['activite'])) {
            $sets[]   = 'activite=?';
            $params[] = substr((string)$body['activite'], 0, 50);
        }
        if ($newStatus !== null) {
            $sets[]   = 'status=?';
            $params[] = $newStatus;
            if ($newStatus === 'archived') $sets[] = 'closed_at=NOW()';
        }
        if (isset($body['planned_at'])) {
            $sets[]   = 'planned_at=?';
            $params[] = parseDiveDateToMySql((string)$body['planned_at']);
        }
        if (isset($body['started_at'])) {
            $sets[]   = 'started_at=?';
            $params[] = parseDiveDateToMySql((string)$body['started_at']);
        }
    }

    // drive_link mutable même après archivage
    if (isset($body['drive_link'])) {
        $sets[]   = 'drive_link=?';
        $params[] = substr((string)$body['drive_link'], 0, 500);
    }

    // Rejeu sans effet du PATCH d'archivage (outbox, réponse perdue) : succès.
    $archivedReplay = $curStatus === 'archived' && $newStatus === 'archived';
    if (empty($sets) && !$hasRenderState && !$archivedReplay) Json::abort(422, 'Aucun champ à mettre à jour');

    // Validation règles métier uniquement lors d'une transition de statut significative
    // (in_progress ou archived). Les auto-saves intermédiaires ('prepared') ne
    // bloquent pas la composition en cours (membres sans aptitude, etc.).
    if (isset($body['palanquees']) && $curStatus !== 'archived'
        && in_array($newStatus, ['in_progress', 'archived'], true)) {
        $ans = $body['answers'] ?? [];
        if (empty($ans)) {
            $existingAnswers = Db::row('SELECT answers FROM dives WHERE id=?', [$row['id']]);
            $ans = json_decode($existingAnswers['answers'] ?? '{}', true) ?? [];
        }
        validatePalanqueesOrAbort($body['palanquees'], $ans, (string)$user['club_id']);
    }

    // Garde-fou anti-écrasement : un client qui aurait ouvert la plongée sans
    // son contenu (ex. hors-ligne) ne doit pas vider une composition existante.
    if ($curStatus !== 'archived' && isEmptyDivePayload($body)) {
        $existing = Db::row('SELECT palanquees FROM dives WHERE id=?', [$row['id']]);
        $existingPals = json_decode($existing['palanquees'] ?? '[]', true) ?: [];
        if (!empty($existingPals)) {
            Json::abort(409, 'Mise à jour refusée : elle viderait une plongée existante', 'EMPTY_OVERWRITE_REFUSED');
        }
    }

    // H4 : render_state → dive_runtime_state (UPSERT sans toucher dives.updated_at),
    // écrit seulement après validation, et seulement si la plongée n'a pas été
    // archivée entre-temps (condition dans la même instruction).
    if ($hasRenderState) {
        $rsJson = renderStateJsonOrAbort($body['render_state']);
        if (!DiveStore::writeRuntimeStateUnlessArchived((string)$row['id'], $rsJson)) {
            Json::abort(422, DivePolicy::ARCHIVED_MESSAGE, DivePolicy::ARCHIVED_IMMUTABLE);
        }
    }

    if (!empty($sets)) {
        $params[] = $row['id'];
        Db::q('UPDATE dives SET ' . implode(',', $sets) . ' WHERE id=?', $params);
    }

    if ($newStatus === 'archived' && $curStatus !== 'archived') {
        Log::action('dive.archived', ['dive_id' => $row['id'], 'club_id' => $user['club_id']]);
        DiveArchive::onArchived((string)$row['id']);
    }
    $updated = Db::row('SELECT id, status, drive_link, documents_status FROM dives WHERE id=?', [$row['id']]);
    Json::ok($updated);
}

// ── DELETE /api/dives/:id ───────────────────────────────────────────────────
// Suppression logique (soft-delete). Refusée si status = 'archived'.
if ($method === 'DELETE' && preg_match('#^/api/dives/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'dives.write');

    $row = DiveStore::findActive($m[1], (string)$user['club_id']);
    if (!$row) Json::abort(404, 'Plongée introuvable');
    if ($row['status'] === 'archived') {
        Json::abort(422, 'Impossible de supprimer une plongée archivée', DivePolicy::ARCHIVED_IMMUTABLE);
    }

    Db::q('UPDATE dives SET deleted_at=NOW() WHERE id=?', [$row['id']]);
    Log::action('dive.deleted', ['dive_id' => $row['id']]);
    Json::ok(['id' => $row['id'], 'deleted' => true]);
}

// ── Documents archivés (A322-72) ───────────────────────────────────────────
// GET  /api/dives/:id/documents        → { status, documents: [{type, sha256, bytes, created_at}] }
// GET  /api/dives/:id/documents/:type  → PDF (fiche | checklist), intégrité SHA-256 vérifiée
// POST /api/dives/:id/documents        → (re)génère les deux PDF, synchrone
if (preg_match('#^/api/dives/([^/]+)/documents(?:/([a-z]+))?$#', $path, $m)) {
    $docType = $m[2] ?? null;
    if ($method === 'GET' && $docType === null) {
        $user = Auth::require();
        Club::requirePermission($user, 'documents.read');
        $dive = archivedDiveOrAbort($m[1], (string)$user['club_id'], false);
        Json::ok([
            'dive_id'    => $dive['id'],
            'status'     => $dive['documents_status'],
            'updated_at' => SyncHelpers::toIso($dive['documents_updated_at'] ?? null),
            'documents'  => DiveArchive::listForDive((string)$dive['id']),
        ]);
    }
    if ($method === 'GET' && $docType !== null) {
        if (!in_array($docType, DivePdf::TYPES, true)) Json::abort(404, 'Type de document inconnu');
        $user = Auth::require();
        Club::requirePermission($user, 'documents.read');
        $dive = archivedDiveOrAbort($m[1], (string)$user['club_id'], false);
        try {
            $doc = DiveArchive::read((string)$dive['id'], $docType);
        } catch (\RuntimeException $e) {
            error_log('[dp-fede] ' . $e->getMessage());
            Log::action('dive.document_unreadable', ['dive_id' => $dive['id'], 'type' => $docType]);
            Json::abort(500, 'Document archivé illisible ou altéré : régénérer le document');
        }
        if ($doc === null) Json::abort(404, 'Document non disponible (statut : ' . ($dive['documents_status'] ?? 'aucun') . ')');
        Log::action('dive.document_downloaded', ['dive_id' => $dive['id'], 'type' => $docType]);
        PdfRender::stream($doc['content'], DivePdf::filename($dive, $docType));
    }
    if ($method === 'POST' && $docType === null) {
        // Régénération : seulement si documents_status = 'error' ou document
        // manquant / altéré (sinon 409) ; journalisée avec l'ancienne empreinte.
        // Un document intègre n'est jamais remplacé.
        Csrf::verify();
        $user = Auth::require();
        Club::requirePermission($user, 'documents.generate');
        $dive = archivedDiveOrAbort($m[1], (string)$user['club_id'], true);
        $res  = DiveArchive::regenerate($dive, new DateTimeImmutable('now'));
        if ($res['status'] === 'refused') Json::abort(409, $res['message'], $res['code']);
        if ($res['status'] !== 'ok') {
            Json::abort(500, 'Échec de la génération des documents (détail journalisé côté serveur)');
        }
        Json::ok([
            'dive_id'   => $dive['id'],
            'status'    => 'ok',
            'documents' => DiveArchive::listForDive((string)$dive['id']),
        ]);
    }
}

/** Plongée archivée du club, sinon 404 (409 si non archivée et $mustBeArchived). */
function archivedDiveOrAbort(string $idOrUuid, string $clubId, bool $mustBeArchived): array {
    $dive = DiveStore::findActive(
        $idOrUuid, $clubId,
        'id, club_id, status, site_nom, date_plongee, documents_status, documents_updated_at'
    );
    if (!$dive) Json::abort(404, 'Plongée introuvable');
    if ($mustBeArchived && $dive['status'] !== 'archived') {
        Json::abort(409, 'Les documents ne sont générés que pour une plongée archivée', 'DIVE_NOT_ARCHIVED');
    }
    return $dive;
}

// ─────────────────────────────────────────────────────────────────────────────
// render_state : objet JSON { pressions, realises, heuresDebut, heuresFin,
// checked, comments } — refuse les autres types et les charges > 512 Ko.
// ─────────────────────────────────────────────────────────────────────────────

/** @param mixed $value */
function renderStateJsonOrAbort($value): string {
    try {
        return Validate::encodeJsonObject($value, DivePolicy::RENDER_STATE_MAX_BYTES, 'render_state');
    } catch (InvalidArgumentException $e) {
        Json::abort(422, $e->getMessage());
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de format date_plongee / planned_at / started_at / closed_at.
// ─────────────────────────────────────────────────────────────────────────────

function parseDiveDateToMySql(string $raw): ?string {
    $raw = trim($raw);
    if ($raw === '') return null;
    $candidates = [
        'Y-m-d\TH:i',
        'Y-m-d\TH:i:s',
        'Y-m-d H:i',
        'Y-m-d H:i:s',
        'Y-m-d',
    ];
    foreach ($candidates as $fmt) {
        $dt = DateTimeImmutable::createFromFormat($fmt, $raw);
        if ($dt !== false) return $dt->format('Y-m-d H:i:s');
    }
    // ISO 8601 avec fuseau (ex. toISOString() → 2026-06-12T06:30:00.000Z) :
    // converti dans le fuseau du serveur, comme les dates saisies localement.
    if (preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/', $raw)) {
        try {
            $dt = new DateTimeImmutable($raw);
            return $dt->setTimezone(new DateTimeZone(date_default_timezone_get()))->format('Y-m-d H:i:s');
        } catch (Exception $e) {
            return null;
        }
    }
    return null;
}

/**
 * Vrai si le PATCH porte answers ET palanquees vides : signature d'un client
 * qui écrirait un état jamais chargé.
 */
function isEmptyDivePayload(array $body): bool {
    if (!array_key_exists('answers', $body) || !array_key_exists('palanquees', $body)) return false;
    return empty($body['answers']) && empty($body['palanquees']);
}

function normalizeDiveDate(?string $sqlDate): ?string {
    if (!$sqlDate) return null;
    $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $sqlDate);
    return $dt ? $dt->format('Y-m-d\TH:i') : $sqlDate;
}
