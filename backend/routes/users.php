<?php
declare(strict_types=1);

// Toute la gestion d'utilisateurs est réservée AU super-administrateur
// (identifié par email unique, voir Auth::SUPER_ADMIN_EMAIL).
// Un compte simplement promu role='admin' en base n'a PAS accès ici.

// GET /api/users — liste de tous les utilisateurs
if ($method === 'GET' && $path === '/api/users') {
    Auth::requireSuperAdmin();
    $rows = Db::all(
        'SELECT id,email,nom,prenom,role,club_nom,club_numero,club_siret,
                created_at,last_login
         FROM users WHERE kind = \'person\' ORDER BY created_at'
    );
    Json::ok($rows);
}

// GET /api/users/stats — stats agrégées par utilisateur
if ($method === 'GET' && $path === '/api/users/stats') {
    Auth::requireSuperAdmin();
    $rows = Db::all('
        SELECT
          u.id, u.email, u.nom, u.prenom, u.club_nom, u.role,
          u.created_at, u.last_login,
          (SELECT COUNT(*) FROM divers d WHERE d.user_id=u.id AND d.deleted_at IS NULL) AS nb_divers,
          (SELECT COUNT(*) FROM sites  s WHERE s.user_id=u.id AND s.deleted_at IS NULL) AS nb_sites,
          (SELECT COUNT(*) FROM dives  v WHERE v.user_id=u.id AND v.deleted_at IS NULL) AS nb_fiches
        FROM users u
        WHERE u.kind = \'person\'
        ORDER BY u.created_at DESC
    ');
    Json::ok($rows);
}

// PATCH /api/users/:id/role — changer le rôle (super-admin uniquement)
if ($method === 'PATCH' && preg_match('#^/api/users/(\d+)/role$#', $path, $m)) {
    Csrf::verify();
    $me = Auth::requireSuperAdmin();
    if ((int)$m[1] === (int)$me['id']) Json::abort(400, 'Impossible de modifier votre propre rôle');

    $body = Json::body();
    $role = $body['role'] ?? '';
    if (!in_array($role, ['admin','user'], true)) Json::abort(422, 'Rôle invalide');

    $target = Db::row('SELECT id,email FROM users WHERE id=?', [$m[1]]);
    if (!$target) Json::abort(404, 'Utilisateur introuvable');

    Db::q('UPDATE users SET role=? WHERE id=?', [$role, $m[1]]);
    Log::action('user.role_changed', ['target_id' => (int)$m[1], 'target_email' => $target['email'] ?? null, 'new_role' => $role]);
    Json::ok(null);
}

// DELETE /api/users/:id — supprimer un utilisateur (super-admin uniquement)
if ($method === 'DELETE' && preg_match('#^/api/users/(\d+)$#', $path, $m)) {
    Csrf::verify();
    $me = Auth::requireSuperAdmin();
    if ((int)$m[1] === (int)$me['id']) Json::abort(400, 'Impossible de supprimer votre propre compte');

    $target = Db::row('SELECT id,email FROM users WHERE id=?', [$m[1]]);
    if (!$target) Json::abort(404, 'Utilisateur introuvable');
    // Garde-fou anti-suppression du super-admin par lui-même (déjà bloqué
    // par le test id-self ci-dessus, mais on double pour la postérité).
    if (($target['email'] ?? '') === Auth::SUPER_ADMIN_EMAIL) {
        Json::abort(400, 'Impossible de supprimer le super-administrateur');
    }

    Db::q('DELETE FROM users WHERE id=?', [$m[1]]);
    Log::action('user.deleted', ['target_id' => (int)$m[1], 'target_email' => $target['email'] ?? null]);
    Json::ok(null);
}
