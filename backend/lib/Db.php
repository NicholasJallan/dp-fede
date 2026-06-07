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

        // Migration 001 — tables initiales
        $exists = $pdo->query("SHOW TABLES LIKE 'users'")->fetchColumn();
        if (!$exists) {
            $sql = file_get_contents(__DIR__ . '/../migrations/001_init.sql');
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
                $pdo->exec($stmt);
            }
        }

        // Migration 002 — colonnes v2 (idempotente grâce à IF NOT EXISTS)
        $hasCol = $pdo->query("SHOW COLUMNS FROM divers LIKE 'niveau_plongeur'")->fetchColumn();
        if (!$hasCol) {
            $sql = file_get_contents(__DIR__ . '/../migrations/002_schema_v2.sql');
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
                $pdo->exec($stmt);
            }
        }

        // Migration 003 — table archives
        $hasArchives = $pdo->query("SHOW TABLES LIKE 'archives'")->fetchColumn();
        if (!$hasArchives) {
            $sql = file_get_contents(__DIR__ . '/../migrations/003_archives.sql');
            foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
                $pdo->exec($stmt);
            }
        }

        // Migration 006 — archives.date_plongee VARCHAR(50) → DATETIME
        // Détectée par l'absence de la colonne backup date_plongee_legacy
        $hasLegacy = $pdo->query("SHOW COLUMNS FROM archives LIKE 'date_plongee_legacy'")->fetchColumn();
        if (!$hasLegacy) {
            $colType = $pdo->query("SHOW COLUMNS FROM archives LIKE 'date_plongee'")->fetch();
            if ($colType && stripos($colType['Type'] ?? '', 'varchar') !== false) {
                $sql = file_get_contents(__DIR__ . '/../migrations/006_archives_datetime.sql');
                foreach (array_filter(array_map('trim', explode(';', $sql))) as $stmt) {
                    $pdo->exec($stmt);
                }
            }
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
