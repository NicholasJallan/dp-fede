// Tests unitaires — gardes et propagation DP (src/app/dp-guards.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { dpAnswerFields, clampPalMelanges } from '../src/app/dp-guards.js';
import { diverFullName } from '../src/components/format.js';

describe('dpAnswerFields — propagation des informations du DP', () => {
  test('dpId vide, null ou undefined vide dp_qual et dp_nom', () => {
    assert.deepEqual(dpAnswerFields('', null), { dp_qual: '', dp_nom: '' });
    assert.deepEqual(dpAnswerFields(null, undefined), { dp_qual: '', dp_nom: '' });
    assert.deepEqual(dpAnswerFields(undefined, null), { dp_qual: '', dp_nom: '' });
  });

  test('dpId renseigné mais selectedDP absent (annuaire en cours de chargement / DP supprimé) renvoie null', () => {
    assert.equal(dpAnswerFields('dp-123', null), null);
    assert.equal(dpAnswerFields('dp-123', undefined), null);
  });

  test('dpId et selectedDP présents renvoient qualification et nom formaté', () => {
    const dp = { prenom: 'Eve', nom: 'Moniteur', niveau_encadrant: 'E3' };
    assert.deepEqual(dpAnswerFields('dp-1', dp), {
      dp_qual: 'E3',
      dp_nom: diverFullName(dp),
    });
  });

  test('selectedDP sans niveau_encadrant replie sur chaîne vide', () => {
    const dp = { prenom: 'Bob', nom: 'Martin' };
    assert.deepEqual(dpAnswerFields('dp-2', dp), {
      dp_qual: '',
      dp_nom: diverFullName(dp),
    });
  });
});

describe('clampPalMelanges — filtrage des mélanges selon prérogatives DP', () => {
  test('si dpKnown est falsy, renvoie exactement la même référence de tableau', () => {
    const pals = [{ id: 'p1', melanges: ['Nx ≤ 40%'] }];
    const outFalse = clampPalMelanges(pals, new Set(['Air']), false);
    assert.equal(outFalse, pals);

    const outNull = clampPalMelanges(pals, new Set(['Air']), null);
    assert.equal(outNull, pals);

    const outUndefined = clampPalMelanges(pals, new Set(['Air']), undefined);
    assert.equal(outUndefined, pals);
  });

  test("si aucune palanquée ne change, renvoie la même référence de tableau et d'objets", () => {
    const pals = [
      { id: 'p1', melanges: ['Air'] },
      { id: 'p2', melanges: ['Nx ≤ 40%'] },
    ];
    const allowed = new Set(['Air', 'Nx ≤ 40%']);
    const out = clampPalMelanges(pals, allowed, true);

    assert.equal(out, pals);
    assert.equal(out[0], pals[0]);
    assert.equal(out[1], pals[1]);
  });

  test('filtre les mélanges interdits et préserve les objets de palanquées inchangées', () => {
    const pals = [
      { id: 'p1', melanges: ['Air', 'Nx > 40%'] },
      { id: 'p2', melanges: ['Air'] },
    ];
    const allowed = new Set(['Air', 'Nx ≤ 40%']);
    const out = clampPalMelanges(pals, allowed, true);

    assert.notEqual(out, pals);
    assert.deepEqual(out[0].melanges, ['Air']);
    assert.equal(out[1], pals[1]); // palanquée inchangée préservée par référence
  });

  test("si le filtre vide la liste des mélanges, replie sur ['Air']", () => {
    const pals = [{ id: 'p1', melanges: ['Tx'] }];
    const allowed = new Set(['Air', 'Nx ≤ 40%']);
    const out = clampPalMelanges(pals, allowed, true);

    assert.deepEqual(out[0].melanges, ['Air']);
  });

  test('melanges absent ou non défini reste [] sans altérer le tableau', () => {
    const pals = [{ id: 'p1' }];
    const allowed = new Set(['Air']);
    const out = clampPalMelanges(pals, allowed, true);

    assert.equal(out, pals);
    assert.deepEqual(out[0].melanges, undefined);
  });
});
