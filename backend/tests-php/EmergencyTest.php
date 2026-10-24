<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

if (file_exists(__DIR__ . '/../lib/Emergency.php')) {
    require_once __DIR__ . '/../lib/Emergency.php';
}

/**
 * Numéros et résolutions d'urgence — rejeu de tests/fixtures/emergency.json
 * partagé avec les tests front JS (tests/emergency.test.js).
 */
final class EmergencyTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/emergency.json';

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
        $this->assertSame('112', \Emergency::INCONNUE);
        $this->assertSame(['CH' => '144', 'FR' => '18'], \Emergency::PAR_PAYS);
    }

    public static function infoProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['info'] as $c) {
            $label = sprintf('pays=%s, milieu=%s', var_export($c['pays'], true), var_export($c['milieu'], true));
            $out[$label] = [$c['pays'], $c['milieu'], $c['secondaryNums'], $c['vhf']];
        }
        return $out;
    }

    #[DataProvider('infoProvider')]
    public function testInfo(?string $pays, ?string $milieu, string $expectedSecondary, ?string $expectedVhf): void
    {
        $res = \Emergency::info($pays, $milieu);
        $this->assertSame([
            'secondaryNums' => $expectedSecondary,
            'vhf' => $expectedVhf,
        ], $res);
    }

    public static function defaultNumberProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['defaultNumber'] as $c) {
            $label = sprintf('pays=%s, clubDefault=%s', var_export($c['pays'], true), var_export($c['clubDefault'], true));
            $out[$label] = [$c['pays'], $c['clubDefault'], $c['expected']];
        }
        return $out;
    }

    #[DataProvider('defaultNumberProvider')]
    public function testDefaultNumber(?string $pays, ?string $clubDefault, string $expected): void
    {
        $this->assertSame($expected, \Emergency::defaultNumber($pays, $clubDefault));
    }

    public static function resolveProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['resolve'] as $c) {
            $label = sprintf(
                'pays=%s, clubDefault=%s, current=%s, manual=%s',
                var_export($c['pays'], true),
                var_export($c['clubDefault'], true),
                var_export($c['current'], true),
                var_export($c['manual'], true)
            );
            $out[$label] = [$c['pays'], $c['clubDefault'], $c['current'], (bool)$c['manual'], $c['expected']];
        }
        return $out;
    }

    #[DataProvider('resolveProvider')]
    public function testResolve(?string $pays, ?string $clubDefault, ?string $current, bool $manual, string $expected): void
    {
        $this->assertSame($expected, \Emergency::resolve($pays, $clubDefault, $current, $manual));
    }
}
