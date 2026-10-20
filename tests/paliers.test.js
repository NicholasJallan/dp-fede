// Tests — paliers de décompression réalisés (modale de sortie, fiche, PDF).
// Le résumé est partagé avec le PDF serveur : cas communs dans
// tests/fixtures/paliers.json (relus par backend/tests-php/PdfRenderTest.php).

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { formatPaliers, initialPaliers, paliersDone, paliersTotal, PALIER_DEPTHS } from '../src/domain/index.js';
import { applyPalier, applyConfort, applyDuree } from '../src/screens/fiche/fin-rules.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/paliers.json', import.meta.url), 'utf8'));

describe('formatPaliers — cas partagés avec le PDF serveur', () => {
  for (const c of fixtures.cases) {
    test(c.name, () => assert.equal(formatPaliers(c.real), c.expected));
  }
});

describe('paliers — saisie', () => {
  test('tranches de 3 m, de la plus profonde à la surface', () => {
    assert.deepEqual([...PALIER_DEPTHS], [9, 6, 3]);
  });

  test('initialPaliers reprend une saisie précédente et complète les champs', () => {
    const f = initialPaliers({ paliers: { 3: '4' }, confort: { on: true, duree: '2' } });
    assert.deepEqual(f.paliers, { 9: '', 6: '', 3: '4' });
    assert.deepEqual(f.confort, { on: true, profondeur: '3', duree: '2' });
    assert.deepEqual(initialPaliers(undefined).paliers, { 9: '', 6: '', 3: '' });
  });

  test('applyPalier borne à 0–99 min et accepte le vide', () => {
    const f = initialPaliers(null);
    assert.equal(applyPalier(f, 3, '120').paliers[3], '99');
    assert.equal(applyPalier(f, 6, '').paliers[6], '');
    assert.equal(applyPalier(f, 9, '2').paliers[9], '2');
    assert.equal(f.paliers[9], '', 'pas de mutation');
  });

  test('applyConfort borne profondeur (1–12 m) et durée (0–30 min)', () => {
    const f = initialPaliers(null);
    assert.equal(applyConfort(f, { profondeur: '40' }).confort.profondeur, '12');
    assert.equal(applyConfort(f, { profondeur: '0' }).confort.profondeur, '1');
    assert.equal(applyConfort(f, { duree: '45' }).confort.duree, '30');
    assert.equal(applyConfort(f, { on: true }).confort.on, true);
  });

  test('total des paliers (pour comparer à la DTR réalisée)', () => {
    const real = { paliers: { 6: '1', 3: '3' }, confort: { on: true, profondeur: '5', duree: '2' } };
    assert.deepEqual(paliersDone(real), [[6, 1], [3, 3]]);
    assert.equal(paliersTotal(real), 6);
    assert.equal(paliersTotal({ ...real, confort: { ...real.confort, on: false } }), 4);
  });

  test('les règles existantes (durée, DTR) conservent les paliers', () => {
    const f = { duree: '40', profMax: '20', dtr: '5', commentaire: '', ...initialPaliers({ paliers: { 3: '3' } }) };
    const g = applyDuree(f, '50', 45);
    assert.equal(g.duree, '45');
    assert.equal(g.paliers[3], '3');
  });
});
