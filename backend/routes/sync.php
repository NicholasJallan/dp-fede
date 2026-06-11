<?php
declare(strict_types=1);

// GET /api/sync/state
// Renvoie les curseurs « max(updated_at) par table » pour l'utilisateur
// courant. Le client compare avec ses meta locaux pour décider s'il y a
// quelque chose à pull (et pour quelle plage temporelle).
//
// Format réponse :
// {
//   server_time: "2026-06-07T15:32:11",
//   divers:   { updated_at: "..." | null, deleted_at: "..." | null },
//   sites:    { updated_at: "..." | null, deleted_at: "..." | null },
//   dives:    { updated_at: "..." | null, deleted_at: "..." | null }
// }
if ($method === 'GET' && $path === '/api/sync/state') {
    $user = Auth::require();

    $divers = Db::row(
        'SELECT MAX(updated_at) AS u, MAX(deleted_at) AS d FROM divers WHERE user_id=?',
        [$user['id']]
    ) ?? ['u' => null, 'd' => null];

    $sites = Db::row(
        'SELECT MAX(updated_at) AS u, MAX(deleted_at) AS d FROM sites WHERE user_id=?',
        [$user['id']]
    ) ?? ['u' => null, 'd' => null];

    $dives = Db::row(
        'SELECT MAX(updated_at) AS u, MAX(deleted_at) AS d FROM dives WHERE user_id=?',
        [$user['id']]
    ) ?? ['u' => null, 'd' => null];

    Json::ok([
        'server_time' => date('Y-m-d\TH:i:s'),
        'divers' => [
            'updated_at' => SyncHelpers::toIso($divers['u']),
            'deleted_at' => SyncHelpers::toIso($divers['d']),
        ],
        'sites' => [
            'updated_at' => SyncHelpers::toIso($sites['u']),
            'deleted_at' => SyncHelpers::toIso($sites['d']),
        ],
        'dives' => [
            'updated_at' => SyncHelpers::toIso($dives['u']),
            'deleted_at' => SyncHelpers::toIso($dives['d']),
        ],
    ]);
}
