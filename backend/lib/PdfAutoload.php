<?php
declare(strict_types=1);

/**
 * Autoloader restreint pour mPDF, sans passer par vendor/autoload.php.
 *
 * vendor/autoload.php exécute vendor/composer/platform_check.php, qui échoue
 * sous PHP 7.4 : firebase/php-jwt v7 (aussi dans vendor/, requis par Auth
 * pour la vérification JWKS locale) exige PHP 8+ et contient effectivement
 * une syntaxe PHP 8-only (vérifié : `php7.4 -l` échoue sur JWT.php/JWK.php).
 * Un autoload global ferait planter Auth::verifyJwtLocal() dès son
 * `class_exists('\Firebase\JWT\JWK')`, qui déclencherait le chargement (et
 * donc le parse) de ce fichier cassé — pire que le fallback réseau actuel.
 *
 * mPDF lui-même supporte PHP 7.4 (composer.json : ^5.6 || ^7.0 || ~8.x), et
 * tous ses fichiers passent `php7.4 -l`, à une exception : psr/log a été
 * verrouillé sur la v3 (PHP 8 requis, `mixed` en retour de méthode) au lieu
 * d'une version 1.x/2.x compatible. `Psr\Log\` est donc chargé depuis
 * lib/psr-log-shim/ (copie figée de psr/log v1.1.4, PHP 7.4-compatible,
 * mêmes noms de classes — cf. lib/psr-log-shim/README.md) plutôt que
 * vendor/psr/log/src/, pour rester correct même après un `composer install`
 * qui réinstallerait la v3.
 *
 * Cet autoloader ne mappe donc QUE les namespaces réellement nécessaires à
 * mPDF, jamais Firebase\JWT\.
 */

$__pdfAutoloadMap = [
    'Mpdf\\PsrHttpMessageShim\\' => __DIR__ . '/../vendor/mpdf/psr-http-message-shim/src/',
    'Mpdf\\PsrLogAwareTrait\\'   => __DIR__ . '/../vendor/mpdf/psr-log-aware-trait/src/',
    'Mpdf\\'                     => __DIR__ . '/../vendor/mpdf/mpdf/src/',
    'Psr\\Log\\'                 => __DIR__ . '/psr-log-shim/',
    'Psr\\Http\\Message\\'       => __DIR__ . '/../vendor/psr/http-message/src/',
    'DeepCopy\\'                 => __DIR__ . '/../vendor/myclabs/deep-copy/src/DeepCopy/',
    'setasign\\Fpdi\\'           => __DIR__ . '/../vendor/setasign/fpdi/src/',
];

spl_autoload_register(function (string $class) use ($__pdfAutoloadMap): void {
    foreach ($__pdfAutoloadMap as $prefix => $dir) {
        if (strncmp($class, $prefix, strlen($prefix)) !== 0) continue;
        $relative = substr($class, strlen($prefix));
        $file = $dir . str_replace('\\', '/', $relative) . '.php';
        if (is_file($file)) require $file;
        return;
    }
});

require_once __DIR__ . '/../vendor/myclabs/deep-copy/src/DeepCopy/deep_copy.php';
require_once __DIR__ . '/../vendor/mpdf/mpdf/src/functions.php';
