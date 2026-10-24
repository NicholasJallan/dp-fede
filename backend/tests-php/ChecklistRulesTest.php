<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * Check-list du PDF — mêmes scénarios que tests/checklist-php.test.js
 * (tests/fixtures/checklist.json, items visibles calculés par checklist.js).
 */
final class ChecklistRulesTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/checklist.json';

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
        foreach (\ChecklistRules::visible($answers) as $phase) {
            foreach ($phase['items'] as $it) $ids[] = $it['id'];
        }
        $this->assertSame($visible, $ids);
    }

    public function testReglesMilieuNaturel(): void
    {
        $this->assertTrue(\ChecklistRules::reglesMilieuNaturel(['milieu' => 'En mer']));
        $this->assertTrue(\ChecklistRules::reglesMilieuNaturel(['milieu' => 'Fosse', 'site_prof_max' => 20]));
        $this->assertTrue(\ChecklistRules::reglesMilieuNaturel(['milieu' => 'Fosse']));
        $this->assertFalse(\ChecklistRules::reglesMilieuNaturel(['milieu' => 'Fosse', 'site_prof_max' => '6']));
        $this->assertFalse(\ChecklistRules::reglesMilieuNaturel(['milieu' => 'Piscine']));
    }
}
