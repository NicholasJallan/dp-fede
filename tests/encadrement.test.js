// Niveau encadrant selon le cadre (associatif / SCA) : src/domain/encadrement.js.
// Mêmes cas que backend/tests-php/EncadrementTest.php.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  diplomeProLabel,
  diplomeProLevel,
  diverForCadre,
  dpDiplomeProRequis,
  encadrantLevel,
  isCadrePro,
} from '../src/domain/encadrement.js';
import { diplomeProHint, diverToForm } from '../src/components/diver-payload.js';

const CASES = [
  // [niveau_encadrant, diplome_pro, associatif, pro, libellé]
  ['E4', 'DEJEPS', 'E4', 'E3', 'MF1 + BEPPA + DEJEPS sans CC'],
  ['E4', 'DEJEPS-E4', 'E4', 'E4', 'MF2 + DEJEPS avec CC'],
  ['E3', 'DEJEPS-E4', 'E4', 'E4', 'DEJEPS d’avant la réforme, niveau non relevé'],
  ['E3', 'DEJEPS', 'E3', 'E3', 'MF1 + DEJEPS'],
  ['N4', 'DEJEPS', 'E3', 'E3', 'GP + DEJEPS (import)'],
  ['E3', 'DESJEPS', 'E4', 'E4', 'DESJEPS'],
  ['E3', 'BEES2', 'E4', 'E4', 'BEES2'],
  ['E4', null, 'E4', 'E4', 'MF2 sans diplôme pro : fédéral partout'],
  ['E3', 'Autre', 'E3', 'E3', 'diplôme « Autre » sans niveau'],
  [null, null, null, null, 'plongeur sans encadrement'],
];

for (const [ne, dip, asso, pro, label] of CASES) {
  test(`encadrantLevel — ${label}`, () => {
    const d = { niveau_encadrant: ne, diplome_pro: dip };
    assert.equal(encadrantLevel(d, false), asso);
    assert.equal(encadrantLevel(d, true), pro);
  });
}

test('isCadrePro : seule la SCA est un cadre professionnel', () => {
  assert.equal(isCadrePro('sca'), true);
  for (const t of ['club', 'csa', 'autre', null, undefined]) assert.equal(isCadrePro(t), false);
});

test('diplomeProLevel / diplomeProLabel : codes historiques conservés', () => {
  assert.equal(diplomeProLevel('DEJEPS'), 'E3');
  assert.equal(diplomeProLevel('DEJEPS-E4'), 'E4');
  assert.equal(diplomeProLevel('inconnu'), null);
  assert.equal(diplomeProLabel('DEJEPS'), 'DEJEPS E3');
  assert.equal(diplomeProLabel(''), '');
  assert.equal(diplomeProLabel('XYZ'), 'XYZ');
});

test('diverForCadre : objet inchangé si le niveau ne bouge pas', () => {
  const d = { id: 'a', niveau_encadrant: 'E4', diplome_pro: 'DEJEPS' };
  assert.equal(diverForCadre(d, false), d);
});

test('diverForCadre : niveau du cadre, niveau saisi conservé', () => {
  const d = { id: 'a', niveau_encadrant: 'E4', diplome_pro: 'DEJEPS' };
  const v = diverForCadre(d, true);
  assert.equal(v.niveau_encadrant, 'E3');
  assert.equal(v.niveau_encadrant_annuaire, 'E4');
  assert.equal(d.niveau_encadrant, 'E4', 'pas de mutation');
});

test('dpDiplomeProRequis : en SCA, un enseignant sans diplôme pro n’est pas DP', () => {
  for (const ne of ['E1', 'E2', 'E3', 'E4']) {
    assert.equal(dpDiplomeProRequis({ niveau_encadrant: ne, diplome_pro: '' }, true), true, ne);
    assert.equal(dpDiplomeProRequis({ niveau_encadrant: ne, diplome_pro: '' }, false), false, `${ne} associatif`);
  }
  assert.equal(dpDiplomeProRequis({ niveau_encadrant: 'E3', diplome_pro: 'DEJEPS' }, true), false);
  assert.equal(dpDiplomeProRequis({ niveau_encadrant: 'E3', diplome_pro: 'Autre' }, true), false, 'BPJEPS…');
  assert.equal(dpDiplomeProRequis({ niveau_encadrant: 'N5', diplome_pro: '' }, true), false, 'P5 / DPE');
  assert.equal(dpDiplomeProRequis({ niveau_encadrant: 'N4', diplome_pro: '' }, true), false);
});

test('diverForCadre : enseignant sans diplôme pro en SCA marqué non DP, niveau inchangé', () => {
  const d = { id: 'a', niveau_encadrant: 'E4', diplome_pro: '' };
  const v = diverForCadre(d, true);
  assert.equal(v.dp_diplome_pro_requis, true);
  assert.equal(v.niveau_encadrant, 'E4');
  assert.equal(v.niveau_encadrant_annuaire, undefined);
  assert.equal(diverForCadre(d, false), d);
});

test('diverToForm relit le niveau saisi d’une vue diverForCadre (pas d’écrasement à l’écriture)', () => {
  const v = diverForCadre({ id: 'a', nom: 'X', niveau_encadrant: 'E4', diplome_pro: 'DEJEPS' }, true);
  assert.equal(diverToForm(v).niveau_encadrant, 'E4');
  const up = diverForCadre({ id: 'b', nom: 'Y', niveau_encadrant: null, diplome_pro: 'DESJEPS' }, false);
  assert.equal(diverToForm(up).niveau_encadrant, '');
});

test('diplomeProHint : niveaux par cadre et rappel du CC pour un MF2', () => {
  assert.equal(diplomeProHint({ diplome_pro: '', niveau_encadrant: 'E4' }), undefined);
  assert.match(
    diplomeProHint({ diplome_pro: 'DEJEPS', niveau_encadrant: 'E4' }),
    /associatif : E4.*\(SCA\) : E3.*équivalence/,
  );
  assert.doesNotMatch(diplomeProHint({ diplome_pro: 'DEJEPS-E4', niveau_encadrant: 'E4' }), /équivalence/);
});
