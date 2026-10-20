<?php
declare(strict_types=1);

// Anciennes « structures partagées » (routes/workspaces.php, production
// juin → octobre 2026) : remplacées par les clubs (migration 007 : un club
// par structure, mêmes membres et mêmes données). Les codes d'invitation
// partagés ne sont PAS repris : rejoindre un club passe par une invitation
// nominative du responsable (lien à usage unique, docs/api-club.md).
// Un client resté sur l'ancien front reçoit un 410 explicite au lieu d'un 404.
if (strpos($path, '/api/workspaces') === 0) {
    Json::abort(410, 'Les structures sont devenues des clubs : rechargez l\'application. Pour rejoindre un club, demandez une invitation à son responsable.', 'WORKSPACES_REPLACED');
}
