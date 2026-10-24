<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\TestCase;

/** Niveau encadrant selon le cadre — mêmes cas que tests/encadrement.test.js. */
final class EncadrementTest extends TestCase
{
    /** @dataProvider cases */
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
}
