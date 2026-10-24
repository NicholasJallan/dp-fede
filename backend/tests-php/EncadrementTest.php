<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Niveau encadrant selon le cadre — mêmes cas que tests/encadrement.test.js. */
final class EncadrementTest extends TestCase
{
    #[DataProvider('cases')]
    public function testLevel(?string $ne, ?string $diplome, ?string $asso, ?string $pro): void
    {
        $this->assertSame($asso, \Encadrement::level($ne, $diplome, false), 'associatif');
        $this->assertSame($pro, \Encadrement::level($ne, $diplome, true), 'pro');
    }

    public static function cases(): array
    {
        return [
            'MF1 + BEPPA + DEJEPS sans CC' => ['E4', 'DEJEPS', 'E4', 'E3'],
            'MF2 + DEJEPS avec CC'         => ['E4', 'DEJEPS-E4', 'E4', 'E4'],
            'DEJEPS avant réforme'         => ['E3', 'DEJEPS-E4', 'E4', 'E4'],
            'MF1 + DEJEPS'                 => ['E3', 'DEJEPS', 'E3', 'E3'],
            'GP + DEJEPS (import)'         => ['N4', 'DEJEPS', 'E3', 'E3'],
            'DESJEPS'                      => ['E3', 'DESJEPS', 'E4', 'E4'],
            'BEES2'                        => ['E3', 'BEES2', 'E4', 'E4'],
            'MF2 sans diplôme pro'         => ['E4', null, 'E4', 'E4'],
            'diplôme Autre'                => ['E3', 'Autre', 'E3', 'E3'],
            'MF1 + BPJEPS'                 => ['E3', 'BPJEPS', 'E3', 'E2'],
            'GP + BPJEPS'                  => ['N4', 'BPJEPS', 'E2', 'E2'],
            'sans encadrement'             => [null, null, null, null],
        ];
    }

    public function testCadreProSeulementEnSca(): void
    {
        $this->assertTrue(\Encadrement::isCadrePro('sca'));
        foreach (['club', 'csa', 'autre', null] as $t) $this->assertFalse(\Encadrement::isCadrePro($t));
    }

    public function testApplyToRowLitLeDiplomeDesQualifs(): void
    {
        $row = ['niveau_encadrant' => 'E4', 'qualifs' => json_encode(['nitrox' => ['PN'], 'diplome' => 'DEJEPS'])];
        $this->assertSame('E3', \Encadrement::applyToRow($row, true)['niveau_encadrant']);
        $this->assertSame('E4', \Encadrement::applyToRow($row, false)['niveau_encadrant']);
        $legacy = ['niveau_encadrant' => 'E4', 'qualifs' => '["PN","RIFAP"]'];
        $this->assertSame('E4', \Encadrement::applyToRow($legacy, true)['niveau_encadrant']);
    }

    public function testDpDiplomeProRequisEnSca(): void
    {
        foreach (['N5', 'E1', 'E2', 'E3', 'E4'] as $ne) {
            $this->assertTrue(\Encadrement::dpDiplomeProRequis($ne, null, true), $ne);
            $this->assertFalse(\Encadrement::dpDiplomeProRequis($ne, null, false), "{$ne} associatif");
        }
        $this->assertFalse(\Encadrement::dpDiplomeProRequis('E3', 'DEJEPS', true));
        $this->assertTrue(\Encadrement::dpDiplomeProRequis('E3', 'Autre', true), '« Autre » ne compte pas');
        $this->assertFalse(\Encadrement::dpDiplomeProRequis('E3', 'BPJEPS', true), 'BPJEPS : E2');
        $this->assertFalse(\Encadrement::dpDiplomeProRequis('N5', 'DEJEPS', true), 'N5 + DEJEPS');
        $this->assertFalse(\Encadrement::dpDiplomeProRequis('N4', null, true));

        $sans = ['niveau_encadrant' => 'E4', 'qualifs' => json_encode(['nitrox' => ['PN-C']])];
        $this->assertTrue(\Encadrement::applyToRow($sans, true)['dp_diplome_pro_requis'] ?? false);
        $this->assertArrayNotHasKey('dp_diplome_pro_requis', \Encadrement::applyToRow($sans, false));
        $avec = ['niveau_encadrant' => 'E4', 'qualifs' => json_encode(['diplome' => 'DEJEPS-E4'])];
        $this->assertArrayNotHasKey('dp_diplome_pro_requis', \Encadrement::applyToRow($avec, true));
    }
}
