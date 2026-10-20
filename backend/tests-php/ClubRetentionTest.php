<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

/** Conservation légale (A322-72) des fiches à la suppression d'un club. */
final class ClubRetentionTest extends TestCase
{
    private DateTimeImmutable $now;

    protected function setUp(): void
    {
        $this->now = new DateTimeImmutable('2026-10-20 15:00:00');
    }

    private function dive(string $id, ?string $closed, ?string $date, array $answers = [], array $pals = []): array
    {
        return [
            'id' => $id, 'closed_at' => $closed, 'date_plongee' => $date, 'created_at' => '2020-01-01 00:00:00',
            'answers' => json_encode($answers), 'palanquees' => json_encode($pals),
        ];
    }

    public function testReferenceDateIsLatestOfClosedAtAndDiveDate(): void
    {
        $d = $this->dive('a', '2026-03-02 18:00:00', '2026-03-01 09:00:00');
        $this->assertSame('2026-03-02', \ClubRetention::referenceDate($d)->format('Y-m-d'));
        $d = $this->dive('b', null, '2026-03-01 09:00:00');
        $this->assertSame('2026-03-01', \ClubRetention::referenceDate($d)->format('Y-m-d'));
        $d = $this->dive('c', null, null);
        $this->assertSame('2020-01-01', \ClubRetention::referenceDate($d)->format('Y-m-d'));
        $this->assertNull(\ClubRetention::referenceDate(['id' => 'x']));
    }

    public function testRetentionEndIs365DaysAfterReference(): void
    {
        $end = \ClubRetention::retentionEnd($this->dive('a', '2026-03-02 18:00:00', null));
        $this->assertSame('2027-03-02', $end->format('Y-m-d'));
        $end = \ClubRetention::retentionEnd($this->dive('b', null, '2024-03-01 09:00:00'));
        $this->assertSame('2025-03-01', $end->format('Y-m-d')); // 2024 est bissextile : 365 jours
    }

    public function testPlanKeepsOnlyDivesStillUnderRetention(): void
    {
        $recent = $this->dive('recent', null, '2026-07-14 09:00:00',
            ['dp_id' => 'dp1', 'site_id' => 's1', 'sec_surface_membres' => ['ss1']],
            [['membres' => [['diverId' => 'd1'], ['_bapteme' => true, 'diverId' => 'b1'], ['diverId' => 'd2']]]]);
        $old      = $this->dive('old', null, '2025-06-01 09:00:00', ['site_id' => 's9'], [['membres' => [['diverId' => 'd9']]]]);
        $closedLate = $this->dive('late', '2025-10-25 10:00:00', '2025-06-01 09:00:00', [], [['membres' => [['diverId' => 'd1']]]]);
        $boundary = $this->dive('edge', '2025-10-20 08:00:00', null); // fin de conservation = aujourd'hui → conservée
        $expired  = $this->dive('gone', '2025-10-19 08:00:00', null);

        $plan = \ClubRetention::plan([$recent, $old, $closedLate, $boundary, $expired], $this->now);

        $this->assertSame(['recent', 'late', 'edge'], $plan['dive_ids']);
        $this->assertSame(3, $plan['count']);
        $this->assertSame('2027-07-14', $plan['until']);
        $this->assertSame(['d1', 'd2', 'dp1', 'ss1'], $plan['diver_ids']);
        $this->assertSame(['s1'], $plan['site_ids']);
    }

    public function testPlanWithNothingToKeep(): void
    {
        $plan = \ClubRetention::plan([$this->dive('old', null, '2024-01-01 09:00:00')], $this->now);
        $this->assertSame(0, $plan['count']);
        $this->assertNull($plan['until']);
        $this->assertSame([], $plan['dive_ids']);
    }

    public function testReferencedIdsToleratesGarbage(): void
    {
        $r = \ClubRetention::referencedIds(['answers' => '{invalide', 'palanquees' => '["x", {"membres": "y"}]']);
        $this->assertSame(['divers' => [], 'sites' => []], $r);
    }

    public function testMergeAndMessage(): void
    {
        $m = \ClubRetention::merge([
            ['count' => 2, 'until' => '2027-03-01'],
            ['count' => 0, 'until' => null],
            ['count' => 1, 'until' => '2027-07-14'],
        ]);
        $this->assertSame(['fiches' => 3, 'until' => '2027-07-14', 'clubs' => 2], $m);

        $this->assertStringContainsString('3 fiches de sécurité archivées conservées jusqu\'au 14/07/2027', \ClubRetention::message(3, '2027-07-14'));
        $this->assertStringContainsString('A322-72', \ClubRetention::message(1, '2027-07-14'));
        $this->assertStringContainsString('1 fiche de sécurité archivée conservée', \ClubRetention::message(1, '2027-07-14'));
        $this->assertStringStartsWith('Aucune fiche', \ClubRetention::message(0, null));
    }
}
