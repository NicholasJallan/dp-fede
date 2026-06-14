<?php
declare(strict_types=1);

/**
 * Migrations versionnées — applique les fichiers backend/migrations/NNN_*.sql
 * dans l'ordre lexicographique, une seule fois chacun.
 *
 * Stratégie de démarrage sur instance existante (migration 000) :
 * si les tables principales existent déjà, on marque 000 comme appliqué sans
 * le ré-exécuter (le contenu est équivalent à Db::migrate()).
 */
class Migrator
{
    private const MIGRATIONS_DIR = __DIR__ . '/../migrations';
    private const TABLE          = 'schema_migrations';

    public static function run(PDO $pdo): void
    {
        self::ensureTable($pdo);
        $applied = self::appliedVersions($pdo);
        $files   = self::migrationFiles();

        foreach ($files as $version => $path) {
            if (in_array($version, $applied, true)) continue;

            // Heuristique : 000 sur base existante → marquer sans exécuter
            if ($version === '000' && self::baseTablesExist($pdo)) {
                self::markApplied($pdo, $version);
                continue;
            }

            self::applyFile($pdo, $path);
            self::markApplied($pdo, $version);
        }
    }

    // ── Internals ──────────────────────────────────────────────────────────

    private static function ensureTable(PDO $pdo): void
    {
        $pdo->exec("CREATE TABLE IF NOT EXISTS " . self::TABLE . " (
            version    VARCHAR(10) NOT NULL PRIMARY KEY,
            applied_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    }

    /** @return string[] liste des versions déjà appliquées */
    private static function appliedVersions(PDO $pdo): array
    {
        return $pdo->query("SELECT version FROM " . self::TABLE)->fetchAll(PDO::FETCH_COLUMN);
    }

    /** @return array<string,string> version => chemin, triés lexicographiquement */
    private static function migrationFiles(): array
    {
        $dir   = self::MIGRATIONS_DIR;
        $files = [];
        foreach (glob("{$dir}/*.sql") ?: [] as $path) {
            $base    = basename($path, '.sql');
            $version = explode('_', $base, 2)[0];
            $files[$version] = $path;
        }
        ksort($files);
        return $files;
    }

    private static function baseTablesExist(PDO $pdo): bool
    {
        foreach (['users', 'dives', 'divers', 'sites'] as $t) {
            $r = $pdo->query("SHOW TABLES LIKE '{$t}'")->fetchColumn();
            if (!$r) return false;
        }
        return true;
    }

    private static function applyFile(PDO $pdo, string $path): void
    {
        $sql = file_get_contents($path);
        // Exécuter chaque statement séparément (PDO::exec ne gère pas les multi-statements)
        foreach (self::splitStatements($sql) as $stmt) {
            $stmt = trim($stmt);
            if ($stmt !== '') {
                $pdo->exec($stmt);
            }
        }
    }

    /** Découpe le SQL en statements individuels (séparateur ';'). Ignore les commentaires. */
    private static function splitStatements(string $sql): array
    {
        // Retire les commentaires -- et /* */
        $sql = preg_replace('/--[^\n]*/', '', $sql);
        $sql = preg_replace('#/\*.*?\*/#s', '', $sql);
        return explode(';', $sql);
    }

    private static function markApplied(PDO $pdo, string $version): void
    {
        $pdo->prepare("INSERT IGNORE INTO " . self::TABLE . " (version) VALUES (?)")
            ->execute([$version]);
    }
}
