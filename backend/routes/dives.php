<?php
declare(strict_types=1);

// ── GET /api/dives ─────────────────────────────────────────────────────────
// Liste des plongées (tous statuts par défaut).
// ?status=prepared,in_progress,archived — filtre sur un ou plusieurs statuts.
// ?since=ISO8601 — pull incrémental (updated_at >= since).
if ($method === 'GET' && $path === '/api/dives') {
    $user   = Auth::require();
    $since  = $_GET['since']  ?? null;
    $status = isset($_GET['status'])
        ? array_filter(array_map('trim', explode(',', $_GET['status'])))
        : [];
    $allowed = ['prepared', 'in_progress', 'archived'];

    $where  = ['d.user_id=?'];
    $params = [$user['id']];

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
                d.palanquees, d.deleted_at, d.updated_at, d.created_at
           FROM dives d
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
if ($method === 'GET' && preg_match('#^/api/dives/([^/]+)$#', $path, $m)) {
    $user = Auth::require();
    $row  = Db::row(
        'SELECT * FROM dives WHERE id=? AND user_id=? AND deleted_at IS NULL',
        [$m[1], $user['id']]
    );
    if (!$row) {
        // Essai par client_uuid (utile lors du premier load depuis le client)
        $row = Db::row(
            'SELECT * FROM dives WHERE client_uuid=? AND user_id=? AND deleted_at IS NULL',
            [$m[1], $user['id']]
        );
    }
    if (!$row) Json::abort(404, 'Plongée introuvable');
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
// Idempotence : si client_uuid existe déjà pour cet utilisateur, renvoie 200.
if ($method === 'POST' && $path === '/api/dives') {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();

    $clientUuid = isset($body['client_uuid']) && SyncHelpers::isValidUuid((string)$body['client_uuid'])
        ? (string)$body['client_uuid'] : null;

    if ($clientUuid) {
        $existing = Db::row(
            'SELECT id, status FROM dives WHERE user_id=? AND client_uuid=?',
            [$user['id'], $clientUuid]
        );
        if ($existing) {
            Json::ok(['id' => $existing['id'], 'duplicate' => true], 200);
        }
    }

    $status  = in_array($body['status'] ?? '', ['prepared', 'in_progress', 'archived'])
        ? $body['status'] : 'prepared';
    $dpDate  = parseDiveDateToMySql((string)($body['date_plongee'] ?? ''));
    $planned = $dpDate; // planned_at = date_plongee à la création

    $id = Db::uuid();
    Db::q(
        'INSERT INTO dives
         (id, user_id, client_uuid, status, site_nom, date_plongee, planned_at,
          dp_nom, dp_qual, activite, answers, palanquees, render_state, drive_link)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
            $id, $user['id'], $clientUuid, $status,
            substr((string)($body['site_nom']   ?? ''), 0, 255),
            $dpDate,
            $planned,
            substr((string)($body['dp_nom']     ?? ''), 0, 200),
            substr((string)($body['dp_qual']    ?? ''), 0, 20),
            substr((string)($body['activite']   ?? ''), 0, 50),
            json_encode($body['answers']    ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($body['palanquees'] ?? [], JSON_UNESCAPED_UNICODE),
            json_encode($body['render_state'] ?? [], JSON_UNESCAPED_UNICODE),
            substr((string)($body['drive_link'] ?? ''), 0, 500),
        ]
    );
    Log::action('dive.created', ['dive_id' => $id]);
    Json::ok(['id' => $id, 'duplicate' => false], 201);
}

// ── PATCH /api/dives/:id ────────────────────────────────────────────────────
// Mise à jour partielle d'une plongée.
// Autorisée sur tous les champs tant que status != 'archived'.
// Quand status = 'archived' : seuls drive_link et render_state sont mutables.
// Transition 'archived' → tout autre statut : refusée.
if ($method === 'PATCH' && preg_match('#^/api/dives/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();

    $row = Db::row(
        'SELECT id, status FROM dives WHERE (id=? OR client_uuid=?) AND user_id=? AND deleted_at IS NULL',
        [$m[1], $m[1], $user['id']]
    );
    if (!$row) Json::abort(404, 'Plongée introuvable');

    $curStatus = $row['status'];
    $newStatus = isset($body['status']) && in_array($body['status'], ['prepared', 'in_progress', 'archived'])
        ? $body['status'] : null;

    // Transition rétrograde interdite
    if ($newStatus !== null && $curStatus === 'archived' && $newStatus !== 'archived') {
        Json::abort(422, 'Impossible de modifier le statut d\'une plongée archivée');
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
        }
        if (isset($body['planned_at'])) {
            $sets[]   = 'planned_at=?';
            $params[] = parseDiveDateToMySql((string)$body['planned_at']);
        }
        if (isset($body['started_at'])) {
            $sets[]   = 'started_at=?';
            $params[] = parseDiveDateToMySql((string)$body['started_at']);
        }
        if (isset($body['closed_at'])) {
            $sets[]   = 'closed_at=?';
            $params[] = parseDiveDateToMySql((string)$body['closed_at']);
        }
    }

    // render_state et drive_link sont mutables même après archivage
    if (isset($body['render_state'])) {
        $sets[]   = 'render_state=?';
        $params[] = json_encode($body['render_state'], JSON_UNESCAPED_UNICODE);
    }
    if (isset($body['drive_link'])) {
        $sets[]   = 'drive_link=?';
        $params[] = substr((string)$body['drive_link'], 0, 500);
    }

    if (empty($sets)) Json::abort(422, 'Aucun champ à mettre à jour');

    $params[] = $row['id'];
    Db::q('UPDATE dives SET ' . implode(',', $sets) . ' WHERE id=?', $params);

    $updated = Db::row('SELECT id, status, drive_link FROM dives WHERE id=?', [$row['id']]);
    if ($newStatus === 'archived' && $curStatus !== 'archived') {
        Log::action('dive.archived', ['dive_id' => $updated['id'], 'drive_link' => $updated['drive_link'] ?? null]);
    }
    Json::ok($updated);
}

// ── DELETE /api/dives/:id ───────────────────────────────────────────────────
// Suppression logique (soft-delete). Refusée si status = 'archived'.
if ($method === 'DELETE' && preg_match('#^/api/dives/([^/]+)$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();

    $row = Db::row(
        'SELECT id, status FROM dives WHERE (id=? OR client_uuid=?) AND user_id=? AND deleted_at IS NULL',
        [$m[1], $m[1], $user['id']]
    );
    if (!$row) Json::abort(404, 'Plongée introuvable');
    if ($row['status'] === 'archived') {
        Json::abort(422, 'Impossible de supprimer une plongée archivée');
    }

    Db::q('UPDATE dives SET deleted_at=NOW() WHERE id=?', [$row['id']]);
    Log::action('dive.deleted', ['dive_id' => $row['id']]);
    Json::ok(['id' => $row['id'], 'deleted' => true]);
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
    return null;
}

function normalizeDiveDate(?string $sqlDate): ?string {
    if (!$sqlDate) return null;
    $dt = DateTimeImmutable::createFromFormat('Y-m-d H:i:s', $sqlDate);
    return $dt ? $dt->format('Y-m-d\TH:i') : $sqlDate;
}
