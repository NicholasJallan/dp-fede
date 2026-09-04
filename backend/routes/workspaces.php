<?php
declare(strict_types=1);

// Structures partagées (stages, clubs, sorties).
//
// Une structure possède un « compte-structure » : une ligne users avec
// kind='workspace', sans identité Google exploitable, qui ne peut jamais se
// connecter (cf. Auth::current()). Les divers / sites / dives du stage lui
// appartiennent, et les membres agissent pour son compte via $user['scope_id'].
// Ajouter un stage = créer une structure + distribuer son code d'invitation.

// GET /api/workspaces — les structures dont je suis membre
if ($method === 'GET' && $path === '/api/workspaces') {
    $user = Auth::require();
    Json::ok(array_map('wsPublic', Db::all(
        'SELECT w.id, w.name, w.slug, m.role,
                (SELECT COUNT(*) FROM workspace_members mm WHERE mm.workspace_id = w.id) AS members_count
           FROM workspaces w
           JOIN workspace_members m ON m.workspace_id = w.id
          WHERE m.user_id = ? AND w.archived_at IS NULL
          ORDER BY w.name',
        [$user['id']]
    )));
}

// POST /api/workspaces/join — rejoindre avec un code d'invitation
if ($method === 'POST' && $path === '/api/workspaces/join') {
    Csrf::verify();
    $user = Auth::require();
    $code = strtoupper(trim(Json::body()['code'] ?? ''));

    if ($code === '' || !preg_match('/^[A-Z0-9][A-Z0-9\-]{2,39}$/', $code)) {
        Json::abort(400, 'Code invalide.');
    }

    // La collation utf8mb4_unicode_ci rend la comparaison insensible à la casse.
    $ws = Db::row('SELECT * FROM workspaces WHERE join_code = ? AND archived_at IS NULL', [$code]);
    if (!$ws) Json::abort(404, 'Aucune structure ne correspond à ce code.');

    Db::q(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE role = role',
        [$ws['id'], $user['id'], 'member']
    );
    Auth::setWorkspace((int)$ws['id']);
    Log::action('workspace.join', ['user_id' => $user['id'], 'workspace' => $ws['slug']]);

    Json::ok(userPublic(Auth::current()));
}

// POST /api/workspaces/activate — basculer de scope ({workspace_id: null} = perso)
if ($method === 'POST' && $path === '/api/workspaces/activate') {
    Csrf::verify();
    $user = Auth::require();
    $raw  = Json::body()['workspace_id'] ?? null;

    if ($raw === null || $raw === '' || $raw === 0 || $raw === '0') {
        Auth::setWorkspace(null);
    } else {
        $wsId = (int)$raw;
        $ok   = Db::row(
            'SELECT w.id FROM workspaces w
               JOIN workspace_members m ON m.workspace_id = w.id AND m.user_id = ?
              WHERE w.id = ? AND w.archived_at IS NULL',
            [$user['id'], $wsId]
        );
        if (!$ok) Json::abort(403, 'Vous n\'êtes pas membre de cette structure.');
        Auth::setWorkspace($wsId);
    }

    Json::ok(userPublic(Auth::current()));
}

// DELETE /api/workspaces/:id/members/me — quitter une structure
if ($method === 'DELETE' && preg_match('#^/api/workspaces/(\d+)/members/me$#', $path, $m)) {
    Csrf::verify();
    $user = Auth::require();
    Db::q('DELETE FROM workspace_members WHERE workspace_id=? AND user_id=?', [(int)$m[1], $user['id']]);
    Auth::setWorkspace(null);
    Json::ok(userPublic(Auth::current()));
}

// GET /api/workspaces/all — toutes les structures (super-admin)
if ($method === 'GET' && $path === '/api/workspaces/all') {
    Auth::requireSuperAdmin();
    Json::ok(array_map('wsPublic', Db::all(
        'SELECT w.id, w.name, w.slug, w.join_code, w.created_at, \'owner\' AS role,
                (SELECT COUNT(*) FROM workspace_members mm WHERE mm.workspace_id = w.id) AS members_count,
                (SELECT COUNT(*) FROM divers d WHERE d.user_id = w.data_user_id AND d.deleted_at IS NULL) AS divers_count,
                (SELECT COUNT(*) FROM dives v WHERE v.user_id = w.data_user_id AND v.deleted_at IS NULL) AS dives_count
           FROM workspaces w
          WHERE w.archived_at IS NULL
          ORDER BY w.created_at DESC'
    )));
}

// POST /api/workspaces — créer une structure (super-admin)
if ($method === 'POST' && $path === '/api/workspaces') {
    Csrf::verify();
    $user = Auth::requireSuperAdmin();
    $v    = new Validate(Json::body());
    $v->required('name', 'Nom de la structure')
      ->maxLen('name', 200, 'Nom de la structure')
      ->required('join_code', 'Code d\'invitation')
      ->maxLen('join_code', 40, 'Code d\'invitation')
      ->abortIfErrors();

    $name = $v->str('name');
    $code = strtoupper($v->str('join_code'));
    $slug = wsSlugify($name);

    if (!preg_match('/^[A-Z0-9][A-Z0-9\-]{2,39}$/', $code)) {
        Json::abort(400, 'Le code doit faire au moins 3 caractères (lettres, chiffres, tirets).');
    }
    if ($slug === '') Json::abort(400, 'Nom de structure invalide.');
    if (Db::row('SELECT id FROM workspaces WHERE slug=? OR join_code=?', [$slug, $code])) {
        Json::abort(409, 'Une structure porte déjà ce nom ou ce code.');
    }

    $pdo = Db::get();
    $pdo->beginTransaction();
    try {
        // Compte-structure : porte les données du stage et l'identité affichée
        // sur la fiche de sécurité. Non connectable (kind='workspace').
        Db::q(
            'INSERT INTO users (google_sub, email, nom, prenom, avatar_url, role, kind, club_nom, urgence_defaut)
             VALUES (?,?,?,?,?,?,?,?,?)',
            [
                'workspace:' . $slug . ':' . bin2hex(random_bytes(8)),
                'structure+' . $slug . '@dp-fede.invalid',
                '', '', '', 'user', 'workspace', $name, '18',
            ]
        );
        $dataUserId = (int)$pdo->lastInsertId();

        Db::q(
            'INSERT INTO workspaces (name, slug, join_code, data_user_id, created_by) VALUES (?,?,?,?,?)',
            [$name, $slug, $code, $dataUserId, $user['id']]
        );
        $wsId = (int)$pdo->lastInsertId();

        Db::q(
            'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES (?,?,?)',
            [$wsId, $user['id'], 'owner']
        );
        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        Json::abort(500, 'Création impossible : ' . $e->getMessage());
    }

    Log::action('workspace.create', ['user_id' => $user['id'], 'workspace' => $slug]);
    Json::ok(wsPublic(Db::row(
        'SELECT id, name, slug, join_code, created_at, \'owner\' AS role, 1 AS members_count FROM workspaces WHERE id=?',
        [$wsId]
    )), 201);
}

// ── Helpers ────────────────────────────────────────────────────────────────

/** Normalise les entiers renvoyés en texte par PDO (le front compare des ids). */
function wsPublic(?array $w): ?array {
    if (!$w) return null;
    foreach (['id', 'members_count', 'divers_count', 'dives_count'] as $k) {
        if (isset($w[$k])) $w[$k] = (int)$w[$k];
    }
    return $w;
}

/** « BEPPA Hendaye 2026 » → « beppa-hendaye-2026 ». */
function wsSlugify(string $name): string {
    $s = iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $name);
    if ($s === false) $s = $name;
    $s = strtolower($s);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    return trim(substr($s, 0, 80), '-');
}
