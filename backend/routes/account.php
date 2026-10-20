<?php
declare(strict_types=1);

// RGPD — droits de l'utilisateur sur ses propres données.
// (Le profil se modifie via PATCH /api/auth/account, cf. routes/auth.php.)

// GET /api/account/export — export JSON (format dp-assistant-export/2) :
// compte, clubs (adhésions + rôle), invitations envoyées, plongeurs / sites /
// plongées dont l'utilisateur est l'auteur (+ runtime state, métadonnées des
// PDF archivés), sessions actives sans leur identifiant.
// ?download=1 → servi en pièce jointe (lien direct depuis l'UI).
if ($method === 'GET' && $path === '/api/account/export') {
    $user = Auth::requireUser();
    RateLimit::hitOrAbort('export', 10, 3600, 'Trop d\'exports. Réessayez dans une heure.', 'u' . $user['id']);

    $export = Account::fetchExport((int)$user['id']);
    Log::action('account.exported');

    if (!empty($_GET['download'])) {
        header('Content-Disposition: attachment; filename="dp-assistant-export-' . date('Y-m-d') . '.json"');
    }
    Json::ok($export);
}

// DELETE /api/account — suppression définitive du compte. Corps obligatoire :
// { "confirm": "SUPPRIMER" }. Supprime les clubs dont l'utilisateur est le
// seul membre (avec leurs données) ; ses contributions aux clubs partagés y
// restent, sans auteur. Refusé (409) pour le dernier administrateur
// (super-admin compris) et pour le seul responsable d'un club partagé.
// Auth::requireUser : pas de résolution de club (aucun club créé ici).
if ($method === 'DELETE' && $path === '/api/account') {
    Csrf::verify();
    $user = Auth::requireUser();
    $uid  = (int)$user['id'];

    $err = Account::deletionError($user, Json::body(), Account::otherAdminCount($uid), Account::clubBlockers($uid));
    if ($err !== null) Json::abort($err[0], $err[1], $err[2] ?? null);

    $result = Account::deleteUserData($uid);
    Auth::destroySession();
    Csrf::clear();
    Log::action('account.deleted', ['user_id' => $uid, 'rows' => $result['counts'], 'retained' => $result['retained']]);
    Json::ok([
        'deleted'  => true,
        'retained' => $result['retained'],
        'message'  => ClubRetention::message($result['retained']['fiches'], $result['retained']['until']),
    ]);
}
