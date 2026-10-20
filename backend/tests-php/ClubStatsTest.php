<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

/** Statistiques du club (assemblée générale) et export CSV. */
final class ClubStatsTest extends TestCase
{
    private function rows(): array
    {
        $p = static fn(string $dive, ?string $diver, ?int $pal, ?string $type, string $role, ?int $min, string $nom = '') => [
            'dive_id' => $dive, 'diver_id' => $diver, 'palanquee' => $pal, 'pal_type' => $type,
            'role' => $role, 'duree_realisee' => $min, 'nom' => $nom, 'prenom' => '', 'licence' => '',
        ];
        return [
            $p('A', 'z', null, null, 'dp', null, 'Zoé'),
            $p('A', 'a', 1, 'exploration', 'guide', 60, 'Alice'),
            $p('A', 'b', 1, 'exploration', 'plongeur', 60, 'Bob'),
            $p('A', null, 2, 'bapteme', 'bapteme', 30),
            $p('A', 'c', 2, 'bapteme', 'encadrant', 30, 'Chloé'),
            $p('B', 'a', 1, 'formation', 'encadrant', 45, 'Alice'),
            $p('B', 'd', 1, 'formation', 'plongeur', 45, 'David'),
        ];
    }

    public function testAggregate(): void
    {
        $s = \ClubStats::aggregate($this->rows(), '2026-09-15', '2027-09-14');
        $this->assertSame(2, $s['plongees']);
        $this->assertSame(3, $s['palanquees']);
        $this->assertSame(['exploration' => 1, 'guidee' => 0, 'formation' => 1, 'bapteme' => 1], $s['palanquees_par_type']);
        $this->assertSame(['exploration' => 1, 'guidee' => 0, 'formation' => 1, 'bapteme' => 1], $s['plongees_par_type']);
        $this->assertSame(4, $s['plongeurs_distincts']);   // a, b, c, d — z n'a fait que diriger
        $this->assertSame(1, $s['baptemes']);
        $this->assertSame(6, $s['participations']);
        $this->assertSame(4.5, $s['heures_cumulees']);     // 270 min

        $first = $s['par_plongeur'][0];
        $this->assertSame('a', $first['diver_id']);
        $this->assertSame(2, $first['plongees']);
        $this->assertSame(1.8, $first['heures']);          // 105 min
        $z = array_values(array_filter($s['par_plongeur'], static fn(array $p): bool => $p['diver_id'] === 'z'))[0];
        $this->assertSame(0, $z['plongees']);
        $this->assertSame(1, $z['dp']);
    }

    public function testAggregateEmpty(): void
    {
        $s = \ClubStats::aggregate([], '2026-01-01', '2026-12-31');
        $this->assertSame(0, $s['plongees']);
        $this->assertSame(0.0, $s['heures_cumulees']);
        $this->assertSame([], $s['par_plongeur']);
    }

    public function testParseRange(): void
    {
        $today = new DateTimeImmutable('2026-10-20');
        $this->assertSame(['2026-09-15', '2027-09-14'], \ClubStats::parseRange(null, null, $today));
        $this->assertSame(['2026-01-01', '2026-12-31'], \ClubStats::parseRange('2026-01-01', '2026-12-31', $today));
        $this->assertIsString(\ClubStats::parseRange('2026-12-31', '2026-01-01', $today));
        $this->assertIsString(\ClubStats::parseRange('2026-02-30', '2026-12-31', $today));
        $this->assertIsString(\ClubStats::parseRange('2026-01-01', null, $today));
        $this->assertIsString(\ClubStats::parseRange('2010-01-01', '2026-01-01', $today));
    }

    public function testCsvExport(): void
    {
        $csv = \ClubStats::toCsv(\ClubStats::aggregate($this->rows(), '2026-09-15', '2027-09-14'));
        $this->assertStringStartsWith("\xEF\xBB\xBFIndicateur;Valeur\r\n", $csv);
        $this->assertStringContainsString("Heures cumulées (heures-plongeur);4,5\r\n", $csv);
        $this->assertStringContainsString("Nom;Prénom;Licence;Plongées;Plongées dirigées (DP);Heures\r\n", $csv);
        $this->assertStringContainsString("Alice;;;2;0;1,8\r\n", $csv);
    }

    public function testCsvCellNeutralizesFormulasAndQuotes(): void
    {
        $this->assertSame("'=HYPERLINK(\"x\")", str_replace('""', '"', trim(\ClubStats::csvCell('=HYPERLINK("x")'), '"')));
        $this->assertSame("'+33", \ClubStats::csvCell('+33'));
        $this->assertSame("'@cmd", \ClubStats::csvCell('@cmd'));
        $this->assertSame('"a;b"', \ClubStats::csvCell('a;b'));
        $this->assertSame('"dit ""JJ"""', \ClubStats::csvCell('dit "JJ"'));
        $this->assertSame('-3', \ClubStats::csvCell(-3));
        $this->assertSame('1,5', \ClubStats::csvCell(1.5));
    }
}
