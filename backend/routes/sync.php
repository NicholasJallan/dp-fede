<?php
declare(strict_types=1);

// GET /api/sync/state
// Renvoie les curseurs « max(updated_at) par table » pour le CLUB COURANT.
// Le client compare avec ses meta locaux pour décider s'il y a quelque chose
// à pull (et pour quelle plage temporelle). club_id permet au client de
// détecter un changement de club courant : il doit alors vider son cache
// local (divers, sites, plongées) et ses curseurs avant de resynchroniser.
//
// Format réponse :
// {
//   server_time: "2026-06-07T15:32:11",
//   club_id: "uuid", club_role: "responsable" | "dp" | "encadrant" | "lecture",
//   divers:   { updated_at: "..." | null, deleted_at: "..." | null },
//   sites:    { updated_at: "..." | null, deleted_at: "..." | null },
//   dives:    { updated_at: "..." | null, deleted_at: "..." | null }
// }
if ($method === 'GET' && $path === '/api/sync/state') {
    $user   = Auth::require();
    $clubId = (string)$user['club_id'];
    $cursor = static function (string $table) use ($clubId): array {
        // $table : constante interne (divers | sites | dives).
        $r = Db::row("SELECT MAX(updated_at) AS u, MAX(deleted_at) AS d FROM {$table} WHERE club_id=?", [$clubId])
            ?? ['u' => null, 'd' => null];
        return ['updated_at' => SyncHelpers::toIso($r['u']), 'deleted_at' => SyncHelpers::toIso($r['d'])];
    };

    Json::ok([
        'server_time' => date('Y-m-d\TH:i:s'),
        'club_id'     => $clubId,
        'club_role'   => $user['club_role'],
        'divers'      => $cursor('divers'),
        'sites'       => $cursor('sites'),
        'dives'       => $cursor('dives'),
    ]);
}
