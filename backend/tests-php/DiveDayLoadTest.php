<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

if (file_exists(__DIR__ . '/../lib/DiveDayLoad.php')) {
    require_once __DIR__ . '/../lib/DiveDayLoad.php';
}

/**
 * Calcul des entrées de charge d'une plongée et lecture de la journée (art. 5, arrêté n° 2018-199 CM).
 * Rejeu partagé avec tests/pf-quota.test.js via tests/fixtures/daily-quota.json.
 */
final class DiveDayLoadTest extends TestCase
{
    private const FIXTURE_PATH = __DIR__ . '/../../tests/fixtures/daily-quota.json';

    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    private static function fixtures(): array
    {
        $json = file_get_contents(self::FIXTURE_PATH);
        if ($json === false) {
            throw new \RuntimeException('Fixture introuvable : ' . self::FIXTURE_PATH);
        }
        return json_decode($json, true, 512, JSON_THROW_ON_ERROR);
    }

    public function testEntriesFromFixture(): void
    {
        $fixtures = self::fixtures();
        foreach ($fixtures['entries'] as $idx => $item) {
            $actual = \DiveDayLoad::entries($item['dive']);
            $this->assertSame(
                $item['expected'],
                $actual,
                sprintf('Échec entries[%d] : %s', $idx, $item['desc'])
            );
        }
    }

    public function testForDayWithRecordingPdo(): void
    {
        $clubId = 'club-pf-1';
        $date = '2026-10-25';

        $this->pdo->respond(
            '/SELECT .* FROM dives d/i',
            [
                [
                    'id' => 'dive-1',
                    'palanquees' => json_encode([
                        [
                            'id' => 'p1',
                            'profMax' => 20,
                            'duree' => 45,
                            'melanges' => ['Air'],
                            'membres' => [['diverId' => 'd1', 'aptitude' => 'PE-20']],
                        ],
                    ]),
                    'render_state' => null,
                ],
                [
                    'id' => 'dive-2',
                    'palanquees' => json_encode([
                        [
                            'id' => 'p1',
                            'profMax' => 30,
                            'duree' => 40,
                            'melanges' => ['Tx'],
                            'membres' => [['diverId' => 'd2', 'aptitude' => 'PA-40']],
                        ],
                    ]),
                    'render_state' => json_encode([
                        'realises' => ['p1' => ['profMax' => 32, 'duree' => 42]],
                    ]),
                ],
            ]
        );

        $entries = \DiveDayLoad::forDay($clubId, $date);

        $this->assertCount(2, $entries);
        $this->assertSame([
            ['diveId' => 'dive-1', 'diverId' => 'd1', 'profMax' => 20, 'duree' => 45, 'trimix' => false],
            ['diveId' => 'dive-2', 'diverId' => 'd2', 'profMax' => 32, 'duree' => 42, 'trimix' => true],
        ], $entries);

        $this->assertNotEmpty($this->pdo->log);
        $this->assertStringContainsString('d.club_id', $this->pdo->log[0]['sql']);
        $this->assertStringContainsString('d.deleted_at IS NULL', $this->pdo->log[0]['sql']);
    }
}
