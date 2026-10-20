<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../lib/Rules.php';

/**
 * Cas réglementaires partagés avec le front (tests/pal-rules.test.js) :
 * tests/fixtures/pal-rules.json. Le moteur PHP doit produire exactement le
 * même ensemble de codes bloquants ('err') et les avertissements attendus.
 */
class RulesFixturesTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/pal-rules.json';

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

    public function caseProvider(): array
    {
        $out = [];
        foreach (self::fixtures()['cases'] as $i => $c) {
            $label = sprintf('#%02d %s', $i + 1, $c['name']);
            $out[$label] = [$c];
        }
        return $out;
    }

    /** Reproduit buildCase() de tests/pal-rules.test.js. */
    private static function buildCase(array $c): array
    {
        $fx = self::fixtures();
        $diversById = [];
        $baptemeSeq = 0;
        $membres = [];
        foreach ($c['pal']['membres'] as $spec) {
            if (!array_key_exists(0, $spec)) {
                $baptemeSeq++;
                $membres[] = [
                    'id' => "b{$baptemeSeq}", '_bapteme' => true, 'aptitude' => 'Baptême',
                    'prenom' => 'Baptisé', 'nom' => (string)$baptemeSeq,
                ];
                continue;
            }
            [$key, $aptitude] = $spec;
            $presetKey = explode('#', $key)[0];
            if (!isset($fx['divers'][$presetKey])) {
                throw new RuntimeException("preset plongeur inconnu : {$key}");
            }
            $diversById[$key] = array_merge(
                ['id' => $key, 'nom' => strtoupper($key), 'prenom' => 'Test'],
                $fx['divers'][$presetKey]
            );
            $membres[] = ['diverId' => $key, 'aptitude' => $aptitude];
        }
        $pal = array_merge(['melanges' => ['Air']], $c['pal'], ['membres' => $membres]);
        $dp  = $fx['dps'][$c['dp']] ?? null;
        $answers = array_merge(
            $fx['defaults'],
            ['dp_qual' => $dp['niveau_encadrant'] ?? null],
            $c['answers'] ?? []
        );
        return [$pal, $diversById, $answers, $dp];
    }

    private static function codes(array $issues, string $tone): array
    {
        $codes = [];
        foreach ($issues as $i) {
            if ($i['tone'] === $tone) $codes[$i['code']] = true;
        }
        $codes = array_keys($codes);
        sort($codes);
        return $codes;
    }

    /** @dataProvider caseProvider */
    public function testCasReglementaire(array $c): void
    {
        [$pal, $diversById, $answers, $dp] = self::buildCase($c);
        $issues = Rules::validatePal($pal, $diversById, $answers, $dp);
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
            if (in_array('EFFECTIF_ENCADRES', $c['errors'], true)) { $case = $c; break; }
        }
        $this->assertNotNull($case);
        [$pal, $diversById, $answers, $dp] = self::buildCase($case);
        $err = null;
        foreach (Rules::validatePal($pal, $diversById, $answers, $dp) as $i) {
            if ($i['code'] === 'EFFECTIF_ENCADRES') { $err = $i; break; }
        }
        $this->assertNotNull($err);
        $this->assertIsString($err['text']);
        $this->assertSame('III-16 b', $err['ref']);
        $this->assertGreaterThanOrEqual(5, count($err['ids']));
    }

    public function testPalanqueeVideAvertissementSeul(): void
    {
        $fx = self::fixtures();
        $issues = Rules::validatePal(['membres' => []], [], $fx['defaults'], $fx['dps']['e3']);
        $this->assertSame(['PAL_EMPTY'], array_column($issues, 'code'));
    }
}
