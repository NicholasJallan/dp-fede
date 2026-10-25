// Tests métier — dispatcher de règles selon la juridiction (src/domain/rules-for.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { rulesFor } from '../src/domain/rules-for.js';
import {
  validatePal,
  validatePalPf,
  getDiverAptitudes,
  getDpMaxDepth,
  computePalHardLimit,
  CHECKLIST_RULES,
} from '../src/domain/index.js';

import win from './setup.js';

const COMMON_INTERFACE_KEYS = [
  'rolesFor',
  'palHardLimit',
  'dpMaxDepth',
  'palMode',
  'palType',
  'availableMelanges',
  'isDpCandidate',
  'isEnseignantRole',
];

describe('rulesFor — dispatcher de règles (Lot 2d)', () => {
  test('Exporté par src/domain/index.js via setup.js', () => {
    assert.equal(typeof win.rulesFor, 'function');
  });

  test('rulesFor("FR") renvoie le profil FR avec clés legacy et API commune', () => {
    const rules = rulesFor('FR');
    assert.ok(Object.isFrozen(rules), 'L’objet renvoyé doit être gelé');
    assert.equal(rules.jurisdiction, 'FR');
    assert.equal(rules.validatePal, validatePal);
    assert.equal(rules.checklistRules, CHECKLIST_RULES);

    // Clés legacy FR
    assert.equal(rules.getDiverAptitudes, getDiverAptitudes);
    assert.equal(rules.getDpMaxDepth, getDpMaxDepth);
    assert.equal(rules.computePalHardLimit, computePalHardLimit);

    // API commune
    for (const key of COMMON_INTERFACE_KEYS) {
      assert.equal(typeof rules[key], 'function', `clé commune FR manquante : ${key}`);
    }
  });

  test('rulesFor("PF") renvoie le profil PF avec validatePalPf et API commune', () => {
    const rules = rulesFor('PF');
    assert.ok(Object.isFrozen(rules));
    assert.equal(rules.jurisdiction, 'PF');
    assert.equal(rules.validatePal, validatePalPf);
    assert.equal(rules.checklistRules, CHECKLIST_RULES);

    // API commune
    for (const key of COMMON_INTERFACE_KEYS) {
      assert.equal(typeof rules[key], 'function', `clé commune PF manquante : ${key}`);
    }
  });

  test('rulesFor avec valeurs invalides (null, undefined, inconnu) retombe sur FR', () => {
    for (const invalid of [null, undefined, '', '   ', 'XX', 123, {}]) {
      const rules = rulesFor(invalid);
      assert.ok(Object.isFrozen(rules));
      assert.equal(rules.jurisdiction, 'FR');
      assert.equal(rules.validatePal, validatePal);
    }
  });

  test('Insensible à la casse et aux espaces ("  fr  ", "  pf  ")', () => {
    assert.equal(rulesFor('  fr  ').jurisdiction, 'FR');
    assert.equal(rulesFor('  pf  ').jurisdiction, 'PF');
  });
});
