<?php
declare(strict_types=1);

/**
 * Rate-limiting persistant via MariaDB.
 * Remplace le compteur APCu (perdu au reload PHP-FPM) par une table SQL
 * dont l'état survit aux redémarrages et est partagé entre workers.
 *
 * Fallback transparent vers APCu si la table n'existe pas encore
 * (premier déploiement avant que Db::migrate() ait tourné).
 */
class RateLimit {
    public static function hitOrAbort(
        string  $bucket,
        int     $max,
        int     $windowSec,
        string  $errMsg,
        ?string $ident = null
    ): void {
        $ident       = $ident ?? ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
        $windowStart = date('Y-m-d H:i:s', time() - $windowSec);

        try {
            // Upsert atomique : reset ou incrément selon la fenêtre courante
            Db::q(
                'INSERT INTO rate_limits (bucket, ident, count, window_start) VALUES (?,?,1,NOW())
                 ON DUPLICATE KEY UPDATE
                   count        = IF(window_start < ?, 1, count + 1),
                   window_start = IF(window_start < ?, NOW(), window_start)',
                [$bucket, $ident, $windowStart, $windowStart]
            );
            $row = Db::row(
                'SELECT count FROM rate_limits WHERE bucket=? AND ident=?',
                [$bucket, $ident]
            );
            $n = (int)($row['count'] ?? 0);
            if ($n > $max) Json::abort(429, $errMsg);
        } catch (\Exception $e) {
            // Table absente (premier déploiement) : fallback APCu
            self::fallbackApcu($bucket, $max, $windowSec, $errMsg, $ident);
            return;
        }

        // Garbage collection probabiliste (≈1 % des requêtes)
        if (random_int(1, 100) === 1) {
            self::purge();
        }
    }

    public static function purge(): void {
        try {
            Db::q("DELETE FROM rate_limits WHERE window_start < DATE_SUB(NOW(), INTERVAL 1 HOUR)");
        } catch (\Exception $e) {
            // silently ignore
        }
    }

    private static function fallbackApcu(string $bucket, int $max, int $windowSec, string $errMsg, string $ident): void {
        if (!extension_loaded('apcu') || !apcu_enabled()) return;
        $key = "rl_{$bucket}_{$ident}";
        $n   = apcu_fetch($key);
        if ($n === false) {
            apcu_store($key, 1, $windowSec);
            return;
        }
        apcu_inc($key);
        if ((int)$n >= $max) Json::abort(429, $errMsg);
    }
}
