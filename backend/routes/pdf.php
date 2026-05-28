<?php
declare(strict_types=1);

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
    if (!str_ends_with($name, '.pdf')) $name .= '.pdf';

    // Fichiers temporaires
    $tmpHtml = tempnam(sys_get_temp_dir(), 'fiche_') . '.html';
    $tmpPdf  = tempnam(sys_get_temp_dir(), 'fiche_') . '.pdf';
    file_put_contents($tmpHtml, $html);

    // Construire la commande wkhtmltopdf — A4 portrait, marges raisonnables
    $bin = '/usr/bin/wkhtmltopdf';
    $cmd = sprintf(
        '%s --quiet --enable-local-file-access ' .
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
