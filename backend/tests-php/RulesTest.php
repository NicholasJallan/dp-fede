<?php
declare(strict_types=1);

use PHPUnit\Framework\TestCase;

require_once __DIR__ . '/../lib/Rules.php';

// Tests unitaires des helpers de Rules et du contrat de validateDive.
// Les règles de composition des palanquées sont couvertes par la fixture
// partagée JS/PHP (RulesFixturesTest + tests/fixtures/pal-rules.json).

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
    return ['diverId' => $diver['id'], 'aptitude' => $aptitude];
}

function makeBapteme(string $prenom = 'Alice'): array
{
    return ['_bapteme' => true, 'id' => 'b-' . $prenom, 'prenom' => $prenom, 'nom' => 'Doe', 'aptitude' => 'Baptême'];
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
function dpN5(): array { return ['niveau_encadrant' => 'N5', 'nitrox' => [], 'trimix' => []]; }

function errCodes(array $issues): array
{
    return array_values(array_unique(array_column(array_filter($issues, function ($i) {
        return $i['tone'] === 'err';
    }), 'code')));
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
        $this->assertSame('lac', Rules::getMilieuType('CARRIÈRE'));
        $this->assertSame('lac', Rules::getMilieuType('carriere'));
    }

    public function testGetMilieuTypePiscineFosse(): void
    {
        $this->assertSame('piscine', Rules::getMilieuType('Piscine'));
        $this->assertSame('fosse',   Rules::getMilieuType('Fosse'));
    }

    // ── aptitudeMaxDepth ─────────────────────────────────────────────────────

    public function testAptitudeMaxDepth(): void
    {
        $this->assertSame(6,   Rules::aptitudeMaxDepth('Baptême'));
        $this->assertSame(12,  Rules::aptitudeMaxDepth('PE12'));
        $this->assertSame(20,  Rules::aptitudeMaxDepth('PE20'));
        $this->assertSame(60,  Rules::aptitudeMaxDepth('PE60'));
        $this->assertSame(12,  Rules::aptitudeMaxDepth('PA12'));
        $this->assertSame(40,  Rules::aptitudeMaxDepth('GP'));
        $this->assertSame(40,  Rules::aptitudeMaxDepth('E3'));
        $this->assertSame(70,  Rules::aptitudeMaxDepth('PTH70'));
        $this->assertSame(120, Rules::aptitudeMaxDepth('PTH120'));
        $this->assertSame(0,   Rules::aptitudeMaxDepth('INCONNU'));
    }

    // ── getPalType / derivePalMode ───────────────────────────────────────────

    public function testGetPalType(): void
    {
        $this->assertSame('bapteme',     Rules::getPalType([['aptitude' => 'Baptême'], ['aptitude' => 'E3']]));
        $this->assertSame('formation',   Rules::getPalType([['aptitude' => 'E3'], ['aptitude' => 'PE20']]));
        $this->assertSame('guidee',      Rules::getPalType([['aptitude' => 'GP'], ['aptitude' => 'PE40']]));
        $this->assertSame('exploration', Rules::getPalType([['aptitude' => 'PA40'], ['aptitude' => 'PA40']]));
    }

    public function testGetPalTypeRespecteLeModeDuDp(): void
    {
        $membres = [['aptitude' => 'E3'], ['aptitude' => 'PE40']];
        $this->assertSame('guidee', Rules::getPalType($membres, 'exploration'));
        $this->assertSame('formation', Rules::getPalType([['aptitude' => 'GP'], ['aptitude' => 'PE20']], 'enseignement'));
    }

    public function testDerivePalMode(): void
    {
        $this->assertSame('enseignement', Rules::derivePalMode(['mode' => 'exploration', 'membres' => [['aptitude' => 'Baptême']]]));
        $this->assertSame('exploration',  Rules::derivePalMode(['mode' => 'exploration', 'membres' => [['aptitude' => 'E3']]]));
        $this->assertSame('enseignement', Rules::derivePalMode(['membres' => [['aptitude' => 'E2'], ['aptitude' => 'PE20']]]));
        $this->assertSame('exploration',  Rules::derivePalMode(['membres' => [['aptitude' => 'GP'], ['aptitude' => 'PE20']]]));
    }

    // ── getDpMaxDepth (III-15 a, A322-76, A322-98) ───────────────────────────

    public function testDpMaxDepthBase(): void
    {
        $cases = [
            ['E1', 'formation',   6],
            ['E1', 'exploration', 6],
            ['E2', 'formation',   6],
            ['E3', 'formation',   40],
            ['E3', 'exploration', 60],
            ['E4', 'formation',   60],
            ['N5', 'formation',   0],
            ['N5', 'bapteme',     0],
            ['N5', 'exploration', 60],
            ['N4', 'exploration', 0],
        ];
        foreach ($cases as [$ne, $palType, $expected]) {
            $dp = ['niveau_encadrant' => $ne, 'trimix' => []];
            $this->assertSame($expected, Rules::getDpMaxDepth($palType, $dp), "{$ne} {$palType}");
        }
        $this->assertSame(0, Rules::getDpMaxDepth('exploration', null));
    }

    public function testDpMaxDepthPth120(): void
    {
        $e3pth = ['niveau_encadrant' => 'E3', 'trimix' => ['PTH-120']];
        $this->assertSame(70, Rules::getDpMaxDepth('exploration', $e3pth));
        $this->assertSame(40, Rules::getDpMaxDepth('formation',   $e3pth)); // enseignement : 40 m

        $e4pth = ['niveau_encadrant' => 'E4', 'trimix' => ['PTH-120']];
        $this->assertSame(120, Rules::getDpMaxDepth('exploration', $e4pth));
        $this->assertSame(80,  Rules::getDpMaxDepth('formation',   $e4pth));
    }

    // ── hasGasQual ───────────────────────────────────────────────────────────

    public function testHasGasQualHierarchie(): void
    {
        $d = ['trimix' => ['PTH-70']];
        $this->assertTrue(Rules::hasGasQual($d, 'PTH-40'));
        $this->assertTrue(Rules::hasGasQual($d, 'PN-C'));
        $this->assertFalse(Rules::hasGasQual($d, 'PTH-120'));
        $this->assertFalse(Rules::hasGasQual([], 'PN'));
        $this->assertFalse(Rules::hasGasQual(null, 'PN'));
    }

    // ── getDiverAptitudes / bonus de formation ───────────────────────────────

    public function testDebutantBaptemeOuFormationPE12PE20(): void
    {
        $this->assertSame(['Baptême', 'PE12', 'PE20'], Rules::getDiverAptitudes(makeDiver([])));
    }

    public function testN1AptitudesPE20(): void
    {
        $d = makeDiver(['niveau_plongeur' => 'N1']);
        $this->assertContains('PE20', Rules::getDiverAptitudes($d));
        $this->assertNotContains('PE40', Rules::getDiverAptitudes($d));
    }

    public function testE2EstGuideDePalanquee(): void
    {
        $apts = Rules::getDiverAptitudes(makeDiver(['niveau_encadrant' => 'E2']));
        $this->assertContains('GP', $apts);
        $this->assertContains('E2', $apts);
    }

    public function testBonusFormationUniquementEnEnseignement(): void
    {
        $n1 = makeDiver(['niveau_plongeur' => 'N1', 'aptitudes_sup' => ['PA20']]);
        $this->assertSame(['PE40', 'PA40'], Rules::getFormationBonusAptitudes($n1, 'E3', 'enseignement'));
        $this->assertSame([], Rules::getFormationBonusAptitudes($n1, 'E3', 'exploration'));
        $this->assertSame([], Rules::getFormationBonusAptitudes($n1, 'E2', 'enseignement'));
        $this->assertContains('PE40', Rules::getDiverAptitudes($n1, false, ['maxEnsLevel' => 'E4', 'mode' => 'enseignement']));
    }

    // ── validatePal — forme des issues ───────────────────────────────────────

    public function testIssueContientToneCodeTextRefIds(): void
    {
        $n1 = makeDiver(['niveau_plongeur' => 'N1']);
        $n4 = makeDiver(['niveau_encadrant' => 'N4']);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($n4, 'GP'), makeMembre($n1, 'PE20')], 'profMax' => 25]),
            buildDiversById($n1, $n4), makeAnswers(), dpE3()
        );
        $depth = array_values(array_filter($issues, function ($i) { return $i['code'] === 'APT_DEPTH'; }));
        $this->assertCount(1, $depth);
        $this->assertSame('err', $depth[0]['tone']);
        $this->assertSame('A322-73', $depth[0]['ref']);
        $this->assertSame([$n1['id']], $depth[0]['ids']);
        $this->assertSame('PE20 de Jean DUPONT limité à 20 m (palanquée à 25 m).', $depth[0]['text']);
    }

    public function testMembreSansAptitudeBloquantSansErreurSecondaire(): void
    {
        $d1 = makeDiver(['niveau_plongeur' => 'N2']);
        $d2 = makeDiver(['niveau_plongeur' => 'N2']);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($d1, 'PE20'), makeMembre($d2, '')]]),
            buildDiversById($d1, $d2), makeAnswers(), dpE3()
        );
        $this->assertSame(['APT_MISSING'], errCodes($issues));
    }

    public function testMembreInconnuIgnore(): void
    {
        $d1 = makeDiver(['niveau_plongeur' => 'N2']);
        $pal = makePal(['membres' => [makeMembre($d1, 'PA20'), ['diverId' => 'absent', 'aptitude' => 'PA20']]]);
        $this->assertSame(['PAL_SOLO'], errCodes(Rules::validatePal($pal, buildDiversById($d1), makeAnswers(), dpE3())));
    }

    public function testE1EnPiscineSixMetresOk(): void
    {
        $e1 = makeDiver(['niveau_encadrant' => 'E1']);
        $pe = makeDiver(['niveau_plongeur' => 'N1']);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($e1, 'E1'), makeMembre($pe, 'PE20')], 'profMax' => 6]),
            buildDiversById($e1, $pe), makeAnswers(['milieu' => 'Piscine']), dpE3()
        );
        $this->assertSame([], errCodes($issues));
        $this->assertContains('OK', array_column($issues, 'code'));
    }

    public function testDpAbsentAvertissementNonBloquant(): void
    {
        $a = makeDiver(['niveau_plongeur' => 'N3']);
        $b = makeDiver(['niveau_plongeur' => 'N3']);
        $issues = Rules::validatePal(
            makePal(['membres' => [makeMembre($a, 'PA40'), makeMembre($b, 'PA40')], 'profMax' => 40]),
            buildDiversById($a, $b), makeAnswers(['dp_qual' => '']), null
        );
        $this->assertSame([], errCodes($issues));
        $this->assertContains('DP_MISSING', array_column($issues, 'code'));
    }

    public function testCertificatMedicalExpireDateCalendaire(): void
    {
        $n4 = makeDiver(['niveau_encadrant' => 'N4', 'medical' => '2025-06-14']);
        $n2 = makeDiver(['niveau_plongeur' => 'N2', 'medical' => '2025-06-15']);
        $pal = makePal(['membres' => [makeMembre($n4, 'GP'), makeMembre($n2, 'PE40')]]);
        $issues = Rules::validatePal($pal, buildDiversById($n4, $n2), makeAnswers(['date' => '2026-06-14T09:00']), dpE3());
        $expired = array_values(array_filter($issues, function ($i) { return $i['code'] === 'MEDICAL_EXPIRED'; }));
        $this->assertCount(1, $expired);
        $this->assertSame([$n4['id']], $expired[0]['ids']);
        $this->assertSame("Certificat médical de Jean DUPONT expiré (émis le 2025-06-14, valable jusqu'au 14/06/2026).", $expired[0]['text']);
    }

    public function testPpO2ArrondiMod(): void
    {
        $gp = makeDiver(['niveau_encadrant' => 'N4', 'nitrox' => ['PN', 'PN-C']]);
        $pe = makeDiver(['niveau_plongeur' => 'N2', 'nitrox' => ['PN']]);
        $dp = dpE3(['nitrox' => ['PN', 'PN-C']]);
        $base = ['membres' => [makeMembre($gp, 'GP'), makeMembre($pe, 'PE40')], 'melanges' => ['Nx ≤ 40%'], 'o2' => 32];
        // 32 % → MOD = floor((1.6 / 0.32 - 1) * 10) = 40 m
        $this->assertSame([], errCodes(Rules::validatePal(makePal($base + ['profMax' => 40]), buildDiversById($gp, $pe), makeAnswers(), $dp)));
        $this->assertSame(['PPO2_MAX'], errCodes(Rules::validatePal(makePal(['profMax' => 40, 'o2' => 33] + $base), buildDiversById($gp, $pe), makeAnswers(), $dp)));
    }

    // ── validateDive ─────────────────────────────────────────────────────────

    public function testValidateDiveOkMalgreAvertissements(): void
    {
        $n3a = makeDiver(['niveau_plongeur' => 'N3']);
        $n3b = makeDiver(['niveau_plongeur' => 'N3']);
        $pal = makePal(['membres' => [makeMembre($n3a, 'PA40'), makeMembre($n3b, 'PA40')], 'profMax' => 40]);
        $res = Rules::validateDive([$pal], buildDiversById($n3a, $n3b), makeAnswers(), dpE3());
        $this->assertTrue($res['ok']);
        $this->assertEmpty($res['errors']);
        $this->assertNotEmpty($res['warnings']); // certificat / date de naissance non renseignés
    }

    public function testValidateDiveErreurPrefixeeParPalanquee(): void
    {
        $n1 = makeDiver(['niveau_plongeur' => 'N1']);
        $pal = makePal(['membres' => [makeMembre($n1, 'PE20')], 'profMax' => 20]); // 1 personne
        $res = Rules::validateDive([$pal], buildDiversById($n1), makeAnswers(), dpE3());
        $this->assertFalse($res['ok']);
        $this->assertStringStartsWith('P1 :', $res['errors'][0]);
        $codes = array_column(array_filter($res['issues'], function ($i) { return $i['tone'] === 'err'; }), 'code');
        $this->assertContains('PAL_SOLO', $codes);
    }

    public function testValidateDiveSecondePalanquee(): void
    {
        $a = makeDiver(['niveau_plongeur' => 'N3']);
        $b = makeDiver(['niveau_plongeur' => 'N3']);
        $c = makeDiver(['niveau_plongeur' => 'N1']);
        $ok  = makePal(['membres' => [makeMembre($a, 'PA40'), makeMembre($b, 'PA40')], 'profMax' => 40]);
        $bad = makePal(['membres' => [makeMembre($c, 'PE20')]]);
        $res = Rules::validateDive([$ok, $bad], buildDiversById($a, $b, $c), makeAnswers(), dpE3());
        $this->assertFalse($res['ok']);
        $this->assertStringStartsWith('P2 :', $res['errors'][0]);
    }
}
