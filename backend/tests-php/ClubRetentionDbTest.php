<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/** Conservation légale : minimisation des données conservées, purge sur dates serveur. */
final class ClubRetentionDbTest extends TestCase
{
    private const CLUB = '0b9d2c8e-6f1a-4c3b-9d2e-1a2b3c4d5e6f';

    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    private function plan(): array
    {
        return ['dive_ids' => ['dv1'], 'diver_ids' => ['d1', 'd2'], 'site_ids' => ['s1'], 'count' => 1, 'until' => '2027-07-14'];
    }

    public function testRetainedDiversAreStrippedOfDataTheFicheDoesNotNeed(): void
    {
        \ClubRetention::retireClubRows($this->pdo, self::CLUB, $this->plan());
        $updates = $this->pdo->matching('/^\s*UPDATE divers SET/');
        $this->assertCount(1, $updates);
        $sql = $updates[0]['sql'];
        foreach (['date_naissance', 'representant_legal', 'autorisation_parentale_saison', 'notes', 'licence_fin', 'medical', 'external_id'] as $col) {
            $this->assertMatchesRegularExpression("/\\b{$col}=NULL\\b/", $sql, $col);
        }
        // Données de la fiche (identité, niveaux, aptitudes, qualifications, licence) conservées.
        foreach (['nom', 'prenom', 'licence', 'niveau_plongeur', 'niveau_encadrant', 'aptitudes_sup', 'qualifs'] as $col) {
            $this->assertDoesNotMatchRegularExpression("/[ ,]{$col}=/", $sql, $col);
        }
        $this->assertSame([self::CLUB], $updates[0]['params']);
        $this->assertCount(1, $this->pdo->matching('/^\s*UPDATE sites SET notes=NULL WHERE club_id=\?/'));
    }

    public function testAnonymizationHappensAfterNonRetainedRowsAreDeleted(): void
    {
        \ClubRetention::retireClubRows($this->pdo, self::CLUB, $this->plan());
        $sql = array_column($this->pdo->log, 'sql');
        $delete = array_keys(array_filter($sql, static fn(string $s): bool => str_starts_with(trim($s), 'DELETE FROM divers')))[0];
        $update = array_keys(array_filter($sql, static fn(string $s): bool => str_starts_with(trim($s), 'UPDATE divers SET')))[0];
        $this->assertGreaterThan($delete, $update);
    }

    public function testNothingToRetainDeletesEverythingWithoutAnonymizing(): void
    {
        \ClubRetention::retireClubRows($this->pdo, self::CLUB, ['dive_ids' => [], 'diver_ids' => [], 'site_ids' => [], 'count' => 0, 'until' => null]);
        $this->assertSame([], $this->pdo->matching('/^\s*UPDATE divers SET/'));
    }

    public function testArchivedDivesPurgeUsesServerDatesOnly(): void
    {
        $opts = \Retention::parseOptions(['--dry-run', '--archived-dives-years=5', '--soft-deleted-days=0'], [])['options'];
        \Retention::run($opts, new DateTimeImmutable('2026-10-20 12:00:00'));
        $q = $this->pdo->matching("/FROM dives WHERE status = 'archived'/");
        $this->assertCount(1, $q);
        $this->assertStringContainsString(\ClubRetention::REFERENCE_SQL . ' < ?', $q[0]['sql']);
        $this->assertStringNotContainsString('date_plongee', $q[0]['sql']);
    }
}
