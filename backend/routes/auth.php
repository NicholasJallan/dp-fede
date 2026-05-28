<?php
declare(strict_types=1);

// POST /api/auth/google — échange un Google ID token contre une session
if ($method === 'POST' && $path === '/api/auth/google') {
    $body    = Json::body();
    $idToken = trim($body['credential'] ?? '');
    if (!$idToken) Json::abort(400, 'Jeton manquant');

    $payload = Auth::verifyGoogleToken($idToken);
    if (!$payload) Json::abort(401, 'Jeton Google invalide ou expiré');

    $user = Auth::upsertUser($payload);
    Auth::createSession((int)$user['id']);
    Csrf::token(); // émet le cookie CSRF

    Json::ok(userPublic($user));
}

// GET /api/auth/me — utilisateur courant
if ($method === 'GET' && $path === '/api/auth/me') {
    $user = Auth::current();
    if (!$user) Json::ok(null);

    Csrf::token();
    Json::ok(userPublic($user));
}

// POST /api/auth/logout
if ($method === 'POST' && $path === '/api/auth/logout') {
    Csrf::verify();
    Auth::destroySession();
    Json::ok(null);
}

// PATCH /api/auth/account — modifier son propre profil
if ($method === 'PATCH' && $path === '/api/auth/account') {
    Csrf::verify();
    $user = Auth::require();
    $v    = new Validate(Json::body());
    $STRUCTURE_TYPES = ['club','sca','csa','autre'];
    $v->maxLen('nom', 100, 'Nom')
      ->maxLen('prenom', 100, 'Prénom')
      ->maxLen('club_nom', 200, 'Nom du club')
      ->maxLen('club_numero', 50, 'Numéro de club')
      ->maxLen('club_siret', 50, 'SIRET')
      ->maxLen('president_prenom', 100, 'Prénom du président')
      ->maxLen('president_nom', 100, 'Nom du président')
      ->maxLen('president_tel', 30, 'Téléphone du président')
      ->maxLen('urgence_defaut', 20, 'Numéro d\'urgence')
      ->abortIfErrors();

    $st = $v->nullable('structure_type');
    if ($st && !in_array($st, $STRUCTURE_TYPES, true)) $st = null;

    Db::q(
        'UPDATE users SET nom=?, prenom=?, club_nom=?, club_numero=?, club_siret=?, structure_type=?, president_prenom=?, president_nom=?, president_tel=?, urgence_defaut=? WHERE id=?',
        [
            $v->str('nom', $user['nom']),
            $v->str('prenom', $user['prenom']),
            $v->str('club_nom', $user['club_nom']),
            $v->str('club_numero', $user['club_numero']),
            $v->str('club_siret', $user['club_siret']),
            $st,
            $v->str('president_prenom', $user['president_prenom'] ?? null),
            $v->str('president_nom',    $user['president_nom']    ?? null),
            $v->str('president_tel',    $user['president_tel']    ?? null),
            $v->str('urgence_defaut',   $user['urgence_defaut']   ?? '18'),
            $user['id'],
        ]
    );

    Json::ok(userPublic(Db::row('SELECT * FROM users WHERE id=?', [$user['id']])));
}

// Helper — strip sensitive fields
function userPublic(array $u): array {
    unset($u['google_sub']);
    return $u;
}
