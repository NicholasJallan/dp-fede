<?php
declare(strict_types=1);

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../lib/PfRules.php';

/**
 * Cas réglementaires partagés avec le front (tests/pal-rules-pf.test.js) :
 * tests/fixtures/pal-rules-pf.json. Le moteur PHP PfRules doit produire exactement
 * le même ensemble de codes bloquants ('err') et les avertissements attendus.
 */
class PfRulesFixturesTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/pal-rules-pf.json';

    /** @var array|null */
    private static $fixtures = null;

    private static function fixtures(): array
    {
        if (self::$fixtures === null) {
            $json = file_get_contents(self::FIXTURE_PATH);
            if ($json === false) {
                throw new RuntimeException('Fixture introuvable : ' . self::FIXTURE_PATH);
            }
            self::$fixtures = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        }
        return self::$fixtures;
    }

    public static function caseProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['cases'] as $i => $c) {
            $label = sprintf('#%02d %s', $i + 1, $c['name']);
            $out[$label] = [$c];
        }
        return $out;
    }

    /** Reproduit buildCase() de tests/pal-rules-pf.test.js. */
    private static function buildCase(array $c): array
    {
        $fx = self::fixtures();
        $diversById = [];
        $baptemeSeq = 0;
        $membres = [];
        foreach ($c['pal']['membres'] as $spec) {
            if (!is_array($spec) || !array_key_exists(0, $spec)) {
                $baptemeSeq++;
                $membres[] = [
                    'id' => "b{$baptemeSeq}",
                    '_bapteme' => true,
                    'aptitude' => 'Baptême',
                    'prenom' => 'Baptisé',
                    'nom' => (string)$baptemeSeq,
                ];
                continue;
            }
            [$key, $aptitude] = $spec;
            $extra = is_array($spec[2] ?? null) ? $spec[2] : [];
            $presetKey = explode('#', $key)[0];
            if (!isset($fx['divers'][$presetKey])) {
                throw new RuntimeException("preset plongeur inconnu : {$key}");
            }
            $diversById[$key] = array_merge(
                ['id' => $key, 'nom' => strtoupper($key), 'prenom' => 'Test'],
                $fx['divers'][$presetKey]
            );
            $membres[] = array_merge(['diverId' => $key, 'aptitude' => $aptitude], $extra);
        }
        $pal = array_merge(['melanges' => ['Air']], $c['pal'], ['membres' => $membres]);
        $dp  = isset($c['dp']) && is_string($c['dp']) ? ($fx['dps'][$c['dp']] ?? null) : null;
        $answers = array_merge(
            $fx['defaults'],
            $c['answers'] ?? []
        );
        return [$pal, $diversById, $answers, $dp];
    }

    private static function codes(array $issues, string $tone): array
    {
        $codes = [];
        foreach ($issues as $i) {
            if ($i['tone'] === $tone) {
                $codes[$i['code']] = true;
            }
        }
        $codes = array_keys($codes);
        sort($codes);
        return $codes;
    }

    #[DataProvider('caseProvider')]
    public function testCasReglementaire(array $c): void
    {
        [$pal, $diversById, $answers, $dp] = self::buildCase($c);
        $issues = PfRules::validatePal($pal, $diversById, $answers, $dp);
        $dump = implode("\n", array_map(function ($i) {
            return "{$i['tone']} {$i['code']} {$i['text']}";
        }, $issues));

        $expected = $c['errors'];
        sort($expected);
        $this->assertSame($expected, self::codes($issues, 'err'), $dump);

        $warns = self::codes($issues, 'warn');
        foreach ($c['warnings'] ?? [] as $w) {
            $this->assertContains($w, $warns, "avertissement {$w} attendu\n{$dump}");
        }
        if (count($c['errors']) === 0) {
            $this->assertContains('OK', array_column($issues, 'code'), $dump);
        }
    }

    public function testFixtureNonVide(): void
    {
        $this->assertNotEmpty(self::fixtures()['cases']);
    }

    public function testChaqueIssuePorteCodeRefEtIds(): void
    {
        $case = null;
        foreach (self::fixtures()['cases'] as $c) {
            if (in_array('PF_EFFECTIF', $c['errors'], true)) {
                $case = $c;
                break;
            }
        }
        $this->assertNotNull($case);
        [$pal, $diversById, $answers, $dp] = self::buildCase($case);
        $err = null;
        foreach (PfRules::validatePal($pal, $diversById, $answers, $dp) as $i) {
            if ($i['code'] === 'PF_EFFECTIF') {
                $err = $i;
                break;
            }
        }
        $this->assertNotNull($err);
        $this->assertIsString($err['text']);
        $this->assertIsString($err['ref']);
        $this->assertNotEmpty($err['ref']);
        $this->assertNotEmpty($err['ids']);
    }

    public function testPalanqueeVideAvertissementSeul(): void
    {
        $fx = self::fixtures();
        $issues = PfRules::validatePal(['membres' => []], [], $fx['defaults'], $fx['dps']['dp40']);
        $this->assertSame(['PAL_EMPTY'], array_column($issues, 'code'));
    }
}
