// Tests métier — validatePal (règles palanquée FFESSM + Code du Sport)

const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const win = require('./setup');
const {
  resetIds,
  makeDiver, makeMembre, makeBapteme, makePal, makeAnswers,
  buildDiversById, PRESET, errors, warnings, isOk,
} = require('./helpers/builders');

const { validatePal } = win;

beforeEach(resetIds);

// =========================================================================
// Taille (binôme min, 6 max)
// =========================================================================
describe('validatePal — taille', () => {
  test('palanquée vide → warn seulement, pas err', () => {
    const issues = validatePal(makePal({ membres: [] }), {}, makeAnswers(), PRESET.e3());
    assert.deepEqual(warnings(issues), ['Palanquée vide.']);
    assert.equal(errors(issues).length, 0);
  });

  test('palanquée de 1 personne → BLOQUANT binôme min', () => {
    const d = PRESET.n2();
    const issues = validatePal(
      makePal({ membres: [makeMembre(d, 'PE20')] }),
      buildDiversById(d), makeAnswers(), PRESET.e3(),
    );
    assert.ok(errors(issues).some(e => /binôme minimum/i.test(e)));
  });

  test('palanquée > 6 personnes → BLOQUANT', () => {
    const dp = PRESET.e3();
    const enc = makeDiver({ niveau_encadrant: 'E4' });
    const divers = Array.from({ length: 7 }, () => PRESET.n2());
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(enc, 'E4'), ...divers.map(d => makeMembre(d, 'PE20'))],
    });
    const issues = validatePal(pal, buildDiversById(enc, ...divers), makeAnswers(), dp);
    assert.ok(errors(issues).some(e => /Max 6 personnes/.test(e)));
  });
});

// =========================================================================
// Profondeur par aptitude
// =========================================================================
describe('validatePal — profondeur vs aptitude', () => {
  test('PE20 dans palanquée à 25m → BLOQUANT', () => {
    const n1 = PRESET.n1();
    const n3 = PRESET.n3();
    const n4 = makeDiver({ niveau_encadrant: 'N4' });
    const pal = makePal({
      profMax: 25,
      membres: [makeMembre(n4, 'GP'), makeMembre(n1, 'PE20')],
    });
    const issues = validatePal(pal, buildDiversById(n1, n3, n4), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /PE20.*limité à 20m/.test(e)));
  });

  test('PA40 à 35m → OK (pas de dépassement)', () => {
    const a = makeDiver({ niveau_plongeur: 'N2', aptitudes_sup: ['PA40'] });
    const b = makeDiver({ niveau_plongeur: 'N3' });
    const pal = makePal({
      profMax: 35,
      membres: [makeMembre(a, 'PA40'), makeMembre(b, 'PA40')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), PRESET.e3());
    assert.equal(errors(issues).length, 0);
  });
});

// =========================================================================
// Règles GP (palanquée guidée)
// =========================================================================
describe('validatePal — règles GP', () => {
  test('GP + 4 PE20 à 20m → OK', () => {
    const gp = PRESET.n4();
    const pe = Array.from({ length: 4 }, () => PRESET.n1());
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(gp, 'GP'), ...pe.map(d => makeMembre(d, 'PE20'))],
    });
    const issues = validatePal(pal, buildDiversById(gp, ...pe), makeAnswers(), PRESET.e3());
    assert.ok(isOk(issues), `Issues: ${JSON.stringify(issues)}`);
  });

  test('GP + 5 PE → BLOQUANT (max 4 encadrés)', () => {
    const gp = PRESET.n4();
    const pe = Array.from({ length: 5 }, () => PRESET.n1());
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(gp, 'GP'), ...pe.map(d => makeMembre(d, 'PE20'))],
    });
    const issues = validatePal(pal, buildDiversById(gp, ...pe), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /max 4 encadrés/.test(e)));
  });

  test('GP + PE60 → BLOQUANT (PE60 interdit en palanquée guidée)', () => {
    const gp = PRESET.n4();
    const n3 = PRESET.n3();
    const pal = makePal({
      profMax: 40,
      membres: [makeMembre(gp, 'GP'), makeMembre(n3, 'PE60')],
    });
    const issues = validatePal(pal, buildDiversById(gp, n3), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /seuls PE20\/PE40 sont autorisés/.test(e)));
  });

  test('GP + panachage PE20/PE40 → BLOQUANT', () => {
    const gp = PRESET.n4();
    const n1 = PRESET.n1();
    const n2 = PRESET.n2();
    const pal = makePal({
      profMax: 40,
      membres: [makeMembre(gp, 'GP'), makeMembre(n1, 'PE20'), makeMembre(n2, 'PE40')],
    });
    const issues = validatePal(pal, buildDiversById(gp, n1, n2), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /même prérogative/.test(e)));
  });

  test('Palanquée à 6 sans 2 encadrants → BLOQUANT', () => {
    const gp = PRESET.n4();
    const pe = Array.from({ length: 5 }, () => PRESET.n2());
    const pal = makePal({
      profMax: 40,
      membres: [makeMembre(gp, 'GP'), ...pe.map(d => makeMembre(d, 'PE40'))],
    });
    const issues = validatePal(pal, buildDiversById(gp, ...pe), makeAnswers(), PRESET.e3());
    // Déclenche aussi "max 4 encadrés", on cherche le serre-file
    assert.ok(errors(issues).some(e => /Serre-file|2 encadrants minimum/.test(e)));
  });

  test('Palanquée à 6 avec 2 GP → OK serre-file', () => {
    const gp1 = PRESET.n4();
    const gp2 = makeDiver({ niveau_encadrant: 'N4' });
    const pe = Array.from({ length: 4 }, () => PRESET.n2());
    const pal = makePal({
      profMax: 40,
      // Le serre-file (dernier) doit être GP
      membres: [makeMembre(gp1, 'GP'), ...pe.map(d => makeMembre(d, 'PE40')), makeMembre(gp2, 'GP')],
    });
    const issues = validatePal(pal, buildDiversById(gp1, gp2, ...pe), makeAnswers(), PRESET.e3());
    assert.equal(errors(issues).length, 0, `Issues: ${JSON.stringify(errors(issues))}`);
  });
});

// =========================================================================
// Règles encadrants E1/E2/E3/E4
// =========================================================================
describe('validatePal — encadrants', () => {
  test('E1 hors piscine → BLOQUANT', () => {
    const e1 = PRESET.e1();
    const n1 = PRESET.n1();
    const pal = makePal({
      profMax: 6,
      membres: [makeMembre(e1, 'E1'), makeMembre(n1, 'PE20')],
    });
    const issues = validatePal(pal, buildDiversById(e1, n1), makeAnswers({ milieu: 'En mer' }), PRESET.e3());
    assert.ok(errors(issues).some(e => /E1 : formation\/baptême uniquement en piscine/.test(e)));
  });

  test('E2 à 25m → BLOQUANT', () => {
    const e2 = PRESET.e2();
    const n2 = PRESET.n2();
    const pal = makePal({
      profMax: 25,
      membres: [makeMembre(e2, 'E2'), makeMembre(n2, 'PE40')],
    });
    const issues = validatePal(pal, buildDiversById(e2, n2), makeAnswers({ milieu: 'Piscine' }), PRESET.e3());
    assert.ok(errors(issues).some(e => /E2 : profondeur max 20 m/.test(e)));
  });

  test('E3 avec PE60 → BLOQUANT (seul E4 peut encadrer PE60)', () => {
    const e3 = PRESET.e3();
    const n3 = PRESET.n3();
    const pal = makePal({
      profMax: 40,
      membres: [makeMembre(e3, 'E3'), makeMembre(n3, 'PE60')],
    });
    const issues = validatePal(pal, buildDiversById(e3, n3), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /ne peut pas encadrer un PE60/.test(e)));
  });

  test('E4 à 60m + PE60 → OK', () => {
    const e4 = PRESET.e4();
    const n3 = PRESET.n3();
    const pal = makePal({
      profMax: 60,
      membres: [makeMembre(e4, 'E4'), makeMembre(n3, 'PE60')],
    });
    const issues = validatePal(pal, buildDiversById(e4, n3), makeAnswers(), PRESET.e4());
    assert.equal(errors(issues).length, 0, `Issues: ${JSON.stringify(errors(issues))}`);
  });

  test('Formation avec PA → BLOQUANT (utiliser PE)', () => {
    const e3 = PRESET.e3();
    const n2 = PRESET.n2();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(e3, 'E3'), makeMembre(n2, 'PA20')],
    });
    const issues = validatePal(pal, buildDiversById(e3, n2), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /aptitudes PA non autorisées/.test(e)));
  });
});

// =========================================================================
// PA autonomes
// =========================================================================
describe('validatePal — PA autonomes', () => {
  test('3 PA20 à 20m → OK', () => {
    const a = makeDiver({ niveau_plongeur: 'N2' });
    const b = makeDiver({ niveau_plongeur: 'N2' });
    const c = makeDiver({ niveau_plongeur: 'N2' });
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(a, 'PA20'), makeMembre(b, 'PA20'), makeMembre(c, 'PA20')],
    });
    const issues = validatePal(pal, buildDiversById(a, b, c), makeAnswers(), PRESET.e3());
    assert.ok(isOk(issues), `Issues: ${JSON.stringify(issues)}`);
  });

  test('4 PA → BLOQUANT (max 3)', () => {
    const divers = Array.from({ length: 4 }, () => PRESET.n3());
    const pal = makePal({
      profMax: 40,
      membres: divers.map(d => makeMembre(d, 'PA40')),
    });
    const issues = validatePal(pal, buildDiversById(...divers), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /max 3 plongeurs autonomes/.test(e)));
  });

  test('Panachage PA20/PA40 → BLOQUANT', () => {
    const a = PRESET.n2();
    const b = PRESET.n3();
    const pal = makePal({
      profMax: 40,
      membres: [makeMembre(a, 'PA20'), makeMembre(b, 'PA40')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /pas de panachage des prérogatives PA/.test(e)));
  });
});

// =========================================================================
// PE sans encadrement
// =========================================================================
describe('validatePal — PE sans encadrement', () => {
  test('2 PE20 seuls → BLOQUANT (GP ou E1→E4 obligatoire)', () => {
    const a = PRESET.n1();
    const b = PRESET.n1();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(a, 'PE20'), makeMembre(b, 'PE20')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /sans encadrement/.test(e)));
  });

  test('Panachage PE + PA sans encadrement → BLOQUANT', () => {
    const a = PRESET.n2();
    const b = PRESET.n2();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(a, 'PE20'), makeMembre(b, 'PA20')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /Panachage PE \+ PA/.test(e)));
  });
});

// =========================================================================
// Baptêmes
// =========================================================================
describe('validatePal — baptêmes', () => {
  test('Baptême + E3 en mer → OK', () => {
    const e3 = PRESET.e3();
    const bap = makeBapteme();
    const pal = makePal({
      profMax: 6,
      membres: [makeMembre(e3, 'E3'), bap],
    });
    const issues = validatePal(pal, buildDiversById(e3), makeAnswers({ milieu: 'En mer' }), PRESET.e3());
    assert.equal(errors(issues).length, 0, `Issues: ${JSON.stringify(errors(issues))}`);
  });

  test('Baptême + E1 en mer → BLOQUANT (E3/E4 requis milieu naturel)', () => {
    const e1 = PRESET.e1();
    const bap = makeBapteme();
    const pal = makePal({
      profMax: 6,
      membres: [makeMembre(e1, 'E1'), bap],
    });
    const issues = validatePal(pal, buildDiversById(e1), makeAnswers({ milieu: 'En mer' }), PRESET.e3());
    assert.ok(errors(issues).some(e => /encadrant E3 ou E4 requis/.test(e)));
  });

  test('Baptême sans encadrant → BLOQUANT', () => {
    const n3 = PRESET.n3();
    const bap = makeBapteme();
    const pal = makePal({
      profMax: 6,
      membres: [makeMembre(n3, 'PA12'), bap],
    });
    const issues = validatePal(pal, buildDiversById(n3), makeAnswers({ milieu: 'Piscine' }), PRESET.e3());
    assert.ok(errors(issues).some(e => /Baptême : un encadrant E1→E4 est obligatoire/.test(e)));
  });

  test('Baptême à 10m → BLOQUANT (max 6m)', () => {
    const e3 = PRESET.e3();
    const bap = makeBapteme();
    const pal = makePal({
      profMax: 10,
      membres: [makeMembre(e3, 'E3'), bap],
    });
    const issues = validatePal(pal, buildDiversById(e3), makeAnswers({ milieu: 'En mer' }), PRESET.e3());
    assert.ok(errors(issues).some(e => /Baptême : profondeur max 6 m/.test(e)));
  });
});

// =========================================================================
// Débutants
// =========================================================================
describe('validatePal — licenciés débutants', () => {
  test('Débutant sans encadrant → BLOQUANT', () => {
    const deb = PRESET.debutant();
    const n3 = PRESET.n3();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(deb, 'PE20'), makeMembre(n3, 'PA12')],
    });
    const issues = validatePal(pal, buildDiversById(deb, n3), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /Licencié débutant : un enseignant E1→E4 est obligatoire/.test(e)));
  });

  test('Débutant + E3 → OK formation PE20', () => {
    const deb = PRESET.debutant();
    const e3 = PRESET.e3();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(e3, 'E3'), makeMembre(deb, 'PE20')],
    });
    const issues = validatePal(pal, buildDiversById(deb, e3), makeAnswers(), PRESET.e3());
    assert.equal(errors(issues).length, 0, `Issues: ${JSON.stringify(errors(issues))}`);
  });

  test('Débutant avec aptitude > PE20 → BLOQUANT', () => {
    const deb = PRESET.debutant();
    const e3 = PRESET.e3();
    const pal = makePal({
      profMax: 40,
      membres: [makeMembre(e3, 'E3'), makeMembre(deb, 'PE40')],
    });
    const issues = validatePal(pal, buildDiversById(deb, e3), makeAnswers(), PRESET.e3());
    assert.ok(errors(issues).some(e => /aptitude limitée à Baptême ou PE20/.test(e)));
  });
});

// =========================================================================
// Certificat médical
// =========================================================================
describe('validatePal — certificat médical', () => {
  test('Médical expiré → BLOQUANT', () => {
    const expired = makeDiver({
      niveau_plongeur: 'N2',
      medical: '2024-01-01',  // expirera le 2025-01-01
    });
    const ok = PRESET.n3();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(expired, 'PA20'), makeMembre(ok, 'PA20')],
    });
    const issues = validatePal(
      pal, buildDiversById(expired, ok),
      makeAnswers({ date: '2026-06-01T10:00' }), PRESET.e3(),
    );
    assert.ok(errors(issues).some(e => /Certificat médical.*expiré/.test(e)));
  });

  test('Médical valide → OK', () => {
    const fresh = makeDiver({
      niveau_plongeur: 'N2',
      medical: '2026-01-01',  // valable jusqu'au 2027-01-01
    });
    const ok = PRESET.n3();
    const pal = makePal({
      profMax: 20,
      membres: [makeMembre(fresh, 'PA20'), makeMembre(ok, 'PA20')],
    });
    const issues = validatePal(
      pal, buildDiversById(fresh, ok),
      makeAnswers({ date: '2026-06-01T10:00' }), PRESET.e3(),
    );
    assert.equal(errors(issues).length, 0);
  });
});

// =========================================================================
// Mélanges respiratoires
// =========================================================================
describe('validatePal — mélanges & qualifications DP', () => {
  test('Nitrox sans DP PN-C → BLOQUANT', () => {
    const dpSansPNC = makeDiver({ niveau_encadrant: 'E3' });
    const a = makeDiver({ niveau_plongeur: 'N3', nitrox: ['PN-C'] });
    const b = makeDiver({ niveau_plongeur: 'N3', nitrox: ['PN-C'] });
    const pal = makePal({
      profMax: 30,
      melanges: ['Nx ≤ 40%'],
      membres: [makeMembre(a, 'PA40'), makeMembre(b, 'PA40')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), dpSansPNC);
    assert.ok(errors(issues).some(e => /DP doit être PN-C/.test(e)));
  });

  test('Nitrox avec DP PN-C → OK', () => {
    const dp = makeDiver({ niveau_encadrant: 'E3', nitrox: ['PN-C'] });
    const a = makeDiver({ niveau_plongeur: 'N3', nitrox: ['PN-C'] });
    const b = makeDiver({ niveau_plongeur: 'N3', nitrox: ['PN-C'] });
    const pal = makePal({
      profMax: 30,
      melanges: ['Nx ≤ 40%'],
      membres: [makeMembre(a, 'PA40'), makeMembre(b, 'PA40')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), dp);
    assert.equal(errors(issues).length, 0, `Issues: ${JSON.stringify(errors(issues))}`);
  });

  test('Trimix sans DP PTH-120 → BLOQUANT', () => {
    const dp = makeDiver({ niveau_encadrant: 'E3', trimix: ['PTH-70'] });
    const a = makeDiver({ niveau_plongeur: 'N3', trimix: ['PTH-70'] });
    const b = makeDiver({ niveau_plongeur: 'N3', trimix: ['PTH-70'] });
    const pal = makePal({
      profMax: 50,
      melanges: ['Tx'],
      membres: [makeMembre(a, 'PA40'), makeMembre(b, 'PA40')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), dp);
    assert.ok(errors(issues).some(e => /DP doit être PTH-120/.test(e)));
  });

  test('Trimix avec N1 dans la palanquée → BLOQUANT (N1 interdit)', () => {
    const dp = makeDiver({ niveau_encadrant: 'E4', trimix: ['PTH-120'] });
    const e4 = makeDiver({ niveau_encadrant: 'E4', trimix: ['PTH-120'] });
    const n1 = makeDiver({ niveau_plongeur: 'N1' });
    const pal = makePal({
      profMax: 30,
      melanges: ['Tx'],
      membres: [makeMembre(e4, 'E4'), makeMembre(n1, 'PE20')],
    });
    const issues = validatePal(pal, buildDiversById(e4, n1), makeAnswers(), dp);
    assert.ok(errors(issues).some(e => /Trimix interdit pour N1/.test(e)));
  });

  test('Trimix avec GP → BLOQUANT (palanquée guidée + Tx interdit)', () => {
    const dp = makeDiver({ niveau_encadrant: 'E4', trimix: ['PTH-120'] });
    const gp = makeDiver({ niveau_encadrant: 'N4', trimix: ['PTH-70'] });
    const n3 = makeDiver({ niveau_plongeur: 'N3', trimix: ['PTH-70'] });
    const pal = makePal({
      profMax: 40,
      melanges: ['Tx'],
      membres: [makeMembre(gp, 'GP'), makeMembre(n3, 'PE40')],
    });
    const issues = validatePal(pal, buildDiversById(gp, n3), makeAnswers(), dp);
    assert.ok(errors(issues).some(e => /palanquée guidée.*Trimix interdit/.test(e)));
  });

  test('Exploration Nitrox : plongeur sans PN → BLOQUANT', () => {
    const dp = makeDiver({ niveau_encadrant: 'E3', nitrox: ['PN-C'] });
    const a = makeDiver({ niveau_plongeur: 'N3', nitrox: ['PN-C'] });
    const b = makeDiver({ niveau_plongeur: 'N3' });  // pas de PN
    const pal = makePal({
      profMax: 30,
      melanges: ['Nx ≤ 40%'],
      membres: [makeMembre(a, 'PA40'), makeMembre(b, 'PA40')],
    });
    const issues = validatePal(pal, buildDiversById(a, b), makeAnswers(), dp);
    assert.ok(errors(issues).some(e => /Nx ≤ 40% nécessite la qualification PN/.test(e)));
  });

  test('Formation : règle qualif individuelle levée (l\'élève peut apprendre)', () => {
    const dp = makeDiver({ niveau_encadrant: 'E3', nitrox: ['PN-C'] });
    const e3 = makeDiver({ niveau_encadrant: 'E3', nitrox: ['PN-C'] });
    const n2 = makeDiver({ niveau_plongeur: 'N2' });  // pas de PN
    const pal = makePal({
      profMax: 30,
      melanges: ['Nx ≤ 40%'],
      membres: [makeMembre(e3, 'E3'), makeMembre(n2, 'PE40')],
    });
    const issues = validatePal(pal, buildDiversById(e3, n2), makeAnswers(), dp);
    // L'erreur "Nx ≤ 40% nécessite PN" ne doit PAS apparaître en formation
    assert.equal(errors(issues).filter(e => /Nx ≤ 40% nécessite la qualification PN/.test(e)).length, 0);
  });
});
