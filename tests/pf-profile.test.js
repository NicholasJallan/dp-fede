// Tests métier — Dérivation de profil PF et profil effectif (Arrêté 199 CM)
// Conforme aux Annexes I, II, III, VII, VIII, IX.
// Rejeu de la fixture partagée tests/fixtures/pf-equivalences.json.

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PF_CODES, pfFromFr, pfProfile } from '../src/domain/pf/pf-profile.js';
import win from './setup.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'pf-equivalences.json');
const fixtures = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));

describe('pf-profile — constantes PF_CODES', () => {
  test('Exporté par src/domain/index.js via setup.js', () => {
    assert.equal(typeof win.pfFromFr, 'function');
    assert.equal(typeof win.pfProfile, 'function');
    assert.ok(win.PF_CODES, 'PF_CODES doit être exporté par le domaine');
  });

  test('PF_CODES et sous-listes sont gelés', () => {
    assert.ok(Object.isFrozen(PF_CODES), 'PF_CODES doit être gelé');
    assert.ok(Object.isFrozen(PF_CODES.aptitudes), 'aptitudes doit être gelé');
    assert.ok(Object.isFrozen(PF_CODES.gaz), 'gaz doit être gelé');
    assert.ok(Object.isFrozen(PF_CODES.fonctions), 'fonctions doit être gelé');
    assert.ok(Object.isFrozen(PF_CODES.diplomes), 'diplomes doit être gelé');
  });

  test('PF_CODES contient exactement les codes de l arrêté 199 CM dans l ordre canonique', () => {
    assert.deepEqual(PF_CODES.aptitudes, [
      'PE-12',
      'PE-20',
      'PE-30',
      'PE-40',
      'PE-50',
      'PA-12',
      'PA-20',
      'PA-30',
      'PA-40',
      'PA-50',
    ]);
    assert.deepEqual(PF_CODES.gaz, ['PN', 'PN-C', 'PTH-50', 'PTH-70', 'PTH-100', 'PTH-120']);
    assert.deepEqual(PF_CODES.fonctions, [
      'ENS-06',
      'ENS-20',
      'ENS-30',
      'ENS-40',
      'ENS-50',
      'GP-40',
      'GP-50',
      'DP-40',
      'DP-60',
      'DP-70',
      'DP-100',
      'DP-120',
    ]);
    assert.deepEqual(PF_CODES.diplomes, [
      'BPJEPS',
      'DEJEPS',
      'DEJEPS-E4',
      'DESJEPS',
      'BEES1',
      'BEES2',
      'BEES3',
      'BPP-GAPPN',
    ]);
  });
});

describe('pf-profile — pfFromFr (rejeu fixture partagée)', () => {
  for (const tc of fixtures.fromFr) {
    test(`fromFr: ${tc.desc} (${tc.ref})`, () => {
      const res = pfFromFr(tc.diver);
      assert.deepEqual(res, tc.out);
    });
  }

  test('fromFr avec plongeur vide, null ou undefined renvoie des listes vides et diplome null', () => {
    const emptyExpected = {
      aptitudes: [],
      gaz: [],
      fonctions: [],
      diplome_homologue: null,
    };
    assert.deepEqual(pfFromFr(null), emptyExpected);
    assert.deepEqual(pfFromFr(undefined), emptyExpected);
    assert.deepEqual(pfFromFr({}), emptyExpected);
  });
});

describe('pf-profile — pfProfile (profil effectif, rejeu fixture partagée)', () => {
  for (const tc of fixtures.effective) {
    test(`effective: ${tc.desc}`, () => {
      const res = pfProfile(tc.diver);
      assert.deepEqual(res, tc.out);
    });
  }

  test('pfProfile avec plongeur null ou undefined renvoie un profil vide avec derived true', () => {
    const expected = {
      aptitudes: [],
      gaz: [],
      fonctions: [],
      diplome_homologue: null,
      stagiaire: false,
      patente: false,
      brevets: '',
      attestation: null,
      derived: {
        aptitudes: true,
        gaz: true,
        fonctions: true,
        diplome_homologue: true,
      },
    };
    assert.deepEqual(pfProfile(null), expected);
    assert.deepEqual(pfProfile(undefined), expected);
  });
});
