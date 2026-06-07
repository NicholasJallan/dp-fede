// Tests métier — computePalHardLimit et clampProfMax (lib/depth-clamp.js)

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const win = require('./setup');
const { computePalHardLimit, clampProfMax, getPalType, aptitudeMaxDepth, getDpMaxDepth } = win;

const deps = { aptitudeMaxDepth, getPalType, getDpMaxDepth };

describe('computePalHardLimit', () => {
  test('Palanquée vide + DP E3 exploration → DP limite (60)', () => {
    const limit = computePalHardLimit({
      membres: [], dp: { niveau_encadrant: 'E3', trimix: [] },
      sessionMax: Infinity, ...deps,
    });
    assert.equal(limit, 60);
  });

  test('PE20 dans la palanquée → bornée à 20', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'PE20' }, { aptitude: 'GP' }],
      dp: { niveau_encadrant: 'E3', trimix: [] },
      sessionMax: 60, ...deps,
    });
    assert.equal(limit, 20);
  });

  test('Session 30 vs DP 60 vs PA40 → bornée à 30 (session gagne)', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'PA40' }, { aptitude: 'PA40' }],
      dp: { niveau_encadrant: 'E3', trimix: [] },
      sessionMax: 30, ...deps,
    });
    assert.equal(limit, 30);
  });

  test('Palanquée formation à 50m avec DP E3 → bornée à 40 (formation E3 max)', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'E3' }, { aptitude: 'PE40' }],
      dp: { niveau_encadrant: 'E3', trimix: [] },
      sessionMax: 60, ...deps,
    });
    assert.equal(limit, 40);
  });

  test('PTH-120 sur E4 en exploration → 120 m possible', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'PTH120' }, { aptitude: 'PTH120' }],
      dp: { niveau_encadrant: 'E4', trimix: ['PTH-120'] },
      sessionMax: Infinity, ...deps,
    });
    assert.equal(limit, 120);
  });
});

describe('clampProfMax', () => {
  test('profMax inférieur au plafond → inchangé', () => {
    assert.equal(clampProfMax(20, 40), 20);
  });

  test('profMax > plafond → rabotté', () => {
    assert.equal(clampProfMax(60, 40), 40);
  });

  test('plafond Infinity → profMax inchangé', () => {
    assert.equal(clampProfMax(120, Infinity), 120);
  });

  test('plafond égal à profMax → inchangé', () => {
    assert.equal(clampProfMax(40, 40), 40);
  });
});
