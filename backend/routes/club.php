<?php
declare(strict_types=1);

// Socle club — contrat détaillé : docs/api-club.md.
// Toutes les écritures : CSRF + Auth + rate-limit « write » (index.php).

if (strpos($path, '/api/club') === 0) {

    // ── Club courant ────────────────────────────────────────────────────────

    // GET /api/club — informations du club courant, rôle, permissions, volumes.
    if ($method === 'GET' && $path === '/api/club') {
        $user = Auth::require();
        Club::requirePermission($user, 'club.read');
        Json::ok(clubPayload($user));
    }

    // PATCH /api/club — met à jour les informations du club (responsable).
    if ($method === 'PATCH' && $path === '/api/club') {
        Csrf::verify();
        $user = Auth::require();
        Club::requirePermission($user, 'club.manage');
        [$fields, $errors] = Club::sanitizeClubFields(Json::body());
        if ($errors) Json::abort(422, implode('; ', $errors));
        if (!$fields) Json::abort(422, 'Aucun champ à mettre à jour');
        Club::update((string)$user['club_id'], $fields);
        Log::action('club.updated', ['club_id' => $user['club_id'], 'fields' => array_keys($fields)]);
        Json::ok(clubPayload($user));
    }

    // DELETE /api/club — suppression du club. Corps : { "confirm": "SUPPRIMER" }.
    // Conservation légale (A322-72) : les fiches archivées de moins d'un an et
    // les données qu'elles référencent sont conservées (club soft-deleted,
    // sans membre) puis purgées par bin/purge.php ; le reste est supprimé.
    if ($method === 'DELETE' && $path === '/api/club') {
        Csrf::verify();
        $user = Auth::require();
        Club::requirePermission($user, 'club.manage');
        if ((Json::body()['confirm'] ?? null) !== Account::DELETE_CONFIRMATION) {
            Json::abort(422, 'Confirmation requise : envoyer { "confirm": "' . Account::DELETE_CONFIRMATION . '" }');
        }
        $clubId = (string)$user['club_id'];
        $result = ClubRetention::retire($clubId);
        $kept   = $result['retained'];
        Log::action('club.deleted', ['club_id' => $clubId, 'rows' => $result['counts'], 'retained' => $kept]);
        Json::ok([
            'deleted'  => true,
            'club_id'  => $clubId,
            'retained' => ['fiches' => $kept['count'], 'until' => $kept['until']],
            'message'  => ClubRetention::message($kept['count'], $kept['until']),
        ]);
    }

    // ── Clubs de l'utilisateur / changement de club courant ─────────────────

    // GET /api/club/memberships — clubs dont l'utilisateur est membre.
    if ($method === 'GET' && $path === '/api/club/memberships') {
        $user = Auth::require(); // garantit au moins un club
        Json::ok([
            'current_club_id' => $user['club_id'],
            'clubs'           => Club::memberships((int)$user['id'], (string)$user['club_id']),
        ]);
    }

    // POST /api/club/switch { club_id } — change le club courant.
    if ($method === 'POST' && $path === '/api/club/switch') {
        Csrf::verify();
        $user   = Auth::requireUser();
        $clubId = strtolower(trim((string)(Json::body()['club_id'] ?? '')));
        if (!SyncHelpers::isValidUuid($clubId)) Json::abort(422, 'club_id invalide');
        $role = Club::memberRole($clubId, (int)$user['id']);
        if ($role === null) Json::abort(403, 'Vous n\'êtes pas membre de ce club');
        Db::q('UPDATE users SET current_club_id=? WHERE id=?', [$clubId, $user['id']]);
        Log::action('club.switched', ['club_id' => $clubId]);
        $user['current_club_id'] = $clubId;
        Json::ok(clubPayload($user + ['club_id' => $clubId, 'club_role' => $role]));
    }

    // ── Membres ─────────────────────────────────────────────────────────────

    // GET /api/club/members — membres du club (e-mail visible du responsable).
    if ($method === 'GET' && $path === '/api/club/members') {
        $user = Auth::require();
        Club::requirePermission($user, 'members.read');
        $canManage = Club::can($user['club_role'], 'club.manage');
        $rows = Db::all(
            "SELECT m.user_id, m.role, m.created_at AS joined_at,
                    u.nom, u.prenom, u.email, u.avatar_url, u.last_seen_at
               FROM club_members m JOIN users u ON u.id = m.user_id
              WHERE m.club_id=?
              ORDER BY FIELD(m.role,'responsable','dp','encadrant','lecture'), u.nom, u.prenom",
            [$user['club_id']]
        );
        $members = array_map(static function (array $r) use ($user, $canManage): array {
            $isMe = (int)$r['user_id'] === (int)$user['id'];
            return [
                'user_id'      => (int)$r['user_id'],
                'role'         => $r['role'],
                'nom'          => $r['nom'],
                'prenom'       => $r['prenom'],
                'email'        => ($canManage || $isMe) ? $r['email'] : null,
                'avatar_url'   => $r['avatar_url'],
                'joined_at'    => SyncHelpers::toIso($r['joined_at']),
                'last_seen_at' => $canManage ? SyncHelpers::toIso($r['last_seen_at']) : null,
                'is_me'        => $isMe,
            ];
        }, $rows);
        Json::ok([
            'members'     => $members,
            'invitations' => $canManage ? ClubInvitation::listForClub((string)$user['club_id']) : [],
        ]);
    }

    // PATCH /api/club/members/:userId { role } — change le rôle (responsable).
    if ($method === 'PATCH' && preg_match('#^/api/club/members/(\d+)$#', $path, $m)) {
        Csrf::verify();
        $user = Auth::require();
        Club::requirePermission($user, 'club.manage');
        $targetId = (int)$m[1];
        $role     = (string)(Json::body()['role'] ?? '');
        if (!Club::isRole($role)) Json::abort(422, 'Rôle invalide (responsable, dp, encadrant, lecture)');
        $current = Club::memberRole((string)$user['club_id'], $targetId);
        if ($current === null) Json::abort(404, 'Membre introuvable');
        if ($current === 'responsable' && $role !== 'responsable' && Club::responsableCount((string)$user['club_id']) <= 1) {
            Json::abort(409, 'Le club doit garder au moins un responsable');
        }
        Db::q('UPDATE club_members SET role=? WHERE club_id=? AND user_id=?', [$role, $user['club_id'], $targetId]);
        Log::action('club.member_role', ['club_id' => $user['club_id'], 'target_id' => $targetId, 'role' => $role]);
        Json::ok(['user_id' => $targetId, 'role' => $role]);
    }

    // DELETE /api/club/members/:userId — retire un membre (responsable), ou
    // quitte le club (soi-même). Ses contributions restent au club.
    if ($method === 'DELETE' && preg_match('#^/api/club/members/(\d+)$#', $path, $m)) {
        Csrf::verify();
        $user     = Auth::require();
        $targetId = (int)$m[1];
        $isSelf   = $targetId === (int)$user['id'];
        if (!$isSelf) Club::requirePermission($user, 'club.manage');
        $current = Club::memberRole((string)$user['club_id'], $targetId);
        if ($current === null) Json::abort(404, 'Membre introuvable');
        if ($current === 'responsable' && Club::responsableCount((string)$user['club_id']) <= 1) {
            Json::abort(409, $isSelf
                ? 'Vous êtes le seul responsable : confiez ce rôle à un autre membre ou supprimez le club'
                : 'Le club doit garder au moins un responsable');
        }
        Db::q('DELETE FROM club_members WHERE club_id=? AND user_id=?', [$user['club_id'], $targetId]);
        Db::q('UPDATE users SET current_club_id=NULL WHERE id=? AND current_club_id=?', [$targetId, $user['club_id']]);
        Log::action('club.member_removed', ['club_id' => $user['club_id'], 'target_id' => $targetId, 'self' => $isSelf]);
        Json::ok(['user_id' => $targetId, 'removed' => true]);
    }

    // ── Invitations ─────────────────────────────────────────────────────────

    // GET /api/club/invitations — invitations en attente (responsable).
    if ($method === 'GET' && $path === '/api/club/invitations') {
        $user = Auth::require();
        Club::requirePermission($user, 'club.manage');
        Json::ok(ClubInvitation::listForClub((string)$user['club_id']));
    }

    // POST /api/club/invitations { email, role } — crée un lien à usage
    // unique (7 jours). Le jeton n'est renvoyé qu'ici, une seule fois.
    if ($method === 'POST' && $path === '/api/club/invitations') {
        Csrf::verify();
        $user = Auth::require();
        Club::requirePermission($user, 'club.manage');
        $body  = Json::body();
        $email = ClubInvitation::normalizeEmail((string)($body['email'] ?? ''));
        $role  = (string)($body['role'] ?? 'dp');
        if (!ClubInvitation::isValidEmail($email)) Json::abort(422, 'Adresse e-mail invalide');
        if (!Club::isRole($role)) Json::abort(422, 'Rôle invalide (responsable, dp, encadrant, lecture)');
        $already = Db::row(
            'SELECT 1 FROM club_members m JOIN users u ON u.id = m.user_id WHERE m.club_id=? AND LOWER(u.email)=?',
            [$user['club_id'], $email]
        );
        if ($already) Json::abort(409, 'Cette personne est déjà membre du club');
        if (ClubInvitation::pendingCount((string)$user['club_id']) >= ClubInvitation::MAX_PENDING) {
            Json::abort(429, 'Trop d\'invitations en attente : annulez-en avant d\'en créer de nouvelles');
        }
        $created = ClubInvitation::create((string)$user['club_id'], $email, $role, (int)$user['id']);
        Log::action('club.invitation_created', ['club_id' => $user['club_id'], 'invitation_id' => $created['invitation']['id'] ?? null, 'role' => $role]);
        Json::ok(ClubInvitation::publicInvitation($created['invitation'], new DateTimeImmutable('now')) + [
            'token' => $created['token'],
            'url'   => ClubInvitation::link((string)(Config::get('app')['domain'] ?? ''), $created['token']),
        ], 201);
    }

    // DELETE /api/club/invitations/:id — annule une invitation (responsable).
    if ($method === 'DELETE' && preg_match('#^/api/club/invitations/([0-9a-fA-F-]{36})$#', $path, $m)) {
        Csrf::verify();
        $user = Auth::require();
        Club::requirePermission($user, 'club.manage');
        if (!ClubInvitation::revoke((string)$user['club_id'], $m[1])) Json::abort(404, 'Invitation introuvable ou déjà utilisée');
        Log::action('club.invitation_revoked', ['club_id' => $user['club_id'], 'invitation_id' => $m[1]]);
        Json::ok(['id' => $m[1], 'revoked' => true]);
    }

    // POST /api/club/invitations/preview { token } — aperçu avant acceptation.
    // POST /api/club/invitations/accept  { token } — rejoint le club.
    if ($method === 'POST' && preg_match('#^/api/club/invitations/(preview|accept)$#', $path, $m)) {
        Csrf::verify();
        $user = Auth::requireUser();
        RateLimit::hitOrAbort('invite', 20, 900, 'Trop de tentatives. Réessayez dans 15 minutes.', 'u' . $user['id']);
        $token = strtolower(trim((string)(Json::body()['token'] ?? '')));
        $inv   = ClubInvitation::findByToken($token);
        if (!$inv) Json::abort(404, 'Invitation introuvable');
        $now = new DateTimeImmutable('now');

        if ($m[1] === 'preview') {
            Json::ok([
                'club_id'      => $inv['club_id'],
                'club_nom'     => $inv['club_nom'],
                'role'         => $inv['role'],
                'email'        => $inv['email'],
                'status'       => ClubInvitation::status($inv, $now),
                'expires_at'   => SyncHelpers::toIso($inv['expires_at']),
                'email_matches'=> ClubInvitation::normalizeEmail((string)$inv['email'])
                                  === ClubInvitation::normalizeEmail((string)$user['email']),
                'already_member' => Club::memberRole((string)$inv['club_id'], (int)$user['id']) !== null,
            ]);
        }

        $err = ClubInvitation::acceptError($inv, (string)$user['email'], $now);
        if ($err !== null) Json::abort($err[0], $err[1]);
        if (!ClubInvitation::accept($inv, (int)$user['id'])) {
            Json::abort(410, 'Cette invitation vient d\'être utilisée ou a expiré');
        }
        $removed = Club::removeEmptyPersonalClubs((int)$user['id'], (string)$inv['club_id']);
        Log::action('club.invitation_accepted', ['club_id' => $inv['club_id'], 'invitation_id' => $inv['id']]);
        $role = Club::memberRole((string)$inv['club_id'], (int)$user['id']) ?? $inv['role'];
        $user['current_club_id'] = $inv['club_id'];
        Json::ok(clubPayload($user + ['club_id' => $inv['club_id'], 'club_role' => $role]) + [
            'removed_empty_clubs' => $removed,
        ]);
    }

    // ── Alertes / statistiques ──────────────────────────────────────────────

    // GET /api/club/alerts?days=30 — CACI, licences, autorisations parentales.
    if ($method === 'GET' && $path === '/api/club/alerts') {
        $user = Auth::require();
        Club::requirePermission($user, 'alerts.read');
        $days = isset($_GET['days']) ? (int)$_GET['days'] : ClubAlerts::DEFAULT_DAYS;
        if ($days < 1 || $days > ClubAlerts::MAX_DAYS) Json::abort(422, 'days doit être compris entre 1 et ' . ClubAlerts::MAX_DAYS);
        Json::ok(ClubAlerts::fetchForClub((string)$user['club_id'], $days));
    }

    // GET /api/club/stats?from=AAAA-MM-JJ&to=AAAA-MM-JJ[&format=csv]
    if ($method === 'GET' && $path === '/api/club/stats') {
        $user  = Auth::require();
        Club::requirePermission($user, 'stats.read');
        $range = ClubStats::parseRange($_GET['from'] ?? null, $_GET['to'] ?? null, new DateTimeImmutable('today'));
        if (is_string($range)) Json::abort(422, $range);
        $stats = ClubStats::fetch((string)$user['club_id'], $range[0], $range[1]);
        if (($_GET['format'] ?? '') === 'csv') {
            $csv = ClubStats::toCsv($stats);
            header('Content-Type: text/csv; charset=utf-8');
            header('Content-Disposition: attachment; filename="statistiques-' . $range[0] . '-' . $range[1] . '.csv"');
            header('Content-Length: ' . strlen($csv));
            header('Cache-Control: no-store');
            echo $csv;
            exit;
        }
        Json::ok($stats);
    }
}

/** Réponse commune : club courant, rôle, permissions, volumes. */
function clubPayload(array $user): array {
    $clubId = (string)$user['club_id'];
    $club   = Club::find($clubId);
    if (!$club) Json::abort(404, 'Club introuvable');
    $count = static function (string $sql) use ($clubId): int {
        return (int)(Db::row($sql, [$clubId])['n'] ?? 0);
    };
    $permissions = [];
    foreach (array_keys(Club::PERMISSIONS) as $action) {
        $permissions[$action] = Club::can($user['club_role'], $action);
    }
    return [
        'club'        => Club::publicClub($club),
        'role'        => $user['club_role'],
        'permissions' => $permissions,
        'counts'      => [
            'members'        => $count('SELECT COUNT(*) AS n FROM club_members WHERE club_id=?'),
            'divers'         => $count('SELECT COUNT(*) AS n FROM divers WHERE club_id=? AND deleted_at IS NULL'),
            'sites'          => $count('SELECT COUNT(*) AS n FROM sites WHERE club_id=? AND deleted_at IS NULL'),
            'dives'          => $count('SELECT COUNT(*) AS n FROM dives WHERE club_id=? AND deleted_at IS NULL'),
            'dives_archived' => $count("SELECT COUNT(*) AS n FROM dives WHERE club_id=? AND deleted_at IS NULL AND status='archived'"),
        ],
        'clubs_count' => count(Club::membershipRoles((int)$user['id'])),
    ];
}
