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
}
