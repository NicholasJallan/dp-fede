// Tests métier — dispatcher de règles selon la juridiction (src/domain/rules-for.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { rulesFor } from '../src/domain/rules-for.js';
import {
  validatePal,
  getDiverAptitudes,
  getDpMaxDepth,
  computePalHardLimit,
  CHECKLIST_RULES,
} from '../src/domain/index.js';

import win from './setup.js';

describe('rulesFor — dispatcher de règles (Lot 0)', () => {
  test('Exporté par src/domain/index.js via setup.js', () => {
    assert.equal(typeof win.rulesFor, 'function');
  });

  test('rulesFor("FR") renvoie un profil complet pointant sur le domaine FR', () => {
    const rules = rulesFor('FR');
    assert.ok(Object.isFrozen(rules), 'L’objet renvoyé doit être gelé');
    assert.equal(rules.jurisdiction, 'FR');
    assert.equal(rules.validatePal, validatePal);
    assert.equal(rules.getDiverAptitudes, getDiverAptitudes);
    assert.equal(rules.getDpMaxDepth, getDpMaxDepth);
    assert.equal(rules.computePalHardLimit, computePalHardLimit);
    assert.equal(rules.checklistRules, CHECKLIST_RULES);
  });

  test('rulesFor("PF") retombe sur FR au Lot 0 (PF non encore implémentée)', () => {
    const rules = rulesFor('PF');
    assert.ok(Object.isFrozen(rules));
    // Au Lot 0, jurisdiction indique la juridiction dont les règles sont réellement appliquées
    assert.equal(rules.jurisdiction, 'FR');
    assert.equal(rules.validatePal, validatePal);
    assert.equal(rules.getDiverAptitudes, getDiverAptitudes);
    assert.equal(rules.getDpMaxDepth, getDpMaxDepth);
    assert.equal(rules.computePalHardLimit, computePalHardLimit);
    assert.equal(rules.checklistRules, CHECKLIST_RULES);
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
    assert.equal(rulesFor('  pf  ').jurisdiction, 'FR');
  });
});
