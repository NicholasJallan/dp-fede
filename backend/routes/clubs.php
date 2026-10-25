<?php
declare(strict_types=1);

// Annuaire des clubs, création, demandes d'adhésion (côté demandeur).
// Contrat détaillé : docs/api-club.md. Pas de club courant requis :
// Auth::requireUser (le demandeur n'est pas encore membre du club visé).
// Écritures : CSRF + rate-limit « write » (racine /api/club, index.php).

if (strpos($path, '/api/clubs') === 0) {

    // GET /api/clubs?q=… — clubs nommés et actifs (annuaire).
    if ($method === 'GET' && $path === '/api/clubs') {
        $user = Auth::requireUser();
        Json::ok(['clubs' => ClubDirectory::search((int)$user['id'], (string)($_GET['q'] ?? ''))]);
    }

    // POST /api/clubs { nom, structure_type, jurisdiction, numero_ffessm, siret, … }
    // Crée un club : le créateur en est responsable, il devient le club courant.
    if ($method === 'POST' && $path === '/api/clubs') {
        Csrf::verify();
        $user = Auth::requireUser();
        RateLimit::hitOrAbort('club_create', 5, 3600, 'Trop de clubs créés. Réessayez dans une heure.', 'u' . $user['id']);
        [$fields, $errors] = Club::sanitizeNewClub(Json::body());
        if ($errors) Json::abort(422, implode('; ', $errors));
        $conflict = ClubDirectory::identityConflict($fields);
        if ($conflict) Json::abort(409, $conflict['message'], $conflict['code']);
        try {
            $clubId = ClubDirectory::create((int)$user['id'], $fields);
        } catch (PDOException $e) {
            $conflict = Club::identityConflictFromException($e);
            if (!$conflict) throw $e;
            Json::abort(409, $conflict['message'], $conflict['code']);
        }
        $removed = Club::removeEmptyPersonalClubs((int)$user['id'], $clubId, true);
        Log::action('club.created', ['club_id' => $clubId, 'personal' => false]);
        $user['current_club_id'] = $clubId;
        Json::ok(clubPayload($user + ['club_id' => $clubId, 'club_role' => 'responsable']) + [
            'removed_empty_clubs' => $removed,
        ], 201);
    }

    // GET /api/clubs/join-requests — mes demandes (en attente, traitées récemment).
    if ($method === 'GET' && $path === '/api/clubs/join-requests') {
        $user = Auth::requireUser();
        Json::ok(['requests' => ClubJoinRequest::listForUser((int)$user['id'])]);
    }

    // DELETE /api/clubs/join-requests/:id — retire ma demande en attente.
    if ($method === 'DELETE' && preg_match('#^/api/clubs/join-requests/([0-9a-fA-F-]{36})$#', $path, $m)) {
        Csrf::verify();
        $user = Auth::requireUser();
        if (!ClubJoinRequest::cancel((int)$user['id'], strtolower($m[1]))) {
            Json::abort(404, 'Demande introuvable ou déjà traitée', 'JOIN_REQUEST_NOT_FOUND');
        }
        Log::action('club.join_cancelled', ['request_id' => $m[1]]);
        Json::ok(['id' => strtolower($m[1]), 'status' => 'cancelled']);
    }

    // POST /api/clubs/:id/join-requests { message? } — demande à rejoindre un club.
    if ($method === 'POST' && preg_match('#^/api/clubs/([0-9a-fA-F-]{36})/join-requests$#', $path, $m)) {
        Csrf::verify();
        $user   = Auth::requireUser();
        $userId = (int)$user['id'];
        $clubId = strtolower($m[1]);
        RateLimit::hitOrAbort('club_join', 20, 3600, 'Trop de demandes d\'adhésion. Réessayez dans une heure.', 'u' . $userId);
        [$message, $err] = ClubJoinRequest::sanitizeMessage(Json::body()['message'] ?? null);
        if ($err !== null) Json::abort(422, $err);
        $club = ClubJoinRequest::joinableClub($clubId);
        if (!$club) Json::abort(404, 'Club introuvable', 'CLUB_NOT_FOUND');
        if (Club::memberRole($clubId, $userId) !== null) {
            Json::abort(409, 'Vous êtes déjà membre de ce club', 'ALREADY_MEMBER');
        }
        if (ClubJoinRequest::pendingCountForUser($userId) >= ClubJoinRequest::MAX_PENDING_PER_USER) {
            Json::abort(429, 'Trop de demandes en attente : retirez-en avant d\'en envoyer de nouvelles');
        }
        if (ClubJoinRequest::pendingCountForClub($clubId) >= ClubJoinRequest::MAX_PENDING_PER_CLUB) {
            Json::abort(429, 'Ce club a trop de demandes en attente : contactez directement son responsable');
        }
        $request = ClubJoinRequest::create($clubId, $userId, $message);
        if ($request === null) {
            Json::abort(409, 'Une demande est déjà en attente pour ce club', 'JOIN_REQUEST_PENDING');
        }
        Log::action('club.join_requested', ['club_id' => $clubId, 'request_id' => $request['id']]);
        Json::ok(ClubJoinRequest::publicForUser($request), 201);
    }
}
