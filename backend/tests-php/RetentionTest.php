<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Retention::parseOptions / cutoff — paramétrage de bin/purge.php. */
final class RetentionTest extends TestCase
{
    public function testDefaultsKeepDestructivePurgesDisabled(): void
    {
        $r = \Retention::parseOptions([], []);
        $this->assertSame([], $r['errors']);
        $this->assertFalse($r['options']['dry_run']);
        $this->assertSame(180, $r['options']['soft_deleted_days']);
        // Décision utilisateur : 5 ans par défaut pour les plongées archivées (A322-72 / RGPD)
        $this->assertSame(5, $r['options']['archived_dives_years']);
        $this->assertSame(0, $r['options']['inactive_accounts_years']);
    }

    public function testExplicitZeroDisablesArchivedDivesPurge(): void
    {
        $r = \Retention::parseOptions([], ['archived_dives_years' => 0]);
        $this->assertSame([], $r['errors']);
        $this->assertSame(0, $r['options']['archived_dives_years']);

        $cli = \Retention::parseOptions(['--archived-dives-years=0'], []);
        $this->assertSame([], $cli['errors']);
        $this->assertSame(0, $cli['options']['archived_dives_years']);
    }

    public function testConfigValuesApply(): void
    {
        $r = \Retention::parseOptions([], ['soft_deleted_days' => 30, 'archived_dives_years' => 5]);
        $this->assertSame([], $r['errors']);
        $this->assertSame(30, $r['options']['soft_deleted_days']);
        $this->assertSame(5, $r['options']['archived_dives_years']);
    }

    public function testCliOverridesConfig(): void
    {
        $r = \Retention::parseOptions(
            ['--dry-run', '--archived-dives-years=3', '--soft-deleted-days=0', '--inactive-accounts-years=2'],
            ['archived_dives_years' => 10]
        );
        $this->assertSame([], $r['errors']);
        $this->assertTrue($r['options']['dry_run']);
        $this->assertSame(3, $r['options']['archived_dives_years']);
        $this->assertSame(0, $r['options']['soft_deleted_days']);
        $this->assertSame(2, $r['options']['inactive_accounts_years']);
    }

    public function testInactiveAccountsBelowMinimumRejected(): void
    {
        $r = \Retention::parseOptions(['--inactive-accounts-years=1'], []);
        $this->assertCount(1, $r['errors']);
    }

    #[DataProvider('badArgs')]
    public function testInvalidArgumentsRejected(array $args): void
    {
        $this->assertNotEmpty(\Retention::parseOptions($args, [])['errors']);
    }

    public static function badArgs(): array
    {
        return [
            'négatif'        => [['--archived-dives-years=-1']],
            'non numérique'  => [['--soft-deleted-days=abc']],
            'option inconnue'=> [['--purge-everything']],
        ];
    }

    public function testInvalidConfigTypeRejected(): void
    {
        $this->assertNotEmpty(\Retention::parseOptions([], ['archived_dives_years' => '5'])['errors']);
    }

    public function testHelpFlag(): void
    {
        $this->assertTrue(\Retention::parseOptions(['--help'], [])['options']['help']);
    }

    public function testCutoff(): void
    {
        $now = new \DateTimeImmutable('2026-10-20 03:15:00');
        $this->assertSame('2026-04-23 03:15:00', \Retention::cutoff($now, 180, 'days'));
        $this->assertSame('2023-10-20 03:15:00', \Retention::cutoff($now, 3, 'years'));
    }

    public function testCutoffRejectsUnknownUnit(): void
    {
        $this->expectException(\InvalidArgumentException::class);
        \Retention::cutoff(new \DateTimeImmutable(), 1, 'weeks');
    }
}
