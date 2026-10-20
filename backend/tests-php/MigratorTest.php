<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/**
 * Migrator — fonctions pures (nommage, ordre, découpage SQL) + cohérence des
 * fichiers réellement livrés dans backend/migrations/.
 */
final class MigratorTest extends TestCase
{
    private const DIR = __DIR__ . '/../migrations';

    public function testParseVersionAcceptsConvention(): void
    {
        $this->assertSame('003', \Migrator::parseVersion('003_schema_consolidation.sql'));
    }

    /** @dataProvider invalidNames */
    public function testParseVersionRejectsInvalidNames(string $name): void
    {
        $this->assertNull(\Migrator::parseVersion($name));
    }

    public static function invalidNames(): array
    {
        return [
            'sans description' => ['003.sql'],
            'deux chiffres'    => ['03_foo.sql'],
            'majuscules'       => ['003_Foo.sql'],
            'mauvaise ext.'    => ['003_foo.txt'],
        ];
    }

    public function testPendingVersionsSortedAndExcludesApplied(): void
    {
        $this->assertSame(
            ['002', '010'],
            \Migrator::pendingVersions(['010', '000', '002', '001'], ['000', '001'])
        );
    }

    public function testSplitIgnoresSemicolonsInStringsAndComments(): void
    {
        $sql = "-- commentaire ; ignoré\n"
             . "SET @ddl := IF(1, 'ALTER TABLE t ADD c INT; -- pas un séparateur', 'DO 0');\n"
             . "/* bloc ; commentaire */ SELECT \"a;b\";\n"
             . "# autre commentaire ;\n"
             . "INSERT INTO t VALUES ('l''apostrophe ; ok', 'anti\\'slash;');";
        $stmts = \Migrator::splitStatements($sql);

        $this->assertCount(3, $stmts);
        $this->assertSame("SET @ddl := IF(1, 'ALTER TABLE t ADD c INT; -- pas un séparateur', 'DO 0')", $stmts[0]);
        $this->assertSame('SELECT "a;b"', $stmts[1]);
        $this->assertSame("INSERT INTO t VALUES ('l''apostrophe ; ok', 'anti\\'slash;')", $stmts[2]);
    }

    public function testSplitDropsEmptyStatements(): void
    {
        $this->assertSame(['SELECT 1'], \Migrator::splitStatements(";;\n SELECT 1 ;\n-- fin\n"));
    }

    public function testDoubleDashWithoutSpaceIsNotAComment(): void
    {
        // En MariaDB, « -- » n'ouvre un commentaire que s'il est suivi d'un blanc.
        $this->assertSame(['SELECT 1--1'], \Migrator::splitStatements('SELECT 1--1;'));
    }

    public function testShippedMigrationFilesFollowConventionWithoutDuplicates(): void
    {
        $versions = [];
        foreach (glob(self::DIR . '/*.sql') as $path) {
            $v = \Migrator::parseVersion(basename($path));
            $this->assertNotNull($v, 'Nom invalide : ' . basename($path));
            $versions[] = $v;
        }
        $this->assertSame(count($versions), count(array_unique($versions)), 'Versions en double');
        $this->assertContains('003', $versions);
        $this->assertContains('004', $versions);
        $this->assertContains('005', $versions);
        foreach (['006', '007', '008', '009', '010'] as $v) $this->assertContains($v, $versions);
    }

    /**
     * Migrations du socle club (006–008) : chaque instruction doit être
     * rejouable après un échec partiel (MariaDB valide le DDL implicitement).
     */
    public function testClubMigrationsAreIdempotent(): void
    {
        $allowed = '/^(CREATE TABLE IF NOT EXISTS'
            . '|ALTER TABLE \\w+ ADD COLUMN IF NOT EXISTS'
            . '|ALTER TABLE \\w+\\s+MODIFY '
            . '|CREATE (UNIQUE )?INDEX IF NOT EXISTS'
            . '|INSERT IGNORE INTO'
            . '|UPDATE .+ WHERE .+ IS NULL$'
            . '|SET @\\w+ :='
            . '|PREPARE fk_stmt FROM @ddl$|EXECUTE fk_stmt$|DEALLOCATE PREPARE fk_stmt$)/s';
        foreach (['006_clubs.sql', '007_divers_club_fields.sql', '008_dive_archive.sql', '009_clubs_soft_delete.sql'] as $file) {
            $stmts = \Migrator::splitStatements((string)file_get_contents(self::DIR . '/' . $file));
            $this->assertNotEmpty($stmts, $file);
            foreach ($stmts as $stmt) {
                $this->assertMatchesRegularExpression($allowed, $stmt, "{$file} : instruction non idempotente : {$stmt}");
                if (preg_match('/ALTER TABLE .*(ADD CONSTRAINT|DROP FOREIGN KEY)/', $stmt)) {
                    $this->assertStringStartsWith('SET @ddl := IF(', $stmt, "{$file} : FK non gardée : {$stmt}");
                }
            }
        }
    }

    /** Les FK créées à partir de 006 portent des noms uniques et jamais déjà utilisés. */
    public function testNewConstraintNamesAreUnique(): void
    {
        $old = [];
        $new = [];
        foreach (glob(self::DIR . '/*.sql') as $path) {
            preg_match_all('/CONSTRAINT\s+`?(\w+)`?\s+FOREIGN KEY/i', (string)file_get_contents($path), $m);
            $isNew = (int)\Migrator::parseVersion(basename($path)) >= 6;
            foreach ($m[1] as $n) {
                if ($isNew) $new[] = strtolower($n); else $old[strtolower($n)] = true;
            }
        }
        $this->assertNotEmpty($new);
        $this->assertSame(count($new), count(array_unique($new)), 'Nom de contrainte en double');
        foreach ($new as $n) $this->assertArrayNotHasKey($n, $old, "Nom déjà utilisé avant 006 : {$n}");
    }

    public function testClubBackfillCoversEveryUserAndTable(): void
    {
        $sql = (string)file_get_contents(self::DIR . '/006_clubs.sql');
        foreach (['divers', 'sites', 'dives'] as $t) {
            $this->assertMatchesRegularExpression("/UPDATE {$t} \\w+ JOIN clubs c ON c\\.auto_created_for = \\w+\\.user_id/", $sql, $t);
            $this->assertStringContainsString("ALTER TABLE {$t} MODIFY user_id INT UNSIGNED NULL", $sql);
        }
        $this->assertStringContainsString('UNIQUE KEY uq_clubs_auto_created_for (auto_created_for)', $sql);
    }

    public function testConsolidationMigrationIsIdempotentDdl(): void
    {
        $stmts = \Migrator::splitStatements((string)file_get_contents(self::DIR . '/003_schema_consolidation.sql'));
        $this->assertNotEmpty($stmts);
        foreach ($stmts as $stmt) {
            $this->assertMatchesRegularExpression(
                '/^(CREATE TABLE IF NOT EXISTS|ALTER TABLE \w+ ADD COLUMN IF NOT EXISTS|CREATE (UNIQUE )?INDEX IF NOT EXISTS)/',
                $stmt,
                'Instruction non idempotente : ' . $stmt
            );
        }
    }

    public function testForeignKeyMigrationGuardsEveryConstraint(): void
    {
        $stmts = \Migrator::splitStatements((string)file_get_contents(self::DIR . '/004_foreign_keys.sql'));
        $alterFk = array_filter($stmts, fn(string $s): bool => strpos($s, 'ADD CONSTRAINT') !== false);
        // Chaque ADD CONSTRAINT est dans un IF(@fk_missing, …) exécuté via PREPARE.
        foreach ($alterFk as $s) {
            $this->assertStringStartsWith('SET @ddl := IF(@fk_missing', $s);
        }
        $this->assertCount(5, $alterFk);
        $this->assertCount(5, array_filter($stmts, fn(string $s): bool => $s === 'EXECUTE fk_stmt'));
        $this->assertContains('ALTER TABLE dives MODIFY user_id INT UNSIGNED NOT NULL', $stmts);
    }

    /**
     * Migration 010 : index unique (club_id, client_uuid) à la place de
     * (user_id, client_uuid), doublons existants neutralisés avant, colonne
     * participants_at. Chaque instruction est rejouable.
     */
    public function testClientUuidPerClubMigrationIsIdempotent(): void
    {
        $sql   = (string)file_get_contents(self::DIR . '/010_dives_client_uuid_club.sql');
        $stmts = \Migrator::splitStatements($sql);
        $allowed = '/^(ALTER TABLE \\w+ ADD COLUMN IF NOT EXISTS'
            . '|CREATE (UNIQUE )?INDEX IF NOT EXISTS'
            . '|DROP INDEX IF EXISTS'
            . '|UPDATE dives \\w+\\s+JOIN dives \\w+\\s+ON .+\\s+SET \\w+\\.client_uuid = NULL, \\w+\\.updated_at = \\w+\\.updated_at\\s+WHERE .+'
            . '|UPDATE dives SET participants_at = .+, updated_at = updated_at\\s+WHERE participants_at IS NULL\\s+AND .+)/s';
        foreach ($stmts as $stmt) {
            $this->assertMatchesRegularExpression($allowed, $stmt, "instruction non idempotente : {$stmt}");
        }
        $joined = implode("\n", $stmts);
        // Les doublons sont neutralisés AVANT la création de l'index unique.
        $this->assertLessThan(
            strpos($joined, 'CREATE UNIQUE INDEX IF NOT EXISTS uq_dives_club_client ON dives (club_id, client_uuid)'),
            strpos($joined, 'SET d.client_uuid = NULL')
        );
        $this->assertStringContainsString('DROP INDEX IF EXISTS uniq_dives_client ON dives', $joined);
        // La FK auteur (user_id) garde un index après la suppression de l'ancien.
        $this->assertLessThan(
            strpos($joined, 'DROP INDEX IF EXISTS uniq_dives_client'),
            strpos($joined, 'CREATE INDEX IF NOT EXISTS idx_dives_author ON dives (user_id)')
        );
        $this->assertStringContainsString('ALTER TABLE dives ADD COLUMN IF NOT EXISTS participants_at DATETIME NULL', $joined);
    }
}
