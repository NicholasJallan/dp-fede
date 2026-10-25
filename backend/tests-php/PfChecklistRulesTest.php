<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Check-list Polynésie française (arrêté n° 199 CM) — mêmes scénarios que
 * tests/checklist-pf.test.js (tests/fixtures/checklist-pf.json, items visibles
 * calculés par pf-checklist.js).
 */
final class PfChecklistRulesTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/checklist-pf.json';

    public static function scenarios(): array
    {
        $json = json_decode((string)file_get_contents(self::FIXTURE_PATH), true, 512, JSON_THROW_ON_ERROR);
        $out = [];
        foreach ($json['scenarios'] as $s) $out[$s['name']] = [$s['answers'], $s['visible']];
        return $out;
    }

    #[DataProvider('scenarios')]
    public function testItemsVisibles(array $answers, array $visible): void
    {
        $ids = [];
        foreach (\PfChecklistRules::visible($answers) as $phase) {
            foreach ($phase['items'] as $it) $ids[] = $it['id'];
        }
        $this->assertSame($visible, $ids);
    }
}
