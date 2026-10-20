// Tests métier — profondeur maximale dirigée par le DP
// (annexe III-15 a, A322-76, A322-98)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import win from './setup.js';
const { getDpMaxDepth, getAvailableMelanges } = win;

// =========================================================================
// getDpMaxDepth — limites par qualification DP
// =========================================================================
describe("getDpMaxDepth — limites de base à l'air", () => {
  const cases = [
    // [niveau, palType, expected]
    // E1 / E2 : DP uniquement en piscine ou fosse ≤ 6 m (A322-98)
    ['E1', 'formation', 6],
    ['E1', 'exploration', 6],
    ['E2', 'formation', 6],
    ['E2', 'exploration', 6],
    // E3 (MF1) : air/nitrox en enseignement ou en exploration (III-15 a)
    ['E3', 'formation', 60],
    ['E3', 'exploration', 60],
    ['E4', 'formation', 60],
    ['E4', 'exploration', 60],
    ['N5', 'formation', 0],
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

  test('E3 + PTH-120 en formation → 60 m (air ; trimix limité à 40 m)', () => {
    const dp = { niveau_encadrant: 'E3', trimix: ['PTH-120'] };
    assert.equal(getDpMaxDepth('formation', dp), 60);
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
    assert.equal(getDpMaxDepth('bapteme', dp), 60);
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
    assert.equal(opts.find((o) => o.value === 'Air').allowed, true);
    assert.equal(opts.find((o) => o.value === 'Nx ≤ 40%').allowed, false);
    assert.equal(opts.find((o) => o.value === 'Nx > 40%').allowed, false);
    assert.equal(opts.find((o) => o.value === 'Tx').allowed, false);
  });

  test('DP E3 + PN-C → Nx ≤ 40% et Nx > 40% autorisés', () => {
    const dp = { niveau_encadrant: 'E3', nitrox: ['PN-C'], trimix: [] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find((o) => o.value === 'Nx ≤ 40%').allowed, true);
    assert.equal(opts.find((o) => o.value === 'Nx > 40%').allowed, true);
    assert.equal(opts.find((o) => o.value === 'Tx').allowed, false);
  });

  test('DP E4 + PN-C + PTH-120 → Trimix autorisé', () => {
    const dp = { niveau_encadrant: 'E4', nitrox: ['PN-C'], trimix: ['PTH-120'] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find((o) => o.value === 'Tx').allowed, true);
  });

  test('DP E2 + PTH-120 → Trimix interdit (E1/E2 jamais Tx)', () => {
    const dp = { niveau_encadrant: 'E2', nitrox: ['PN-C'], trimix: ['PTH-120'] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find((o) => o.value === 'Tx').allowed, false);
  });

  test('DP N5 + PTH-120 → Trimix interdit (N5 jamais Tx selon règle DP)', () => {
    const dp = { niveau_encadrant: 'N5', nitrox: ['PN-C'], trimix: ['PTH-120'] };
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find((o) => o.value === 'Tx').allowed, false);
  });

  test('Air toujours autorisé', () => {
    const dp = null;
    const opts = getAvailableMelanges(dp);
    assert.equal(opts.find((o) => o.value === 'Air').allowed, true);
  });
});
