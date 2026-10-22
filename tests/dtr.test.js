// Tests métier — DTR prévue par défaut (src/domain/dtr.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import win from './setup.js';
const { minDtr, dtrForProf } = win;

describe('minDtr — 1 min par tranche de 10 m entamée', () => {
  test('20 m → 2 min, 25 m → 3 min, 6 m → 1 min', () => {
    assert.equal(minDtr(20), 2);
    assert.equal(minDtr(25), 3);
    assert.equal(minDtr(6), 1);
  });

  test('profondeur absente ou nulle → 0', () => {
    assert.equal(minDtr(0), 0);
    assert.equal(minDtr(null), 0);
    assert.equal(minDtr(undefined), 0);
  });
});

describe('dtrForProf — DTR prévue après un changement de profondeur', () => {
  test('DTR non saisie → minimum de la nouvelle profondeur', () => {
    assert.equal(dtrForProf(null, 20, 40), 4);
    assert.equal(dtrForProf(undefined, undefined, 35), 4);
  });

  test('DTR restée au minimum → suit la profondeur, à la hausse comme à la baisse', () => {
    assert.equal(dtrForProf(2, 20, 40), 4);
    assert.equal(dtrForProf(4, 40, 20), 2);
  });

  test('DTR relevée par le DP → conservée tant qu’elle couvre le minimum', () => {
    assert.equal(dtrForProf(10, 40, 30), 10);
    assert.equal(dtrForProf(5, 20, 60), 6);
  });
});
