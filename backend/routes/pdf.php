<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/PdfRender.php';
require_once __DIR__ . '/../lib/Rules.php';

// POST /api/pdf/fiche — génère un PDF via mPDF (PHP pur, pas de process externe).
//
// { dive_id, type: "fiche"|"checklist" } → charge depuis la DB, rendu des
// templates PHP → mPDF. L'ancien mode « HTML fourni par le client » a été
// supprimé : mPDF résout les URL et chemins locaux du HTML (risque SSRF).
//
if ($method === 'POST' && $path === '/api/pdf/fiche') {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();

    if (!isset($body['dive_id'])) Json::abort(400, 'dive_id requis');

    $diveId = (string)$body['dive_id'];
    $type   = in_array($body['type'] ?? 'fiche', ['fiche', 'checklist'], true)
        ? ($body['type'] ?? 'fiche') : 'fiche';

    // Charge la plongée (appartient à l'utilisateur = anti-IDOR)
    $dive = Db::row(
        'SELECT d.*, COALESCE(r.state, d.render_state) AS render_state,
                u.club_nom, u.club_numero, u.structure_type,
                u.president_prenom, u.president_nom, u.president_tel,
                u.urgence_defaut
           FROM dives d
           JOIN users u ON u.id = d.user_id
           LEFT JOIN dive_runtime_state r ON r.dive_id = d.id
          WHERE (d.id=? OR d.client_uuid=?) AND d.user_id=? AND d.deleted_at IS NULL',
        [$diveId, $diveId, $user['id']]
    );
    if (!$dive) Json::abort(404, 'Plongée introuvable');

    $answers    = json_decode($dive['answers']      ?? '{}', true) ?? [];
    $palanquees = json_decode($dive['palanquees']   ?? '[]', true) ?? [];
    $renderState = json_decode($dive['render_state'] ?? '{}', true) ?? [];

    // Charge les divers référencés
    $driverIds = [];
    foreach ($palanquees as $p) {
        foreach ($p['membres'] ?? [] as $m) {
            if (empty($m['_bapteme']) && !empty($m['diverId'])) {
                $driverIds[$m['diverId']] = true;
            }
        }
    }
    $diversById = [];
    if (!empty($driverIds)) {
        $ids  = array_keys($driverIds);
        $phs  = implode(',', array_fill(0, count($ids), '?'));
        $rows = Db::all(
            "SELECT id, nom, prenom, licence, niveau_plongeur, niveau_encadrant FROM divers
              WHERE id IN ({$phs}) AND user_id=? AND deleted_at IS NULL",
            [...$ids, $user['id']]
        );
        foreach ($rows as $row) { $diversById[$row['id']] = $row; }
    }

    // Profil utilisateur pour le template
    $userData = [
        'club_nom'        => $dive['club_nom']        ?? null,
        'club_numero'     => $dive['club_numero']     ?? null,
        'structure_type'  => $dive['structure_type']  ?? null,
        'president_prenom'=> $dive['president_prenom']?? null,
        'president_nom'   => $dive['president_nom']   ?? null,
        'president_tel'   => $dive['president_tel']   ?? null,
        'urgence_defaut'  => $dive['urgence_defaut']  ?? '18',
    ];

    // Rendu du template — $user est remappé sur le profil (≠ $authUser d'Auth::require())
    $authUser = $user; // on préserve le user authentifié avant écrasement local
    $user     = $userData;
    ob_start();
    if ($type === 'checklist') {
        require __DIR__ . '/../templates/checklist.php';
    } else {
        require __DIR__ . '/../templates/fiche.php';
    }
    $bodyHtml = ob_get_clean();
    $user = $authUser; // restore

    $title = $type === 'checklist' ? 'Check-list opérationnelle' : 'Fiche de sécurité';
    $html  = PdfRender::buildHtml($title, $bodyHtml);

    try {
        $pdf = PdfRender::generate($html);
    } catch (\RuntimeException $e) {
        Json::abort(500, 'Erreur de génération PDF : ' . $e->getMessage());
    }

    $siteName = preg_replace('/[^a-zA-Z0-9-]/', '-', substr($dive['site_nom'] ?? 'site', 0, 30));
    $date     = substr($dive['date_plongee'] ?? date('Y-m-d'), 0, 10);
    $filename = "{$date}-{$type}-{$siteName}.pdf";
    PdfRender::stream($pdf, $filename);
}
