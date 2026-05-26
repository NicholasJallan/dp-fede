<?php
declare(strict_types=1);

class Config {
    private static ?array $cfg = null;

    /** @return mixed */
    public static function get(string $key) {
        if (self::$cfg === null) {
            $path = '/etc/dp-fede/config.php';
            if (!file_exists($path)) {
                throw new RuntimeException("Config manquante : {$path}");
            }
            self::$cfg = require $path;
        }
        return self::$cfg[$key] ?? null;
    }
}
