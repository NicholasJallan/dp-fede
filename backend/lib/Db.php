<?php
declare(strict_types=1);

class Db {
    private static ?PDO $pdo = null;

    public static function get(): PDO {
        if (self::$pdo !== null) return self::$pdo;

        $cfg = Config::get('db');
        $dsn = "mysql:host={$cfg['host']};dbname={$cfg['name']};charset=utf8mb4";

        self::$pdo = new PDO($dsn, $cfg['user'], $cfg['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        self::migrate();
        return self::$pdo;
    }

    private static function migrate(): void {
        $pdo = self::$pdo;

        // Quick check — run migration only if users table absent
        $exists = $pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn();
        if ($exists) return;

        $sql = file_get_contents(__DIR__ . '/../migrations/001_init.sql');
        // Split on ; to execute statement by statement
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
            $pdo->exec($stmt);
        }
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

    public static function uuid(): string {
        $b = random_bytes(16);
        $b[6] = chr((ord($b[6]) & 0x0f) | 0x40);
        $b[8] = chr((ord($b[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($b), 4));
    }
}
