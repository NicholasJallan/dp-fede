<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if (file_exists(__DIR__ . '/../lib/PfProfile.php')) {
    require_once __DIR__ . '/../lib/PfProfile.php';
}

/**
 * Dérivation de profil PF et profil effectif (Arrêté 199 CM) — backend/lib/PfProfile.php
 * Rejeu de la fixture partagée tests/fixtures/pf-equivalences.json.
 */
final class PfProfileTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/pf-equivalences.json';

    private static ?array $fixtures = null;

    private static function fixtures(): array
    {
        if (self::$fixtures === null) {
            $json = file_get_contents(self::FIXTURE_PATH);
            if ($json === false) {
                throw new \RuntimeException('Fixture introuvable : ' . self::FIXTURE_PATH);
            }
            self::$fixtures = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        }
        return self::$fixtures;
    }

    public function testConstants(): void
    {
        $this->assertSame([
            'PE-12', 'PE-20', 'PE-30', 'PE-40', 'PE-50',
            'PA-12', 'PA-20', 'PA-30', 'PA-40', 'PA-50',
        ], \PfProfile::APTITUDES);

        $this->assertSame([
            'PN', 'PN-C', 'PTH-50', 'PTH-70', 'PTH-100', 'PTH-120',
        ], \PfProfile::GAZ);

        $this->assertSame([
            'ENS-06', 'ENS-20', 'ENS-30', 'ENS-40', 'ENS-50',
            'GP-40', 'GP-50',
            'DP-40', 'DP-60', 'DP-70', 'DP-100', 'DP-120',
        ], \PfProfile::FONCTIONS);

        $this->assertSame([
            'BPJEPS', 'DEJEPS', 'DEJEPS-E4', 'DESJEPS', 'BEES1', 'BEES2', 'BEES3', 'BPP-GAPPN',
        ], \PfProfile::DIPLOMES);
    }

    public static function fromFrProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['fromFr'] as $idx => $c) {
            $label = sprintf('#%d: %s (%s)', $idx, $c['desc'], $c['ref']);
            $out[$label] = [$c['diver'], $c['out']];
        }
        return $out;
    }

    #[DataProvider('fromFrProvider')]
    public function testFromFr(array $diver, array $expected): void
    {
        $this->assertSame($expected, \PfProfile::fromFr($diver));
    }

    public function testFromFrWithEmptyOrNullDiver(): void
    {
        $empty = [
            'aptitudes' => [],
            'gaz' => [],
            'fonctions' => [],
            'diplome_homologue' => null,
        ];
        $this->assertSame($empty, \PfProfile::fromFr([]));
    }

    public static function effectiveProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['effective'] as $idx => $c) {
            $label = sprintf('#%d: %s', $idx, $c['desc']);
            $out[$label] = [$c['diver'], $c['out']];
        }
        return $out;
    }

    #[DataProvider('effectiveProvider')]
    public function testEffective(array $diver, array $expected): void
    {
        $this->assertSame($expected, \PfProfile::effective($diver));
    }

    public function testEffectiveWithEmptyDiver(): void
    {
        $expected = [
            'aptitudes' => [],
            'gaz' => [],
            'fonctions' => [],
            'diplome_homologue' => null,
            'stagiaire' => false,
            'patente' => false,
            'brevets' => '',
            'attestation' => null,
            'derived' => [
                'aptitudes' => true,
                'gaz' => true,
                'fonctions' => true,
                'diplome_homologue' => true,
            ],
        ];
        $this->assertSame($expected, \PfProfile::effective([]));
    }

    public function testSanitizeNullReturnsNullAndNoErrors(): void
    {
        [$norm, $errors] = \PfProfile::sanitize(null);
        $this->assertNull($norm);
        $this->assertSame([], $errors);
    }

    public function testSanitizeNonObjectOrListReturnsError(): void
    {
        foreach (['string', 123, true, ['element1', 'element2']] as $invalid) {
            [$norm, $errors] = \PfProfile::sanitize($invalid);
            $this->assertNull($norm);
            $this->assertContains('pf : objet attendu', $errors);
        }
    }

    public function testSanitizeValidObjectNormalizesAndOrdersKeys(): void
    {
        $in = [
            'fonctions'         => ['DP-40', 'ENS-06'],
            'aptitudes'         => ['PA-20', 'PE-12'],
            'gaz'               => ['PTH-70', 'PN'],
            'patente'           => 1,
            'stagiaire'         => 0,
            'diplome_homologue' => 'BPJEPS',
            'brevets'           => '   Moniteur Fédéral 1   ',
            'attestation'       => '2026-06-15',
        ];
        [$norm, $errors] = \PfProfile::sanitize($in);
        $this->assertSame([], $errors);
        $this->assertNotNull($norm);
        $this->assertSame(
            ['aptitudes', 'gaz', 'fonctions', 'diplome_homologue', 'stagiaire', 'patente', 'brevets', 'attestation'],
            array_keys($norm)
        );
        $this->assertSame(['PE-12', 'PA-20'], $norm['aptitudes']);
        $this->assertSame(['PN', 'PTH-70'], $norm['gaz']);
        $this->assertSame(['ENS-06', 'DP-40'], $norm['fonctions']);
        $this->assertSame('BPJEPS', $norm['diplome_homologue']);
        $this->assertFalse($norm['stagiaire']);
        $this->assertTrue($norm['patente']);
        $this->assertSame('Moniteur Fédéral 1', $norm['brevets']);
        $this->assertSame('2026-06-15', $norm['attestation']);
    }

    public function testSanitizeDefaultsMissingFields(): void
    {
        [$norm, $errors] = \PfProfile::sanitize([]);
        $this->assertSame([], $errors);
        $this->assertSame([
            'aptitudes'         => [],
            'gaz'               => [],
            'fonctions'         => [],
            'diplome_homologue' => null,
            'stagiaire'         => false,
            'patente'           => false,
            'brevets'           => '',
            'attestation'       => null,
        ], $norm);
    }

    public function testSanitizeDeduplicatesAptitudesGazFonctions(): void
    {
        $in = [
            'aptitudes' => ['PE-12', 'PE-12', 'PE-20'],
            'gaz'       => ['PN', 'PN'],
            'fonctions' => ['ENS-06', 'ENS-06'],
        ];
        [$norm, $errors] = \PfProfile::sanitize($in);
        $this->assertSame([], $errors);
        $this->assertSame(['PE-12', 'PE-20'], $norm['aptitudes']);
        $this->assertSame(['PN'], $norm['gaz']);
        $this->assertSame(['ENS-06'], $norm['fonctions']);
    }

    public function testSanitizeUnknownCodesReturnErrors(): void
    {
        $in = [
            'aptitudes'         => ['PE-12', 'BAD_APT'],
            'gaz'               => ['BAD_GAZ'],
            'fonctions'         => ['BAD_FCT'],
            'diplome_homologue' => 'BAD_DIPLOME',
        ];
        [$norm, $errors] = \PfProfile::sanitize($in);
        $this->assertContains('pf.aptitudes : code inconnu BAD_APT', $errors);
        $this->assertContains('pf.gaz : code inconnu BAD_GAZ', $errors);
        $this->assertContains('pf.fonctions : code inconnu BAD_FCT', $errors);
        $this->assertContains('pf.diplome_homologue : diplôme inconnu', $errors);
    }

    public function testSanitizeDiplomeEmptyOrNullNormalizedToNull(): void
    {
        foreach ([null, '', '   '] as $val) {
            [$norm, $errors] = \PfProfile::sanitize(['diplome_homologue' => $val]);
            $this->assertSame([], $errors);
            $this->assertNull($norm['diplome_homologue']);
        }
    }

    public function testSanitizeBrevetsTooLongOrNonString(): void
    {
        [$norm1, $errors1] = \PfProfile::sanitize(['brevets' => str_repeat('a', 501)]);
        $this->assertContains('pf.brevets : 500 caractères maximum', $errors1);

        [$norm2, $errors2] = \PfProfile::sanitize(['brevets' => ['array_invalid']]);
        $this->assertContains('pf.brevets : 500 caractères maximum', $errors2);
    }

    public function testSanitizeAttestationDateValidation(): void
    {
        [$normEmpty, $errEmpty] = \PfProfile::sanitize(['attestation' => '']);
        $this->assertNull($normEmpty['attestation']);
        $this->assertSame([], $errEmpty);

        [$normInvalid, $errInvalid] = \PfProfile::sanitize(['attestation' => '2026-02-31']);
        $this->assertContains('pf.attestation : date invalide', $errInvalid);

        [$normBad, $errBad] = \PfProfile::sanitize(['attestation' => 'pas-une-date']);
        $this->assertContains('pf.attestation : date invalide', $errBad);
    }
}
