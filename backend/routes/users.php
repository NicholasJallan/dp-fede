<?php
declare(strict_types=1);

// GET /api/users — liste tous les utilisateurs (admin)
if ($method === 'GET' && $path === '/api/users') {
    Auth::requireAdmin();
    $rows = Db::all('SELECT id,email,nom,prenom,role,club_nom,club_numero,club_siret,created_at,last_login FROM users ORDER BY created_at');
    Json::ok($rows);
}

// PATCH /api/users/:id/role — changer le rôle (admin)
if ($method === 'PATCH' && preg_match('#^/api/users/(\d+)/role$#', $path, $m)) {
    Csrf::verify();
    $me = Auth::requireAdmin();
    if ((int)$m[1] === (int)$me['id']) Json::abort(400, 'Impossible de modifier votre propre rôle');

    $body = Json::body();
    $role = $body['role'] ?? '';
    if (!in_array($role, ['admin','user'], true)) Json::abort(422, 'Rôle invalide');

    $target = Db::row('SELECT id FROM users WHERE id=?', [$m[1]]);
    if (!$target) Json::abort(404, 'Utilisateur introuvable');

    Db::q('UPDATE users SET role=? WHERE id=?', [$role, $m[1]]);
    Json::ok(null);
}

// DELETE /api/users/:id — supprimer un utilisateur (admin)
if ($method === 'DELETE' && preg_match('#^/api/users/(\d+)$#', $path, $m)) {
    Csrf::verify();
    $me = Auth::requireAdmin();
    if ((int)$m[1] === (int)$me['id']) Json::abort(400, 'Impossible de supprimer votre propre compte');

    $target = Db::row('SELECT id FROM users WHERE id=?', [$m[1]]);
    if (!$target) Json::abort(404, 'Utilisateur introuvable');

    Db::q('DELETE FROM users WHERE id=?', [$m[1]]);
    Json::ok(null);
}
