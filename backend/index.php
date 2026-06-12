<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Load libs
foreach (['Config','Json','Db','Auth','Csrf','Validate','Smtp','SyncHelpers'] as $cls) {
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

$method = $_SERVER['REQUEST_METHOD'];
$path   = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');

// Rate-limit login attempts (15 min window, 10 essais/IP) — couvre les
// tentatives de brute-force du callback OAuth.
if ($method === 'POST' && $path === '/api/auth/google') {
    rateLimitOrAbort('login', 10, 900, 'Trop de tentatives. Réessayez dans 15 minutes.');
}

// Rate-limit écriture (POST/PATCH/DELETE) sur les ressources métier.
// 120 mutations/min par IP — couvre largement un usage normal (auto-save
// debouncé 500 ms + outbox drain ~3 items/s) mais coupe les abus.
$writeMethods   = ['POST', 'PATCH', 'PUT', 'DELETE'];
$writePathRoots = ['/api/dives', '/api/divers', '/api/sites'];
if (in_array($method, $writeMethods, true)) {
    foreach ($writePathRoots as $root) {
        if (strpos($path, $root) === 0) {
            rateLimitOrAbort('write', 120, 60, 'Trop d\'écritures. Réessayez dans une minute.');
            break;
        }
    }
}

// Router — load matching route file
$routed = false;
foreach (['auth','divers','sites','users','dives','sync','pdf','proxy','csp'] as $r) {
    $file = __DIR__ . "/routes/{$r}.php";
    require $file;
}

Json::abort(404, 'Route introuvable');

// ---------------------------------------------------------------------------

function rateLimitOrAbort(string $bucket, int $max, int $windowSec, string $errMsg): void {
    if (!extension_loaded('apcu') || !apcu_enabled()) return;

    $ip  = $_SERVER['REMOTE_ADDR'] ?? '0';
    $key = "rl_{$bucket}_{$ip}";
    $n   = apcu_fetch($key);
    if ($n === false) {
        apcu_store($key, 1, $windowSec);
        return;
    }
    apcu_inc($key);
    if ((int)$n >= $max) Json::abort(429, $errMsg);
}
