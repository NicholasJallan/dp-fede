<?php
declare(strict_types=1);

/**
 * Accès PDO (connexion paresseuse, une par requête/processus).
 *
 * Le schéma n'est PLUS migré ici : les migrations versionnées
 * (backend/migrations/NNN_*.sql) sont appliquées une seule fois, au
 * déploiement, par `php bin/migrate.php` (cf. deploy/deploy-backend.sh).
 * Auparavant, ~40 requêtes de schéma tournaient à chaque requête HTTP, avec
 * un risque de course entre workers PHP-FPM.
 */
class Db {
    private static ?PDO $pdo = null;

    public static function get(): PDO {
        if (self::$pdo !== null) return self::$pdo;

        $cfg = Config::get('db');
        if (!is_array($cfg)) {
            throw new RuntimeException('Section « db » absente de la configuration');
        }
        $dsn = "mysql:host={$cfg['host']};dbname={$cfg['name']};charset=utf8mb4";

        self::$pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        return self::$pdo;
    }

    public static function q(string $sql, array $params = []): PDOStatement {
        $st = self::get()->prepare($sql);
        $st->execute($params);
        return $st;
    }

    public static function row(string $sql, array $params = []): ?array {
        $r = self::q($sql, $params)->fetch();
        return $r ?: null;
    }

    public static function all(string $sql, array $params = []): array {
        return self::q($sql, $params)->fetchAll();
    }

    /**
     * Exécute $fn dans une transaction ; rollback et relance en cas d'erreur.
     *
     * @template T
     * @param callable(PDO): T $fn
     * @return T
     */
    public static function transaction(callable $fn) {
        $pdo = self::get();
        $pdo->beginTransaction();
        try {
            $result = $fn($pdo);
            $pdo->commit();
            return $result;
        } catch (\Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    public static function uuid(): string {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
