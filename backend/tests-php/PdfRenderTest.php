<?php
declare(strict_types=1);

namespace DpFede\Tests;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/**
 * PdfRender::h / toText — les templates PDF sont en strict_types et reçoivent
 * des réponses JSON contenant des nombres : h() ne doit jamais lever de
 * TypeError.
 */
final class PdfRenderTest extends TestCase
{
    #[DataProvider('values')]
    public function testHAcceptsAnyScalar($input, string $expected): void
    {
        $this->assertSame($expected, \PdfRender::h($input));
    }

    public static function values(): array
    {
        return [
            'int'         => [40, '40'],
            'float'       => [12.5, '12.5'],
            'float entier'=> [12.0, '12'],
            'null'        => [null, ''],
            'bool'        => [true, 'oui'],
            'tableau'     => [['a'], ''],
            'html'        => ['<b>"x"</b>', '&lt;b&gt;&quot;x&quot;&lt;/b&gt;'],
        ];
    }

    public function testTemplateClosureAcceptsInt(): void
    {
        // Reproduit la closure des templates (fichier en strict_types).
        $h = fn($v): string => \PdfRender::h($v);
        $this->assertSame('20', $h(20));
    }

    public function testFormatDateTimeHandlesEmptyAndValid(): void
    {
        $this->assertSame('—', \PdfRender::formatDateTime(null));
        $this->assertSame('—', \PdfRender::formatDateTime(''));
        $this->assertSame('14 juin 2026 — 09:00', \PdfRender::formatDateTime('2026-06-14T09:00'));
    }

    // ── Paliers réalisés (même résumé que le front) ────────────────────────

    #[DataProvider('paliersCases')]
    public function testFormatPaliersMatchesTheFrontEnd(?array $real, ?string $expected): void
    {
        $this->assertSame($expected, \PdfRender::formatPaliers($real));
    }

    public static function paliersCases(): array
    {
        $json = json_decode((string)file_get_contents(__DIR__ . '/../../tests/fixtures/paliers.json'), true);
        $out = [];
        foreach ($json['cases'] as $c) $out[$c['name']] = [$c['real'], $c['expected']];
        return $out;
    }

    private static function renderTemplate(array $vars): string
    {
        extract($vars, EXTR_SKIP);
        ob_start();
        require __DIR__ . '/../templates/fiche.php';
        return (string)ob_get_clean();
    }

    /**
     * Rendu du template fiche.php (sans mPDF) : paliers dans la colonne DTR
     * réalisée, type de palanquée écrit (noir et blanc), champs numériques et
     * réponses absentes sans avertissement.
     */
    public function testFicheTemplateShowsRealisedPaliersAndPalType(): void
    {
        $vars = [
            'answers'     => ['site_nom' => 'Hendaye', 'date' => '2026-09-04T10:00', 'distance_cote' => 2, 'depart_bateau' => true],
            'palanquees'  => [[
                'id' => 'p1', 'profMax' => 12, 'duree' => 40, 'dtr' => 5,
                'membres' => [
                    ['diverId' => 'e', 'aptitude' => 'E2'],
                    ['diverId' => 'a', 'aptitude' => 'PE12'],
                ],
            ]],
            'renderState' => ['realises' => ['p1' => [
                'duree' => '38', 'profMax' => 11, 'dtr' => '6', 'commentaire' => '',
                'paliers' => ['9' => '', '6' => '2', '3' => '5'], 'confort' => ['on' => false, 'profondeur' => '3', 'duree' => ''],
            ]]],
            'diversById'  => [
                'e' => ['id' => 'e', 'nom' => 'Moniteur', 'prenom' => 'Eve', 'licence' => 'L1', 'niveau_encadrant' => 'E2'],
                'a' => ['id' => 'a', 'nom' => 'Eleve', 'prenom' => 'Al', 'licence' => 'L2', 'niveau_plongeur' => 'N1'],
            ],
            'user'        => ['club_nom' => 'Club test', 'urgence_defaut' => '18'],
        ];
        $html = self::renderTemplate($vars);

        $this->assertStringContainsString('6 m 2 min · 3 m 5 min', $html);
        $this->assertStringContainsString('row-formation', $html);
        $this->assertMatchesRegularExpression('/P1<br><span[^>]*>Form\.<\/span>/', $html);
        $this->assertStringContainsString('Non identifiée', $html, 'sec_surface absente : pas d\'avertissement');
    }

    public function testFicheTemplateRendersCountrySpecificEmergencyInfo(): void
    {
        $baseVars = [
            'palanquees'  => [],
            'renderState' => [],
            'diversById'  => [],
            'user'        => ['club_nom' => 'Club test', 'urgence_defaut' => '18'],
        ];

        // 1. Site suisse en lac sans urgence_num, urgence_defaut '18'
        $htmlCh = self::renderTemplate($baseVars + [
            'answers' => ['site_pays_code' => 'CH', 'milieu' => 'Lac', 'site_nom' => 'Le Bouveret'],
        ]);
        $this->assertStringContainsString('URGENCE : 144', $htmlCh);
        $this->assertStringContainsString('1414', $htmlCh);
        $this->assertStringNotContainsString('196', $htmlCh);

        // 2. Site français en mer avec urgence_num personnalisé
        $htmlFr = self::renderTemplate($baseVars + [
            'answers' => ['site_pays_code' => 'FR', 'milieu' => 'En mer', 'urgence_num' => '0612', 'site_nom' => 'Hendaye'],
        ]);
        $this->assertStringContainsString('URGENCE : 0612', $htmlFr);
        $this->assertStringContainsString('196 (CROSS)', $htmlFr);
        $this->assertStringContainsString('Canal 16 (CROSS)', $htmlFr);
    }

    public function testNoRedTintInPdfTypeColours(): void
    {
        $css = \PdfRender::sharedCss();
        $this->assertStringContainsString('.row-formation   td { background: #fefce8; }', $css, 'formation en jaune clair');
        $this->assertStringNotContainsString('#fef2f2', $css, 'rouge réservé au bloquant');
        $this->assertStringNotContainsString('#fff7ed', $css);
    }
}
