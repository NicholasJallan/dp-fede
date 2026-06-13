<?php
declare(strict_types=1);

require_once __DIR__ . '/../lib/HtmlSanitizer.php';

// POST /api/pdf/fiche — génère un PDF depuis HTML via wkhtmltopdf
if ($method === 'POST' && $path === '/api/pdf/fiche') {
    Csrf::verify();
    $user = Auth::require();

    $body = Json::body();
    $html = $body['html']     ?? '';
    $name = $body['filename'] ?? 'fiche-securite.pdf';

    if (!$html) Json::abort(400, 'HTML manquant');
    if (strlen($html) > 5_000_000) Json::abort(413, 'HTML trop volumineux');

    // Sanitization du nom de fichier
    $name = preg_replace('/[^a-zA-Z0-9._-]/', '_', $name);
    if (substr($name, -4) !== '.pdf') $name .= '.pdf';

    // Strip LFI/SSRF avant écriture sur disque
    $html = HtmlSanitizer::forPdf($html);

    // Fichiers temporaires — tempnam crée un fichier sans extension ; rename
    // pour que wkhtmltopdf détecte le format HTML (évite aussi les orphelins).
    $tmpHtml = tempnam(sys_get_temp_dir(), 'fiche_');
    rename($tmpHtml, $tmpHtml . '.html');
    $tmpHtml .= '.html';

    $tmpPdf = tempnam(sys_get_temp_dir(), 'fiche_');
    rename($tmpPdf, $tmpPdf . '.pdf');
    $tmpPdf .= '.pdf';

    file_put_contents($tmpHtml, $html);

    // --disable-local-file-access : neutralise le LFI (exfiltration de fichiers locaux)
    // --disable-javascript : Qt WebKit 538 non patché, pas de JS dans les fiches
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

    // Stream le PDF
    header('Content-Type: application/pdf');
    header('Content-Disposition: attachment; filename="' . $name . '"');
    header('Content-Length: ' . filesize($tmpPdf));
    header('X-Content-Type-Options: nosniff');
    readfile($tmpPdf);
    @unlink($tmpPdf);
    exit;
}
