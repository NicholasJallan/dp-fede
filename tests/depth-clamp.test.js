// Tests métier — computePalHardLimit et clampProfMax (src/domain/depth-clamp.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import win from './setup.js';
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

  test('Palanquée formation E3 + PE40 → bornée à 40 par l\'aptitude de l\'élève', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'E3' }, { aptitude: 'PE40' }],
      dp: { niveau_encadrant: 'E3', trimix: [] },
      sessionMax: 60, ...deps,
    });
    assert.equal(limit, 40);
  });

  test('Air : jamais au-delà de 60 m (A322-76), même avec des aptitudes PTH', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'PTH120' }, { aptitude: 'PTH120' }],
      dp: { niveau_encadrant: 'E4', trimix: ['PTH-120'] },
      sessionMax: Infinity, melanges: ['Air'], ...deps,
    });
    assert.equal(limit, 60);
  });

  test('Trimix autonome sous DP E4 PTH-120 → 120 m possible', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'PA60' }, { aptitude: 'PA60' }],
      dp: { niveau_encadrant: 'E4', trimix: ['PTH-120'] },
      sessionMax: Infinity, melanges: ['Tx'], ...deps,
    });
    assert.equal(limit, 120);
  });

  test('Trimix encadré → 80 m max (A322-76)', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: 'E4' }, { aptitude: 'PE60' }],
      dp: { niveau_encadrant: 'E4', trimix: ['PTH-120'] },
      sessionMax: Infinity, melanges: ['Tx'], mode: 'exploration', ...deps,
    });
    assert.equal(limit, 80);
  });

  test('Membre sans aptitude ignoré (pas de plafond à 0)', () => {
    const limit = computePalHardLimit({
      membres: [{ aptitude: '' }, { aptitude: 'PA40' }],
      dp: { niveau_encadrant: 'E3', trimix: [] },
      sessionMax: Infinity, ...deps,
    });
    assert.equal(limit, 40);
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
