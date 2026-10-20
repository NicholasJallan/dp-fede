<?php
declare(strict_types=1);

// POST /api/pdf/fiche — génère un PDF via mPDF (PHP pur, pas de process externe).
//
// { dive_id, type: "fiche"|"checklist" } → charge la plongée du CLUB COURANT
// depuis la DB, rendu des templates PHP → mPDF (cf. lib/DivePdf.php, partagé
// avec l'archivage serveur). L'ancien mode « HTML fourni par le client » a été
// supprimé : mPDF résout les URL et chemins locaux du HTML (risque SSRF).
// Lecture seule : ouvert à tous les rôles du club (documents.read).
if ($method === 'POST' && $path === '/api/pdf/fiche') {
    Csrf::verify();
    $user = Auth::require();
    Club::requirePermission($user, 'documents.read');
    $body = Json::body();

    if (!isset($body['dive_id']) || !is_scalar($body['dive_id'])) Json::abort(400, 'dive_id requis');
    $type = in_array($body['type'] ?? 'fiche', DivePdf::TYPES, true) ? (string)($body['type'] ?? 'fiche') : 'fiche';

    // Plongée du club courant (anti-IDOR)
    $dive = DivePdf::loadForClub((string)$body['dive_id'], (string)$user['club_id']);
    if (!$dive) Json::abort(404, 'Plongée introuvable');

    try {
        $pdf = DivePdf::render($dive, $type, DivePdf::clubProfile((string)$user['club_id']));
    } catch (\RuntimeException $e) {
        error_log('[dp-fede] PDF ' . $dive['id'] . ' : ' . $e->getMessage());
        Json::abort(500, 'Erreur de génération PDF');
    }
    PdfRender::stream($pdf, DivePdf::filename($dive, $type));
}
