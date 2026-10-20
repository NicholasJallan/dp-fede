<?php
declare(strict_types=1);

// ── POST /api/csp/report ────────────────────────────────────────────────────
// Endpoint de réception des rapports CSP (Content-Security-Policy violations).
// Configuration nginx : ajouter `report-uri /api/csp/report;` à la directive
// CSP du bloc dp-fede.
//
// Les rapports sont des JSON envoyés par le navigateur en `application/csp-report`
// (ou `application/json` selon le navigateur). On les logue dans /var/log/dp-fede-csp.log
// pour analyse.
//
// Pas de CSRF/Auth : les rapports proviennent du navigateur sans pouvoir
// porter de cookie de l'app. Protections :
//   - rate-limit dédié en index.php (bucket « csp », 30/min/IP) ;
//   - corps limité à CSP_REPORT_MAX_BYTES (413 au-delà), doublé côté nginx
//     par client_max_body_size (deploy/nginx-dp-fede.conf).

const CSP_REPORT_MAX_BYTES = 8192;

if ($method === 'POST' && $path === '/api/csp/report') {
    $declared = (int)($_SERVER['CONTENT_LENGTH'] ?? 0);
    if ($declared > CSP_REPORT_MAX_BYTES) {
        http_response_code(413);
        exit;
    }
    // Lecture bornée (+1 octet pour détecter un corps chunked trop long).
    $raw = file_get_contents('php://input', false, null, 0, CSP_REPORT_MAX_BYTES + 1);
    if (is_string($raw) && strlen($raw) > CSP_REPORT_MAX_BYTES) {
        http_response_code(413);
        exit;
    }
    if (!$raw) {
        http_response_code(204);
        exit;
    }

    $report = json_decode($raw, true);
    if (!is_array($report)) {
        http_response_code(400);
        exit;
    }

    // Format Reporting API moderne : enveloppe { "csp-report": {...} } OU
    // tableau de reports [ { "body": {...}, "type": "csp-violation" } ].
    $entry = [
        'ts'         => date('c'),
        'ip'         => $_SERVER['REMOTE_ADDR'] ?? '',
        'user_agent' => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 300),
        'report'     => $report,
    ];

    $logFile = '/var/log/dp-fede-csp.log';
    // Best-effort : si pas writeable, on log via error_log standard.
    $line = json_encode($entry, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "\n";
    if (@file_put_contents($logFile, $line, FILE_APPEND | LOCK_EX) === false) {
        error_log('[CSP-REPORT] ' . $line);
    }

    http_response_code(204);
    exit;
}
