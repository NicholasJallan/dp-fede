// Tests métier — règles de profondeur du Directeur de Plongée
// (CdS A322-86 + extensions PTH-120 pour E3/E4)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const win = require('./setup');
const { getDpMaxDepth, getProfOptions, getAvailableMelanges } = win;

// =========================================================================
// getDpMaxDepth — limites par qualification DP
// =========================================================================
describe('getDpMaxDepth — limites de base à l\'air', () => {
  const cases = [
    // [niveau, palType, expected]
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
  for (const [niveau, palType, expected] of cases) {
    test(`${niveau} en ${palType} → ${expected} m`, () => {
      const dp = { niveau_encadrant: niveau, trimix: [] };
      assert.equal(getDpMaxDepth(palType, dp), expected);
    });
  }
});

describe('getDpMaxDepth — extensions PTH-120', () => {
  test('E3 + PTH-120 en exploration → 70 m', () => {
    const dp = { niveau_encadrant: 'E3', trimix: ['PTH-120'] };
    assert.equal(getDpMaxDepth('exploration', dp), 70);
  });

  test('E3 + PTH-120 en formation → 40 m (pas d\'extension)', () => {
    const dp = { niveau_encadrant: 'E3', trimix: ['PTH-120'] };
    assert.equal(getDpMaxDepth('formation', dp), 40);
  });

  test('E4 + PTH-120 en exploration → 120 m', () => {
    const dp = { niveau_encadrant: 'E4', trimix: ['PTH-120'] };
    assert.equal(getDpMaxDepth('exploration', dp), 120);
  });

  test('E4 + PTH-120 en formation → 80 m', () => {
    const dp = { niveau_encadrant: 'E4', trimix: ['PTH-120'] };
    assert.equal(getDpMaxDepth('formation', dp), 80);
  });

  test('PTH-70 seul ne donne aucune extension', () => {
    const dp = { niveau_encadrant: 'E4', trimix: ['PTH-70'] };
    assert.equal(getDpMaxDepth('exploration', dp), 60);
  });

  test('N5 + PTH-120 → reste à 60 m (Trimix interdit aux N5)', () => {
    const dp = { niveau_encadrant: 'N5', trimix: ['PTH-120'] };
    assert.equal(getDpMaxDepth('exploration', dp), 60);
  });

  test('E1 + PTH-120 → reste à 6 m (E1 jamais en Trimix)', () => {
    const dp = { niveau_encadrant: 'E1', trimix: ['PTH-120'] };
    assert.equal(getDpMaxDepth('formation', dp), 6);
  });
});

describe('getDpMaxDepth — baptême', () => {
  test('baptême est traité comme une formation', () => {
    const dp = { niveau_encadrant: 'E3', trimix: [] };
    assert.equal(getDpMaxDepth('bapteme', dp), 40);
  });

  test('N5 ne peut pas faire un baptême (formation=0)', () => {
    const dp = { niveau_encadrant: 'N5', trimix: [] };
    assert.equal(getDpMaxDepth('bapteme', dp), 0);
  });
});

// =========================================================================
// getAvailableMelanges — filtrage selon qualif DP
// =========================================================================
describe('getAvailableMelanges', () => {
  test('DP E3 sans PN-C → seul Air autorisé', () => {
    const dp = { niveau_encadrant: 'E3', nitrox: [], trimix: [] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find(o => o.value === 'Air').allowed, true);
    assert.equal(opts.find(o => o.value === 'Nx ≤ 40%').allowed, false);
    assert.equal(opts.find(o => o.value === 'Nx > 40%').allowed, false);
    assert.equal(opts.find(o => o.value === 'Tx').allowed, false);
  });

  test('DP E3 + PN-C → Nx ≤ 40% et Nx > 40% autorisés', () => {
    const dp = { niveau_encadrant: 'E3', nitrox: ['PN-C'], trimix: [] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find(o => o.value === 'Nx ≤ 40%').allowed, true);
    assert.equal(opts.find(o => o.value === 'Nx > 40%').allowed, true);
    assert.equal(opts.find(o => o.value === 'Tx').allowed, false);
  });

  test('DP E4 + PN-C + PTH-120 → Trimix autorisé', () => {
    const dp = { niveau_encadrant: 'E4', nitrox: ['PN-C'], trimix: ['PTH-120'] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find(o => o.value === 'Tx').allowed, true);
  });

  test('DP E2 + PTH-120 → Trimix interdit (E1/E2 jamais Tx)', () => {
    const dp = { niveau_encadrant: 'E2', nitrox: ['PN-C'], trimix: ['PTH-120'] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find(o => o.value === 'Tx').allowed, false);
  });

  test('DP N5 + PTH-120 → Trimix interdit (N5 jamais Tx selon règle DP)', () => {
    const dp = { niveau_encadrant: 'N5', nitrox: ['PN-C'], trimix: ['PTH-120'] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find(o => o.value === 'Tx').allowed, false);
  });

  test('Air toujours autorisé', () => {
    const dp = null;
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find(o => o.value === 'Air').allowed, true);
  });
});

// =========================================================================
// getProfOptions
// =========================================================================
describe('getProfOptions', () => {
  test('E3 sans PTH → max 60 m', () => {
    const opts = getProfOptions('E3', 'Exploration', { trimix: [] }, null);
    assert.deepEqual(opts, ['6 m', '12 m', '20 m', '40 m', '60 m']);
  });

  test('E4 + PTH-120 → jusqu\'à 120 m', () => {
    const opts = getProfOptions('E4', 'Exploration', { trimix: ['PTH-120'] }, null);
    assert.ok(opts.includes('120 m'));
    assert.ok(opts.includes('80 m'));
  });

  test('Site 25m → propose 40m comme échelon juste au-dessus', () => {
    const opts = getProfOptions('E3', 'Exploration', { trimix: [] }, { profondeur_max: 25 });
    assert.deepEqual(opts, ['6 m', '12 m', '20 m', '40 m']);
  });

  test('N5 → exploration uniquement, 60 m max', () => {
    const opts = getProfOptions('N5', 'Exploration', { trimix: [] }, null);
    assert.deepEqual(opts, ['6 m', '12 m', '20 m', '40 m', '60 m']);
  });

  test('E1 → formation 6m seulement', () => {
    const opts = getProfOptions('E1', 'Enseignement', { trimix: [] }, null);
    assert.deepEqual(opts, ['6 m']);
  });
});
