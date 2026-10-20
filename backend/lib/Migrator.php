<?php
declare(strict_types=1);

/**
 * Migrations versionnées — applique les fichiers backend/migrations/NNN_*.sql
 * dans l'ordre, une seule fois chacun (table `schema_migrations`).
 *
 * Exécuté UNIQUEMENT en CLI (`php bin/migrate.php`, appelé par
 * deploy/deploy-backend.sh), jamais pendant une requête HTTP.
 *
 * - Verrou MariaDB (GET_LOCK) : deux exécutions concurrentes ne peuvent pas
 *   appliquer la même migration en parallèle.
 * - MariaDB valide implicitement le DDL (pas de transaction possible) : chaque
 *   fichier doit donc être IDEMPOTENT (ADD COLUMN IF NOT EXISTS, CREATE INDEX
 *   IF NOT EXISTS, garde information_schema…) pour pouvoir être rejoué après
 *   un échec partiel.
 * - Démarrage sur instance existante : si les tables principales existent
 *   déjà, 000 (snapshot initial) est marqué appliqué sans être exécuté.
 */
class Migrator
{
    private const MIGRATIONS_DIR = __DIR__ . '/../migrations';
    private const TABLE          = 'schema_migrations';
    private const LOCK_NAME      = 'dp_fede_migrate';
    private const LOCK_TIMEOUT_S = 60;

    /**
     * Applique les migrations en attente.
     *
     * @param callable(string):void|null $log
     * @return string[] versions appliquées (ou marquées) par cet appel
     */
    public static function run(PDO $pdo, ?callable $log = null, ?string $dir = null): array
    {
        $log = $log ?? static function (string $m): void {};
        self::acquireLock($pdo);
        try {
            self::ensureTable($pdo);
            $files   = self::migrationFiles($dir ?? self::MIGRATIONS_DIR);
            $pending = self::pendingVersions(array_keys($files), self::appliedVersions($pdo));
            $done    = [];

            foreach ($pending as $version) {
                $path = $files[$version];
                if ($version === '000' && self::baseTablesExist($pdo)) {
                    self::markApplied($pdo, $version);
                    $log("{$version} : base existante, marquée appliquée sans exécution");
                    $done[] = $version;
                    continue;
                }
                $log('→ ' . basename($path));
                self::applyFile($pdo, $path);
                self::markApplied($pdo, $version);
                $done[] = $version;
            }
            return $done;
        } finally {
            self::releaseLock($pdo);
        }
    }

    /**
     * État des migrations (sans rien appliquer).
     *
     * @return array<string,array{file:string,applied:bool}>
     */
    public static function status(PDO $pdo, ?string $dir = null): array
    {
        self::ensureTable($pdo);
        $applied = self::appliedVersions($pdo);
        $out     = [];
        foreach (self::migrationFiles($dir ?? self::MIGRATIONS_DIR) as $version => $path) {
            $out[$version] = ['file' => basename($path), 'applied' => in_array($version, $applied, true)];
        }
        return $out;
    }

    // ── Fonctions pures (testées) ──────────────────────────────────────────

    /**
     * Extrait la version (« 003 ») d'un nom de fichier « 003_description.sql ».
     * Retourne null si le nom ne respecte pas la convention.
     */
    public static function parseVersion(string $filename): ?string
    {
        return preg_match('/^(\d{3})_[a-z0-9_]+\.sql$/', $filename, $m) ? $m[1] : null;
    }

    /**
     * @param string[] $available versions disponibles
     * @param string[] $applied   versions déjà appliquées
     * @return string[] versions à appliquer, triées
     */
    public static function pendingVersions(array $available, array $applied): array
    {
        $pending = array_values(array_diff($available, $applied));
        sort($pending, SORT_STRING);
        return $pending;
    }

    /**
     * Découpe un script SQL en instructions individuelles (séparateur « ; »).
     * Ignore les « ; » situés dans des chaînes ('…', "…", `…`) et les
     * commentaires (-- …, # …, / * … * /), qui sont retirés.
     *
     * @return string[]
     */
    public static function splitStatements(string $sql): array
    {
        $out   = [];
        $buf   = '';
        $len   = strlen($sql);
        $quote = null; // ', " ou `

        for ($i = 0; $i < $len; $i++) {
            $c    = $sql[$i];
            $next = $i + 1 < $len ? $sql[$i + 1] : '';

            if ($quote !== null) {
                $buf .= $c;
                if ($c === '\\' && $quote !== '`' && $next !== '') {
                    $buf .= $next;
                    $i++;
                } elseif ($c === $quote) {
                    $quote = null;
                }
                continue;
            }

            if ($c === "'" || $c === '"' || $c === '`') {
                $quote = $c;
                $buf  .= $c;
                continue;
            }

            $isDashComment = $c === '-' && $next === '-'
                && ($i + 2 >= $len || ctype_space($sql[$i + 2]));
            if ($isDashComment || $c === '#') {
                $eol = strpos($sql, "\n", $i);
                $i   = $eol === false ? $len : $eol - 1;
                continue;
            }

            if ($c === '/' && $next === '*') {
                $end = strpos($sql, '*/', $i + 2);
                $i   = $end === false ? $len : $end + 1;
                $buf .= ' ';
                continue;
            }

            if ($c === ';') {
                $out[] = $buf;
                $buf   = '';
                continue;
            }
            $buf .= $c;
        }
        $out[] = $buf;

        return array_values(array_filter(array_map('trim', $out), static fn(string $s): bool => $s !== ''));
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private static function acquireLock(PDO $pdo): void
    {
        $st = $pdo->prepare('SELECT GET_LOCK(?, ?)');
        $st->execute([self::LOCK_NAME, self::LOCK_TIMEOUT_S]);
        if ((int)$st->fetchColumn() !== 1) {
            throw new RuntimeException('Une autre migration est en cours (verrou ' . self::LOCK_NAME . ' non obtenu)');
        }
    }

    private static function releaseLock(PDO $pdo): void
    {
        try {
            $pdo->prepare('SELECT RELEASE_LOCK(?)')->execute([self::LOCK_NAME]);
        } catch (\Throwable $e) {
            // Le verrou est de toute façon libéré à la fermeture de la connexion.
        }
    }

    private static function ensureTable(PDO $pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS " . self::TABLE . " (
            version    VARCHAR(10) NOT NULL PRIMARY KEY,
            applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    /** @return string[] */
    private static function appliedVersions(PDO $pdo): array
    {
        return $pdo->query("SELECT version FROM " . self::TABLE)->fetchAll(PDO::FETCH_COLUMN);
    }

    /** @return array<string,string> version => chemin, triés */
    private static function migrationFiles(string $dir): array
    {
        $files = [];
        foreach (glob("{$dir}/*.sql") ?: [] as $path) {
            $version = self::parseVersion(basename($path));
            if ($version === null) {
                throw new RuntimeException('Nom de migration invalide (attendu NNN_description.sql) : ' . basename($path));
            }
            if (isset($files[$version])) {
                throw new RuntimeException("Version de migration en double : {$version}");
            }
            $files[$version] = $path;
        }
        ksort($files, SORT_STRING);
        return $files;
    }

    private static function baseTablesExist(PDO $pdo): bool
    {
        foreach (['users', 'dives', 'divers', 'sites'] as $t) {
            // Pas de « SHOW TABLES LIKE ? » : MariaDB refuse les paramètres
            // dans SHOW en requête préparée native (Db : EMULATE_PREPARES off).
            $st = $pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?');
            $st->execute([$t]);
            if ((int)$st->fetchColumn() === 0) return false;
        }
        return true;
    }

    private static function applyFile(PDO $pdo, string $path): void
    {
        $sql = file_get_contents($path);
        if ($sql === false) {
            throw new RuntimeException("Lecture impossible : {$path}");
        }
        foreach (self::splitStatements($sql) as $stmt) {
            try {
                $pdo->exec($stmt);
            } catch (\PDOException $e) {
                $excerpt = mb_substr(preg_replace('/\s+/', ' ', $stmt) ?? $stmt, 0, 160);
                throw new RuntimeException(basename($path) . " : {$e->getMessage()} — dans : {$excerpt}", 0, $e);
            }
        }
    }

    private static function markApplied(PDO $pdo, string $version): void
    {
        $pdo->prepare("INSERT IGNORE INTO " . self::TABLE . " (version) VALUES (?)")
            ->execute([$version]);
    }
}
