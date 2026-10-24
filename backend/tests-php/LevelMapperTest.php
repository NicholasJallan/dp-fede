<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** Traduction tolérante des niveaux / qualifications d'un fichier d'import. */
final class LevelMapperTest extends TestCase
{
    #[DataProvider('levels')]
    public function testMapLevels(string $niveau, string $encadrant, ?string $np, ?string $ne): void
    {
        $r = \LevelMapper::mapLevels($niveau, $encadrant);
        $this->assertSame([], $r['errors'], implode(' | ', $r['errors']));
        $this->assertSame($np, $r['niveau_plongeur'], 'niveau_plongeur');
        $this->assertSame($ne, $r['niveau_encadrant'], 'niveau_encadrant');
    }

    public static function levels(): array
    {
        return [
            'N1'                     => ['N1', '', 'N1', null],
            'P2'                     => ['P2', '', 'N2', null],
            'Niveau 3'               => ['Niveau 3', '', 'N3', null],
            'Plongeur N2'            => ['Plongeur N2', '', 'N2', null],
            'chiffre seul'           => ['1', '', 'N1', null],
            'parenthèses'            => ['Niveau 3 (N3)', '', 'N3', null],
            'N4'                     => ['N4', '', 'N3', 'N4'],
            'GP'                     => ['GP', '', 'N3', 'N4'],
            'Guide de palanquée'     => ['Guide de palanquée', '', 'N3', 'N4'],
            'N5'                     => ['N5', '', 'N3', 'N5'],
            'E2'                     => ['', 'E2', 'N3', 'E2'],
            'MF1'                    => ['N4', 'MF1', 'N3', 'E3'],
            'MF2'                    => ['', 'MF2', 'N3', 'E4'],
            'MF1 en toutes lettres'  => ['', 'Moniteur fédéral 1er degré', 'N3', 'E3'],
            'BPJEPS'                 => ['', 'BPJEPS', 'N3', 'E2'],
            'BEES1'                  => ['', 'BEES1', 'N3', 'E3'],
            'DEJEPS'                 => ['', 'DE-JEPS', 'N3', 'E3'],
            'DESJEPS'                => ['', 'DESJEPS', 'N3', 'E4'],
            'Initiateur N2'          => ['N2', 'Initiateur', 'N2', 'E1'],
            'Initiateur N3'          => ['N3', 'Initiateur', 'N3', 'E1'],
            'Initiateur sans niveau' => ['', 'Initiatrice', 'N2', 'E1'],
            'Initiateur + GP'        => ['N4', 'Initiateur', 'N3', 'E2'],
            'même cellule'           => ['N4 / Initiateur', '', 'N3', 'E2'],
            'plus haut retenu'       => ['N2, N3', '', 'N3', null],
            'débutant'               => ['Débutant', '', null, null],
            'vide'                   => ['', '', null, null],
            'N/A'                    => ['N/A', '', null, null],
        ];
    }

    public function testUnknownLevelIsAnError(): void
    {
        foreach (['N7', 'Expert', 'MF3'] as $raw) {
            $r = \LevelMapper::mapLevels($raw);
            $this->assertNotEmpty($r['errors'], $raw);
        }
    }

    public function testAptitudeInLevelColumnIsIgnoredWithWarning(): void
    {
        $r = \LevelMapper::mapLevels('PA40');
        $this->assertSame([], $r['errors']);
        $this->assertNull($r['niveau_plongeur']);
        $this->assertStringContainsString('PA-40', $r['warnings'][0]);
    }

    public function testN5AndInitiateurKeepsN5WithWarning(): void
    {
        $r = \LevelMapper::mapLevels('N5', 'Initiateur');
        $this->assertSame('N5', $r['niveau_encadrant']);
        $this->assertNotEmpty($r['warnings']);
    }

    public function testPlongeurForEncadrantMatchesDiverForm(): void
    {
        $this->assertSame('N2', \LevelMapper::plongeurForEncadrant('E1', null));
        $this->assertSame('N3', \LevelMapper::plongeurForEncadrant('E1', 'N3'));
        $this->assertSame('N3', \LevelMapper::plongeurForEncadrant('E3', 'N1'));
        $this->assertSame('N2', \LevelMapper::plongeurForEncadrant(null, 'N2'));
    }

    public function testNitrox(): void
    {
        $this->assertSame(['PN', 'PN-C'], \LevelMapper::mapNitrox('Nitrox confirmé')['value']);
        $this->assertSame(['PN', 'PN-C'], \LevelMapper::mapNitrox('PN-C')['value']);
        $this->assertSame(['PN'], \LevelMapper::mapNitrox('PN')['value']);
        $this->assertSame(['PN'], \LevelMapper::mapNitrox('oui')['value']);
        $this->assertSame([], \LevelMapper::mapNitrox('non')['value']);
        $this->assertSame([], \LevelMapper::mapNitrox('')['value']);
        $this->assertNotNull(\LevelMapper::mapNitrox('peut-être')['error']);
    }

    public function testTrimix(): void
    {
        $this->assertSame(['PTH-40'], \LevelMapper::mapTrimix('PTH-40')['value']);
        $this->assertSame(['PTH-40', 'PTH-70'], \LevelMapper::mapTrimix('PTH70')['value']);
        $this->assertSame(['PTH-40', 'PTH-70', 'PTH-120'], \LevelMapper::mapTrimix('Trimix 120')['value']);
        $this->assertSame([], \LevelMapper::mapTrimix('non')['value']);
        $this->assertNotNull(\LevelMapper::mapTrimix('oui')['error']);
    }

    public function testFoldRemovesAccents(): void
    {
        $this->assertSame('PRENOM DEBUTANTE', \LevelMapper::fold('Prénom Débutante'));
        $this->assertSame(['NIVEAU3', 'N3', ''], \LevelMapper::tokens('Niveau 3 (N3)'));
    }
}
