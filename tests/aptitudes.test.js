// Tests métier — aptitudes individuelles par niveau plongeur

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const win = require('./setup');
const { getDiverAptitudes, aptitudeMaxDepth, getMilieuType, getPalType, sortMembresForFiche, getFormationBonusAptitudes } = win;

describe('getDiverAptitudes — par niveau', () => {
  test('Débutant (rien) → Baptême + PE20', () => {
    const apts = getDiverAptitudes({});
    assert.deepEqual(apts, ['Baptême', 'PE20']);
  });

  test('N1 → PE20', () => {
    const apts = getDiverAptitudes({ niveau_plongeur: 'N1' });
    assert.deepEqual(apts, ['PE20']);
  });

  test('N1 + PA12 sup → PE20 + PA12', () => {
    const apts = getDiverAptitudes({ niveau_plongeur: 'N1', aptitudes_sup: ['PA12'] });
    assert.deepEqual(apts.sort(), ['PA12', 'PE20'].sort());
  });

  test('N2 standard → PE20, PE40, PA12, PA20', () => {
    const apts = getDiverAptitudes({ niveau_plongeur: 'N2' });
    assert.deepEqual(apts.sort(), ['PA12', 'PA20', 'PE20', 'PE40'].sort());
  });

  test('N2 + PA40 sup → PA40 ajouté', () => {
    const apts = getDiverAptitudes({ niveau_plongeur: 'N2', aptitudes_sup: ['PA40'] });
    assert.ok(apts.includes('PA40'));
  });

  test('N3 → toutes PE + toutes PA (sans PA60 sup)', () => {
    const apts = getDiverAptitudes({ niveau_plongeur: 'N3' });
    for (const a of ['PE20', 'PE40', 'PE60', 'PA12', 'PA20', 'PA40', 'PA60']) {
      assert.ok(apts.includes(a), `Manque ${a}`);
    }
  });

  test('N4 → toutes aptitudes plongeur + GP', () => {
    const apts = getDiverAptitudes({ niveau_encadrant: 'N4' });
    assert.ok(apts.includes('GP'));
    assert.ok(apts.includes('PA60'));
    assert.ok(apts.includes('PE60'));
  });

  test('E3 → toutes aptitudes + GP + E3', () => {
    const apts = getDiverAptitudes({ niveau_encadrant: 'E3' });
    assert.ok(apts.includes('E3'));
    assert.ok(apts.includes('GP'));
  });

  test('E1 sans GP sup → pas de GP', () => {
    const apts = getDiverAptitudes({ niveau_encadrant: 'E1' });
    assert.ok(!apts.includes('GP'));
    assert.ok(apts.includes('E1'));
  });

  test('E1 + GP sup → GP visible', () => {
    const apts = getDiverAptitudes({ niveau_encadrant: 'E1', aptitudes_sup: ['GP'] });
    assert.ok(apts.includes('GP'));
  });

  test('N3 + PTH-120 → PTH70 et PTH120', () => {
    const apts = getDiverAptitudes({ niveau_plongeur: 'N3', trimix: ['PTH-120'] });
    assert.ok(apts.includes('PTH70'));
    assert.ok(apts.includes('PTH120'));
  });

  test('Bonus formation : N1 + E3 dans la palanquée → PE40 accessible', () => {
    const apts = getDiverAptitudes(
      { niveau_plongeur: 'N1' },
      false,
      { maxEnsLevel: 'E3' },
    );
    assert.ok(apts.includes('PE40'), 'Bonus formation PE40 manquant');
  });

  test('Bonus formation : N2 + E4 → PE60 accessible', () => {
    const apts = getDiverAptitudes(
      { niveau_plongeur: 'N2' },
      false,
      { maxEnsLevel: 'E4' },
    );
    assert.ok(apts.includes('PE60'));
  });

  test('Bonus formation : N1 + E2 → pas de PE40 (E2 enseigne max PE20)', () => {
    const apts = getDiverAptitudes(
      { niveau_plongeur: 'N1' },
      false,
      { maxEnsLevel: 'E2' },
    );
    assert.ok(!apts.includes('PE40'));
  });
});

describe('aptitudeMaxDepth', () => {
  const cases = {
    'Baptême': 6,
    'PE20': 20, 'PE40': 40, 'PE60': 60,
    'PA12': 12, 'PA20': 20, 'PA40': 40, 'PA60': 60,
    'GP': 60,
    'E1': 6, 'E2': 20, 'E3': 40, 'E4': 60,
    'PTH70': 70, 'PTH120': 120,
  };
  for (const [apt, depth] of Object.entries(cases)) {
    test(`${apt} → ${depth} m`, () => {
      assert.equal(aptitudeMaxDepth(apt), depth);
    });
  }
  test('Aptitude inconnue → fallback 60', () => {
    assert.equal(aptitudeMaxDepth('GLOUBI'), 60);
  });
});

describe('getMilieuType — normalisation', () => {
  test.each = (cases, fn) => cases.forEach(c => test(c.label, () => fn(c)));
  test('"En mer" → mer', () => assert.equal(getMilieuType('En mer'), 'mer'));
  test('"Lac" → lac', () => assert.equal(getMilieuType('Lac'), 'lac'));
  test('"Carrière" → lac', () => assert.equal(getMilieuType('Carrière'), 'lac'));
  test('"Carriere" sans accent → lac', () => assert.equal(getMilieuType('Carriere'), 'lac'));
  test('"piscine" → piscine', () => assert.equal(getMilieuType('piscine'), 'piscine'));
  test('"Fosse" → fosse', () => assert.equal(getMilieuType('Fosse'), 'fosse'));
  test('null → mer (défaut)', () => assert.equal(getMilieuType(null), 'mer'));
  test('"Autre" → mer (fallback)', () => assert.equal(getMilieuType('Autre'), 'mer'));
});

describe('getPalType', () => {
  test('Baptême présent → bapteme', () => {
    assert.equal(getPalType([{ aptitude: 'E3' }, { aptitude: 'Baptême' }]), 'bapteme');
  });
  test('E3 sans baptême → formation', () => {
    assert.equal(getPalType([{ aptitude: 'E3' }, { aptitude: 'PE40' }]), 'formation');
  });
  test('GP + PE → guidee', () => {
    assert.equal(getPalType([{ aptitude: 'GP' }, { aptitude: 'PE40' }]), 'guidee');
  });
  test('PA only → exploration', () => {
    assert.equal(getPalType([{ aptitude: 'PA20' }, { aptitude: 'PA20' }]), 'exploration');
  });
});

describe('sortMembresForFiche — ordre canonique', () => {
  test('E4 > E3 > GP > PE > PA > Baptême', () => {
    const membres = [
      { aptitude: 'Baptême' },
      { aptitude: 'PA40' },
      { aptitude: 'PE40' },
      { aptitude: 'GP' },
      { aptitude: 'E3' },
      { aptitude: 'E4' },
    ];
    const sorted = sortMembresForFiche(membres);
    assert.deepEqual(sorted.map(m => m.aptitude), ['E4', 'E3', 'GP', 'PE40', 'PA40', 'Baptême']);
  });

  test('2 GP : le dernier devient serre-file (en queue)', () => {
    const membres = [
      { id: 'a', aptitude: 'GP' },
      { id: 'b', aptitude: 'PE40' },
      { id: 'c', aptitude: 'GP' },
    ];
    const sorted = sortMembresForFiche(membres);
    // L'un des GP doit être en queue
    assert.equal(sorted[sorted.length - 1].aptitude, 'GP');
  });
});
