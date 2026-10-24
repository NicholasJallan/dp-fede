<?php
declare(strict_types=1);
error_reporting(E_ALL);
ini_set('display_errors', '0');
ini_set('log_errors', '1');

// Fuseau des dates de plongée : PHP 8 vaut UTC par défaut (PHP 7.4 devinait
// celui du système). Les dates saisies sont locales (France / Suisse).
// Inconditionnel : en PHP 8, ini_get('date.timezone') vaut « UTC » même sans
// réglage, un test « non défini » ne s'appliquerait jamais.
date_default_timezone_set('Europe/Paris');

// Dépendances Composer (mPDF, php-jwt) — installées au déploiement par
// `composer install --no-dev`. Sans elles, l'API démarre mais la génération
// PDF échoue et la vérification JWT retombe sur l'endpoint tokeninfo.
if (is_file(__DIR__ . '/vendor/autoload.php')) {
    require_once __DIR__ . '/vendor/autoload.php';
} else {
    error_log('[dp-fede] vendor/autoload.php absent — exécuter composer install --no-dev');
}

// Load libs
foreach (['Config','Json','Db','Auth','Csrf','Validate','SyncHelpers','RateLimit','Log','Account',
          'Club','ClubInvitation','ClubAlerts','ClubStats','Encadrement','LevelMapper','DiverImport','DiverImportPlan',
          'DivePdf','DivePolicy','DiveStore','DiveDates','DiveRefusal','DiveService','DiverValidation','DiveArchive','ClubRetention','LegacyWorkspaces'] as $cls) {
    require_once __DIR__ . "/lib/{$cls}.php";
}

// Filet de sécurité : toute exception non gérée (base indisponible, schéma
// non migré…) renvoie un JSON 500 générique et est journalisée côté serveur,
// sans fuite de détail vers le client.
set_exception_handler(static function (\Throwable $e): void {
    error_log('[dp-fede] ' . get_class($e) . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    if (!headers_sent()) {
        header('Content-Type: application/json; charset=utf-8');
    }
    Json::abort(500, 'Erreur interne du serveur');
});

// CORS — uniquement le front du même domaine
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$allowed = 'https://' . (Config::get('app')['domain'] ?? '');
if ($origin === $allowed) {
    header("Access-Control-Allow-Origin: {$origin}");
    header('Access-Control-Allow-Credentials: true');
    header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type, X-CSRF-Token, X-DP-Club');
    header('Access-Control-Max-Age: 600');
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

$method = $_SERVER['REQUEST_METHOD'];
// HEAD : même routage que GET ; PHP/nginx suppriment automatiquement le corps.
if ($method === 'HEAD') $method = 'GET';
$path   = strtok($_SERVER['REQUEST_URI'] ?? '/', '?');

// Rate-limit login attempts (15 min window, 10 essais/IP) — couvre les
// tentatives de brute-force du callback OAuth.
if ($method === 'POST' && $path === '/api/auth/google') {
    RateLimit::hitOrAbort('login', 10, 900, 'Trop de tentatives. Réessayez dans 15 minutes.');
}

// Rapports CSP : endpoint public (pas d'auth possible) → 30 rapports/min/IP.
if ($method === 'POST' && $path === '/api/csp/report') {
    RateLimit::hitOrAbort('csp', 30, 60, 'Trop de rapports CSP.');
}

// Proxys vers des API tierces (SHOM…) : chaque appel déclenche des requêtes
// sortantes → 30/min/IP pour ne pas transformer le Pi en relais.
if (strpos($path, '/api/proxy/') === 0) {
    RateLimit::hitOrAbort('proxy', 30, 60, 'Trop de requêtes. Réessayez dans une minute.');
}

// Rate-limit écriture (POST/PATCH/DELETE) sur les ressources métier.
// 120 mutations/min par IP — couvre largement un usage normal (auto-save
// debouncé 500 ms + outbox drain ~3 items/s) mais coupe les abus.
$writeMethods   = ['POST', 'PATCH', 'PUT', 'DELETE'];
$writePathRoots = ['/api/dives', '/api/divers', '/api/sites', '/api/account', '/api/club', '/api/pdf'];
if (in_array($method, $writeMethods, true)) {
    foreach ($writePathRoots as $root) {
        if (strpos($path, $root) === 0) {
            RateLimit::hitOrAbort('write', 120, 60, 'Trop d\'écritures. Réessayez dans une minute.');
            break;
        }
    }
}

// Router — load matching route file
$routed = false;
foreach (['auth','account','club','divers','sites','users','dives','sync','pdf','proxy','csp','legacy'] as $r) {
    $file = __DIR__ . "/routes/{$r}.php";
    require $file;
}

Json::abort(404, 'Route introuvable');

