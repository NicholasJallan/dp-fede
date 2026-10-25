<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DpFede\Tests\Support\RecordingPdo;
use PHPUnit\Framework\TestCase;

/** Tests pour DivePdf::clubProfile : repli sur Club::DEFAULT_URGENCE ('112'). */
final class DivePdfTest extends TestCase
{
    private RecordingPdo $pdo;

    protected function setUp(): void
    {
        $this->pdo = RecordingPdo::install();
    }

    protected function tearDown(): void
    {
        RecordingPdo::uninstall();
    }

    public function testClubProfileDefaultsUrgenceTo112WhenNull(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', [
            ['nom' => 'Club Bulles', 'urgence_defaut' => null],
        ]);

        $profile = \DivePdf::clubProfile('c-1');
        $this->assertSame('Club Bulles', $profile['club_nom']);
        $this->assertSame('112', $profile['urgence_defaut']);
    }

    public function testClubProfileDefaultsUrgenceTo112WhenEmptyString(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', [
            ['nom' => 'Club Bulles', 'urgence_defaut' => ''],
        ]);

        $profile = \DivePdf::clubProfile('c-1');
        $this->assertSame('112', $profile['urgence_defaut']);
    }

    public function testClubProfilePreservesExplicitUrgenceNumber(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', [
            ['nom' => 'Club Suisse', 'urgence_defaut' => '144'],
        ]);

        $profile = \DivePdf::clubProfile('c-swiss');
        $this->assertSame('144', $profile['urgence_defaut']);
    }

    public function testClubProfileDefaultsUrgenceTo112WhenClubNotFound(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', []);

        $profile = \DivePdf::clubProfile('c-missing');
        $this->assertNull($profile['club_nom']);
        $this->assertSame('112', $profile['urgence_defaut']);
    }

    public function testJurisdictionFor(): void
    {
        $this->assertSame('PF', \DivePdf::jurisdictionFor(['site_pays_code' => 'PF'], ['jurisdiction' => 'FR']));
        $this->assertSame('FR', \DivePdf::jurisdictionFor(['site_pays_code' => 'FR'], ['jurisdiction' => 'PF']));
        $this->assertSame('PF', \DivePdf::jurisdictionFor([], ['jurisdiction' => 'PF']));
        $this->assertSame('FR', \DivePdf::jurisdictionFor([], ['jurisdiction' => 'FR']));
        $this->assertSame('FR', \DivePdf::jurisdictionFor([], []));
    }

    public function testTemplateFor(): void
    {
        $this->assertSame('fiche.php', \DivePdf::templateFor('fiche', 'FR'));
        $this->assertSame('checklist.php', \DivePdf::templateFor('checklist', 'FR'));
        $this->assertSame('fiche-pf.php', \DivePdf::templateFor('fiche', 'PF'));
        $this->assertSame('checklist.php', \DivePdf::templateFor('checklist', 'PF'));
    }

    public function testClubProfileExposesJurisdiction(): void
    {
        $this->pdo->respond('/SELECT \* FROM clubs WHERE id=\?/i', [
            ['nom' => 'Moorea Dive', 'jurisdiction' => 'PF', 'urgence_defaut' => '15'],
        ]);
        $profile = \DivePdf::clubProfile('c-pf');
        $this->assertSame('PF', $profile['jurisdiction']);
    }

    public function testHtmlFichePf(): void
    {
        $this->pdo->respond('/SELECT id, nom, prenom, licence, niveau_plongeur, niveau_encadrant/i', [
            ['id' => 'd-gp', 'nom' => 'Teiva', 'prenom' => 'Ari', 'licence' => '123', 'niveau_plongeur' => null, 'niveau_encadrant' => 'N4', 'pf' => '{"fonctions":["GP-40"]}', 'qualifs' => '[]'],
            ['id' => 'd-pe', 'nom' => 'Vahine', 'prenom' => 'Lea', 'licence' => '456', 'niveau_plongeur' => 'N1', 'niveau_encadrant' => null, 'pf' => '{"aptitudes":["PE-20"]}', 'qualifs' => '[]'],
        ]);

        $dive = [
            'id' => 'dive-1',
            'club_id' => 'club-pf',
            'answers' => json_encode([
                'jurisdiction' => 'PF',
                'site_pays_code' => 'PF',
                'site_nom' => 'La Vallée Blanche',
                'navire_nom' => 'Tahiti Nui',
                'navire_immat' => 'PY 1234',
                'depart_bateau' => true,
                'o2' => true,
                'o2_litres' => 800,
                'dp_nom' => 'Chef Plongée',
                'dp_qual' => 'MF1',
            ]),
            'palanquees' => json_encode([
                [
                    'id' => 'p1',
                    'profMax' => 20,
                    'duree' => 45,
                    'membres' => [
                        ['diverId' => 'd-gp', 'aptitude' => 'GP-40'],
                        ['diverId' => 'd-pe', 'aptitude' => 'PE-20'],
                    ],
                ],
            ]),
            'render_state' => json_encode([
                'realises' => [
                    'p1' => [
                        'paliers' => ['3' => '3'],
                    ],
                ],
            ]),
        ];

        $profile = [
            'club_nom' => 'Club Moorea',
            'jurisdiction' => 'PF',
            'urgence_defaut' => '15',
        ];

        $html = \DivePdf::html($dive, 'fiche', $profile);

        $this->assertStringContainsString('FEUILLE DE PALANQUÉE', $html);
        $this->assertStringContainsString('199 CM', $html);
        $this->assertStringContainsString('Tahiti Nui', $html);
        $this->assertStringContainsString('PY 1234', $html);
        $this->assertStringContainsString('GP-40', $html);
        $this->assertStringContainsString('Palier à 3 m', $html);
    }

    public function testHtmlChecklistPf(): void
    {
        $dive = [
            'id' => 'dive-1',
            'club_id' => 'club-pf',
            'answers' => json_encode([
                'jurisdiction' => 'PF',
                'site_pays_code' => 'PF',
                'milieu' => 'En mer',
            ]),
            'palanquees' => json_encode([]),
            'render_state' => json_encode([]),
        ];

        $profile = [
            'club_nom' => 'Club Moorea',
            'jurisdiction' => 'PF',
            'urgence_defaut' => '15',
        ];

        $html = \DivePdf::html($dive, 'checklist', $profile);

        $this->assertStringContainsString('Plan de secours écrit', $html);
    }
}
