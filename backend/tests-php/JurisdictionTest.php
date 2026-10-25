<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if (file_exists(__DIR__ . '/../lib/Jurisdiction.php')) {
    require_once __DIR__ . '/../lib/Jurisdiction.php';
}

/**
 * Normalisation et résolution de juridiction — rejeu de tests/fixtures/jurisdiction.json
 * partagé avec les tests front JS (tests/jurisdiction.test.js).
 */
final class JurisdictionTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/jurisdiction.json';

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
        $this->assertSame('FR', \Jurisdiction::DEFAULT);
        $this->assertSame(['FR', 'PF'], \Jurisdiction::ALL);
    }

    public static function normalizeProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['normalize'] as $idx => $c) {
            $label = sprintf('#%d: in=%s', $idx, var_export($c['in'], true));
            $out[$label] = [$c['in'], $c['out']];
        }
        return $out;
    }

    #[DataProvider('normalizeProvider')]
    public function testNormalize(mixed $in, ?string $expected): void
    {
        $this->assertSame($expected, \Jurisdiction::normalize($in));
    }

    public static function forCountryProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['forCountry'] as $idx => $c) {
            $label = sprintf('#%d: in=%s', $idx, var_export($c['in'], true));
            $out[$label] = [$c['in'], $c['out']];
        }
        return $out;
    }

    #[DataProvider('forCountryProvider')]
    public function testForCountry(mixed $in, ?string $expected): void
    {
        // En PHP la méthode accepte ?string
        $str = is_string($in) ? $in : null;
        $this->assertSame($expected, \Jurisdiction::forCountry($str));
    }

    public static function resolveProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['resolve'] as $idx => $c) {
            $label = sprintf('#%d: pays=%s, club=%s (%s)', $idx, var_export($c['pays'], true), var_export($c['club'], true), $c['desc']);
            $out[$label] = [$c['pays'], $c['club'], $c['out']];
        }
        return $out;
    }

    #[DataProvider('resolveProvider')]
    public function testResolve(?string $pays, mixed $club, string $expected): void
    {
        $this->assertSame($expected, \Jurisdiction::resolve($pays, $club));
    }

    public function testResolveAcceptsClubAsArray(): void
    {
        $this->assertSame('PF', \Jurisdiction::resolve(null, ['jurisdiction' => 'PF']));
        $this->assertSame('FR', \Jurisdiction::resolve(null, ['jurisdiction' => 'FR']));
        $this->assertSame('FR', \Jurisdiction::resolve(null, ['jurisdiction' => 'invalide']));
        $this->assertSame('FR', \Jurisdiction::resolve(null, []));
        $this->assertSame('FR', \Jurisdiction::resolve('FR', ['jurisdiction' => 'PF']));
        $this->assertSame('PF', \Jurisdiction::resolve('PF', ['jurisdiction' => 'FR']));
    }
}
