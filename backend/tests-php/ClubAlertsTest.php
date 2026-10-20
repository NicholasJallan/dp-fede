<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

/** Saisons FFESSM (15/09 → 14/09) et alertes CACI / licence / autorisation parentale. */
final class ClubAlertsTest extends TestCase
{
    public function testSeasonBoundaries(): void
    {
        $this->assertSame('2025-2026', \ClubAlerts::seasonFor(new DateTimeImmutable('2026-09-14')));
        $this->assertSame('2026-2027', \ClubAlerts::seasonFor(new DateTimeImmutable('2026-09-15')));
        $this->assertSame('2026-2027', \ClubAlerts::seasonFor(new DateTimeImmutable('2027-01-10')));
        $this->assertSame('2026-2027', \ClubAlerts::seasonFor(new DateTimeImmutable('2026-12-31 23:59')));
        $this->assertSame(['2026-09-15', '2027-09-14'], \ClubAlerts::seasonBounds('2026-2027'));
        $this->assertNull(\ClubAlerts::seasonBounds('2026-2028'));
    }

    public function testSeasonValidationAndNormalization(): void
    {
        $this->assertTrue(\ClubAlerts::isValidSeason('2026-2027'));
        $this->assertFalse(\ClubAlerts::isValidSeason('2026-2026'));
        $this->assertFalse(\ClubAlerts::isValidSeason('2026/2027'));
        $this->assertFalse(\ClubAlerts::isValidSeason(null));
        $this->assertSame('2026-2027', \ClubAlerts::normalizeSeason('2026/2027'));
        $this->assertSame('2026-2027', \ClubAlerts::normalizeSeason('2026/27'));
        $this->assertSame('2026-2027', \ClubAlerts::normalizeSeason('26-27'));
        $this->assertSame('2026-2027', \ClubAlerts::normalizeSeason(' 2026 - 2027 '));
        $this->assertNull(\ClubAlerts::normalizeSeason('oui'));
        $this->assertNull(\ClubAlerts::normalizeSeason('2026-2028'));
    }

    public function testAgeAndCaciExpiry(): void
    {
        $at = new DateTimeImmutable('2026-10-20');
        $this->assertSame(16, \ClubAlerts::ageAt('2009-10-21', $at));   // 17 ans demain
        $this->assertSame(18, \ClubAlerts::ageAt('2008-10-20', $at));
        $this->assertNull(\ClubAlerts::ageAt(null, $at));
        $this->assertNull(\ClubAlerts::ageAt('2030-01-01', $at));
        $this->assertSame('2027-03-01', \ClubAlerts::caciExpiry('2026-03-01')->format('Y-m-d'));
        $this->assertNull(\ClubAlerts::caciExpiry(''));
    }

    public function testComputeAlerts(): void
    {
        $ok = ['medical' => '2026-06-01', 'licence_fin' => null, 'date_naissance' => '1980-01-01', 'autorisation_parentale_saison' => null];
        $divers = [
            ['id' => 'a', 'nom' => 'A', 'prenom' => 'a', 'medical' => '2025-10-01'] + $ok,             // CACI expiré
            ['id' => 'b', 'nom' => 'B', 'prenom' => 'b', 'medical' => '2025-11-05'] + $ok,             // expire dans 16 j
            ['id' => 'c', 'nom' => 'C', 'prenom' => 'c', 'medical' => null] + $ok,                     // absent
            ['id' => 'd', 'nom' => 'D', 'prenom' => 'd', 'licence_fin' => '2026-10-19'] + $ok,         // licence expirée
            ['id' => 'e', 'nom' => 'E', 'prenom' => 'e', 'licence_fin' => '2026-11-10'] + $ok,         // licence dans 21 j
            ['id' => 'f', 'nom' => 'F', 'prenom' => 'f', 'date_naissance' => '2012-05-01',
             'autorisation_parentale_saison' => '2025-2026'] + $ok,                                    // mineur, ancienne saison
            ['id' => 'g', 'nom' => 'G', 'prenom' => 'g', 'date_naissance' => '2012-05-01',
             'autorisation_parentale_saison' => '2026-2027'] + $ok,                                    // mineur en règle
            ['id' => 'h', 'nom' => 'H', 'prenom' => 'h'] + $ok,                                        // RAS
            ['id' => 'i', 'nom' => 'I', 'prenom' => 'i', 'medical' => null, 'deleted_at' => '2026-01-01 00:00:00'] + $ok,
        ];
        $r = \ClubAlerts::compute($divers, new DateTimeImmutable('2026-10-20 15:00'), 30);

        $this->assertSame('2026-2027', $r['season']);
        $this->assertSame(30, $r['days']);
        $this->assertSame([
            'caci_expire' => 1, 'licence_expiree' => 1, 'autorisation_parentale_manquante' => 1,
            'caci_expire_bientot' => 1, 'licence_expire_bientot' => 1, 'caci_absent' => 1,
        ], $r['counts']);

        $byDiver = [];
        foreach ($r['items'] as $it) $byDiver[$it['diver_id']][] = $it;
        $this->assertSame(-19, $byDiver['a'][0]['days']);
        $this->assertSame('2026-10-01', $byDiver['a'][0]['date']);
        $this->assertSame(16, $byDiver['b'][0]['days']);
        $this->assertSame(-1, $byDiver['d'][0]['days']);
        $this->assertSame(21, $byDiver['e'][0]['days']);
        $this->assertSame(14, $byDiver['f'][0]['age']);
        $this->assertArrayNotHasKey('g', $byDiver);
        $this->assertArrayNotHasKey('h', $byDiver);
        $this->assertArrayNotHasKey('i', $byDiver);

        // Erreurs d'abord, puis avertissements ; à sévérité égale, par échéance.
        $this->assertSame('error', $r['items'][0]['severity']);
        $this->assertSame('a', $r['items'][0]['diver_id']);
        $this->assertSame('caci_absent', $r['items'][count($r['items']) - 1]['type']);
    }

    public function testCaciExpiringOnTheDayIsExpired(): void
    {
        $r = \ClubAlerts::compute(
            [['id' => 'x', 'nom' => 'X', 'prenom' => '', 'medical' => '2025-10-20']],
            new DateTimeImmutable('2026-10-20'),
            30
        );
        $this->assertSame('caci_expire', $r['items'][0]['type']);
        $this->assertSame(0, $r['items'][0]['days']);
    }
}
