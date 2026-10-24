// Tests unitaires — règles pures de saisie de la fiche plongeur (src/components/diver-form-rules.js)

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  plongeurForEncadrant,
  toggleTrimixQual,
  nitroxPrereq,
  trimixPrereq,
  applyDiplomePro,
  applyNitrox,
  validateDiverForm,
  NIVEAUX_PLONGEUR,
  NIVEAUX_ENCADRANT,
  TRIMIX_QUALS,
} from '../src/components/diver-form-rules.js';

describe('diver-form-rules — constantes', () => {
  test('niveaux et qualifications exportés', () => {
    assert.deepEqual(NIVEAUX_PLONGEUR, ['N1', 'N2', 'N3']);
    assert.deepEqual(NIVEAUX_ENCADRANT, ['N4', 'N5', 'E1', 'E2', 'E3', 'E4']);
    assert.deepEqual(TRIMIX_QUALS, ['PTH-40', 'PTH-70', 'PTH-120']);
  });
});

describe('diver-form-rules — plongeurForEncadrant', () => {
  test('E1 garde N2 sauf si N3', () => {
    assert.equal(plongeurForEncadrant('E1', 'N1'), 'N2');
    assert.equal(plongeurForEncadrant('E1', 'N2'), 'N2');
    assert.equal(plongeurForEncadrant('E1', 'N3'), 'N3');
    assert.equal(plongeurForEncadrant('E1', null), 'N2');
  });

  test('autre encadrant impose N3', () => {
    assert.equal(plongeurForEncadrant('E2', 'N1'), 'N3');
    assert.equal(plongeurForEncadrant('E3', 'N2'), 'N3');
    assert.equal(plongeurForEncadrant('E4', null), 'N3');
    assert.equal(plongeurForEncadrant('N4', 'N1'), 'N3');
    assert.equal(plongeurForEncadrant('N5', 'N2'), 'N3');
  });

  test('sans niveau encadrant, le niveau plongeur reste inchangé', () => {
    assert.equal(plongeurForEncadrant('', 'N1'), 'N1');
    assert.equal(plongeurForEncadrant(null, 'N2'), 'N2');
    assert.equal(plongeurForEncadrant(undefined, 'N3'), 'N3');
    assert.equal(plongeurForEncadrant('', null), null);
  });
});

describe('diver-form-rules — toggleTrimixQual (cascade PTH-40 ⊂ 70 ⊂ 120)', () => {
  test('ajout en cascade croissante', () => {
    assert.deepEqual(toggleTrimixQual([], 'PTH-40'), ['PTH-40']);
    assert.deepEqual(toggleTrimixQual([], 'PTH-70'), ['PTH-40', 'PTH-70']);
    assert.deepEqual(toggleTrimixQual([], 'PTH-120'), ['PTH-40', 'PTH-70', 'PTH-120']);
  });

  test('retrait en cascade décroissante', () => {
    const full = ['PTH-40', 'PTH-70', 'PTH-120'];
    assert.deepEqual(toggleTrimixQual(full, 'PTH-120'), ['PTH-40', 'PTH-70']);
    assert.deepEqual(toggleTrimixQual(full, 'PTH-70'), ['PTH-40']);
    assert.deepEqual(toggleTrimixQual(full, 'PTH-40'), []);
  });
});

describe('diver-form-rules — nitroxPrereq', () => {
  test('PN ou autre qualif ne demande aucun prérequis', () => {
    assert.equal(nitroxPrereq({ niveau_plongeur: 'N1', niveau_encadrant: '' }, 'PN'), null);
  });

  test('PN-C exige PE-40 ou PA-40 (N2 minimum)', () => {
    assert.equal(
      nitroxPrereq({ niveau_plongeur: 'N1', niveau_encadrant: '' }, 'PN-C'),
      'PE-40 ou PA-40 requis (N2 minimum)',
    );
    assert.equal(
      nitroxPrereq({ niveau_plongeur: null, niveau_encadrant: '' }, 'PN-C'),
      'PE-40 ou PA-40 requis (N2 minimum)',
    );
  });

  test('PN-C accepté pour N2, N3 ou encadrant', () => {
    assert.equal(nitroxPrereq({ niveau_plongeur: 'N2', niveau_encadrant: '' }, 'PN-C'), null);
    assert.equal(nitroxPrereq({ niveau_plongeur: 'N3', niveau_encadrant: '' }, 'PN-C'), null);
    assert.equal(nitroxPrereq({ niveau_plongeur: 'N1', niveau_encadrant: 'E1' }, 'PN-C'), null);
  });
});

describe('diver-form-rules — trimixPrereq', () => {
  test('exige PN-C avant toute qualification trimix', () => {
    const sansPnc = { nitrox: ['PN'], niveau_plongeur: 'N3', niveau_encadrant: '' };
    assert.equal(trimixPrereq(sansPnc, 'PTH-40'), 'PN-C requis');
    assert.equal(trimixPrereq(sansPnc, 'PTH-70'), 'PN-C requis');
    assert.equal(trimixPrereq(sansPnc, 'PTH-120'), 'PN-C requis');
  });

  test('PTH-40 exige N2 minimum avec PN-C', () => {
    const base = { nitrox: ['PN-C'], niveau_encadrant: '' };
    assert.equal(trimixPrereq({ ...base, niveau_plongeur: 'N1' }, 'PTH-40'), 'PE-40 ou PA-40 requis (N2 minimum)');
    assert.equal(trimixPrereq({ ...base, niveau_plongeur: 'N2' }, 'PTH-40'), null);
    assert.equal(trimixPrereq({ ...base, niveau_plongeur: 'N3' }, 'PTH-40'), null);
  });

  test('PTH-70 et PTH-120 exigent N3 minimum avec PN-C', () => {
    const base = { nitrox: ['PN-C'], niveau_encadrant: '' };
    assert.equal(trimixPrereq({ ...base, niveau_plongeur: 'N2' }, 'PTH-70'), 'PE-60 ou PA-60 requis (N3 minimum)');
    assert.equal(trimixPrereq({ ...base, niveau_plongeur: 'N2' }, 'PTH-120'), 'PE-60 ou PA-60 requis (N3 minimum)');
    assert.equal(trimixPrereq({ ...base, niveau_plongeur: 'N3' }, 'PTH-70'), null);
    assert.equal(trimixPrereq({ ...base, niveau_plongeur: 'N3' }, 'PTH-120'), null);
  });

  test('encadrant satisfait les prérequis de niveau trimix', () => {
    const enc = { nitrox: ['PN-C'], niveau_plongeur: 'N1', niveau_encadrant: 'E2' };
    assert.equal(trimixPrereq(enc, 'PTH-40'), null);
    assert.equal(trimixPrereq(enc, 'PTH-70'), null);
    assert.equal(trimixPrereq(enc, 'PTH-120'), null);
  });
});

describe('diver-form-rules — applyDiplomePro', () => {
  const emptyForm = {
    diplome_pro: '',
    niveau_encadrant: '',
    niveau_plongeur: 'N1',
    rifap: false,
    nitrox: [],
  };

  test('BPJEPS confère E2, N3 implicite et RIFAP', () => {
    const res = applyDiplomePro(emptyForm, 'BPJEPS');
    assert.equal(res.diplome_pro, 'BPJEPS');
    assert.equal(res.niveau_encadrant, 'E2');
    assert.equal(res.niveau_plongeur, 'N3');
    assert.equal(res.rifap, true);
    assert.deepEqual(res.nitrox, []);
  });

  test('DEJEPS confère E3, RIFAP, PN et PN-C', () => {
    const res = applyDiplomePro(emptyForm, 'DEJEPS');
    assert.equal(res.diplome_pro, 'DEJEPS');
    assert.equal(res.niveau_encadrant, 'E3');
    assert.equal(res.niveau_plongeur, 'N3');
    assert.equal(res.rifap, true);
    assert.ok(res.nitrox.includes('PN'));
    assert.ok(res.nitrox.includes('PN-C'));
  });

  test('DEJEPS-E4 et DESJEPS confèrent E4, RIFAP, PN et PN-C', () => {
    for (const diplome of ['DEJEPS-E4', 'DESJEPS']) {
      const res = applyDiplomePro(emptyForm, diplome);
      assert.equal(res.diplome_pro, diplome);
      assert.equal(res.niveau_encadrant, 'E4');
      assert.equal(res.niveau_plongeur, 'N3');
      assert.equal(res.rifap, true);
      assert.ok(res.nitrox.includes('PN'));
      assert.ok(res.nitrox.includes('PN-C'));
    }
  });

  test('ne baisse jamais un niveau encadrant existant plus élevé', () => {
    const e4Form = { ...emptyForm, niveau_encadrant: 'E4', niveau_plongeur: 'N3', rifap: true };
    const res = applyDiplomePro(e4Form, 'BPJEPS');
    assert.equal(res.diplome_pro, 'BPJEPS');
    assert.equal(res.niveau_encadrant, 'E4');
  });
});

describe('diver-form-rules — applyNitrox', () => {
  const base = { nitrox: [] };

  test('ajouter PN ajoute PN seul', () => {
    const res = applyNitrox(base, 'PN');
    assert.deepEqual(res.nitrox, ['PN']);
  });

  test('ajouter PN-C ajoute automatiquement PN si absent', () => {
    const res = applyNitrox(base, 'PN-C');
    assert.deepEqual(res.nitrox, ['PN-C', 'PN']);
  });

  test('retirer PN retire automatiquement PN-C', () => {
    const withBoth = { nitrox: ['PN', 'PN-C'] };
    const res = applyNitrox(withBoth, 'PN');
    assert.deepEqual(res.nitrox, []);
  });

  test('retirer PN-C conserve PN', () => {
    const withBoth = { nitrox: ['PN', 'PN-C'] };
    const res = applyNitrox(withBoth, 'PN-C');
    assert.deepEqual(res.nitrox, ['PN']);
  });
});

describe('diver-form-rules — validateDiverForm', () => {
  const valid = {
    nom: 'Dupont',
    medical: '2026-05-01',
    autorisation_parentale_saison: '',
    representant_legal: '',
  };

  test('formulaire complet et valide renvoie une chaîne vide', () => {
    assert.equal(validateDiverForm(valid), '');
  });

  test('nom manquant ou blanc renvoie le message requis', () => {
    assert.equal(validateDiverForm({ ...valid, nom: '' }), 'Le nom est obligatoire.');
    assert.equal(validateDiverForm({ ...valid, nom: '   ' }), 'Le nom est obligatoire.');
  });

  test('date de certificat médical manquante renvoie le message requis', () => {
    assert.equal(validateDiverForm({ ...valid, medical: '' }), 'La date du certificat médical est obligatoire.');
    assert.equal(validateDiverForm({ ...valid, medical: null }), 'La date du certificat médical est obligatoire.');
  });

  test('saison autorisation parentale invalide renvoie le message requis', () => {
    assert.equal(
      validateDiverForm({ ...valid, autorisation_parentale_saison: '2026' }),
      "Saison de l'autorisation parentale invalide (format 2026-2027).",
    );
    assert.equal(
      validateDiverForm({ ...valid, autorisation_parentale_saison: '2026-2028' }),
      "Saison de l'autorisation parentale invalide (format 2026-2027).",
    );
    assert.equal(validateDiverForm({ ...valid, autorisation_parentale_saison: '2026-2027' }), '');
  });

  test('représentant légal > 200 caractères renvoie le message requis', () => {
    const longRep = 'A'.repeat(201);
    assert.equal(
      validateDiverForm({ ...valid, representant_legal: longRep }),
      'Représentant légal : 200 caractères maximum.',
    );
    assert.equal(validateDiverForm({ ...valid, representant_legal: 'A'.repeat(200) }), '');
  });
});
