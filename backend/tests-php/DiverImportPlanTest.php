<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/** Import plongeurs — rapprochement idempotent avec l'annuaire du club. */
final class DiverImportPlanTest extends TestCase
{
    private function rec(array $over = []): array
    {
        return $over + [
            'nom' => 'Dupont', 'prenom' => 'Jean', 'licence' => null, 'external_id' => null, 'source' => 'vpdive',
            'representant_legal' => null, 'date_naissance' => null, 'medical' => null, 'licence_fin' => null,
            'levels' => null, 'nitrox' => null, 'trimix' => null, 'autorisation_parentale_saison' => null,
        ];
    }

    private function existing(): array
    {
        $base = [
            'licence' => '', 'date_naissance' => null, 'niveau_plongeur' => null, 'niveau_encadrant' => null,
            'qualifs' => null, 'medical' => null, 'licence_fin' => null, 'source' => 'manuel', 'external_id' => null,
            'representant_legal' => null, 'autorisation_parentale_saison' => null, 'deleted_at' => null,
        ];
        return [
            ['id' => 'd1', 'nom' => 'Dupont', 'prenom' => 'Jean', 'licence' => 'a 123', 'medical' => '2025-01-01',
             'niveau_plongeur' => 'N2',
             'qualifs' => '{"nitrox":[],"trimix":[],"recycleurs":["Revo"],"diplome":null,"rifap":true,"tiv":false}'] + $base,
            ['id' => 'd2', 'nom' => 'Martin', 'prenom' => 'Anne', 'source' => 'vpdive', 'external_id' => '42',
             'deleted_at' => '2026-01-01 00:00:00'] + $base,
            ['id' => 'd3', 'nom' => 'Durand', 'prenom' => 'Paul', 'date_naissance' => '1980-05-05'] + $base,
            ['id' => 'd4', 'nom' => 'DURAND', 'prenom' => 'Paul', 'date_naissance' => '1990-06-06'] + $base,
        ];
    }

    public function testPlanMatchesCreatesAndReportsErrors(): void
    {
        $records = [
            ['line' => 2, 'record' => $this->rec(['licence' => 'A123', 'external_id' => '7', 'medical' => '2026-02-01',
                                                   'levels' => ['niveau_plongeur' => 'N2', 'niveau_encadrant' => null]])],
            ['line' => 3, 'record' => $this->rec(['nom' => 'Martin', 'prenom' => 'Anne', 'external_id' => '42'])],
            ['line' => 4, 'record' => $this->rec(['nom' => 'Durand', 'prenom' => 'Paul'])],
            ['line' => 5, 'record' => $this->rec(['nom' => 'Nouveau', 'prenom' => 'Bob', 'licence' => 'Z9'])],
            ['line' => 6, 'record' => $this->rec(['nom' => 'Autre', 'licence' => 'A123'])],
            ['line' => 7, 'record' => $this->rec(['nom' => 'Durand', 'prenom' => 'Paul', 'date_naissance' => '1990-06-06',
                                                   'external_id' => '88'])],
        ];
        $plan = \DiverImportPlan::plan($records, $this->existing());
        $byLine = array_column($plan, null, 'line');

        // Ligne 2 : rapprochée par licence (normalisée), CACI + identifiant externe mis à jour.
        $this->assertSame('update', $byLine[2]['action']);
        $this->assertSame('d1', $byLine[2]['diver_id']);
        $this->assertSame(['medical', 'external_id', 'source'], array_keys($byLine[2]['changes']));

        // Ligne 3 : rapprochée par (source, external_id), fiche supprimée réactivée.
        $this->assertSame('update', $byLine[3]['action']);
        $this->assertSame('d2', $byLine[3]['diver_id']);
        $this->assertArrayHasKey('deleted_at', $byLine[3]['changes']);

        // Ligne 4 : homonymes sans licence ni identifiant → erreur.
        $this->assertSame('error', $byLine[4]['action']);

        // Ligne 5 : création.
        $this->assertSame('create', $byLine[5]['action']);
        $this->assertNull($byLine[5]['diver_id']);

        // Ligne 6 : même licence que la ligne 2 → doublon dans le fichier.
        $this->assertSame('error', $byLine[6]['action']);
        $this->assertStringContainsString('ligne 2', $byLine[6]['error']);

        // Ligne 7 : homonyme départagé par la date de naissance.
        $this->assertSame('update', $byLine[7]['action']);
        $this->assertSame('d4', $byLine[7]['diver_id']);

        $report = \DiverImportPlan::report($plan, [['line' => 8, 'errors' => ['Nom manquant']]], [], true, ['format' => 'csv']);
        $this->assertTrue($report['dry_run']);
        $this->assertSame('csv', $report['format']);
        $this->assertSame(7, $report['total']);
        $this->assertSame(1, $report['created']);
        $this->assertSame(3, $report['updated']);
        $this->assertSame(0, $report['unchanged']);
        $this->assertSame([4, 6, 8], array_column($report['errors'], 'line'));
        $this->assertCount(4, $report['items']);
    }

    public function testReimportingSameDataIsUnchanged(): void
    {
        $plan = \DiverImportPlan::plan(
            [['line' => 2, 'record' => $this->rec(['source' => 'manuel', 'licence' => 'A123', 'medical' => '2025-01-01',
                                                    'levels' => ['niveau_plongeur' => 'N2', 'niveau_encadrant' => null],
                                                    'nitrox' => []])]],
            $this->existing()
        );
        $this->assertSame('unchanged', $plan[0]['action']);
        $this->assertSame([], $plan[0]['changes']);
    }

    public function testEmptyValuesNeverOverwrite(): void
    {
        $diff = \DiverImportPlan::diff($this->existing()[0], $this->rec(['source' => 'manuel']));
        $this->assertSame([], $diff);
    }

    public function testLevelAndQualificationChanges(): void
    {
        $diff = \DiverImportPlan::diff($this->existing()[0], $this->rec([
            'source' => 'manuel',
            'levels' => ['niveau_plongeur' => 'N3', 'niveau_encadrant' => 'N4'],
            'nitrox' => ['PN', 'PN-C'],
        ]));
        $this->assertSame(['N2', 'N3'], $diff['niveau_plongeur']);
        $this->assertSame([null, 'N4'], $diff['niveau_encadrant']);
        $this->assertSame([[], ['PN', 'PN-C']], $diff['nitrox']);
    }

    public function testLicenceAlreadyLinkedToAnotherExternalIdIsAConflict(): void
    {
        $existing = $this->existing();
        $existing[0]['source'] = 'vpdive';
        $existing[0]['external_id'] = '7';
        $plan = \DiverImportPlan::plan(
            [['line' => 2, 'record' => $this->rec(['licence' => 'A123', 'external_id' => '99'])]],
            $existing
        );
        $this->assertSame('error', $plan[0]['action']);
        $this->assertStringContainsString('7', $plan[0]['error']);
    }

    public function testDecodeQualifsLegacyFlatArray(): void
    {
        $q = \DiverImportPlan::decodeQualifs('["PN","RIFAP","PTH-40"]');
        $this->assertSame(['PN'], $q['nitrox']);
        $this->assertSame(['PTH-40'], $q['trimix']);
        $this->assertTrue($q['raw']['rifap']);
        $this->assertSame([], \DiverImportPlan::decodeQualifs(null)['nitrox']);
    }
}
