<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Load libs
foreach (['Config','Json','Db','Auth','Csrf','Validate','Smtp'] as $cls) {
    require_once __DIR__ . "/lib/{$cls}.php";
}

// CORS — uniquement le front du même domaine
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = 'https://' . (Config::get('app')['domain'] ?? '');
if ($origin === $allowed) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token');
    header('Access-Control-Max-Age: 600');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

// Rate limit login attempts (simple, per-IP, stored in APCu if available)
$method = $_SERVER['REQUEST_METHOD'];
$path   = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');

if ($method === 'POST' && $path === '/api/auth/google') {
    rateLimitOrAbort();
}

// Router — load matching route file
$routed = false;
foreach (['auth','divers','sites','users'] as $r) {
    $file = __DIR__ . "/routes/{$r}.php";
    require $file;
}

Json::abort(404, 'Route introuvable');

// ---------------------------------------------------------------------------

function rateLimitOrAbort(): void {
    if (!extension_loaded('apcu') || !apcu_enabled()) return;

    $ip  = $_SERVER['REMOTE_ADDR'] ?? '0';
    $key = "rl_login_{$ip}";
    $n   = apcu_fetch($key);
    if ($n === false) {
        apcu_store($key, 1, 900); // 15 min window
    } else {
        apcu_inc($key);
        if ((int)$n >= 10) Json::abort(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    }
}
