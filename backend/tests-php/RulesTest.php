<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../lib/Rules.php';

// ── Builders ────────────────────────────────────────────────────────────────

function makeDiver(array $fields): array
{
    static $seq = 0;
    return array_merge([
        'id'               => 'd' . (++$seq),
        'nom'              => 'Dupont',
        'prenom'           => 'Jean',
        'niveau_plongeur'  => null,
        'niveau_encadrant' => null,
        'aptitudes_sup'    => [],
        'nitrox'           => [],
        'trimix'           => [],
        'medical'          => null,
    ], $fields);
}

function makePal(array $fields): array
{
    return array_merge(['membres' => [], 'profMax' => 20, 'melanges' => ['Air']], $fields);
}

function makeMembre(array $diver, string $aptitude): array
{
    return ['diverId' => $diver['id'], 'aptitude' => $aptitude, 'diver' => $diver];
}

function makeBapteme(string $prenom = 'Alice'): array
{
    return ['_bapteme' => true, 'prenom' => $prenom, 'nom' => 'Doe', 'aptitude' => 'Baptême'];
}

function makeAnswers(array $override = []): array
{
    return array_merge([
        'milieu'   => 'Lac',
        'date'     => '2026-06-14T09:00',
        'dp_qual'  => 'E3',
        'dp_id'    => 'dp1',
    ], $override);
}

function buildDiversById(array ...$divers): array
{
    $map = [];
    foreach ($divers as $d) { $map[$d['id']] = $d; }
    return $map;
}

function dpE3(array $extra = []): array
{
    return array_merge(['niveau_encadrant' => 'E3', 'nitrox' => [], 'trimix' => []], $extra);
}
function dpE4(array $extra = []): array
{
    return array_merge(['niveau_encadrant' => 'E4', 'nitrox' => [], 'trimix' => []], $extra);
}
function dpN5(): array { return ['niveau_encadrant' => 'N5', 'nitrox' => [], 'trimix' => []]; }

function errors(array $issues): array
{
    return array_values(array_map(fn($i) => $i['text'], array_filter($issues, fn($i) => $i['tone'] === 'err')));
}
function warnings(array $issues): array
{
    return array_values(array_map(fn($i) => $i['text'], array_filter($issues, fn($i) => $i['tone'] === 'warn')));
}

// ============================================================================
class RulesTest extends TestCase
{
    // ── getMilieuType ────────────────────────────────────────────────────────

    public function testGetMilieuTypeMer(): void
    {
        $this->assertSame('mer', Rules::getMilieuType('En mer'));
        $this->assertSame('mer', Rules::getMilieuType(null));
        $this->assertSame('mer', Rules::getMilieuType(''));
    }

    public function testGetMilieuTypeLacCarriere(): void
    {
        $this->assertSame('lac', Rules::getMilieuType('Lac'));
        $this->assertSame('lac', Rules::getMilieuType('Carrière'));
        $this->assertSame('lac', Rules::getMilieuType('carriere'));
    }

    public function testGetMilieuTypePiscineForsse(): void
    {
        $this->assertSame('piscine', Rules::getMilieuType('Piscine'));
        $this->assertSame('fosse',   Rules::getMilieuType('Fosse'));
    }

    // ── aptitudeMaxDepth ─────────────────────────────────────────────────────

    public function testAptitudeMaxDepth(): void
    {
        $this->assertSame(6,   Rules::aptitudeMaxDepth('Baptême'));
        $this->assertSame(20,  Rules::aptitudeMaxDepth('PE20'));
        $this->assertSame(40,  Rules::aptitudeMaxDepth('PE40'));
        $this->assertSame(60,  Rules::aptitudeMaxDepth('PE60'));
        $this->assertSame(12,  Rules::aptitudeMaxDepth('PA12'));
        $this->assertSame(60,  Rules::aptitudeMaxDepth('GP'));
        $this->assertSame(40,  Rules::aptitudeMaxDepth('E3'));
        $this->assertSame(70,  Rules::aptitudeMaxDepth('PTH70'));
        $this->assertSame(120, Rules::aptitudeMaxDepth('PTH120'));
        $this->assertSame(60,  Rules::aptitudeMaxDepth('INCONNU')); // fallback
    }

    // ── getPalType ───────────────────────────────────────────────────────────

    public function testGetPalType(): void
    {
        $this->assertSame('bapteme',     Rules::getPalType([['aptitude' => 'Baptême'], ['aptitude' => 'E3']]));
        $this->assertSame('formation',   Rules::getPalType([['aptitude' => 'E3'], ['aptitude' => 'PE20']]));
        $this->assertSame('guidee',      Rules::getPalType([['aptitude' => 'GP'], ['aptitude' => 'PE40']]));
        $this->assertSame('exploration', Rules::getPalType([['aptitude' => 'PA40'], ['aptitude' => 'PA40']]));
    }

    // ── getDpMaxDepth ────────────────────────────────────────────────────────

    public function testDpMaxDepthBase(): void
    {
        $cases = [
            ['E1', 'formation',   6],
            ['E1', 'exploration', 0],
            ['E2', 'formation',   20],
            ['E2', 'exploration', 0],
            ['E3', 'formation',   40],
            ['E3', 'exploration', 60],
            ['E4', 'formation',   60],
            ['E4', 'exploration', 60],
            ['N5', 'formation',   0],
            ['N5', 'exploration', 60],
        ];
        foreach ($cases as [$ne, $palType, $expected]) {
            $dp = ['niveau_encadrant' => $ne, 'trimix' => []];
            $this->assertSame($expected, Rules::getDpMaxDepth($palType, $dp), "{$ne} {$palType}");
        }
    }

    public function testDpMaxDepthPth120(): void
    {
        $e3pth = ['niveau_encadrant' => 'E3', 'trimix' => ['PTH-120']];
        $this->assertSame(70, Rules::getDpMaxDepth('exploration', $e3pth));
        $this->assertSame(40, Rules::getDpMaxDepth('formation',   $e3pth)); // pas d'extension

        $e4pth = ['niveau_encadrant' => 'E4', 'trimix' => ['PTH-120']];
        $this->assertSame(120, Rules::getDpMaxDepth('exploration', $e4pth));
        $this->assertSame(80,  Rules::getDpMaxDepth('formation',   $e4pth));
    }

    public function testDpMaxDepthBapteme(): void
    {
        $this->assertSame(40, Rules::getDpMaxDepth('bapteme', ['niveau_encadrant' => 'E3', 'trimix' => []]));
        $this->assertSame(0,  Rules::getDpMaxDepth('bapteme', ['niveau_encadrant' => 'N5', 'trimix' => []]));
    }

    // ── validatePal — taille ─────────────────────────────────────────────────

    public function testPalanqueeVide(): void
    {
        $issues = Rules::validatePal(makePal(['membres' => []]), [], makeAnswers(), dpE3());
        $this->assertSame(['Palanquée vide.'], warnings($issues));
        $this->assertEmpty(errors($issues));
    }

    public function testPalanqueeUnPersonne(): void
    {
        $d = makeDiver(['niveau_plongeur' => 'N2']);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($d, 'PE20')]]),
            buildDiversById($d), makeAnswers(), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'binôme')));
    }

    public function testPalanqueeMaxSixPersonnes(): void
    {
        $e4 = makeDiver(['niveau_encadrant' => 'E4']);
        $others = array_map(fn() => makeDiver(['niveau_plongeur' => 'N2']), range(1, 7));
        $membres = [makeMembre($e4, 'E4'), ...array_map(fn($d) => makeMembre($d, 'PE20'), $others)];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 20]),
            buildDiversById($e4, ...$others), makeAnswers(), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'Max 6')));
    }

    public function testMembreSansAptitudeBloquant(): void
    {
        $d1 = makeDiver(['niveau_plongeur' => 'N2']);
        $d2 = makeDiver(['niveau_plongeur' => 'N2']);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($d1, 'PE20'), makeMembre($d2, '')]]),
            buildDiversById($d1, $d2), makeAnswers(), dpE3()
        );
        $errs = errors($issues);
        $this->assertNotEmpty(array_filter($errs, fn($e) => str_contains($e, 'sans aptitude')));
        $this->assertCount(1, $errs); // early return, pas d'erreurs secondaires
    }

    // ── validatePal — profondeur vs aptitude ─────────────────────────────────

    public function testPE20Depassement(): void
    {
        $n1 = makeDiver(['niveau_plongeur' => 'N1']);
        $n4 = makeDiver(['niveau_encadrant' => 'N4']);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($n4, 'GP'), makeMembre($n1, 'PE20')], 'profMax' => 25]),
            buildDiversById($n1, $n4), makeAnswers(), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'PE20') && str_contains($e, '20 m')));
    }

    // ── validatePal — règles GP ───────────────────────────────────────────────

    public function testGpAvecPE20Ok(): void
    {
        $gp   = makeDiver(['niveau_encadrant' => 'N4']);
        $pe   = array_map(fn() => makeDiver(['niveau_plongeur' => 'N1']), range(1, 4));
        $membres = [makeMembre($gp, 'GP'), ...array_map(fn($d) => makeMembre($d, 'PE20'), $pe)];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 20]),
            buildDiversById($gp, ...$pe), makeAnswers(), dpE3()
        );
        $this->assertEmpty(errors($issues));
    }

    public function testGpAvecPA40Interdit(): void
    {
        $gp = makeDiver(['niveau_encadrant' => 'N4']);
        $n2 = makeDiver(['niveau_plongeur' => 'N2', 'aptitudes_sup' => ['PA40']]);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($gp, 'GP'), makeMembre($n2, 'PA40')], 'profMax' => 20]),
            buildDiversById($gp, $n2), makeAnswers(), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'GP')));
    }

    public function testGpMaxQuatreEncadres(): void
    {
        $gp  = makeDiver(['niveau_encadrant' => 'N4']);
        $pes = array_map(fn() => makeDiver(['niveau_plongeur' => 'N1']), range(1, 5));
        $membres = [makeMembre($gp, 'GP'), ...array_map(fn($d) => makeMembre($d, 'PE20'), $pes)];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 20]),
            buildDiversById($gp, ...$pes), makeAnswers(), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'max 4 encadrés')));
    }

    // ── validatePal — règles formation ────────────────────────────────────────

    public function testE1PiscineSeulement(): void
    {
        $e1 = makeDiver(['niveau_encadrant' => 'E1']);
        $pe = makeDiver(['niveau_plongeur' => 'N1']);
        $membres = [makeMembre($e1, 'E1'), makeMembre($pe, 'PE20')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 6]),
            buildDiversById($e1, $pe), makeAnswers(['milieu' => 'Lac']), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'E1') && str_contains($e, 'piscine')));
    }

    public function testE1EnPiscineProfMax6OK(): void
    {
        $e1 = makeDiver(['niveau_encadrant' => 'E1']);
        $pe = makeDiver(['niveau_plongeur' => 'N1']);
        $membres = [makeMembre($e1, 'E1'), makeMembre($pe, 'PE20')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 6]),
            buildDiversById($e1, $pe), makeAnswers(['milieu' => 'Piscine']), dpE3()
        );
        $this->assertEmpty(errors($issues));
    }

    public function testE3FormatMaxQuaranteMerSansE4(): void
    {
        $e3 = makeDiver(['niveau_encadrant' => 'E3']);
        $pe = makeDiver(['niveau_plongeur' => 'N2']);
        $membres = [makeMembre($e3, 'E3'), makeMembre($pe, 'PE40')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 50]),
            buildDiversById($e3, $pe), makeAnswers(['milieu' => 'Lac']), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, '40 m')));
    }

    // ── validatePal — limite DP ───────────────────────────────────────────────

    public function testDpE3ExplorationMax60(): void
    {
        $n3a = makeDiver(['niveau_plongeur' => 'N3']);
        $n3b = makeDiver(['niveau_plongeur' => 'N3']);
        $membres = [makeMembre($n3a, 'PA60'), makeMembre($n3b, 'PA60')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 70]),
            buildDiversById($n3a, $n3b), makeAnswers(['dp_qual' => 'E3']), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'DP E3')));
    }

    public function testDpN5NePeutPasFaireFormation(): void
    {
        $e3 = makeDiver(['niveau_encadrant' => 'E3']);
        $pe = makeDiver(['niveau_plongeur' => 'N2']);
        $membres = [makeMembre($e3, 'E3'), makeMembre($pe, 'PE20')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 20]),
            buildDiversById($e3, $pe), makeAnswers(['dp_qual' => 'N5']), dpN5()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'DP N5')));
    }

    // ── validatePal — baptême ─────────────────────────────────────────────────

    public function testBaptemeRequiertEncadrant(): void
    {
        $n3 = makeDiver(['niveau_plongeur' => 'N3']);
        $membres = [makeBapteme(), makeMembre($n3, 'PA60')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 6]),
            buildDiversById($n3), makeAnswers(), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'E1→E4')));
    }

    public function testBaptemeE1E2EnMerRequiertE3ouE4(): void
    {
        $e2 = makeDiver(['niveau_encadrant' => 'E2']);
        $membres = [makeBapteme(), makeMembre($e2, 'E2')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 6]),
            buildDiversById($e2), makeAnswers(['milieu' => 'En mer']), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'E3 ou E4')));
    }

    public function testBaptemeProfonMaxSixMetres(): void
    {
        $e3 = makeDiver(['niveau_encadrant' => 'E3']);
        $membres = [makeBapteme(), makeMembre($e3, 'E3')];
        $issues  = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 10]),
            buildDiversById($e3), makeAnswers(), dpE3()
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'Baptême : profondeur max 6 m')));
    }

    // ── validatePal — nitrox DP ───────────────────────────────────────────────

    public function testNitroxSansPncBloquant(): void
    {
        $n3a = makeDiver(['niveau_plongeur' => 'N3', 'nitrox' => ['PN-C']]);
        $n3b = makeDiver(['niveau_plongeur' => 'N3', 'nitrox' => ['PN-C']]);
        $membres = [makeMembre($n3a, 'PA40'), makeMembre($n3b, 'PA40')];
        $dp = ['niveau_encadrant' => 'E3', 'nitrox' => [], 'trimix' => []]; // DP sans PN-C
        $issues = Rules::validatePal(
            makePal(['membres' => $membres, 'profMax' => 30, 'melanges' => ['Nx ≤ 40%']]),
            buildDiversById($n3a, $n3b), makeAnswers(), $dp
        );
        $this->assertNotEmpty(array_filter(errors($issues), fn($e) => str_contains($e, 'PN-C')));
    }

    // ── validateDive ─────────────────────────────────────────────────────────

    public function testValidateDiveOk(): void
    {
        $n3a = makeDiver(['niveau_plongeur' => 'N3']);
        $n3b = makeDiver(['niveau_plongeur' => 'N3']);
        $pal  = makePal(['membres' => [makeMembre($n3a, 'PA40'), makeMembre($n3b, 'PA40')], 'profMax' => 40]);
        $res  = Rules::validateDive([$pal], buildDiversById($n3a, $n3b), makeAnswers(), dpE3());
        $this->assertTrue($res['ok']);
        $this->assertEmpty($res['errors']);
    }

    public function testValidateDiveErreur(): void
    {
        $n1 = makeDiver(['niveau_plongeur' => 'N1']);
        $pal = makePal(['membres' => [makeMembre($n1, 'PE20')], 'profMax' => 20]); // 1 personne
        $res = Rules::validateDive([$pal], buildDiversById($n1), makeAnswers(), dpE3());
        $this->assertFalse($res['ok']);
        $this->assertNotEmpty($res['errors']);
    }

    public function testValidateDivePrefixPalLabel(): void
    {
        $n1 = makeDiver(['niveau_plongeur' => 'N1']);
        $pal = makePal(['membres' => [makeMembre($n1, 'PE20')], 'profMax' => 20]); // 1 personne
        $res = Rules::validateDive([$pal], buildDiversById($n1), makeAnswers(), dpE3());
        $this->assertStringStartsWith('P1 :', $res['errors'][0]);
    }

    // ── getDiverAptitudes ────────────────────────────────────────────────────

    public function testDebutantBaptemeOuPE20(): void
    {
        $d = makeDiver([]);
        $this->assertSame(['Baptême', 'PE20'], Rules::getDiverAptitudes($d));
    }

    public function testN1AptitudesPE20(): void
    {
        $d = makeDiver(['niveau_plongeur' => 'N1']);
        $this->assertContains('PE20', Rules::getDiverAptitudes($d));
        $this->assertNotContains('PE40', Rules::getDiverAptitudes($d));
    }

    public function testE3AptitudesGP(): void
    {
        $d = makeDiver(['niveau_encadrant' => 'E3']);
        $apts = Rules::getDiverAptitudes($d);
        $this->assertContains('GP', $apts);
        $this->assertContains('E3', $apts);
    }
}
