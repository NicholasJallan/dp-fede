<?php
declare(strict_types=1);

// Bootstrap PHPUnit — charge tous les libs du backend dans l'ordre attendu
// par index.php. On stub Config en mémoire pour ne pas dépendre de
// /etc/dp-fede/config.php (qui n'existe que sur le Pi).

require_once __DIR__ . '/../lib/Json.php';

// Stub minimal de Config — réimplémente la même API publique.
if (!class_exists('Config')) {
    class Config {
        private static array $store = [
            'app'    => ['domain' => 'dp-fede.bullesenvalais.ch'],
            'db'     => ['host' => '127.0.0.1', 'name' => 'dp_fede_test', 'user' => 'test', 'pass' => 'test'],
            'google' => ['client_id' => 'test-client-id.apps.googleusercontent.com'],
        ];
        public static function get(string $section): array {
            return self::$store[$section] ?? [];
        }
        public static function set(string $section, array $values): void {
            self::$store[$section] = $values;
        }
    }
}

// Charge les autres libs.
require_once __DIR__ . '/../lib/Validate.php';
require_once __DIR__ . '/../lib/HtmlSanitizer.php';
require_once __DIR__ . '/../lib/Csrf.php';
require_once __DIR__ . '/../lib/SyncHelpers.php';
require_once __DIR__ . '/../lib/Auth.php';
require_once __DIR__ . '/../lib/Rules.php';
// Db dépend de PDO live → on ne charge pas Auth::current/Session ici (les
// tests qui en ont besoin doivent mocker explicitement).
require_once __DIR__ . '/../lib/Db.php';

// Charge les helpers de routes utilisés (parseDiveDateToMySql, normalizeDiveDate).
// Sans définir $method/$path → les blocs if du fichier ne se déclenchent pas,
// seules les fonctions globales sont visibles.
$method = 'GET';
$path   = '/__bootstrap__';
require_once __DIR__ . '/../routes/dives.php';

// Stub pour éviter que Json::abort termine le process en plein test.
if (!class_exists('JsonAbortedException')) {
    class JsonAbortedException extends RuntimeException {
        public int $httpStatus;
        public function __construct(int $status, string $message) {
            parent::__construct($message);
            $this->httpStatus = $status;
        }
    }
}
