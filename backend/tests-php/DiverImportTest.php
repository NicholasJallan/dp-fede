<?php
declare(strict_types=1);

namespace DpFede\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\TestCase;

/** Import plongeurs — lecture CSV, en-têtes FR tolérants, normalisation. */
final class DiverImportTest extends TestCase
{
    private DateTimeImmutable $today;

    protected function setUp(): void
    {
        $this->today = new DateTimeImmutable('2026-10-20');
    }

    public function testDecodeStripsBomAndConvertsWindows1252(): void
    {
        $this->assertSame(['nom;prenom', 'UTF-8 (BOM)'], \DiverImport::decode("\xEF\xBB\xBFnom;prenom"));
        $this->assertSame(['Prénom', 'UTF-8'], \DiverImport::decode('Prénom'));
        $this->assertSame(['Prénom', 'Windows-1252'], \DiverImport::decode("Pr\xE9nom"));
    }

    public function testDetectSeparator(): void
    {
        $this->assertSame(';', \DiverImport::detectSeparator("nom;prenom;licence\nA;B;C"));
        $this->assertSame(',', \DiverImport::detectSeparator("nom,prenom,licence\n"));
        $this->assertSame(',', \DiverImport::detectSeparator("\"Nom; complet\",prenom,licence"));
        $this->assertSame("\t", \DiverImport::detectSeparator("nom\tprenom"));
        $this->assertSame(';', \DiverImport::detectSeparator('nom'));
    }

    public function testParseCsvHandlesQuotesMultilineAndBlankLines(): void
    {
        $csv  = "nom;prenom\n\"Dupont; Jr\";\"Jean \"\"JJ\"\"\"\n\nMartin;\"Anne\nMarie\"\nDurand;Paul\n";
        $rows = \DiverImport::parseCsv($csv, ';');
        $this->assertCount(4, $rows);
        $this->assertSame(['nom', 'prenom'], $rows[0]['cells']);
        $this->assertSame(['Dupont; Jr', 'Jean "JJ"'], $rows[1]['cells']);
        $this->assertSame(2, $rows[1]['line']);
        $this->assertSame(["Martin", "Anne\nMarie"], $rows[2]['cells']);
        $this->assertSame(4, $rows[2]['line']);
        $this->assertSame(6, $rows[3]['line']);
    }

    public function testHeaderKey(): void
    {
        $this->assertSame('n_de_licence', \DiverImport::headerKey('N° de licence'));
        $this->assertSame('date_de_naissance', \DiverImport::headerKey(' Date de naissance '));
        $this->assertSame('prenom', \DiverImport::headerKey('Prénom'));
        $this->assertSame('ne_e_le', \DiverImport::headerKey('Né(e) le'));
    }

    public function testMapFrenchHeaders(): void
    {
        $headers = ['Nom', 'Prénom', 'N° licence', 'Date de naissance', 'Niveau', 'Niveau encadrant',
                    'Nitrox', 'Trimix', 'CACI', 'Fin de licence', 'Identifiant externe', 'Source',
                    'Couleur préférée', 'Nom de famille'];
        $r = \DiverImport::mapHeaders($headers);
        $this->assertSame([], $r['errors']);
        $this->assertSame(
            ['nom', 'prenom', 'licence', 'date_naissance', 'niveau', 'niveau_encadrant', 'nitrox', 'trimix',
             'caci', 'licence_fin', 'external_id', 'source'],
            array_values($r['map'])
        );
        // Colonne inconnue et doublon (« Nom de famille » après « Nom ») ignorés.
        $this->assertSame(['Couleur préférée', 'Nom de famille'], $r['ignored']);
    }

    public function testVpdiveProfileRecognizesMemberIdentifier(): void
    {
        $headers = ['Nom', 'Prénom', 'Code adhérent', 'Date certificat médical'];
        $auto = \DiverImport::mapHeaders($headers, 'auto');
        $this->assertContains('Code adhérent', $auto['ignored']);
        $vp = \DiverImport::mapHeaders($headers, 'vpdive');
        $this->assertSame('external_id', $vp['recognized']['Code adhérent']);
        $this->assertSame('caci', $vp['recognized']['Date certificat médical']);
    }

    public function testMissingNomColumnIsFatal(): void
    {
        $this->assertNotEmpty(\DiverImport::mapHeaders(['Prénom', 'Licence'])['errors']);
    }

    public function testJsonRecordsUseSameAliases(): void
    {
        $recs = \DiverImport::jsonToRecords([['Nom' => 'Dupont', 'Prénom' => 'Jean', 'N° licence' => 'A1', 'x' => ['y']]]);
        $this->assertSame(['nom' => 'Dupont', 'prenom' => 'Jean', 'licence' => 'A1'], $recs[0]['data']);
        $this->assertSame(1, $recs[0]['line']);
    }

    public function testNormalizeValidRow(): void
    {
        $n = \DiverImport::normalize([
            'nom' => 'Dupont', 'prenom' => 'Jean', 'licence' => 'a-12 345', 'date_naissance' => '01/02/90',
            'niveau' => 'N2', 'nitrox' => 'oui', 'caci' => '2026-03-01', 'licence_fin' => '14/09/2027',
            'autorisation_parentale_saison' => '',
        ], 'csv', $this->today);

        $this->assertSame([], $n['errors']);
        $rec = $n['record'];
        $this->assertSame('A-12345', $rec['licence']);
        $this->assertSame('1990-02-01', $rec['date_naissance']);
        $this->assertSame('2026-03-01', $rec['medical']);
        $this->assertSame('2027-09-14', $rec['licence_fin']);
        $this->assertSame(['niveau_plongeur' => 'N2', 'niveau_encadrant' => null], $rec['levels']);
        $this->assertSame(['PN'], $rec['nitrox']);
        $this->assertNull($rec['trimix']);
        $this->assertNull($rec['external_id']);
        $this->assertSame('csv', $rec['source']);
        $this->assertNull($rec['autorisation_parentale_saison']);
    }

    public function testEmptyCellsMeanNoChange(): void
    {
        $rec = \DiverImport::normalize(['nom' => 'Dupont'], 'vpdive', $this->today)['record'];
        $this->assertNull($rec['licence']);
        $this->assertNull($rec['medical']);
        $this->assertNull($rec['levels']);
        $this->assertNull($rec['nitrox']);
        $this->assertSame('vpdive', $rec['source']);
    }

    public function testNormalizeErrors(): void
    {
        $cases = [
            ['nom' => ''],
            ['nom' => 'A', 'date_naissance' => '31/02/2020'],
            ['nom' => 'A', 'caci' => '2027-01-01'],
            ['nom' => 'A', 'trimix' => 'oui'],
            ['nom' => 'A', 'niveau' => 'Expert'],
            ['nom' => 'A', 'autorisation_parentale_saison' => '2026'],
            ['nom' => 'A', 'source' => 'pas valide !'],
            ['nom' => str_repeat('x', 101)],
        ];
        foreach ($cases as $data) {
            $n = \DiverImport::normalize($data, 'csv', $this->today);
            $this->assertNull($n['record'], json_encode($data));
            $this->assertNotEmpty($n['errors'], json_encode($data));
        }
    }

    public function testTrimixAddsNitroxPrerequisite(): void
    {
        $n = \DiverImport::normalize(['nom' => 'A', 'niveau' => 'N3', 'trimix' => 'PTH-40'], 'csv', $this->today);
        $this->assertSame(['PN', 'PN-C'], $n['record']['nitrox']);
        $this->assertSame(['PTH-40'], $n['record']['trimix']);
        $this->assertNotEmpty($n['warnings']);
    }

    public function testParentalAuthorizationYesMeansCurrentSeason(): void
    {
        $rec = \DiverImport::normalize(['nom' => 'A', 'autorisation_parentale_saison' => 'Oui'], 'csv', $this->today)['record'];
        $this->assertSame('2026-2027', $rec['autorisation_parentale_saison']);
        $rec = \DiverImport::normalize(['nom' => 'A', 'autorisation_parentale_saison' => '2026/27'], 'csv', $this->today)['record'];
        $this->assertSame('2026-2027', $rec['autorisation_parentale_saison']);
    }

    /** @dataProvider dates */
    public function testParseDate(string $raw, bool $birth, ?string $expected): void
    {
        $this->assertSame($expected, \DiverImport::parseDate($raw, $birth, $this->today));
    }

    public static function dates(): array
    {
        return [
            'ISO'                    => ['2026-10-20', false, '2026-10-20'],
            'ISO + heure'            => ['2026-10-20 08:00:00', false, '2026-10-20'],
            'JJ/MM/AAAA'             => ['20/10/2026', false, '2026-10-20'],
            'J/M/AAAA'               => ['5/3/2026', false, '2026-03-05'],
            'JJ.MM.AAAA'             => ['20.10.2026', false, '2026-10-20'],
            'JJ-MM-AA'               => ['20-10-26', false, '2026-10-20'],
            'AAAA/MM/JJ'             => ['2026/10/20', false, '2026-10-20'],
            'naissance AA > courant' => ['01/01/30', true, '1930-01-01'],
            'naissance AA ≤ courant' => ['01/01/20', true, '2020-01-01'],
            'série Excel'            => ['45000', false, '2023-03-15'],
            '30 février'             => ['30/02/2026', false, null],
            'texte'                  => ['hier', false, null],
            'année hors bornes'      => ['01/01/1800', false, null],
        ];
    }
}
