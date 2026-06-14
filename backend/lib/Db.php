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

    /**
     * Applique d'abord les migrations versionnées (Migrator), puis les garde-fous
     * idempotents hérités (addColumnIfMissing / addIndexIfMissing) pour la
     * compatibilité avec les instances déployées avant l'introduction du Migrator.
     */
    private static function migrate(): void {
        $pdo = self::$pdo;

        // H3 — migrations versionnées
        require_once __DIR__ . '/Migrator.php';
        Migrator::run($pdo);

        $pdo->exec("CREATE TABLE IF NOT EXISTS users (
            id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
            google_sub    VARCHAR(255) NOT NULL,
            email         VARCHAR(255) NOT NULL,
            nom           VARCHAR(100) DEFAULT '',
            prenom        VARCHAR(100) DEFAULT '',
            avatar_url    VARCHAR(500) DEFAULT '',
            role          ENUM('admin','user') NOT NULL DEFAULT 'user',
            club_nom      VARCHAR(200) DEFAULT '',
            club_numero   VARCHAR(50)  DEFAULT '',
            club_siret    VARCHAR(50)  DEFAULT '',
            structure_type VARCHAR(20) NULL,
            president_prenom VARCHAR(100) NULL,
            president_nom    VARCHAR(100) NULL,
            president_tel    VARCHAR(30)  NULL,
            urgence_defaut   VARCHAR(20)  NULL,
            created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login    DATETIME,
            UNIQUE KEY uq_google_sub (google_sub),
            UNIQUE KEY uq_email (email),
            INDEX idx_email (email)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS sessions (
            id         CHAR(64) PRIMARY KEY,
            user_id    INT UNSIGNED NOT NULL,
            ip_addr    VARCHAR(45) DEFAULT '',
            user_agent VARCHAR(500) DEFAULT '',
            expires_at DATETIME NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user    (user_id),
            INDEX idx_expires (expires_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $pdo->exec("CREATE TABLE IF NOT EXISTS divers (
            id               CHAR(36) PRIMARY KEY,
            user_id          INT UNSIGNED NOT NULL,
            nom              VARCHAR(100) NOT NULL,
            prenom           VARCHAR(100) NOT NULL DEFAULT '',
            licence          VARCHAR(50)  DEFAULT '',
            niveau           VARCHAR(30)  DEFAULT '',
            niveau_plongeur  VARCHAR(3)   NULL,
            niveau_encadrant VARCHAR(4)   NULL,
            aptitudes_sup    JSON         NULL,
            qualifs          JSON,
            medical          DATE,
            notes            TEXT,
            deleted_at       DATETIME     NULL,
            created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at       DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user (user_id),
            INDEX idx_nom  (nom, prenom),
            INDEX idx_divers_user_updated (user_id, updated_at),
            INDEX idx_divers_user_deleted (user_id, deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS sites (
            id              CHAR(36) PRIMARY KEY,
            user_id         INT UNSIGNED NOT NULL,
            nom             VARCHAR(200) NOT NULL,
            milieu          ENUM('En mer','Lac','Carrière','Piscine','Autre') DEFAULT 'En mer',
            profondeur_max  DECIMAL(5,1),
            coordonnees     JSON,
            depart_bord     TINYINT(1) NOT NULL DEFAULT 0,
            depart_bateau   TINYINT(1) NOT NULL DEFAULT 0,
            shot_line       TINYINT(1) NOT NULL DEFAULT 0,
            ville           VARCHAR(150) NULL,
            pays            VARCHAR(80)  NULL,
            pays_code       VARCHAR(3)   NULL,
            region          VARCHAR(150) NULL,
            acces_secours   VARCHAR(500) NULL,
            caisson         VARCHAR(500) NULL,
            notes           TEXT,
            updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            deleted_at      DATETIME NULL,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user (user_id),
            INDEX idx_sites_user_updated (user_id, updated_at),
            INDEX idx_sites_user_deleted (user_id, deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        $pdo->exec("CREATE TABLE IF NOT EXISTS dives (
            id           VARCHAR(36)  PRIMARY KEY,
            user_id      INT          NOT NULL,
            client_uuid  VARCHAR(36)  NULL,
            site_nom     VARCHAR(255),
            date_plongee DATETIME     NULL,
            dp_nom       VARCHAR(200),
            dp_qual      VARCHAR(20),
            activite     VARCHAR(50),
            status       ENUM('prepared','in_progress','archived') NOT NULL DEFAULT 'archived',
            planned_at   DATETIME     NULL,
            started_at   DATETIME     NULL,
            closed_at    DATETIME     NULL,
            answers      MEDIUMTEXT,
            palanquees   MEDIUMTEXT,
            render_state MEDIUMTEXT   NULL,
            drive_link   VARCHAR(500),
            deleted_at   DATETIME     NULL,
            updated_at   TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            created_at   TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY uniq_dives_client (user_id, client_uuid),
            INDEX idx_dives_user_date    (user_id, date_plongee DESC),
            INDEX idx_dives_user_status  (user_id, status, planned_at DESC),
            INDEX idx_dives_user_deleted (user_id, deleted_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");

        // Garde-fous idempotents pour la base déjà déployée : les colonnes /
        // index ci-dessus n'existent pas forcément sur une instance créée par
        // une version antérieure du schéma. CREATE TABLE IF NOT EXISTS ne les
        // ajoute pas à une table existante — on complète donc ici.
        self::addColumnIfMissing('users',  'structure_type',   'VARCHAR(20) NULL');
        self::addColumnIfMissing('users',  'president_prenom',  'VARCHAR(100) NULL');
        self::addColumnIfMissing('users',  'president_nom',     'VARCHAR(100) NULL');
        self::addColumnIfMissing('users',  'president_tel',     'VARCHAR(30)  NULL');
        self::addColumnIfMissing('users',  'urgence_defaut',    'VARCHAR(20)  NULL');

        self::addColumnIfMissing('divers', 'niveau_plongeur',  'VARCHAR(3)  NULL');
        self::addColumnIfMissing('divers', 'niveau_encadrant', 'VARCHAR(4)  NULL');
        self::addColumnIfMissing('divers', 'aptitudes_sup',    'JSON        NULL');
        self::addColumnIfMissing('divers', 'deleted_at',       'DATETIME    NULL');
        self::addIndexIfMissing ('divers', 'idx_divers_user_updated', '(user_id, updated_at)');
        self::addIndexIfMissing ('divers', 'idx_divers_user_deleted', '(user_id, deleted_at)');

        self::addColumnIfMissing('sites',  'depart_bord',   'TINYINT(1) NOT NULL DEFAULT 0');
        self::addColumnIfMissing('sites',  'depart_bateau', 'TINYINT(1) NOT NULL DEFAULT 0');
        self::addColumnIfMissing('sites',  'shot_line',     'TINYINT(1) NOT NULL DEFAULT 0');
        self::addColumnIfMissing('sites',  'ville',         'VARCHAR(150) NULL');
        self::addColumnIfMissing('sites',  'pays',          'VARCHAR(80)  NULL');
        self::addColumnIfMissing('sites',  'pays_code',     'VARCHAR(3)   NULL');
        self::addColumnIfMissing('sites',  'region',        'VARCHAR(150) NULL');
        self::addColumnIfMissing('sites',  'acces_secours', 'VARCHAR(500) NULL');
        self::addColumnIfMissing('sites',  'caisson',       'VARCHAR(500) NULL');
        self::addColumnIfMissing('sites',  'updated_at',    'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        self::addColumnIfMissing('sites',  'deleted_at',    'DATETIME NULL');
        self::addIndexIfMissing ('sites',  'idx_sites_user_updated', '(user_id, updated_at)');
        self::addIndexIfMissing ('sites',  'idx_sites_user_deleted', '(user_id, deleted_at)');

        self::addColumnIfMissing('dives',  'client_uuid',  'VARCHAR(36) NULL');
        self::addColumnIfMissing('dives',  'status',       "ENUM('prepared','in_progress','archived') NOT NULL DEFAULT 'archived'");
        self::addColumnIfMissing('dives',  'planned_at',   'DATETIME NULL');
        self::addColumnIfMissing('dives',  'started_at',   'DATETIME NULL');
        self::addColumnIfMissing('dives',  'closed_at',    'DATETIME NULL');
        self::addColumnIfMissing('dives',  'render_state', 'MEDIUMTEXT NULL');
        self::addColumnIfMissing('dives',  'deleted_at',   'DATETIME NULL');
        self::addColumnIfMissing('dives',  'updated_at',   'TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
        self::addUniqueIndexIfMissing('dives', 'uniq_dives_client',     '(user_id, client_uuid)');
        self::addIndexIfMissing     ('dives', 'idx_dives_user_date',    '(user_id, date_plongee DESC)');
        self::addIndexIfMissing     ('dives', 'idx_dives_user_status',  '(user_id, status, planned_at DESC)');
        self::addIndexIfMissing     ('dives', 'idx_dives_user_deleted', '(user_id, deleted_at)');

        $pdo->exec("CREATE TABLE IF NOT EXISTS rate_limits (
            bucket       VARCHAR(64)  NOT NULL,
            ident        VARCHAR(64)  NOT NULL,
            count        INT UNSIGNED NOT NULL DEFAULT 0,
            window_start DATETIME     NOT NULL,
            PRIMARY KEY (bucket, ident)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    /** Ajoute une colonne si absente. SHOW COLUMNS LIKE est fiable et
     *  indépendant de la version MariaDB. */
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
