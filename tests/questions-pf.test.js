// Tests métier — questions spécifiques à la Polynésie française (arrêté n° 199 CM)
// Définies dans src/domain/questions.js, filtrées par matchCondition(q.when, answers).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { QUESTIONS } from '../src/domain/questions.js';
import { matchCondition } from '../src/domain/conditions.js';

const allQuestions = QUESTIONS.flatMap((s) => s.questions);
const findQ = (id) => allQuestions.find((q) => q.id === id);

const SECTION_B_IDS = ['plongee_nuit', 'plongee_derive', 'plongee_passe', 'navire_nom', 'navire_immat'];
const SECTION_G_IDS = ['o2_litres'];
const ALL_PF_IDS = [...SECTION_B_IDS, ...SECTION_G_IDS];

describe('Questions Polynésie française (arrêté n° 199 CM)', () => {
  test('toutes les questions PF existent dans QUESTIONS', () => {
    for (const id of ALL_PF_IDS) {
      assert.ok(findQ(id), `question manquante : ${id}`);
    }
  });

  test('questions rattachées aux bonnes sections', () => {
    const secB = QUESTIONS.find((s) => s.id === 'B')?.questions.map((q) => q.id) || [];
    for (const id of SECTION_B_IDS) {
      assert.ok(secB.includes(id), `${id} doit appartenir à la section B`);
    }

    const secG = QUESTIONS.find((s) => s.id === 'G')?.questions.map((q) => q.id) || [];
    for (const id of SECTION_G_IDS) {
      assert.ok(secG.includes(id), `${id} doit appartenir à la section G`);
    }
  });

  test('visibles sous juridiction PF avec les prérequis nécessaires', () => {
    const pfBase = { jurisdiction: 'PF' };
    assert.equal(matchCondition(findQ('plongee_nuit')?.when, pfBase), true);
    assert.equal(matchCondition(findQ('plongee_derive')?.when, pfBase), true);
    assert.equal(matchCondition(findQ('plongee_passe')?.when, pfBase), true);
    assert.equal(matchCondition(findQ('o2_litres')?.when, pfBase), true);

    const pfBoat = { jurisdiction: 'PF', depart_bateau: true };
    assert.equal(matchCondition(findQ('navire_nom')?.when, pfBoat), true);
    assert.equal(matchCondition(findQ('navire_immat')?.when, pfBoat), true);
  });

  test('invisibles sous juridiction FR même avec depart_bateau', () => {
    const frAnswers = { jurisdiction: 'FR', depart_bateau: true };
    for (const id of ALL_PF_IDS) {
      assert.equal(matchCondition(findQ(id)?.when, frAnswers), false, `${id} ne doit pas être visible en FR`);
    }
  });

  test('invisibles sans juridiction (null / undefined / vide)', () => {
    const emptyAnswers = { depart_bateau: true };
    for (const id of ALL_PF_IDS) {
      assert.equal(matchCondition(findQ(id)?.when, emptyAnswers), false, `${id} invisible sans juridiction`);
    }
  });

  test('navire_nom et navire_immat invisibles sans depart_bateau en PF', () => {
    const pfNoBoat = { jurisdiction: 'PF', depart_bateau: false };
    assert.equal(matchCondition(findQ('navire_nom')?.when, pfNoBoat), false);
    assert.equal(matchCondition(findQ('navire_immat')?.when, pfNoBoat), false);
  });
});
