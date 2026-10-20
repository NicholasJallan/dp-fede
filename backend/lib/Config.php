<?php
declare(strict_types=1);

class Config {
    private const DEFAULT_PATH = '/etc/dp-fede/config.php';

    private static ?array $cfg = null;

    /**
     * Chemin du fichier de configuration. Surchargeable par la variable
     * d'environnement DP_FEDE_CONFIG (CLI uniquement en pratique : test de
     * restauration sur une base temporaire, cf. deploy/restore.md).
     */
    public static function path(): string {
        $env = getenv('DP_FEDE_CONFIG');
        return ($env !== false && $env !== '') ? $env : self::DEFAULT_PATH;
    }

    /** @return mixed */
    public static function get(string $key) {
        if (self::$cfg === null) {
            $path = self::path();
            if (!file_exists($path)) {
                throw new RuntimeException("Config manquante : {$path}");
            }
            $loaded = require $path;
            if (!is_array($loaded)) {
                throw new RuntimeException("Config invalide (tableau attendu) : {$path}");
            }
            self::$cfg = $loaded;
        }
        return self::$cfg[$key] ?? null;
    }
}
