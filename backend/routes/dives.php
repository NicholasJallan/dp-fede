<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/Rules.php';
require_once __DIR__ . '/../lib/Encadrement.php';

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

// ── GET /api/dives/day-load?date=AAAA-MM-JJ ─────────────────────────────────
// Charge du jour (Polynésie, arrêté n° 199 CM art. 5) : une entrée par
// plongeur et par palanquée des plongées du club ce jour-là. Déclarée avant
// GET /api/dives/:id (sinon « day-load » serait lu comme un id).
if ($method === 'GET' && $path === '/api/dives/day-load') {
    $user = Auth::require();
    Club::requirePermission($user, 'dives.read');
    $date = (string)($_GET['date'] ?? '');
    if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $date) !== 1) Json::abort(422, 'Date invalide (AAAA-MM-JJ attendu)');
    $exclude = isset($_GET['exclude']) ? (string)$_GET['exclude'] : null;
    Json::ok(['date' => $date, 'entries' => DiveDayLoad::forDay((string)$user['club_id'], $date, $exclude)]);
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

    try {
        $created = DiveService::create($clubId, (string)$user['id'], $body);
    } catch (DiveRefusal $e) {
        Json::abort($e->httpStatus, $e->getMessage(), $e->errorCode);
    } catch (PDOException $e) {
        // Deux rejeux simultanés : l'index unique (club_id, client_uuid) a
        // arrêté le second → même réponse qu'un rejeu séquentiel.
        if ($clientUuid && (string)$e->getCode() === '23000') respondIfClientUuidKnown($clientUuid, $clubId);
        throw $e;
    }
    Json::ok(['id' => $created['id'], 'duplicate' => false, 'documents_status' => $created['documents_status']], 201);
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
    try {
        Json::ok(DiveService::patch((string)$user['club_id'], $m[1], Json::body()));
    } catch (DiveRefusal $e) {
        Json::abort($e->httpStatus, $e->getMessage(), $e->errorCode);
    }
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

    Db::q("UPDATE dives SET deleted_at=NOW() WHERE id=? AND club_id=? AND status<>'archived'", [$row['id'], $user['club_id']]);
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
// Helpers de format date_plongee / planned_at / started_at / closed_at.
// ─────────────────────────────────────────────────────────────────────────────

function parseDiveDateToMySql(string $raw): ?string {
    return DiveDates::toMysql($raw);
}

function normalizeDiveDate(?string $sqlDate): ?string {
    return DiveDates::fromMysql($sqlDate);
}
