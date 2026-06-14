<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/PdfRender.php';
require_once __DIR__ . '/../lib/Rules.php';
require_once __DIR__ . '/../lib/HtmlSanitizer.php';

// POST /api/pdf/fiche — génère un PDF.
//
// Mode A (nouveau, C1.2) : { dive_id, type: "fiche"|"checklist" }
//   → charge depuis la DB, rendu PHP, wkhtmltopdf.
//
// Mode B (legacy, déprécié) : { html, filename }
//   → HTML sanitizé envoyé directement à wkhtmltopdf.
//   Log l'accès. Sera retiré dans une release future.
//
if ($method === 'POST' && $path === '/api/pdf/fiche') {
    Csrf::verify();
    $user = Auth::require();
    $body = Json::body();

    // ── Mode A : rendu depuis dive_id ──────────────────────────────────────
    if (isset($body['dive_id'])) {
        $diveId = (string)$body['dive_id'];
        $type   = in_array($body['type'] ?? 'fiche', ['fiche', 'checklist'], true)
            ? ($body['type'] ?? 'fiche') : 'fiche';

        // Charge la plongée (appartient à l'utilisateur = anti-IDOR)
        $dive = Db::row(
            'SELECT d.*, u.club_nom, u.club_numero, u.structure_type,
                    u.president_prenom, u.president_nom, u.president_tel,
                    u.urgence_defaut
               FROM dives d
               JOIN users u ON u.id = d.user_id
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

    // ── Mode B : legacy HTML direct (déprécié) ─────────────────────────────
    $html = $body['html']     ?? '';
    $name = $body['filename'] ?? 'fiche-securite.pdf';

    if (!$html) Json::abort(400, 'HTML manquant');
    if (strlen($html) > 5_000_000) Json::abort(413, 'HTML trop volumineux');

    Log::action('pdf.legacy', ['filename' => substr($name, 0, 100)]);

    $name = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    if (!str_ends_with($name, '.pdf')) $name .= '.pdf';

    $html = HtmlSanitizer::forPdf($html);

    $tmpHtml = tempnam(sys_get_temp_dir(), 'fiche_');
    rename($tmpHtml, $tmpHtml . '.html');
    $tmpHtml .= '.html';

    $tmpPdf = tempnam(sys_get_temp_dir(), 'fiche_');
    rename($tmpPdf, $tmpPdf . '.pdf');
    $tmpPdf .= '.pdf';

    file_put_contents($tmpHtml, $html);

    $bin = '/usr/bin/wkhtmltopdf';
    $cmd = sprintf(
        '%s --quiet --disable-local-file-access --disable-javascript ' .
        '--no-stop-slow-scripts --javascript-delay 0 ' .
        '--page-size A4 --orientation Portrait ' .
        '--margin-top 12mm --margin-bottom 12mm --margin-left 12mm --margin-right 12mm ' .
        '%s %s 2>&1',
        escapeshellcmd($bin),
        escapeshellarg($tmpHtml),
        escapeshellarg($tmpPdf)
    );

    exec($cmd, $output, $code);
    @unlink($tmpHtml);

    if ($code !== 0 || !file_exists($tmpPdf) || filesize($tmpPdf) === 0) {
        @unlink($tmpPdf);
        Json::abort(500, 'Erreur de génération PDF : ' . implode("\n", $output));
    }

    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($tmpPdf));
    header('X-Content-Type-Options: nosniff');
    readfile($tmpPdf);
    @unlink($tmpPdf);
    exit;
}
