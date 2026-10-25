// Tests métier — libellés de juridiction et types de structure par juridiction (src/domain/levels.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  STRUCTURE_LABELS,
  JURISDICTION_LABELS,
  structureLabels,
  structureLabel,
} from '../src/domain/levels.js';

import win from './setup.js';

describe('Exporté par src/domain/index.js via setup.js', () => {
  test('Exports disponibles sur l’objet global de test', () => {
    assert.equal(typeof win.structureLabels, 'function');
    assert.equal(typeof win.structureLabel, 'function');
    assert.ok(win.JURISDICTION_LABELS);
    assert.ok(win.STRUCTURE_LABELS);
  });
});

describe('JURISDICTION_LABELS', () => {
  test('Définit les libellés officiels gelés pour FR et PF', () => {
    assert.deepEqual(JURISDICTION_LABELS, {
      FR: 'France — Code du sport',
      PF: 'Polynésie française — arrêté n° 199 CM',
    });
    assert.ok(Object.isFrozen(JURISDICTION_LABELS), 'JURISDICTION_LABELS doit être gelé');
  });
});

describe('STRUCTURE_LABELS (compatibilité historique)', () => {
  test('Conserve ses 4 clés FR historiques', () => {
    assert.deepEqual(Object.keys(STRUCTURE_LABELS), ['club', 'sca', 'csa', 'autre']);
    assert.equal(STRUCTURE_LABELS.club, 'Club FFESSM associatif');
    assert.equal(STRUCTURE_LABELS.sca, 'Structure Commerciale Agréée (SCA)');
    assert.equal(STRUCTURE_LABELS.csa, "Convention de Section d'Activité (CSA)");
    assert.equal(STRUCTURE_LABELS.autre, 'Autre');
  });
});

describe('structureLabels(jurisdiction)', () => {
  test('FR renvoie un objet gelé identique à STRUCTURE_LABELS', () => {
    const labels = structureLabels('FR');
    assert.ok(Object.isFrozen(labels), 'L’objet renvoyé doit être gelé');
    assert.deepEqual(Object.keys(labels), ['club', 'sca', 'csa', 'autre']);
    assert.equal(labels.club, 'Club FFESSM associatif');
    assert.equal(labels.sca, 'Structure Commerciale Agréée (SCA)');
    assert.equal(labels.csa, "Convention de Section d'Activité (CSA)");
    assert.equal(labels.autre, 'Autre');
  });

  test('PF renvoie un objet gelé avec 5 clés incluant patente', () => {
    const labels = structureLabels('PF');
    assert.ok(Object.isFrozen(labels), 'L’objet renvoyé doit être gelé');
    assert.deepEqual(Object.keys(labels), ['club', 'sca', 'patente', 'csa', 'autre']);
    assert.equal(labels.club, 'Association (FPESSM / FFESSM)');
    assert.equal(labels.sca, 'Établissement commercial');
    assert.equal(labels.patente, 'Moniteur patenté (indépendant)');
    assert.equal(labels.csa, "Convention de Section d'Activité (CSA)");
    assert.equal(labels.autre, 'Autre');
  });

  test('Insensible à la casse et aux espaces ("  pf  ", "  FR  ")', () => {
    assert.deepEqual(structureLabels('  pf  '), structureLabels('PF'));
    assert.deepEqual(structureLabels('  FR  '), structureLabels('FR'));
  });

  test('Valeur absente ou invalide (null, undefined, "XX") retombe sur FR', () => {
    for (const invalid of [null, undefined, '', '   ', 'XX', 123, {}]) {
      const labels = structureLabels(invalid);
      assert.deepEqual(Object.keys(labels), ['club', 'sca', 'csa', 'autre']);
      assert.equal(labels.club, 'Club FFESSM associatif');
    }
  });
});

describe('structureLabel(type, jurisdiction)', () => {
  test('Résolution du libellé pour la juridiction demandée', () => {
    assert.equal(structureLabel('club', 'FR'), 'Club FFESSM associatif');
    assert.equal(structureLabel('club', 'PF'), 'Association (FPESSM / FFESSM)');
    assert.equal(structureLabel('sca', 'PF'), 'Établissement commercial');
    assert.equal(structureLabel('patente', 'PF'), 'Moniteur patenté (indépendant)');
  });

  test('Repli sur une autre juridiction si le type existe (ex. patente en FR)', () => {
    assert.equal(structureLabel('patente', 'FR'), 'Moniteur patenté (indépendant)');
  });

  test('Type inconnu renvoie le code brut', () => {
    assert.equal(structureLabel('code_inconnu', 'FR'), 'code_inconnu');
    assert.equal(structureLabel('code_inconnu', 'PF'), 'code_inconnu');
  });

  test('Type vide, null ou undefined renvoie null', () => {
    assert.equal(structureLabel('', 'FR'), null);
    assert.equal(structureLabel(null, 'FR'), null);
    assert.equal(structureLabel(undefined, 'PF'), null);
  });
});
