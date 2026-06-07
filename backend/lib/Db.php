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
        // Complète : date_plongee = DATETIME, date_plongee_legacy = VARCHAR backup.
        // Gère l'état partiel si date_plongee_dt existe déjà mais date_plongee_legacy non.
        $hasLegacy = $pdo->query("SHOW COLUMNS FROM archives LIKE 'date_plongee_legacy'")->fetchColumn();
        if (!$hasLegacy) {
            $hasDt = $pdo->query("SHOW COLUMNS FROM archives LIKE 'date_plongee_dt'")->fetchColumn();
            if (!$hasDt) {
                $colType = $pdo->query("SHOW COLUMNS FROM archives LIKE 'date_plongee'")->fetch();
                if ($colType && stripos($colType['Type'] ?? '', 'varchar') !== false) {
                    $pdo->exec("ALTER TABLE archives ADD COLUMN date_plongee_dt DATETIME NULL AFTER date_plongee");
                    $hasDt = true;
                }
            }
            if ($hasDt) {
                $pdo->exec("UPDATE archives SET date_plongee_dt = COALESCE(STR_TO_DATE(REPLACE(date_plongee, 'T', ' '), '%Y-%m-%d %H:%i'), STR_TO_DATE(date_plongee, '%Y-%m-%d')) WHERE date_plongee IS NOT NULL AND date_plongee <> '' AND date_plongee_dt IS NULL");
                $pdo->exec("ALTER TABLE archives CHANGE COLUMN date_plongee date_plongee_legacy VARCHAR(50)");
                $pdo->exec("ALTER TABLE archives CHANGE COLUMN date_plongee_dt date_plongee DATETIME NULL");
                try {
                    $pdo->exec("CREATE INDEX idx_archives_user_date ON archives (user_id, date_plongee DESC)");
                } catch (\PDOException $e) { /* index déjà existant */ }
            }
        }

        // Migration 007 — Offline sync : soft-delete, updated_at, client_uuid.
        // Appliquée colonne par colonne pour rester idempotente quel que soit
        // l'état partiel de la base (déploiement interrompu, rerun, etc.).
        self::addColumnIfMissing('divers',   'deleted_at',  'DATETIME NULL');
        self::addIndexIfMissing ('divers',   'idx_divers_user_updated', '(user_id, updated_at)');
        self::addIndexIfMissing ('divers',   'idx_divers_user_deleted', '(user_id, deleted_at)');

        self::addColumnIfMissing('sites',    'updated_at',  'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        self::addColumnIfMissing('sites',    'deleted_at',  'DATETIME NULL');
        self::addIndexIfMissing ('sites',    'idx_sites_user_updated',  '(user_id, updated_at)');
        self::addIndexIfMissing ('sites',    'idx_sites_user_deleted',  '(user_id, deleted_at)');

        self::addColumnIfMissing('archives', 'client_uuid', 'VARCHAR(36) NULL');
        self::addColumnIfMissing('archives', 'updated_at',  'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        self::addUniqueIndexIfMissing('archives', 'uniq_archives_client', '(user_id, client_uuid)');

        // Migration 008 — Cycle de vie des plongées (archives → dives).
        // Renomme la table si besoin, puis ajoute les nouvelles colonnes.
        $hasDives = self::$pdo->query("SHOW TABLES LIKE 'dives'")->fetchColumn();
        if (!$hasDives) {
            $hasArchives = self::$pdo->query("SHOW TABLES LIKE 'archives'")->fetchColumn();
            if ($hasArchives) {
                self::$pdo->exec('RENAME TABLE archives TO dives');
            } else {
                // Création from scratch (env fraîche sans migration 003-007)
                self::$pdo->exec("CREATE TABLE IF NOT EXISTS dives (
                    id           VARCHAR(36)  PRIMARY KEY,
                    user_id      INT          NOT NULL,
                    client_uuid  VARCHAR(36)  NULL,
                    site_nom     VARCHAR(255),
                    date_plongee DATETIME     NULL,
                    dp_nom       VARCHAR(200),
                    dp_qual      VARCHAR(20),
                    activite     VARCHAR(50),
                    answers      MEDIUMTEXT,
                    palanquees   MEDIUMTEXT,
                    drive_link   VARCHAR(500),
                    updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
                )");
            }
        }

        self::addColumnIfMissing('dives', 'status',       "ENUM('prepared','in_progress','archived') NOT NULL DEFAULT 'archived'");
        self::addColumnIfMissing('dives', 'planned_at',   'DATETIME NULL');
        self::addColumnIfMissing('dives', 'started_at',   'DATETIME NULL');
        self::addColumnIfMissing('dives', 'closed_at',    'DATETIME NULL');
        self::addColumnIfMissing('dives', 'render_state', 'MEDIUMTEXT NULL');
        self::addColumnIfMissing('dives', 'deleted_at',   'DATETIME NULL');
        self::addColumnIfMissing('dives', 'client_uuid',  'VARCHAR(36) NULL');
        self::addColumnIfMissing('dives', 'updated_at',   'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        self::addUniqueIndexIfMissing('dives', 'uniq_dives_client',     '(user_id, client_uuid)');
        self::addIndexIfMissing     ('dives', 'idx_dives_user_date',    '(user_id, date_plongee DESC)');
        self::addIndexIfMissing     ('dives', 'idx_dives_user_status',  '(user_id, status, planned_at DESC)');
        self::addIndexIfMissing     ('dives', 'idx_dives_user_deleted', '(user_id, deleted_at)');

        // Backfill : les lignes existantes (archivées) reçoivent planned_at et closed_at.
        self::$pdo->exec("UPDATE dives SET planned_at = date_plongee WHERE planned_at IS NULL AND date_plongee IS NOT NULL");
        self::$pdo->exec("UPDATE dives SET closed_at  = created_at   WHERE closed_at  IS NULL AND status = 'archived'");
    }

    /** Ajoute une colonne si absente. SHOW COLUMNS LIKE est fiable et indépendant
     *  de la version MariaDB (IF NOT EXISTS sur ADD COLUMN n'est dispo qu'à
     *  partir de 10.0.2 et déjà utilisé ailleurs, mais on garde le pattern
     *  défensif employé pour les migrations 006 et antérieures). */
    private static function addColumnIfMissing(string $table, string $col, string $spec): void {
        $exists = self::$pdo->query("SHOW COLUMNS FROM `{$table}` LIKE " . self::$pdo->quote($col))->fetchColumn();
        if (!$exists) {
            self::$pdo->exec("ALTER TABLE `{$table}` ADD COLUMN `{$col}` {$spec}");
        }
    }

    private static function addIndexIfMissing(string $table, string $name, string $cols): void {
        $exists = self::$pdo->query("SHOW INDEX FROM `{$table}` WHERE Key_name=" . self::$pdo->quote($name))->fetchColumn();
        if (!$exists) {
            self::$pdo->exec("CREATE INDEX `{$name}` ON `{$table}` {$cols}");
        }
    }

    private static function addUniqueIndexIfMissing(string $table, string $name, string $cols): void {
        $exists = self::$pdo->query("SHOW INDEX FROM `{$table}` WHERE Key_name=" . self::$pdo->quote($name))->fetchColumn();
        if (!$exists) {
            self::$pdo->exec("CREATE UNIQUE INDEX `{$name}` ON `{$table}` {$cols}");
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
