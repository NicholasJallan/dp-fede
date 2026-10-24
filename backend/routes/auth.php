<?php
declare(strict_types=1);

// POST /api/auth/google — échange un Google ID token contre une session
if ($method === 'POST' && $path === '/api/auth/google') {
    Csrf::verifyOrigin();
    $body    = Json::body();
    $idToken = is_string($body['credential'] ?? null) ? trim($body['credential']) : '';
    if (!$idToken) Json::abort(400, 'Jeton manquant');

    $payload = Auth::verifyGoogleToken($idToken);
    if (!$payload) {
        Log::action('auth.refused');
        Json::abort(401, 'Jeton Google invalide ou expiré');
    }

    $user = Auth::upsertUser($payload);
    Auth::createSession((int)$user['id']);
    Csrf::token(); // émet le cookie CSRF

    Log::action('auth.login', ['user_id' => $user['id']]);
    Json::ok(authUserPayload($user));
}

// GET /api/auth/me — utilisateur courant
if ($method === 'GET' && $path === '/api/auth/me') {
    $user = Auth::current();
    if (!$user) Json::ok(null);

    Csrf::token();
    Json::ok(authUserPayload($user));
}

// POST /api/auth/logout
// Protection CSRF : jeton double-submit OU Origin/Referer de l'application
// (cf. Csrf::verifyForLogout). Un cookie CSRF manquant ne doit plus empêcher
// la destruction de la session côté serveur.
if ($method === 'POST' && $path === '/api/auth/logout') {
    Csrf::verifyForLogout();
    $user = Auth::current();
    Log::action('auth.logout', ['user_id' => $user['id'] ?? null]);
    Auth::destroySession();
    Csrf::clear();
    Json::ok(null);
}

// PATCH /api/auth/account — modifier son propre profil (nom, prénom).
// Compatibilité : le front actuel envoie aussi les anciens champs club_*
// (club_nom, president_nom…). Ils modifient désormais le club COURANT, ce
// qui est réservé au responsable ; pour un autre rôle, des champs club
// inchangés sont ignorés et une modification est refusée (403).
if ($method === 'PATCH' && $path === '/api/auth/account') {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();
    $v    = new Validate($body);
    $v->maxLen('nom', 100, 'Nom')
      ->maxLen('prenom', 100, 'Prénom')
      ->abortIfErrors();

    [$clubFields, $errors] = Club::sanitizeClubFields(Club::fieldsFromLegacyBody($body));
    if ($errors) Json::abort(422, implode('; ', $errors));
    $club    = Club::find((string)$user['club_id']) ?? [];
    $changed = Club::changedFields($club, $clubFields);
    if ($changed) {
        Club::requirePermission($user, 'club.manage');
        Club::update((string)$user['club_id'], $changed);
        Log::action('club.updated', ['club_id' => $user['club_id']]);
    }

    Db::q(
        'UPDATE users SET nom=?, prenom=? WHERE id=?',
        [$v->str('nom', (string)$user['nom']), $v->str('prenom', (string)$user['prenom']), $user['id']]
    );

    Json::ok(authUserPayload(Db::row('SELECT * FROM users WHERE id=?', [$user['id']])));
}

// Helper — strip sensitive fields
function userPublic(array $u): array {
    unset($u['google_sub']);
    return $u;
}

/**
 * Utilisateur courant + club courant. Les anciens champs users.club_*
 * (club_nom, club_numero, club_siret, structure_type, president_*,
 * urgence_defaut) reflètent le club courant : compatibilité du front actuel.
 * Ajoute club_id, club_role et club_count.
 */
function authUserPayload(array $user): array {
    $ctx  = Club::withContext($user);
    $club = Club::find((string)$ctx['club_id']);
    $n    = count(Club::membershipRoles((int)$user['id']));
    return Club::profileOverlay(userPublic($user), $club, $ctx['club_role'], $n);
}
