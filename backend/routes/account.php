<?php
declare(strict_types=1);

// RGPD — droits de l'utilisateur sur ses propres données.
// (Le profil se modifie via PATCH /api/auth/account, cf. routes/auth.php.)

// GET /api/account/export — export JSON complet (compte, plongeurs, sites,
// plongées + runtime state, sessions actives sans leur identifiant).
// ?download=1 → servi en pièce jointe (lien direct depuis l'UI).
if ($method === 'GET' && $path === '/api/account/export') {
    $user = Auth::require();
    RateLimit::hitOrAbort('export', 10, 3600, 'Trop d\'exports. Réessayez dans une heure.', 'u' . $user['id']);

    $export = Account::fetchExport((int)$user['id']);
    Log::action('account.exported');

    if (!empty($_GET['download'])) {
        header('Content-Disposition: attachment; filename="dp-assistant-export-' . date('Y-m-d') . '.json"');
    }
    Json::ok($export);
}

// DELETE /api/account — suppression définitive du compte et de toutes ses
// données. Corps obligatoire : { "confirm": "SUPPRIMER" }.
// Le dernier administrateur (super-admin compris) ne peut pas se supprimer.
if ($method === 'DELETE' && $path === '/api/account') {
    Csrf::verify();
    $user = Auth::require();
    $uid  = (int)$user['id'];

    $err = Account::deletionError($user, Json::body(), Account::otherAdminCount($uid));
    if ($err !== null) Json::abort($err[0], $err[1]);

    $counts = Account::deleteUserData($uid);
    Auth::destroySession();
    Csrf::clear();
    Log::action('account.deleted', ['user_id' => $uid, 'rows' => $counts]);
    Json::ok(['deleted' => true]);
}
